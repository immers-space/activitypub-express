const { MongoClient } = require("mongodb");
const express = require("express");
const ActivitypubExpress = require("../../index");

const exported = {};

exported.initApex = async function initApex() {
  const routes = {
    actor: "/u/:actor",
    object: "/o/:id",
    activity: "/s/:id",
    inbox: "/inbox/:actor",
    outbox: "/outbox/:actor",
    followers: "/followers/:actor",
    following: "/following/:actor",
    liked: "/liked/:actor",
    shares: "/s/:id/shares",
    likes: "/s/:id/likes",
    collections: "/u/:actor/c/:id",
    blocked: "/u/:actor/blocked",
    rejections: "/u/:actor/rejections",
    rejected: "/u/:actor/rejected",
    nodeinfo: "/nodeinfo",
  };
  const app = express();
  const apex = ActivitypubExpress({
    name: "Apex Test Suite",
    version: process.env.npm_package_version,
    openRegistrations: false,
    nodeInfoMetadata: { foo: "bar" },
    domain: "localhost",
    actorParam: "actor",
    objectParam: "id",
    activityParam: "id",
    routes,
    endpoints: {
      uploadMedia: "https://localhost/upload",
      oauthAuthorizationEndpoint: "https://localhost/auth/authorize",
      proxyUrl: "https://localhost/proxy",
    },
    info: {
      softwareName: "ActivityPub Express",
      version: "2.3.0",
      metadata: {
        foo: "bar",
      },
    },
  });

  app.use(
    express.json({ type: apex.consts.jsonldTypes }),
    express.urlencoded({ extended: true }),
    apex
  );
  app.use(function (err, req, res, next) {
    console.log(err);
    next(err);
  });

  const client = new MongoClient("mongodb://root:example@localhost:27017");
  await client.connect();
  apex.store.db = client.db("apexTestingTempDb");
  const testUser = await apex.createActor("test", "test", "test user");

  return { app, apex, client, testUser, routes };
};

exported.resetDb = async function (apex, client, testUser) {
  // reset db for each test
  await client.db("apexTestingTempDb").dropDatabase();
  apex.store.db = client.db("apexTestingTempDb");
  delete testUser._local;
  await apex.store.setup(testUser);
  testUser._local = { blockList: [] };
};

exported.teardown = async function (client) {
  await client.close();
};

// remove properties from object that may differ for each test run
exported.stripIds = function (obj) {
  return JSON.parse(JSON.stringify(obj, skipTransient));
};

function skipTransient(key, value) {
  if (["_id", "id", "published", "first"].includes(key)) {
    return undefined;
  }
  return value;
}

exported.toExternalJSONLD = async function (apex, value, noContext) {
  value = JSON.parse(apex.stringifyPublicJSONLD(await apex.toJSONLD(value)));
  if (noContext) {
    delete value["@context"];
  }
  return value;
};

module.exports = exported;
