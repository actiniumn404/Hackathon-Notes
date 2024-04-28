from flask import Flask, render_template, request, jsonify, make_response, redirect
from flask_socketio import SocketIO, emit
import jwt
import pymongo

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True

socketio = SocketIO(app)
socketio.init_app(app, cors_allowed_origins="*")


@app.route('/')
def page_home():
    return render_template("app.html", name="app")


@socketio.on('connect')
def socket_connect():
    emit("Message", "yay!")


if __name__ == "__main__":
    socketio.run(app, allow_unsafe_werkzeug=True)