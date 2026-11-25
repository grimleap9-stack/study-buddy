# ============================================================
# FEATURE 2: NOTES
# ============================================================
import re                                                    # regular expressions: used to escape the search word
from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from auth import login_required, uid
from extensions import notes_col
from helpers import serialize, folder_is_mine

notes_bp = Blueprint("notes", __name__)


@notes_bp.route("/api/notes", methods=["POST"])              # URL for adding a note
@login_required
def add_note():                                              # Function to create a note
    data = request.get_json()                                # Read the note data (title, subject, content) from the frontend
    if not folder_is_mine(data.get("folder_id")):            # The note may only be put inside one of the user's own folders
        return jsonify({"error": "Folder not found"}), 404
    # (BAGO) Dagdag na fields: color, folder_id, state (active/archived/trashed), pinned, updated_at
    note = {
        "user_id": uid(),                                    # The owner of this note
        "color": data.get("color", "blue"),
        "folder_id": data.get("folder_id"),
        "state": "active",
        "pinned": data.get("pinned", False),
        "updated_at": datetime.now().isoformat(),
        "title": data.get("title", "Untitled"),              # Note title
        "subject": data.get("subject", ""),                  # Subject (e.g., Math, Science)
        "content": data.get("content", ""),                  # The note's main text
        "created_at": datetime.now().isoformat(),            # When the note was created
    }
    result = notes_col.insert_one(note)                      # Save to MongoDB
    note["_id"] = str(result.inserted_id)                    # Attach the new id as text
    return jsonify(note), 201                                # Return the saved note


@notes_bp.route("/api/notes", methods=["GET"])               # URL for listing/searching notes
@login_required
def get_notes():                                             # Function to fetch notes
    keyword = request.args.get("q", "").strip()              # Read ?q=something from the URL (the search keyword)
    query = {"user_id": uid()}                               # Always start with "only this user's notes"
    if keyword:                                              # Only filter if the user typed a keyword
        safe = re.escape(keyword)                            # Treat characters like ( or * as plain text, so they can't break the search
        query["$or"] = [                                     # Match notes where ANY of the following is true:
            {"title": {"$regex": safe, "$options": "i"}},        # title contains keyword (case-insensitive)
            {"content": {"$regex": safe, "$options": "i"}},      # content contains keyword
            {"subject": {"$regex": safe, "$options": "i"}},      # subject contains keyword
        ]
    notes = [serialize(n) for n in notes_col.find(query)]    # Run the query and clean each result
    return jsonify(notes)                                    # Send the list back


@notes_bp.route("/api/notes/<note_id>", methods=["PUT"])     # URL for editing a note
@login_required
def update_note(note_id):                                    # Function receives the note id
    data = request.get_json()                                # Read the new values
    if not folder_is_mine(data.get("folder_id")):            # Moving a note into someone else's folder is not allowed
        return jsonify({"error": "Folder not found"}), 404
    allowed = {k: v for k, v in data.items()                 # Keep only editable fields
               if k in ("title", "subject", "content", "color", "folder_id", "state", "pinned")}
    allowed["updated_at"] = datetime.now().isoformat()       # Remember when it was last changed
    notes_col.update_one({"_id": ObjectId(note_id), "user_id": uid()},   # Find the note (it must belong to this user)...
                         {"$set": allowed})                  # ...and update it
    return jsonify({"message": "Note updated"})              # Confirm success


@notes_bp.route("/api/notes/<note_id>", methods=["DELETE"])  # URL for deleting a note
@login_required
def delete_note(note_id):                                    # Function receives the note id
    notes_col.delete_one({"_id": ObjectId(note_id), "user_id": uid()})   # Remove it from MongoDB, only if it belongs to this user
    return jsonify({"message": "Note deleted"})              # Confirm success
