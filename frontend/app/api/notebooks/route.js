import { NextResponse } from "next/server";
import { getCurrentUser, createToken } from "../../../lib/auth.js";
import { hasFeature } from "../../../lib/features.js";
import { getConfig, setConfig, getConfigsByCategory } from "../../../lib/org-config.js";
import { SignJWT } from "jose";

const JUPYTER_INTERNAL = "http://jupyter:8888";
const SECRET = new TextEncoder().encode(
  process.env.SECRET_KEY || "dev-secret-change-in-prod"
);

// GET — list notebook sessions
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const enabled = await hasFeature(user.org_id, "notebooks");
  if (!enabled) return NextResponse.json({ error: "Notebooks not enabled" }, { status: 403 });

  const jupyterUrl = "/jupyter/lab";
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

  // Create org workspace + example notebook via Jupyter API
  try {
    const orgShort = user.org_id.replace(/-/g, "").slice(0, 8);
    const dirName = `org_${orgShort}`;

    await fetch(`${JUPYTER_INTERNAL}/jupyter/api/contents/${dirName}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "directory" }),
    });

    const checkRes = await fetch(`${JUPYTER_INTERNAL}/jupyter/api/contents/${dirName}/getting_started.ipynb`);
    if (checkRes.status === 404) {
      await fetch(`${JUPYTER_INTERNAL}/jupyter/api/contents/${dirName}/getting_started.ipynb`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "notebook", content: createStarterNotebook(sdkToken) }),
      });
    }

    // Also create an example notebook
    const exCheckRes = await fetch(`${JUPYTER_INTERNAL}/jupyter/api/contents/${dirName}/examples.ipynb`);
    if (exCheckRes.status === 404) {
      await fetch(`${JUPYTER_INTERNAL}/jupyter/api/contents/${dirName}/examples.ipynb`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "notebook", content: createExampleNotebook(sdkToken) }),
      });
    }
  } catch (e) {
    console.error("Jupyter workspace setup:", e.message);
  }

  return NextResponse.json({
    url: "/jupyter/lab",
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

function createExampleNotebook(token) {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec: { display_name: "Python 3", language: "python", name: "python3" } },
    cells: [
      {
        cell_type: "markdown",
        metadata: {},
        source: [
          "# IoT Stack SDK — Examples\n",
          "\n",
          "Full examples of the SDK features.\n",
        ],
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "# Step 1: Connect\n",
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
        cell_type: "markdown",
        metadata: {},
        source: ["## Data"],
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "# List tables\n",
          "client.tables()",
        ],
        outputs: [],
        execution_count: null,
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "# Query a table (change 'sensor_data' to your table name)\n",
          "# df = client.query_table('sensor_data', limit=20)\n",
          "# df",
        ],
        outputs: [],
        execution_count: null,
      },
      {
        cell_type: "markdown",
        metadata: {},
        source: ["## Files"],
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "# List my files\n",
          "client.files.list()",
        ],
        outputs: [],
        execution_count: null,
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "# Upload a file\n",
          "# Save something locally first\n",
          "import pandas as pd\n",
          "pd.DataFrame({'x': [1,2,3], 'y': [4,5,6]}).to_csv('/tmp/test_upload.csv', index=False)\n",
          "client.files.upload('/tmp/test_upload.csv')\n",
          "client.files.list()",
        ],
        outputs: [],
        execution_count: null,
      },
      {
        cell_type: "markdown",
        metadata: {},
        source: ["## Notifications"],
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "# Send yourself a notification\n",
          "client.notify('Test from Notebook', message='Hello from Jupyter!', type='success')",
        ],
        outputs: [],
        execution_count: null,
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "# Send a warning to all org users\n",
          "# client.broadcast('System Alert', message='Temperature sensor offline', type='warning')",
        ],
        outputs: [],
        execution_count: null,
      },
      {
        cell_type: "markdown",
        metadata: {},
        source: ["## Users & Org"],
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "# Your info\n",
          "client.me()",
        ],
        outputs: [],
        execution_count: null,
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "# Org users\n",
          "client.users()",
        ],
        outputs: [],
        execution_count: null,
      },
      {
        cell_type: "markdown",
        metadata: {},
        source: ["## Dashboards, Apps, Services"],
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "# List dashboards\n",
          "client.dashboards()",
        ],
        outputs: [],
        execution_count: null,
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "# List apps\n",
          "client.apps()",
        ],
        outputs: [],
        execution_count: null,
      },
      {
        cell_type: "code",
        metadata: {},
        source: [
          "# Storage stats\n",
          "client.files.storage()",
        ],
        outputs: [],
        execution_count: null,
      },
    ],
  };
}
