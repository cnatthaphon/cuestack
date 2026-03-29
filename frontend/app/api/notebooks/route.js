import { NextResponse } from "next/server";
import { getCurrentUser, createToken } from "../../../lib/auth.js";
import { hasFeature } from "../../../lib/features.js";
import { getConfig, setConfig, getConfigsByCategory } from "../../../lib/org-config.js";
import { SignJWT } from "jose";

const JUPYTER_INTERNAL = "http://jupyter:8888";
const SECRET = new TextEncoder().encode(
  process.env.SECRET_KEY || "dev-only-not-for-production"
);

// GET — list active Jupyter sessions + notebook workspace pages
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const enabled = await hasFeature(user.org_id, "notebooks");
  if (!enabled) return NextResponse.json({ error: "Notebooks not enabled" }, { status: 403 });

  // Query Jupyter for active kernel sessions
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
    // Jupyter might be down — that's ok
  }

  return NextResponse.json({
    sessions: activeSessions,
    org_id: user.org_id,
  });
}

// POST — create/start a notebook session (generates SDK token)
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const enabled = await hasFeature(user.org_id, "notebooks");
  if (!enabled) return NextResponse.json({ error: "Notebooks not enabled" }, { status: 403 });

  const { name } = await request.json();
  const sessionName = name || "default";

  // Generate SDK token (JWT, 24h, scoped to user+org)
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

  // Save session
  await setConfig(user.org_id, "notebook_session", sessionName, {
    user_id: user.id,
    username: user.username,
    started_at: new Date().toISOString(),
    status: "active",
  });

  // Create org workspace + notebook file via Jupyter API
  const orgShort = user.org_id.replace(/-/g, "").slice(0, 8);
  const dirName = `org_${orgShort}`;
  const nbFileName = `${sessionName}.ipynb`;
  const nbPath = `${dirName}/${nbFileName}`;

  try {
    // Create org directory
    await fetch(`${JUPYTER_INTERNAL}/jupyter/api/contents/${dirName}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "directory" }),
    });

    // Create the specific notebook if it doesn't exist
    const checkRes = await fetch(`${JUPYTER_INTERNAL}/jupyter/api/contents/${nbPath}`);
    if (checkRes.status === 404) {
      await fetch(`${JUPYTER_INTERNAL}/jupyter/api/contents/${nbPath}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "notebook", content: createStarterNotebook(sdkToken) }),
      });
    }
  } catch (e) {
    console.error("Jupyter workspace setup:", e.message);
  }

  // URL points to the specific notebook file in JupyterLab
  const notebookUrl = `/jupyter/lab/tree/${nbPath}`;

  return NextResponse.json({
    url: notebookUrl,
    session: sessionName,
    status: "active",
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
        source: [
          "# IoT Stack Notebook\n",
          "\n",
          "This notebook is pre-configured with the IoT Stack SDK.\n",
          "Run the cell below to connect.\n",
        ],
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "import os\n",
          `os.environ[\"IOT_STACK_TOKEN\"] = \"${token}\"\n`,
          `os.environ[\"IOT_STACK_URL\"] = \"http://nginx:80\"\n`,
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
      {
        cell_type: "code",
        metadata: {},
        source: [
          "# Query data from a table\n",
          "# df = client.query_table('sensor_data', limit=10)\n",
          "# df.head()",
        ],
        outputs: [],
        execution_count: null,
      },
    ],
  };
}

