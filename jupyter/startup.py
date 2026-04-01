"""
CueStack Notebook Startup — auto-connects the SDK.
Provides `client` as a ready-to-use CueStack client.
"""
import os

_token = os.environ.get("CUESTACK_TOKEN", "")

if _token:
    try:
        from cuestack import connect
        client = connect()
        print()
        print("Quick reference:")
        print("  client.tables()             — list org tables")
        print("  client.query_table('name')  — query table → DataFrame")
        print("  client.files.list()         — list my files")
        print("  client.notify('Alert!')     — send notification")
        print("  client.users()              — list org users")
        print("  client.me()                 — your user info")
    except Exception as e:
        print(f"CueStack SDK not available: {e}")
        print("Use: from cuestack import connect; client = connect()")
else:
    print("CueStack SDK: no token set.")
    print("Open notebooks from the platform UI to auto-connect.")
    print("Or manually: from cuestack import connect; client = connect(token='...')")
