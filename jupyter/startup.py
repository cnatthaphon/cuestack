"""
CueStack Notebook Startup — auto-connects the SDK.
Provides `client` as a ready-to-use CueStack client.
"""
import os

_token = os.environ.get("CUESTACK_TOKEN", "")
_org = os.environ.get("ORG_NAME", "")
_plan = os.environ.get("ORG_PLAN", "free")

if _token:
    try:
        from cuestack import connect
        client = connect()
        print(f"CueStack SDK connected | Org: {_org} | Plan: {_plan}")
        print()
        print("Quick reference:")
        print("  client.tables()              — list org tables")
        print("  client.query_table('name')   — query table → DataFrame")
        print("  client.query_events(channel) — query ClickHouse events")
        print("  client.insert_event(ch, data)— insert event")
        print("  client.files.list()          — list my files")
        print("  client.me()                  — your user info")
        print()
        print("Custom Python environments:")
        print("  !python -m venv ~/envs/myenv")
        print("  !~/envs/myenv/bin/pip install <package>")
        print("  !~/envs/myenv/bin/python -m ipykernel install --user --name=myenv")
        print("  Then select 'myenv' kernel from Kernel menu.")
    except Exception as e:
        print(f"CueStack SDK not available: {e}")
else:
    print("CueStack SDK: no token set.")
    print("Open notebooks from the platform UI to auto-connect.")
