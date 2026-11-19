# ------------------------------------------------------------
# FULL SETUP
# ------------------------------------------------------------
# ============================================================
# Need nyo mongodb tas flask bago nyo e run 
# paste nyo sa terminal (python -m venv venv)
# same as this (pip install flask)
# for checking (python -c "import flask; print(flask.__version__)")
# then mongodb (mongodb.com/try/download/community.) copy paste nyo to sa browser
# then run tas click nyo "Complete Setup"
# Install MongoDB as a Service
# Render ginamit ko for deployment nung web app using git hub 
# wla pa syang frontend so di pa gagana ung local host (meron na)
# https://study-buddy-2s3y.onrender.com (copy paste lang sa browser)
# ============================================================


# ============================================================
# Studdybuddy - Starter Backend (Flask + MongoDB)
# Install first:  pip install flask pymongo
# Run:            python studybuddy.py
# ============================================================

from flask import Flask, request, jsonify, render_template   # Flask = web framework; request = incoming data; jsonify = send JSON back; render_template = load HTML files
from pymongo import MongoClient                              # MongoClient lets Python connect to MongoDB
from bson import ObjectId                                    # ObjectId is MongoDB's special type for the unique _id of each document
from datetime import datetime, timedelta                     # datetime = dates/times; timedelta = a length of time (e.g., 1 day)
import os

app = Flask(__name__)                                        # Create the Flask app; __name__ tells Flask where this file lives

# ------------------------------------------------------------
# DATABASE SETUP
# ------------------------------------------------------------
client = MongoClient(os.environ.get("MONGO_URI", "mongodb://localhost:27017/"), serverSelectionTimeoutMS=5000)   # give up after 5 seconds instead of 30
print("Using database at:", os.environ.get("MONGO_URI", "LOCAL MongoDB (localhost)").split("@")[-1])             # shows only the address, never the password
try:
    client.admin.command("ping")                  # quick test: can we really reach the database?
    print("MongoDB connected OK")
except Exception as e:
    print("MongoDB connection FAILED:", e)        # the real reason shows up here
db = client["study_buddy"]                               # Select (or auto-create) a database named "placeholder"
tasks_col = db["tasks"]                                      # Collection (like a table) that stores to-do items
notes_col = db["notes"]                                      # Collection that stores notes
schedules_col = db["schedules"]                              # Collection that stores scheduled activities


# ------------------------------------------------------------
# HELPER FUNCTION
# ------------------------------------------------------------
def serialize(doc):                                          # MongoDB documents contain ObjectId, which JSON can't handle, so we convert it
    doc["_id"] = str(doc["_id"])                             # Turn the ObjectId into a plain string
    return doc                                               # Return the cleaned document


# ------------------------------------------------------------
# HOME PAGE
# ------------------------------------------------------------
@app.route("/")                                              # When someone opens http://localhost:5000/ run the function below (@ = modifies or adds a function)
def home():                                                  # Function for the home page
    return render_template("index.html")                     # Load templates/index.html (your HTML frontend goes there)


# ============================================================
# FEATURE 1: TO-DO LIST
# ============================================================
@app.route("/api/tasks", methods=["POST"])                   # URL for creating a task; only accepts POST requests  (@ = modifies or adds a function)
def add_task():                                              # Function to create a task
    data = request.get_json()                                # Read the JSON data sent by the frontend (JS) into a Python dictionary
    due_date = data.get("due_date")                          # Get the due date; returns None if the user didn't provide one

    if due_date:                                             # Conditional: check if the task HAS a due date
        has_due_date = True                                  # Remember that this task has a due date
    else:                                                    # Otherwise the task has no due date
        has_due_date = False                                 # Remember that it has none
        due_date = None                                      # Make sure the stored value is None (not an empty string)

    task = {                                                 # Build a dictionary describing the task
        "title": data.get("title", "Untitled task"),         # Task name; uses "Untitled task" if none is given
        "due_date": due_date,                                # Due date as text like "2026-11-20" (or None)
        "has_due_date": has_due_date,                        # True/False flag from the check above
        "status": "Pending",                                 # New tasks always start as Pending
        "created_at": datetime.now().isoformat(),            # Save the current date/time as text
    }
    result = tasks_col.insert_one(task)                      # Save the task into MongoDB permanently
    task["_id"] = str(result.inserted_id)                    # Add the new unique ID (as text) to our dictionary
    return jsonify(task), 201                                # Send the task back as JSON with status 201 (Created)


@app.route("/api/tasks", methods=["GET"])                    # URL for listing all tasks  (@ = modifies or adds a function)
def get_tasks():                                             # Function to fetch tasks
    tasks = [serialize(t) for t in tasks_col.find()]         # Get every task from MongoDB and convert each _id to text (list comprehension)
    return jsonify(tasks)                                    # Send the list back as JSON


@app.route("/api/tasks/<task_id>", methods=["PUT"])          # URL for editing a task; <task_id> is part of the URL  (@ = modifies or adds a function)
def update_task(task_id):                                    # Function receives the id from the URL
    data = request.get_json()                                # Read the fields to change from the request
    allowed = {k: v for k, v in data.items()                 # Keep only the fields we allow users to edit (security + safety)
               if k in ("title", "due_date", "status")}      # Allowed fields: title, due_date, status (Pending/Completed)
    if "status" in allowed and allowed["status"] not in ("Pending", "Completed"):  # Conditional: validate the status value
        return jsonify({"error": "Status must be Pending or Completed"}), 400      # 400 = Bad Request
    tasks_col.update_one({"_id": ObjectId(task_id)},         # Find the task with this id...
                         {"$set": allowed})                  # ...and update only the given fields
    return jsonify({"message": "Task updated"})              # Confirm success


@app.route("/api/tasks/<task_id>", methods=["DELETE"])       # URL for deleting a task  (@ = modifies or adds a function)
def delete_task(task_id):                                    # Function receives the id from the URL
    tasks_col.delete_one({"_id": ObjectId(task_id)})         # Remove that task from MongoDB
    return jsonify({"message": "Task deleted"})              # Confirm success


# ============================================================
# FEATURE 2: NOTES
# ============================================================
@app.route("/api/notes", methods=["POST"])                   # URL for adding a note  (@ = modifies or adds a function)
def add_note():                                              # Function to create a note
    data = request.get_json()                                # Read the note data (title, subject, content) from the frontend
    # (BAGO) Dagdag na fields: color, folder_id, state (active/archived/trashed), pinned, updated_at
    note = {"color": data.get("color", "blue"), "folder_id": data.get("folder_id"), "state": "active", "pinned": data.get("pinned", False), "updated_at": datetime.now().isoformat(),                                                 # Build the note dictionary
        "title": data.get("title", "Untitled"),              # Note title
        "subject": data.get("subject", ""),                  # Subject (e.g., Math, Science)
        "content": data.get("content", ""),                  # The note's main text
        "created_at": datetime.now().isoformat(),            # When the note was created
    }
    result = notes_col.insert_one(note)                      # Save to MongoDB
    note["_id"] = str(result.inserted_id)                    # Attach the new id as text
    return jsonify(note), 201                                # Return the saved note


@app.route("/api/notes", methods=["GET"])                    # URL for listing/searching notes  (@ = modifies or adds a function)
def get_notes():                                             # Function to fetch notes
    keyword = request.args.get("q", "").strip()              # Read ?q=something from the URL (the search keyword)
    if keyword:                                              # Conditional: only filter if the user typed a keyword
        query = {"$or": [                                    # Match notes where ANY of the following is true:
            {"title": {"$regex": keyword, "$options": "i"}},     # title contains keyword (case-insensitive)
            {"content": {"$regex": keyword, "$options": "i"}},   # content contains keyword
            {"subject": {"$regex": keyword, "$options": "i"}},   # subject contains keyword
        ]}
    else:                                                    # No keyword typed
        query = {}                                           # Empty query = match every note
    notes = [serialize(n) for n in notes_col.find(query)]    # Run the query and clean each result
    return jsonify(notes)                                    # Send the list back


@app.route("/api/notes/<note_id>", methods=["PUT"])          # URL for editing a note  (@ = modifies or adds a function)
def update_note(note_id):                                    # Function receives the note id
    data = request.get_json()                                # Read the new values
    allowed = {k: v for k, v in data.items()                 # Keep only editable fields
               if k in ("title", "subject", "content", "color", "folder_id", "state", "pinned")}      # Allowed: title, subject, content
    allowed["updated_at"] = datetime.now().isoformat()      # Remember when it was last changed
    notes_col.update_one({"_id": ObjectId(note_id)},         # Find the note...
                         {"$set": allowed})                  # ...and update it
    return jsonify({"message": "Note updated"})              # Confirm success


@app.route("/api/notes/<note_id>", methods=["DELETE"])       # URL for deleting a note  (@ = modifies or adds a function)
def delete_note(note_id):                                    # Function receives the note id
    notes_col.delete_one({"_id": ObjectId(note_id)})         # Remove it from MongoDB
    return jsonify({"message": "Note deleted"})              # Confirm success

# ============================================================
# FEATURE 3: SCHEDULE TRACKING
# ============================================================
@app.route("/api/schedules", methods=["POST"])               # URL for adding a scheduled activity (@ = modifies or adds a function)
def add_schedule():                                          # Function to create a schedule entry
    data = request.get_json()                                # Read activity, date, start_time, end_time
    try:                                                     # Try to validate the date/time formats
        datetime.strptime(data["date"], "%Y-%m-%d")          # Date must look like 2026-11-20
        start = datetime.strptime(data["start_time"], "%H:%M")   # Start time must look like 14:30
        end = datetime.strptime(data["end_time"], "%H:%M")       # End time must look like 16:00
    except (KeyError, ValueError):                           # Missing field or wrong format
        return jsonify({"error": "Use date YYYY-MM-DD and times HH:MM"}), 400   # Tell the user what's wrong
    if end <= start:                                         # Conditional: end time must come after start time
        return jsonify({"error": "End time must be after start time"}), 400
    schedule = {                                             # Build the schedule dictionary
        "activity": data.get("activity", "Activity"),        # Activity name
        "date": data["date"],                                # Date text
        "start_time": data["start_time"],                    # Start time text
        "end_time": data["end_time"],                        # End time text
    }
    result = schedules_col.insert_one(schedule)              # Save to MongoDB
    schedule["_id"] = str(result.inserted_id)                # Attach the id as text
    return jsonify(schedule), 201                            # Return the saved schedule


@app.route("/api/schedules", methods=["GET"])                # URL for listing schedules (@ = modifies or adds a function)
def get_schedules():                                         # Function to fetch schedules
    items = [serialize(s) for s in schedules_col.find().sort([("date", 1), ("start_time", 1)])]  # Get all, sorted by date then start time
    return jsonify(items)                                    # Send back as JSON


@app.route("/api/schedules/<sched_id>", methods=["PUT"])     # URL for editing a schedule entry (@ = modifies or adds a function)
def update_schedule(sched_id):                               # Function receives the id
    data = request.get_json()                                # Read the new values
    allowed = {k: v for k, v in data.items()                 # Keep only editable fields
               if k in ("activity", "date", "start_time", "end_time")}
    schedules_col.update_one({"_id": ObjectId(sched_id)}, {"$set": allowed})  # Update that entry
    return jsonify({"message": "Schedule updated"})          # Confirm success


@app.route("/api/schedules/<sched_id>", methods=["DELETE"])  # URL for deleting a schedule entry (@ = modifies or adds a function)
def delete_schedule(sched_id):                               # Function receives the id
    schedules_col.delete_one({"_id": ObjectId(sched_id)})    # Remove it
    return jsonify({"message": "Schedule deleted"})          # Confirm success


@app.route("/api/schedules/upcoming", methods=["GET"])       # URL for reminders of upcoming activities (@ = modifies or adds a function)
def upcoming_schedules():                                    # Function to find activities happening soon
    now = datetime.now()                                     # Current date and time
    limit = now + timedelta(hours=24)                        # Reminder window: the next 24 hours
    reminders = []                                           # Empty list to collect upcoming activities
    for s in schedules_col.find():                           # Loop through every saved schedule
        start_dt = datetime.strptime(f"{s['date']} {s['start_time']}", "%Y-%m-%d %H:%M")  # Combine date + time into one datetime object
        if now <= start_dt <= limit:                         # Conditional: is it upcoming within 24 hours?
            s = serialize(s)                                 # Clean the _id
            s["reminder"] = f"'{s['activity']}' starts at {s['start_time']} on {s['date']}"  # Add a friendly reminder message
            reminders.append(s)                              # Add to the reminders list
    return jsonify(reminders)                                # Send reminders back


@app.route("/api/schedules/week", methods=["GET"])           # URL for a weekly calendar view (@ = modifies or adds a function)
def weekly_schedule():                                       # Function to group schedules by day for 7 days
    today = datetime.now().date()                            # Today's date (no time)
    week = {}                                                # Dictionary: {"2026-11-12": [activities], ...}
    for i in range(7):                                       # Loop through the next 7 days
        day = (today + timedelta(days=i)).isoformat()        # Compute each date as text (YYYY-MM-DD)
        week[day] = [serialize(s) for s in                   # Fetch that day's activities...
                     schedules_col.find({"date": day}).sort("start_time", 1)]  # ...sorted by start time
    return jsonify(week)                                     # Send the grouped week back


# ============================================================
# FEATURE 4: FOLDERS  (NEW - for Recent Folders on the Home page)
# Each folder has a "state": active (normal) / archived (in Archive) / trashed (in Trash)
# ============================================================
folders_col = db["folders"]                                  # New collection (like a table) in MongoDB for folders

@app.route("/api/folders", methods=["GET"])                  # Get all folders
def get_folders():
    return jsonify([serialize(f) for f in folders_col.find()])   # Convert each folder's _id to text, then send as JSON

@app.route("/api/folders", methods=["POST"])                 # Create a new folder
def add_folder():
    data = request.get_json()                                # Read what the browser sent (name, icon, color)
    now = datetime.now().isoformat()                         # Current date and time as text
    folder = {"name": data.get("name", "New folder"),        # Folder name (default: New folder)
              "icon": data.get("icon", "📁"),                # Emoji icon of the folder
              "color": data.get("color", "blue"),            # Card color
              "state": "active",                             # A new folder is active right away
              "created_at": now, "updated_at": now}          # When it was created and last modified
    folder["_id"] = str(folders_col.insert_one(folder).inserted_id)   # Save to MongoDB, get the new ID as text
    return jsonify(folder), 201                              # Return the folder (201 = Created)

@app.route("/api/folders/<fid>", methods=["PUT"])            # Edit a folder (rename, archive, trash, restore)
def update_folder(fid):
    data = request.get_json()                                # New values from the browser
    allowed = {k: v for k, v in data.items() if k in ("name", "icon", "color", "state")}   # Only fields that are allowed to change
    allowed["updated_at"] = datetime.now().isoformat()       # Update the "last modified" time
    folders_col.update_one({"_id": ObjectId(fid)}, {"$set": allowed})   # Find the folder and update it
    if "state" in allowed:                                   # If the folder's state changed...
        notes_col.update_many({"folder_id": fid}, {"$set": {"state": allowed["state"]}})   # ...the notes inside follow the same state
    return jsonify({"message": "Folder updated"})            # Report success

@app.route("/api/folders/<fid>", methods=["DELETE"])         # Permanently delete a folder
def delete_folder(fid):
    folders_col.delete_one({"_id": ObjectId(fid)})           # Delete the folder
    notes_col.delete_many({"folder_id": fid})                # Also delete all notes inside it
    return jsonify({"message": "Folder deleted"})            # Report success

from pymongo.errors import PyMongoError

@app.errorhandler(PyMongoError)                   # runs whenever a database error happens
def db_error(e):
    print("DATABASE ERROR:", e)
    return jsonify({"error": "Cannot reach the database. Check MONGO_URI, password and Atlas Network Access."}), 503

# ------------------------------------------------------------
# RUN THE APP
# ------------------------------------------------------------
if __name__ == "__main__":                                   # Only true when you run this file directly (python app.py)
    app.run(debug=True, use_reloader=False)                  # Start the server at http://localhost:5000 with error details (auto-reload is off)
