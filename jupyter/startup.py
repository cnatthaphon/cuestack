"""
IoT Stack Notebook Startup — auto-connects the SDK.
Provides `client` as a ready-to-use IoT Stack client.
"""
import os

_token = os.environ.get("IOT_STACK_TOKEN", "")

if _token:
    try:
        from iot_stack import connect
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
        print(f"IoT Stack SDK not available: {e}")
        print("Use: from iot_stack import connect; client = connect()")
else:
    print("IoT Stack SDK: no token set.")
    print("Open notebooks from the platform UI to auto-connect.")
    print("Or manually: from iot_stack import connect; client = connect(token='...')")
