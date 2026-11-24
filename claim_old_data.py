# ============================================================
# Itong part nato for checking lang di talaga sya need pero nilagay ko lang para sa error handling)
#   1. Run the app and create your account first (Create account tab).
#   2. Set MONGO_URI if your data is on MongoDB Atlas (skip this for local MongoDB):
#        Windows PowerShell:  $env:MONGO_URI="your-atlas-connection-string"
#        Mac / Linux:         export MONGO_URI="your-atlas-connection-string"
#   3. Run:  python claim_old_data.py your_username
# ============================================================
import os                                                    # to read the MONGO_URI environment variable
import sys                                                   # to read the username typed after the file name
from pymongo import MongoClient                              # to connect to MongoDB

if len(sys.argv) != 2:                                       # We need exactly one extra word: the username
    sys.exit("Usage: python claim_old_data.py your_username")

client = MongoClient(os.environ.get("MONGO_URI", "mongodb://localhost:27017/"), serverSelectionTimeoutMS=5000)   # same connection rule as the app
db = client["study_buddy"]                                   # same database name as the app

user = db["users"].find_one({"username_lower": sys.argv[1].strip().lower()})   # find the account
if not user:                                                 # no such account yet
    sys.exit("No account with that username. Create the account in the app first.")

owner = str(user["_id"])                                     # the id that will be written into the old documents
for name in ("tasks", "notes", "schedules", "folders"):      # the four collections that hold user data
    result = db[name].update_many({"user_id": {"$exists": False}}, {"$set": {"user_id": owner}})   # only documents that have NO owner yet
    print(f"{name}: {result.modified_count} item(s) now belong to {user['username']}")
