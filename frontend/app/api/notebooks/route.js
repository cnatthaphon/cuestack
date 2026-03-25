import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { hasFeature } from "../../../lib/features.js";
import { getConfig, setConfig, getConfigsByCategory } from "../../../lib/org-config.js";

const JUPYTER_TOKEN = process.env.JUPYTER_TOKEN || "dev-jupyter-token";
const JUPYTER_INTERNAL = "http://jupyter:8888";

// GET — get notebook session info (Jupyter URL with token)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const enabled = await hasFeature(user.org_id, "notebooks");
  if (!enabled) return NextResponse.json({ error: "Notebooks not enabled" }, { status: 403 });

  // Build Jupyter URL with token for this org
  const jupyterUrl = `/jupyter/lab?token=${JUPYTER_TOKEN}`;

  // Get session info from config
  const sessions = await getConfigsByCategory(user.org_id, "notebook_session");

  return NextResponse.json({
    url: jupyterUrl,
    org_id: user.org_id,
    sessions: sessions.map((s) => ({
      key: s.key,
      ...s.value,
      updated_at: s.updated_at,
    })),
  });
}

// POST — create/start a notebook session
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const enabled = await hasFeature(user.org_id, "notebooks");
  if (!enabled) return NextResponse.json({ error: "Notebooks not enabled" }, { status: 403 });

  const { name } = await request.json();
  const sessionName = name || "default";

  // Save session to org config
  await setConfig(user.org_id, "notebook_session", sessionName, {
    user_id: user.id,
    username: user.username,
    started_at: new Date().toISOString(),
    status: "active",
  });

  // Create a starter notebook for this org via Jupyter API
  try {
    const orgShort = user.org_id.replace(/-/g, "").slice(0, 8);
    const dirName = `org_${orgShort}`;

    // Ensure org directory exists
    await fetch(`${JUPYTER_INTERNAL}/jupyter/api/contents/${dirName}`, {
      method: "PUT",
      headers: {
        "Authorization": `token ${JUPYTER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "directory" }),
    });

    // Check if starter notebook exists
    const checkRes = await fetch(
      `${JUPYTER_INTERNAL}/jupyter/api/contents/${dirName}/getting_started.ipynb`,
      { headers: { "Authorization": `token ${JUPYTER_TOKEN}` } }
    );

    if (checkRes.status === 404) {
      // Create starter notebook
      const starterNotebook = createStarterNotebook(user.org_id, user.username);
      await fetch(`${JUPYTER_INTERNAL}/jupyter/api/contents/${dirName}/getting_started.ipynb`, {
        method: "PUT",
        headers: {
          "Authorization": `token ${JUPYTER_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "notebook",
          content: starterNotebook,
        }),
      });
    }
  } catch (e) {
    // Non-fatal — workspace creation might fail on first boot
    console.error("Jupyter workspace setup:", e.message);
  }

  const jupyterUrl = `/jupyter/lab?token=${JUPYTER_TOKEN}`;

  return NextResponse.json({
    url: jupyterUrl,
    session: sessionName,
    status: "active",
  });
}

function createStarterNotebook(orgId, username) {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
    },
    cells: [
      {
        cell_type: "markdown",
        metadata: {},
        source: [
          `# Welcome to IoT Stack Notebooks\n`,
          `\n`,
          `**Organization:** \`${orgId}\`  \n`,
          `**User:** ${username}\n`,
          `\n`,
          `## Available tools\n`,
          `- \`query(sql)\` — Run SQL, returns a pandas DataFrame\n`,
          `- \`tables()\` — List your org's tables\n`,
          `- \`db\` — SQLAlchemy engine for advanced use\n`,
        ],
      },
      {
        cell_type: "code",
        metadata: {},
        source: ["# List your tables\ntables()"],
        outputs: [],
        execution_count: null,
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "# Query data example\n",
          "# df = query('SELECT * FROM your_table_name LIMIT 10')\n",
          "# df.head()",
        ],
        outputs: [],
        execution_count: null,
      },
    ],
  };
}
