# ============================================================
# auth.py - EVERYTHING about accounts lives here:
#   register, login, logout, the login page, and the @login_required protection.
# test3.py only does:   from auth import init_auth, login_required, uid
#                       init_auth(app, db)
# (A Flask "Blueprint" is a group of routes kept in a separate file.)
# ============================================================

from flask import Blueprint, request, jsonify, render_template, session, redirect   # Blueprint = a group of routes; session = remembers who is logged in; redirect = send the browser to another URL
from pymongo.errors import DuplicateKeyError                 # Raised when a username already exists
from datetime import datetime, timedelta                     # datetime = dates/times; timedelta = a length of time (e.g., 30 days)
from functools import wraps                                  # Needed to build the @login_required decorator
from werkzeug.security import generate_password_hash, check_password_hash   # Safe password hashing (comes with Flask, nothing extra to install)
import os                                                    # To read environment variables (SECRET_KEY, RENDER)
import re                                                    # Regular expressions: used to check the username

auth_bp = Blueprint("auth", __name__)                        # Create the group of routes; test3.py plugs it into the app inside init_auth()
users_col = None                                             # The MongoDB "users" collection; it is filled in by init_auth() below


# ------------------------------------------------------------
# SETUP - test3.py calls this ONE time, right after it connects to MongoDB
# ------------------------------------------------------------
def init_auth(app, db):                                      # app = the Flask app, db = the MongoDB database from test3.py
    global users_col                                         # We want to set the users_col variable defined above
    is_render = "RENDER" in os.environ                       # Render sets this variable automatically, so it is True online and False on your computer
    app.secret_key = os.environ.get("SECRET_KEY")            # The secret that signs the login cookie. NEVER type the real one in the code (it goes to GitHub!)
    if not app.secret_key:                                   # No SECRET_KEY was set...
        if is_render:                                        # ...online this is dangerous, so stop the app with a clear message
            raise RuntimeError("Set a SECRET_KEY environment variable in Render first (Environment tab)")
        app.secret_key = "local-dev-key-change-me"           # ...on your own computer a fixed dev key is fine
        print("WARNING: using the local dev SECRET_KEY (OK on your computer, never online)")
    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,                        # JavaScript cannot read the login cookie (protects against stolen cookies)
        SESSION_COOKIE_SAMESITE="Lax",                       # The cookie is not sent on requests started by other websites
        SESSION_COOKIE_SECURE=is_render,                     # Online (https) the cookie is only sent over https; locally (http) it must stay False
        PERMANENT_SESSION_LIFETIME=timedelta(days=30),       # Stay logged in for 30 days (see session.permanent = True below)
    )
    users_col = db["users"]                                  # Collection that stores accounts: username + hashed password
    try:
        users_col.create_index("username_lower", unique=True)   # MongoDB itself refuses two accounts with the same username (any capitalization)
    except Exception as e:
        print("Could not create the users index:", e)
    app.register_blueprint(auth_bp)                          # Plug the routes below into the app


# ------------------------------------------------------------
# HELPERS used by the rest of the app (imported by test3.py)
# ------------------------------------------------------------
def uid():                                                   # The id of the user who is logged in right now
    return session["user_id"]                                # It was saved in the session when they logged in


def login_required(view):                                    # A decorator: put @login_required under @app.route to protect a route
    @wraps(view)                                             # Keeps the original function's name (Flask needs unique names)
    def wrapper(*args, **kwargs):                            # This runs INSTEAD of the real route function
        if "user_id" not in session:                         # Nobody is logged in...
            return jsonify({"error": "Please log in first"}), 401   # ...401 = Unauthorized (app.js sends the browser to /login when it sees this)
        return view(*args, **kwargs)                         # Logged in: run the real route function
    return wrapper


# ------------------------------------------------------------
# ROUTES
# ------------------------------------------------------------
USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,20}$")            # Username rule: 3-20 characters, only letters, numbers and underscore


@auth_bp.route("/login")                                     # The login / sign-up page
def login_page():
    if "user_id" in session:                                 # Already logged in?
        return redirect("/")                                 # Then go straight to the app
    return render_template("login.html")                     # Otherwise show templates/login.html


@auth_bp.route("/api/register", methods=["POST"])            # URL for creating a new account
def register():
    data = request.get_json(silent=True) or {}               # Read the JSON; silent=True gives {} instead of crashing on bad input
    username = str(data.get("username", "")).strip()         # Username typed by the user (spaces at the ends removed)
    password = str(data.get("password", ""))                 # Password typed by the user (we do NOT strip it)
    if not USERNAME_RE.match(username):                      # Check the username rule from above
        return jsonify({"error": "Username must be 3-20 characters: letters, numbers or _"}), 400
    if not 8 <= len(password) <= 128:                        # Check the password length
        return jsonify({"error": "Password must be 8 to 128 characters"}), 400
    user = {                                                 # The account document that goes into MongoDB
        "username": username,                                # Shown in the app, keeps the capitalization they typed
        "username_lower": username.lower(),                  # Used for lookups, so "Juan" and "juan" are the same account
        "password_hash": generate_password_hash(password, method="pbkdf2:sha256"),   # We store a one-way HASH, never the real password
        "created_at": datetime.now().isoformat(),            # When the account was made
    }
    try:
        result = users_col.insert_one(user)                  # Save the account
    except DuplicateKeyError:                                # The unique index rejected it: the username exists already
        return jsonify({"error": "That username is already taken"}), 409
    session.clear()                                          # Start from a clean session
    session["user_id"] = str(result.inserted_id)             # Remember who is logged in (stored in a signed cookie)
    session["username"] = username                           # Also remember the name so the page can show it
    session.permanent = True                                 # Keep the cookie for 30 days instead of until the browser closes
    return jsonify({"username": username}), 201             # 201 = Created


@auth_bp.route("/api/login", methods=["POST"])               # URL for logging in
def login():
    data = request.get_json(silent=True) or {}               # Read the JSON safely
    username = str(data.get("username", "")).strip()         # Typed username
    password = str(data.get("password", ""))                 # Typed password
    user = users_col.find_one({"username_lower": username.lower()})   # Look for the account
    if not user or not check_password_hash(user["password_hash"], password):   # No such user OR wrong password
        return jsonify({"error": "Wrong username or password"}), 401   # Same message for both, so nobody can guess which usernames exist
    session.clear()                                          # Start from a clean session
    session["user_id"] = str(user["_id"])                    # Remember who is logged in
    session["username"] = user["username"]                   # Remember the name
    session.permanent = True                                 # Keep the cookie for 30 days
    return jsonify({"username": user["username"]})           # Success


@auth_bp.route("/api/logout", methods=["POST"])              # URL for logging out
def logout():
    session.clear()                                          # Forget everything about this browser's login
    return jsonify({"message": "Logged out"})
