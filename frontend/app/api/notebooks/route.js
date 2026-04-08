import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { hasFeature } from "../../../lib/features.js";
import { query } from "../../../lib/db.js";
import { SignJWT } from "jose";

const JUPYTERHUB_INTERNAL = "http://jupyterhub:8000";
const SECRET = new TextEncoder().encode(
  process.env.SECRET_KEY || "dev-only-not-for-production"
);

// ---------------------------------------------------------------------------
// Helper: get the Jupyter API base URL for a given org's spawned container.
// JupyterHub spawns per-org containers accessible at /jupyter/user/<orgShort>/
// ---------------------------------------------------------------------------
function userApiBase(orgShort) {
  return `${JUPYTERHUB_INTERNAL}/jupyter/user/${orgShort}`;
}

// Helper: ensure the user's notebook server is running via JupyterHub API.
// JupyterHub admin token or service token would be ideal here, but for the
// initial implementation we use the hub's REST API with a service token
// configured via JUPYTERHUB_API_TOKEN env var.
async function ensureServerRunning(orgShort) {
  const apiToken = process.env.JUPYTERHUB_API_TOKEN || "";
  const headers = apiToken ? { Authorization: `token ${apiToken}` } : {};

  // Check server status — create user if not exists
  const statusRes = await fetch(`${JUPYTERHUB_INTERNAL}/jupyter/hub/api/users/${orgShort}`, { headers });
  if (statusRes.status === 404) {
    // User doesn't exist in JupyterHub yet — create them
    await fetch(`${JUPYTERHUB_INTERNAL}/jupyter/hub/api/users/${orgShort}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  }

  // Request server start (idempotent — no-op if already running)
  const spawnRes = await fetch(`${JUPYTERHUB_INTERNAL}/jupyter/hub/api/users/${orgShort}/server`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  // 201 = started, 400 = already running — both are fine
  if (spawnRes.status === 201 || spawnRes.status === 400 || spawnRes.ok) {
    return true;
  }

  // If 202, server is still starting — poll briefly
  if (spawnRes.status === 202) {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const check = await fetch(`${JUPYTERHUB_INTERNAL}/jupyter/hub/api/users/${orgShort}`, { headers });
      if (check.ok) {
        const data = await check.json();
        if (data.servers?.[""]?.ready) return true;
      }
    }
  }

  return false;
}

// GET — list active Jupyter sessions for the org
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const enabled = await hasFeature(user.org_id, "notebooks");
  if (!enabled) return NextResponse.json({ error: "Notebooks not enabled" }, { status: 403 });

  const orgShort = user.org_id.replace(/-/g, "").slice(0, 8);
  let activeSessions = [];
  try {
    const res = await fetch(`${userApiBase(orgShort)}/api/sessions`);
    if (res.ok) {
      const sessions = await res.json();
      activeSessions = sessions.map((s) => ({
        id: s.id,
        name: s.notebook?.name || s.name || "unknown",
        path: s.notebook?.path || s.path || "",
        kernel_status: s.kernel?.execution_state || "unknown",
        kernel_id: s.kernel?.id || "",
        started_at: s.kernel?.last_activity || null,
      }));
    }
  } catch {
    // Jupyter might be down or server not started
  }

  return NextResponse.json({ sessions: activeSessions, org_id: user.org_id });
}

// POST — open a notebook page in Jupyter
// Ensures the org's container is running, pushes notebook content, returns URL
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const enabled = await hasFeature(user.org_id, "notebooks");
  if (!enabled) return NextResponse.json({ error: "Notebooks not enabled" }, { status: 403 });

  const { page_id, name } = await request.json();

  // Generate SDK token
  const sdkToken = await new SignJWT({
    sub: user.id,
    username: user.username,
    org_id: user.org_id,
    role_id: user.role_id,
    type: "notebook",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(SECRET);

  // Verify page ownership — only owner or shared users can open in Jupyter
  let nbContent = null;
  if (page_id) {
    const result = await query(
      `SELECT config, user_id, visibility, shared_with FROM user_pages WHERE id = $1 AND org_id = $2`,
      [page_id, user.org_id]
    );
    if (result.rows.length > 0) {
      const pageRow = result.rows[0];
      // Ownership check
      const isOwner = pageRow.user_id === user.id;
      const isShared = (pageRow.shared_with || []).some(s => s.type === "user" && s.id === user.id);
      if (!isOwner && !isShared && pageRow.visibility === "private") {
        return NextResponse.json({ error: "Access denied — not the page owner" }, { status: 403 });
      }
      // Load content
      const cfg = typeof pageRow.config === "string"
        ? JSON.parse(pageRow.config) : (pageRow.config || {});
      nbContent = cfg.notebook_content || null;
    }
  }

  const orgShort = user.org_id.replace(/-/g, "").slice(0, 8);
  const sessionName = name || "notebook";
  // Include user ID in filename — prevents other users from guessing/accessing
  const nbPath = `u${user.id}_${sessionName}.ipynb`;

  // Ensure the org's Jupyter server is running
  try {
    const running = await ensureServerRunning(orgShort);
    if (!running) {
      return NextResponse.json({ error: "Could not start Jupyter server" }, { status: 502 });
    }
  } catch (e) {
    console.error("JupyterHub spawn:", e.message);
    return NextResponse.json({ error: "Could not reach JupyterHub" }, { status: 502 });
  }

  const jupyterApi = userApiBase(orgShort);

  // If no content in DB, try to pull existing file from user container (migration)
  if (!nbContent) {
    try {
      // Check both old path (org_xxx/name.ipynb) and new path (name.ipynb)
      for (const tryPath of [`org_${orgShort}/${sessionName}.ipynb`, nbPath]) {
        const existingRes = await fetch(`${jupyterApi}/api/contents/${tryPath}?content=1`);
        if (existingRes.ok) {
          const existing = await existingRes.json();
          nbContent = existing.content;
          // Save to DB so future opens read from DB
          if (page_id && nbContent) {
            const pgRes = await query(`SELECT config FROM user_pages WHERE id = $1 AND org_id = $2`, [page_id, user.org_id]);
            if (pgRes.rows.length > 0) {
              const existCfg = typeof pgRes.rows[0].config === "string" ? JSON.parse(pgRes.rows[0].config) : (pgRes.rows[0].config || {});
              await query(`UPDATE user_pages SET config = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify({ ...existCfg, notebook_content: nbContent }), page_id]);
            }
          }
          break;
        }
      }
    } catch { /* Jupyter might be down */ }
  }

  // Still nothing — create starter
  if (!nbContent) {
    nbContent = createStarterNotebook(sdkToken);
  } else {
    // Refresh the SDK token in existing notebook (tokens expire after 24h)
    if (nbContent.cells) {
      for (const cell of nbContent.cells) {
        if (cell.cell_type !== "code") continue;
        const src = Array.isArray(cell.source) ? cell.source.join("") : (cell.source || "");
        if (src.includes("CUESTACK_TOKEN")) {
          const updated = src.replace(
            /os\.environ\["CUESTACK_TOKEN"\]\s*=\s*"[^"]*"/,
            `os.environ["CUESTACK_TOKEN"] = "${sdkToken}"`
          );
          cell.source = Array.isArray(cell.source) ? updated.split(/(?<=\n)/) : updated;
          break;
        }
      }
    }
  }

  try {
    // Write notebook content to the user's Jupyter server
    // Per-org containers have /workspace as root, so no org subdirectory needed
    await fetch(`${jupyterApi}/api/contents/${nbPath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "notebook", content: nbContent }),
    });
  } catch (e) {
    console.error("Jupyter push:", e.message);
    return NextResponse.json({ error: "Could not reach Jupyter" }, { status: 502 });
  }

  // URL points through JupyterHub to the user's server, single-document mode
  const notebookUrl = `/jupyter/user/${orgShort}/doc/tree/${nbPath}`;

  return NextResponse.json({
    url: notebookUrl,
    jupyter_path: nbPath,
    sdk_token: sdkToken,
  });
}

function createStarterNotebook(token) {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec: { display_name: "Python 3", language: "python", name: "python3" } },
    cells: [
      {
        cell_type: "markdown",
        metadata: {},
        source: ["# CueStack Notebook\n", "\n", "Run the cell below to connect to the CueStack SDK.\n"],
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "import os\n",
          `os.environ["CUESTACK_TOKEN"] = "${token}"\n`,
          `os.environ["CUESTACK_URL"] = "http://nginx:80"\n`,
          "\n",
          "from cuestack import connect\n",
          "client = connect()",
        ],
        outputs: [],
        execution_count: null,
      },
      {
        cell_type: "code",
        metadata: {},
        source: ["# List your tables\nclient.tables()"],
        outputs: [],
        execution_count: null,
      },
    ],
  };
}
