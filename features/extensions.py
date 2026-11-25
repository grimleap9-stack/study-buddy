# ------------------------------------------------------------
# DATABASE SETUP  (shared by all modules, so nobody imports app.py)
# ------------------------------------------------------------
import os
from pymongo import MongoClient                              # MongoClient lets Python connect to MongoDB

client = MongoClient(os.environ.get("MONGO_URI", "mongodb://localhost:27017/"), serverSelectionTimeoutMS=5000)   # give up after 5 seconds instead of 30
print("Using database at:", os.environ.get("MONGO_URI", "LOCAL MongoDB (localhost)").split("@")[-1])             # shows only the address, never the password
try:
    client.admin.command("ping")                             # quick test: can we really reach the database?
    print("MongoDB connected OK")
except Exception as e:
    print("MongoDB connection FAILED:", e)                   # the real reason shows up here

db = client["study_buddy"]                                   # Select (or auto-create) a database named "study_buddy"
tasks_col = db["tasks"]                                      # Collection (like a table) that stores to-do items
notes_col = db["notes"]                                      # Collection that stores notes
schedules_col = db["schedules"]                              # Collection that stores scheduled activities
folders_col = db["folders"]                                  # Collection that stores folders
