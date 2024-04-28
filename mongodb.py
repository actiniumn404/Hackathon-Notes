from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

import json

with open("structure.json") as raw_doc:
    document = json.loads(raw_doc.read())


def get_db():
    uri = "mongodb+srv://andrewchen10:sK7MP0Ilnqkl1dik@hackathondecisions.dft0zvl.mongodb.net/?retryWrites=true&w=majority&appName=HackathonDecisions"
    client = MongoClient(uri, server_api=ServerApi('1'))

    try:
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")
    except Exception as e:
        print(e)

    return client


db = get_db()["database"]
print(db)

db["users"].insert_one(document["users"])
db["notes"].insert_one(document["notes"])
