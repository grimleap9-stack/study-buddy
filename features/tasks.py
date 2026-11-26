# ============================================================
# FEATURE 1: TO-DO LIST
# ============================================================
from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from .auth import login_required, uid
from extensions import tasks_col
from helpers import serialize

tasks_bp = Blueprint("tasks", __name__)                      # A Blueprint = a group of routes that app.py registers later


@tasks_bp.route("/api/tasks", methods=["POST"])              # URL for creating a task; only accepts POST requests
@login_required                                              # only logged-in users can use this route
def add_task():                                              # Function to create a task
    data = request.get_json()                                # Read the JSON data sent by the frontend (JS) into a Python dictionary
    due_date = data.get("due_date")                          # Get the due date; returns None if the user didn't provide one

    if due_date:                                             # Conditional: check if the task HAS a due date
        has_due_date = True                                  # Remember that this task has a due date
    else:                                                    # Otherwise the task has no due date
        has_due_date = False                                 # Remember that it has none
        due_date = None                                      # Make sure the stored value is None (not an empty string)

    task = {                                                 # Build a dictionary describing the task
        "user_id": uid(),                                    # The owner of this task: the logged-in user
        "title": data.get("title", "Untitled task"),         # Task name; uses "Untitled task" if none is given
        "due_date": due_date,                                # Due date as text like "2026-11-20" (or None)
        "has_due_date": has_due_date,                        # True/False flag from the check above
        "status": "Pending",                                 # New tasks always start as Pending
        "created_at": datetime.now().isoformat(),            # Save the current date/time as text
    }
    result = tasks_col.insert_one(task)                      # Save the task into MongoDB permanently
    task["_id"] = str(result.inserted_id)                    # Add the new unique ID (as text) to our dictionary
    return jsonify(task), 201                                # Send the task back as JSON with status 201 (Created)


@tasks_bp.route("/api/tasks", methods=["GET"])               # URL for listing all tasks
@login_required
def get_tasks():                                             # Function to fetch tasks
    tasks = [serialize(t) for t in tasks_col.find({"user_id": uid()})]   # Get only THIS user's tasks and convert each _id to text
    return jsonify(tasks)                                    # Send the list back as JSON


@tasks_bp.route("/api/tasks/<task_id>", methods=["PUT"])     # URL for editing a task; <task_id> is part of the URL
@login_required
def update_task(task_id):                                    # Function receives the id from the URL
    data = request.get_json()                                # Read the fields to change from the request
    allowed = {k: v for k, v in data.items()                 # Keep only the fields we allow users to edit (security + safety)
               if k in ("title", "due_date", "status")}      # Allowed fields: title, due_date, status (Pending/Completed)
    if "status" in allowed and allowed["status"] not in ("Pending", "Completed"):  # Conditional: validate the status value
        return jsonify({"error": "Status must be Pending or Completed"}), 400      # 400 = Bad Request
    tasks_col.update_one({"_id": ObjectId(task_id), "user_id": uid()},   # Find the task with this id AND this owner (so nobody can edit another user's task)...
                         {"$set": allowed})                  # ...and update only the given fields
    return jsonify({"message": "Task updated"})              # Confirm success


@tasks_bp.route("/api/tasks/<task_id>", methods=["DELETE"])  # URL for deleting a task
@login_required
def delete_task(task_id):                                    # Function receives the id from the URL
    tasks_col.delete_one({"_id": ObjectId(task_id), "user_id": uid()})   # Remove that task, but only if it belongs to this user
    return jsonify({"message": "Task deleted"})              # Confirm success
