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

from flask import Flask, jsonify, render_template, session, redirect, make_response   # session, redirect and make_response are only used by the home page below
from pymongo.errors import PyMongoError                      # PyMongoError = any database error (used at the bottom)
from bson.errors import InvalidId                            # raised when an id in a URL is not a valid ObjectId

from extensions import db                                    # database (connection + ping test happen inside extensions.py)
from auth import init_auth                                   # everything about accounts lives in auth.py
from routes.tasks import tasks_bp                            # Feature 1: To-do list
from routes.notes import notes_bp                            # Feature 2: Notes
from routes.schedules import schedules_bp                    # Feature 3: Schedule tracking
from routes.folders import folders_bp                        # Feature 4: Folders

app = Flask(__name__)                                        # Create the Flask app; __name__ tells Flask where this file lives

# Set up accounts: sets the SECRET_KEY + cookie settings, creates the users collection, adds /login, /api/register, /api/login, /api/logout
init_auth(app, db)

# Plug in every feature module
for bp in (tasks_bp, notes_bp, schedules_bp, folders_bp):
    app.register_blueprint(bp)


# ------------------------------------------------------------
# HOME PAGE
# ------------------------------------------------------------
@app.route("/")                                              # When someone opens http://localhost:5000/ run the function below
def home():                                                  # Function for the home page
    if "user_id" not in session:                             # Not logged in?
        return redirect("/login")                            # Send them to the login page
    page = make_response(render_template("index.html", username=session["username"]))   # Load templates/index.html and pass the username to it
    page.headers["Cache-Control"] = "no-store"               # Stops the browser's Back button from showing the app after logging out
    return page


# ------------------------------------------------------------
# ERROR HANDLERS  (app-level handlers also catch errors raised inside blueprints)
# ------------------------------------------------------------
@app.errorhandler(InvalidId)                                 # runs when a URL contains a broken id like /api/tasks/abc
def bad_id(e):
    return jsonify({"error": "Item not found"}), 404


@app.errorhandler(PyMongoError)                              # runs whenever a database error happens
def db_error(e):
    print("DATABASE ERROR:", e)
    return jsonify({"error": "Cannot reach the database. Check MONGO_URI, password and Atlas Network Access."}), 503


# ------------------------------------------------------------
# RUN THE APP
# ------------------------------------------------------------
if __name__ == "__main__":                                   # Only true when you run this file directly (python app.py)
    app.run(debug=True, use_reloader=False)                  # Start the server at http://localhost:5000 with error details (auto-reload is off)
