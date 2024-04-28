from flask import Flask, render_template, request, jsonify, make_response, redirect
from flask_socketio import SocketIO, emit, join_room, leave_room, send
import jwt
import pymongo
import os

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True

socketio = SocketIO(app)
socketio.init_app(app, cors_allowed_origins="*")

STATE = {"USERS": {}}

def check(token):
    try:
        decoded = jwt.decode(token, os.getenv("JWTSecret"), "HS256")
    except:
        return None
    return decoded

@app.route('/notes/<path:room>', defaults={"room": None})
def page_home(room):
    if not "jwt" in request.cookies:
        return redirect("/login")
    if not check(request.cookies.get("jwt")):
        return redirect("/login?err=invalid")

    return render_template("app.html", name="app")


@app.route('/api/signup', methods=["POST"])
def api_signup():
    data = request.get_json()


@socketio.on("join room")
def socket_join_room(data):
    if type(data) != dict:
        emit("error", "Invalid format of query", to=request.sid)
        return

    room = data.get("room", None)
    jwt = data.get("jwt", None)

    if not room or not jwt:
        emit("error", "Missing arguments in room join", to=request.sid)
        return

    decoded = check(jwt)

    if not decoded:
        emit("error", "Missing credentials. Connection denied", to=request.sid)
        return

    if room not in STATE["USERS"]:
        STATE["USERS"][room] = []

    STATE["USERS"][room].append(decoded)

    join_room(room)
    emit("new member", decoded, to=room)
    emit("notes data", decoded, to=request.sid)
    emit("member list", STATE["USERS"][room], to=request.sid)


@socketio.on("leave member")
def socket_leave_room(data):
    print("LEAVING")
    if type(data) != dict:
        emit("error", "Invalid format of query", to=request.sid)
        return

    room = data.get("room", None)
    jwt = data.get("jwt", None)

    if not room or not jwt:
        emit("error", "Missing arguments in room join", to=request.sid)
        return

    decoded = check(jwt)

    if not decoded:
        emit("error", "Missing credentials. Connection denied", to=request.sid)
        return

    if room not in STATE["USERS"]:
        STATE["USERS"][room] = []

    try:
        STATE["USERS"][room].remove(decoded)
    except:
        pass

    leave_room(room)
    emit("leave member", decoded, to=room)
    emit("member list", STATE["USERS"][room], to=room)

@socketio.on('connect')
def socket_connect():
    emit("Message", "yay!")


if __name__ == "__main__":
    socketio.run(app, allow_unsafe_werkzeug=True)