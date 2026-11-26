# ============================================================
# FEATURE 3: SCHEDULE TRACKING
# ============================================================
from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime, timedelta                     # datetime = dates/times; timedelta = a length of time (e.g., 1 day)
from .auth import login_required, uid
from extensions import schedules_col
from helpers import serialize

schedules_bp = Blueprint("schedules", __name__)


@schedules_bp.route("/api/schedules", methods=["POST"])      # URL for adding a scheduled activity
@login_required
def add_schedule():                                          # Function to create a schedule entry
    data = request.get_json()                                # Read activity, date, start_time, end_time
    try:                                                     # Try to validate the date/time formats
        datetime.strptime(data["date"], "%Y-%m-%d")          # Date must look like 2026-11-20
        start = datetime.strptime(data["start_time"], "%H:%M")   # Start time must look like 14:30
        end = datetime.strptime(data["end_time"], "%H:%M")       # End time must look like 16:00
    except (KeyError, ValueError):                           # Missing field or wrong format
        return jsonify({"error": "Use date YYYY-MM-DD and times HH:MM"}), 400   # Tell the user what's wrong
    if end <= start:                                         # End time must come after start time
        return jsonify({"error": "End time must be after start time"}), 400
    schedule = {                                             # Build the schedule dictionary
        "user_id": uid(),                                    # The owner of this schedule entry
        "activity": data.get("activity", "Activity"),        # Activity name
        "date": data["date"],                                # Date text
        "start_time": data["start_time"],                    # Start time text
        "end_time": data["end_time"],                        # End time text
    }
    result = schedules_col.insert_one(schedule)              # Save to MongoDB
    schedule["_id"] = str(result.inserted_id)                # Attach the id as text
    return jsonify(schedule), 201                            # Return the saved schedule


@schedules_bp.route("/api/schedules", methods=["GET"])       # URL for listing schedules
@login_required
def get_schedules():                                         # Function to fetch schedules
    items = [serialize(s) for s in schedules_col.find({"user_id": uid()}).sort([("date", 1), ("start_time", 1)])]  # Only this user's entries, sorted by date then start time
    return jsonify(items)                                    # Send back as JSON


@schedules_bp.route("/api/schedules/<sched_id>", methods=["PUT"])   # URL for editing a schedule entry
@login_required
def update_schedule(sched_id):                               # Function receives the id
    data = request.get_json()                                # Read the new values
    allowed = {k: v for k, v in data.items()                 # Keep only editable fields
               if k in ("activity", "date", "start_time", "end_time")}
    schedules_col.update_one({"_id": ObjectId(sched_id), "user_id": uid()}, {"$set": allowed})  # Update that entry (only if it is this user's)
    return jsonify({"message": "Schedule updated"})          # Confirm success


@schedules_bp.route("/api/schedules/<sched_id>", methods=["DELETE"])   # URL for deleting a schedule entry
@login_required
def delete_schedule(sched_id):                               # Function receives the id
    schedules_col.delete_one({"_id": ObjectId(sched_id), "user_id": uid()})    # Remove it (only if it is this user's)
    return jsonify({"message": "Schedule deleted"})          # Confirm success


@schedules_bp.route("/api/schedules/upcoming", methods=["GET"])   # URL for reminders of upcoming activities
@login_required
def upcoming_schedules():                                    # Function to find activities happening soon
    now = datetime.now()                                     # Current date and time
    limit = now + timedelta(hours=24)                        # Reminder window: the next 24 hours
    reminders = []                                           # Empty list to collect upcoming activities
    for s in schedules_col.find({"user_id": uid()}):         # Loop through this user's saved schedules
        start_dt = datetime.strptime(f"{s['date']} {s['start_time']}", "%Y-%m-%d %H:%M")  # Combine date + time into one datetime object
        if now <= start_dt <= limit:                         # Is it upcoming within 24 hours?
            s = serialize(s)                                 # Clean the _id
            s["reminder"] = f"'{s['activity']}' starts at {s['start_time']} on {s['date']}"  # Add a friendly reminder message
            reminders.append(s)                              # Add to the reminders list
    return jsonify(reminders)                                # Send reminders back


@schedules_bp.route("/api/schedules/week", methods=["GET"])  # URL for a weekly calendar view
@login_required
def weekly_schedule():                                       # Function to group schedules by day for 7 days
    today = datetime.now().date()                            # Today's date (no time)
    week = {}                                                # Dictionary: {"2026-11-12": [activities], ...}
    for i in range(7):                                       # Loop through the next 7 days
        day = (today + timedelta(days=i)).isoformat()        # Compute each date as text (YYYY-MM-DD)
        week[day] = [serialize(s) for s in                   # Fetch that day's activities...
                     schedules_col.find({"date": day, "user_id": uid()}).sort("start_time", 1)]  # ...only this user's, sorted by start time
    return jsonify(week)                                     # Send the grouped week back
