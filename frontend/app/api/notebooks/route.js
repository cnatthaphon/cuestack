import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { hasFeature } from "../../../lib/features.js";
import { query } from "../../../lib/db.js";
import { SignJWT } from "jose";

const JUPYTER_INTERNAL = "http://jupyter:8888";
const SECRET = new TextEncoder().encode(
  process.env.SECRET_KEY || "dev-only-not-for-production"
);

// GET — list active Jupyter sessions
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const enabled = await hasFeature(user.org_id, "notebooks");
  if (!enabled) return NextResponse.json({ error: "Notebooks not enabled" }, { status: 403 });

  let activeSessions = [];
  try {
    const res = await fetch(`${JUPYTER_INTERNAL}/jupyter/api/sessions`);
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
    // Jupyter might be down
  }

  return NextResponse.json({ sessions: activeSessions, org_id: user.org_id });
}

// POST — open a notebook page in Jupyter
// Pushes notebook_content from DB to a temp .ipynb in Jupyter, returns URL
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

  // Load notebook content from page config (DB is source of truth)
  let nbContent = null;
  if (page_id) {
    const result = await query(
      `SELECT config FROM user_pages WHERE id = $1 AND org_id = $2`,
      [page_id, user.org_id]
    );
    if (result.rows.length > 0) {
      const cfg = typeof result.rows[0].config === "string"
        ? JSON.parse(result.rows[0].config) : (result.rows[0].config || {});
      nbContent = cfg.notebook_content || null;
    }
  }

  // If no content yet, create starter notebook
  if (!nbContent) {
    nbContent = createStarterNotebook(sdkToken);
  }

  // Push to Jupyter as a temp file
  const orgShort = user.org_id.replace(/-/g, "").slice(0, 8);
  const dirName = `org_${orgShort}`;
  const sessionName = name || "notebook";
  const nbPath = `${dirName}/${sessionName}.ipynb`;

  try {
    // Ensure org directory exists
    await fetch(`${JUPYTER_INTERNAL}/jupyter/api/contents/${dirName}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "directory" }),
    });

    // Write notebook content to Jupyter
    await fetch(`${JUPYTER_INTERNAL}/jupyter/api/contents/${nbPath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "notebook", content: nbContent }),
    });
  } catch (e) {
    console.error("Jupyter push:", e.message);
    return NextResponse.json({ error: "Could not reach Jupyter" }, { status: 502 });
  }

  const notebookUrl = `/jupyter/lab/tree/${nbPath}`;

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
        source: ["# IoT Stack Notebook\n", "\n", "Run the cell below to connect to the IoT Stack SDK.\n"],
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "import os\n",
          `os.environ["IOT_STACK_TOKEN"] = "${token}"\n`,
          `os.environ["IOT_STACK_URL"] = "http://nginx:80"\n`,
          "\n",
          "from iot_stack import connect\n",
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
