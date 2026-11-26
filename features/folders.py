# ============================================================
# FEATURE 4: FOLDERS  (for Recent Folders on the Home page)
# Each folder has a "state": active (normal) / archived (in Archive) / trashed (in Trash)
# ============================================================
from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from .auth import login_required, uid
from extensions import folders_col, notes_col
from helpers import serialize

folders_bp = Blueprint("folders", __name__)


@folders_bp.route("/api/folders", methods=["GET"])           # Get all folders
@login_required
def get_folders():
    return jsonify([serialize(f) for f in folders_col.find({"user_id": uid()})])   # Only this user's folders; convert each _id to text, then send as JSON


@folders_bp.route("/api/folders", methods=["POST"])          # Create a new folder
@login_required
def add_folder():
    data = request.get_json()                                # Read what the browser sent (name, icon, color)
    now = datetime.now().isoformat()                         # Current date and time as text
    folder = {"user_id": uid(),                              # The owner of this folder
              "name": data.get("name", "New folder"),        # Folder name (default: New folder)
              "icon": data.get("icon", "📁"),                # Emoji icon of the folder
              "color": data.get("color", "blue"),            # Card color
              "state": "active",                             # A new folder is active right away
              "created_at": now, "updated_at": now}          # When it was created and last modified
    folder["_id"] = str(folders_col.insert_one(folder).inserted_id)   # Save to MongoDB, get the new ID as text
    return jsonify(folder), 201                              # Return the folder (201 = Created)


@folders_bp.route("/api/folders/<fid>", methods=["PUT"])     # Edit a folder (rename, archive, trash, restore)
@login_required
def update_folder(fid):
    data = request.get_json()                                # New values from the browser
    allowed = {k: v for k, v in data.items() if k in ("name", "icon", "color", "state")}   # Only fields that are allowed to change
    allowed["updated_at"] = datetime.now().isoformat()       # Update the "last modified" time
    result = folders_col.update_one({"_id": ObjectId(fid), "user_id": uid()}, {"$set": allowed})   # Find the folder (must be this user's) and update it
    if result.matched_count == 0:                            # No folder with that id belongs to this user...
        return jsonify({"error": "Folder not found"}), 404   # ...so stop here and do NOT touch any notes
    if "state" in allowed:                                   # If the folder's state changed...
        notes_col.update_many({"folder_id": fid, "user_id": uid()}, {"$set": {"state": allowed["state"]}})   # ...this user's notes inside follow the same state
    return jsonify({"message": "Folder updated"})            # Report success


@folders_bp.route("/api/folders/<fid>", methods=["DELETE"])  # Permanently delete a folder
@login_required
def delete_folder(fid):
    result = folders_col.delete_one({"_id": ObjectId(fid), "user_id": uid()})   # Delete the folder, only if it is this user's
    if result.deleted_count:                                 # Only if a folder was really deleted...
        notes_col.delete_many({"folder_id": fid, "user_id": uid()})   # ...also delete this user's notes inside it
    return jsonify({"message": "Folder deleted"})            # Report success
