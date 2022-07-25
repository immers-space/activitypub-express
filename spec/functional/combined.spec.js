/* global describe, beforeAll, beforeEach, it, expect, jest */
const request = require("supertest");
const nock = require("nock");
const TestUtils = require("../helpers/test-utils");

describe("combined inbox/outbox flows", function () {
  let testUser;
  let app;
  let apex;
  let client;
  beforeAll(async function () {
    const init = await TestUtils.initApex();
    testUser = init.testUser;
    app = init.app;
    apex = init.apex;
    client = init.client;
    const auth = (req, res, next) => {
      res.locals.apex.authorized = true;
      next();
    };
    app
      .route("/outbox/:actor")
      .get(apex.net.outbox.get)
      .post(auth, apex.net.outbox.post);
    app
      .route("/inbox/:actor")
      .get(apex.net.inbox.get)
      .post(apex.net.inbox.post);
    // app.get('/authorized/outbox/:actor', (req, res, next) => {
    //   res.locals.apex.authorized = true
    //   next()
    // }, apex.net.outbox.get)
  });
  afterAll(async () => {
    await TestUtils.teardown(client);
  });
  beforeEach(function () {
    // don't let failed deliveries pollute later tests
    jest.spyOn(apex.store, "deliveryRequeue").mockResolvedValue(undefined);
    return TestUtils.resetDb(apex, client, testUser);
  });

  it("adds followers and delivers to them", async function () {
    const follow = await apex.buildActivity(
      "Follow",
      "https://mocked.com/u/mocked",
      testUser.id,
      {
        object: testUser.id,
      }
    );
    delete follow._meta;
    nock("https://mocked.com").get("/u/mocked").reply(200, {
      id: "https://mocked.com/u/mocked",
      type: "Actor",
      inbox: "https://mocked.com/u/mocked/inbox",
    });
    // accept & update delivery
    nock("https://mocked.com").post("/u/mocked/inbox").reply(200);
    nock("https://mocked.com").post("/u/mocked/inbox").reply(200);

    let deliveryMade;
    const deliveryPromise = new Promise((resolve) => {
      deliveryMade = resolve;
    });

    // create delivery
    nock("https://mocked.com")
      .post("/u/mocked/inbox")
      .reply(200)
      .on("request", (req, interceptor, body) => {
        const activity = JSON.parse(body);
        expect(activity.type).toEqual("Create");
        expect(activity.object.type).toEqual("Note");
        expect(activity.object.content).toEqual("Hello world");
        setTimeout(() => deliveryMade(), 10);
      });
    let followResolve;
    const followId = new Promise((resolve) => {
      followResolve = resolve;
    });
    app.once("apex-inbox", (msg) => {
      followResolve(msg.activity.id);
    });
    await request(app)
      .post("/inbox/test")
      .set("Content-Type", "application/activity+json")
      .send(follow)
      .expect(200);
    const accept = await apex.buildActivity(
      "Accept",
      testUser.id,
      "https://mocked.com/u/mocked",
      {
        object: await followId,
      }
    );
    await request(app)
      .post("/outbox/test")
      .set("Content-Type", "application/activity+json")
      .send(accept)
      .expect(201);
    expect(
      (await apex.getFollowers(testUser, Infinity, true)).orderedItems
    ).toEqual([
      {
        id: "https://mocked.com/u/mocked",
        type: "Actor",
        inbox: ["https://mocked.com/u/mocked/inbox"],
      },
    ]);
    const note = {
      type: "Note",
      content: "Hello world",
      to: testUser.followers,
    };
    // try to avoid race between background update and the note sent next
    await new Promise((resolve) => setTimeout(resolve, 50));
    await request(app)
      .post("/outbox/test")
      .set("Content-Type", "application/activity+json")
      .send(note)
      .expect(201);

    await deliveryPromise;
  });
});
