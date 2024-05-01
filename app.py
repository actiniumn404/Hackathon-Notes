import datetime
import math
import urllib.parse
import os
import json

from flask import Flask, render_template, request, jsonify, make_response, redirect
from flask_socketio import SocketIO, emit, join_room, leave_room, send
import jwt
import pymongo
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True

socketio = SocketIO(app)
socketio.init_app(app, cors_allowed_origins="*")

STATE = {"USERS": {}}


def get_db():
    uri = "mongodb+srv://andrewchen10:sK7MP0Ilnqkl1dik@hackathondecisions.dft0zvl.mongodb.net/?retryWrites=true&w=majority&appName=HackathonDecisions"
    client = MongoClient(uri, server_api=ServerApi('1'))

    try:
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")
    except Exception as e:
        print(e)

    return client["database"]


db = get_db()


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
    res = check(request.cookies.get("jwt"))
    if not res:
        return redirect("/login?err=invalid")

    return render_template("app.html", name="app", JWT=json.dumps(res), NAME=res["username"])


@app.route('/signup')
def page_signup():
    return render_template("signup.html", name="signup")

@app.route('/dashboard')
def page_dashboard():
    return render_template("signup.html", name="signup")


@app.route('/login')
def page_login():

    return render_template("login.html", name="login")


@app.route('/api/signup', methods=["POST"])
def api_signup():
    raw = urllib.parse.parse_qs(request.get_data())

    data = {}

    for key, value in raw.items():
        data[key.decode("utf-8")] = value[0].decode("utf-8")

    for parameter in ("username", "password", "repeat-password", "agree"):
        if parameter not in data:
            return redirect(f"/signup?err=Missing%20Required%20Parameter:%20{parameter}")
    if data["password"] != data["repeat-password"]:
        return redirect(f"/signup?err=Password%20and%20Repeat-Password%20Fields%20Must%20Match")
    data["username"] = data["username"].lower()
    if not (1 <= len(data["username"]) <= 40):
        return redirect(f"/signup?err=Username%20Length")
    if not (1 <= len(data["password"]) <= 40):
        return redirect(f"/signup?err=Password%20Length")

    for user in db["users"].find():
        keys = list(user.keys())
        if data["username"] in keys:
            print(keys)
            return redirect(f"/signup?err=Duplicate%20Username")
    db["users"].insert_one({data["username"]: data["password"], "icon": f"https://api.dicebear.com/8.x/identicon/svg?seed={data['username']}"})

    token = jwt.encode({
        "username": data["username"],
        "icon": f"https://api.dicebear.com/8.x/identicon/svg?seed={data['username']}",
        "iat": math.floor(datetime.datetime.timestamp(datetime.datetime.now())),
        "exp": math.floor(datetime.datetime.timestamp(datetime.datetime.now() + datetime.timedelta(days=30))),
    }, key=os.getenv("JWTSecret"), algorithm="HS256")

    res = make_response(redirect("/dashboard?login=success"), 200)
    res.set_cookie("jwt", token)

    return res

@app.route('/api/login', methods=["POST"])
def api_login():
    raw = urllib.parse.parse_qs(request.get_data())

    data = {}

    for key, value in raw.items():
        data[key.decode("utf-8")] = value[0].decode("utf-8")

    for parameter in ("username", "password"):
        if parameter not in data:
            return redirect(f"/login?err=Missing%20Required%20Parameter:%20{parameter}")

    data["username"] = data["username"].lower()

    for user in db["users"].find():
        keys = list(user.keys())
        if data["username"] in keys:
            break
    else:
        return redirect(f"/login?err=Invalid%20Username")

    if data["password"] != user[data["username"]]:
        return redirect(f"/login?err=Invalid%20Password")

    token = jwt.encode({
        "username": data["username"],
        "icon": user["icon"],
        "iat": math.floor(datetime.datetime.timestamp(datetime.datetime.now())),
        "exp": math.floor(datetime.datetime.timestamp(datetime.datetime.now() + datetime.timedelta(days=30))),
    }, key=os.getenv("JWTSecret"), algorithm="HS256")

    res = make_response(redirect("/dashboard?login=success"), 200)
    res.set_cookie("jwt", token, path="/")

    return res


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

    try:
        room_data = next(db["notes"].find({"name": room}))
    except StopIteration:
        emit("error", "Invalid Room", to=request.sid)
        return

    join_room(room)
    emit("new member", decoded, to=room)
    emit("notes data", room_data["data"], to=request.sid)
    emit("member list", STATE["USERS"][room], to=request.sid)
    emit("SID", request.sid, to=request.sid)


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

@socketio.on('relay data')
def socket_emit(data):
    emit("relay data", data, to=data["room"])
    db["notes"].replace_one({"name": data["room"]}, {
        "name": data["room"],
        "data": json.loads(data["data"])
    })


@socketio.on('connect')
def socket_connect():
    emit("Message", "yay!")


if __name__ == "__main__":
    socketio.run(app, allow_unsafe_werkzeug=True)