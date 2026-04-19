"""
CueStack SDK — Python client for notebooks and services.

Usage:
    from cuestack import connect
    client = connect()

    # Data
    client.tables()                          # list org tables
    client.query("SELECT * FROM ...")        # query into DataFrame
    client.insert("table_name", rows)        # insert data

    # Files
    client.files.list()                      # list my files
    client.files.upload("local.csv")         # upload file
    client.files.download(file_id)           # download file
    client.files.share(file_id, user_ids=[]) # share with users

    # Notifications
    client.notify("Alert!", type="warning")  # notify self
    client.notify("Down!", user_id=3)        # notify specific user
    client.broadcast("Maintenance!")         # notify all org users

    # Users & Org
    client.me()                              # current user info
    client.users()                           # list org users
    client.org()                             # org info
"""

from cuestack.client import CueStackClient, connect
from cuestack import weather

__all__ = ["CueStackClient", "connect", "weather"]
