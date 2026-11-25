# ------------------------------------------------------------
# HELPER FUNCTIONS  (used by several route modules)
# ------------------------------------------------------------
from bson import ObjectId                                    # ObjectId is MongoDB's special type for the unique _id of each document
from auth import uid                                         # uid() = id of the logged-in user
from extensions import folders_col


def serialize(doc):                                          # MongoDB documents contain ObjectId, which JSON can't handle, so we convert it
    doc["_id"] = str(doc["_id"])                             # Turn the ObjectId into a plain string
    return doc                                               # Return the cleaned document


def folder_is_mine(folder_id):                               # True if folder_id is empty or is a folder owned by the current user
    if not folder_id:                                        # A note with no folder is fine
        return True
    return folders_col.count_documents({"_id": ObjectId(folder_id), "user_id": uid()}, limit=1) == 1   # Does a folder with this id AND this owner exist?
