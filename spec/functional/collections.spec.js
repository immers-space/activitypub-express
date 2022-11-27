/* global describe, beforeAll, beforeEach, it, expect */
const request = require("supertest");
const TestUtils = require("../helpers/test-utils");

describe("collections", function () {
  let testUser;
  let app;
  let apex;
  let client;
  const actors = [
    { id: "https://ignore.com/bob", inbox: "https://ignore.com/bob/in" },
    { id: "https://ignore.com/mary", inbox: "https://ignore.com/mary/in" },
    { id: "https://ignore.com/sue", inbox: "https://ignore.com/sue/in" },
  ];
  beforeAll(async function () {
    const init = await TestUtils.initApex();
    testUser = init.testUser;
    app = init.app;
    apex = init.apex;
    client = init.client;
    app.use((req, res, next) => {
      res.locals.apex.authorized = true;
      next();
    });
    app.get("/followers/:actor", apex.net.followers.get);
    app.get("/following/:actor", apex.net.following.get);
    app.get("/liked/:actor", apex.net.liked.get);
    app.get("/u/:actor/blocked", apex.net.blocked.get);
    app.get("/u/:actor/rejected", apex.net.rejected.get);
    app.get("/u/:actor/rejections", apex.net.rejections.get);
    app.get("/s/:id/shares", apex.net.shares.get);
    app.get("/s/:id/likes", apex.net.likes.get);
    app.get("/u/:actor/c/:id", apex.net.collections.get);
  });
  beforeEach(async function () {
    await TestUtils.resetDb(apex, client, testUser);
    for (const actor of actors) {
      await apex.store.saveObject(actor);
    }
  });
  describe("followers", function () {
    let firstActivity;
    beforeEach(async function () {
      let followers = actors.map((follower) => {
        return apex.buildActivity("Follow", follower.id, testUser.id, {
          object: testUser.id,
        });
      });
      followers = await Promise.all(followers);
      followers.forEach((f) =>
        apex.addMeta(f, "collection", testUser.inbox[0])
      );
      // simulate accepting 2 of the 3
      apex.addMeta(followers[0], "collection", testUser.followers[0]);
      apex.addMeta(followers[2], "collection", testUser.followers[0]);
      for (const follow of followers) {
        await apex.store.saveActivity(follow);
      }
      firstActivity = await apex.store.db
        .collection("streams")
        .findOne({}, { sort: { _id: 1 } });
    });
    it("returns followers collection", async function () {
      const res = await request(app)
        .get("/followers/test")
        .set("Accept", "application/activity+json")
        .expect(200);
      const standard = {
        "@context": [
          "https://www.w3.org/ns/activitystreams",
          "https://w3id.org/security/v1",
        ],
        id: "https://localhost/followers/test",
        type: "OrderedCollection",
        totalItems: 2,
        first: "https://localhost/followers/test?page=true",
      };
      expect(res.body).toEqual(standard);
    });
    it("page returns accepted followers", async function () {
      const res = await request(app)
        .get("/followers/test?page=true")
        .set("Accept", "application/activity+json")
        .expect(200);
      const standard = {
        "@context": [
          "https://www.w3.org/ns/activitystreams",
          "https://w3id.org/security/v1",
        ],
        id: "https://localhost/followers/test?page=true",
        type: "OrderedCollectionPage",
        partOf: "https://localhost/followers/test",
        orderedItems: [actors[2], actors[0]],
        next: `https://localhost/followers/test?page=${firstActivity._id}`,
      };
      expect(res.body).toEqual(standard);
    });
  });
  describe("following", function () {
    let firstActivity;
    beforeEach(async function () {
      let follows = [
        "https://ignore.com/bob",
        "https://ignore.com/mary",
        "https://ignore.com/sue",
      ].map((followerId) => {
        return apex.buildActivity("Follow", testUser.id, followerId, {
          object: followerId,
        });
      });
      follows = await Promise.all(follows);
      follows.forEach((f) => apex.addMeta(f, "collection", testUser.outbox[0]));
      apex.addMeta(follows[0], "collection", testUser.following[0]);
      apex.addMeta(follows[2], "collection", testUser.following[0]);
      for (const follow of follows) {
        await apex.store.saveActivity(follow);
      }
      firstActivity = await apex.store.db
        .collection("streams")
        .findOne({}, { sort: { _id: 1 } });
    });
    it("returns following collection", async function () {
      const res = await request(app)
        .get("/following/test")
        .set("Accept", "application/activity+json")
        .expect(200);
      const standard = {
        "@context": [
          "https://www.w3.org/ns/activitystreams",
          "https://w3id.org/security/v1",
        ],
        id: "https://localhost/following/test",
        type: "OrderedCollection",
        totalItems: 2,
        first: "https://localhost/following/test?page=true",
      };
      expect(res.body).toEqual(standard);
    });
    it("page returns accepted following", async function () {
      const res = await request(app)
        .get("/following/test?page=true")
        .set("Accept", "application/activity+json")
        .expect(200);
      const standard = {
        "@context": [
          "https://www.w3.org/ns/activitystreams",
          "https://w3id.org/security/v1",
        ],
        id: "https://localhost/following/test?page=true",
        type: "OrderedCollectionPage",
        partOf: "https://localhost/following/test",
        orderedItems: ["https://ignore.com/sue", "https://ignore.com/bob"],
        next: `https://localhost/following/test?page=${firstActivity._id}`,
      };
      expect(res.body).toEqual(standard);
    });
  });
  describe("liked collection", function () {
    let firstActivity;
    beforeEach(async function () {
      let likes = [
        "https://ignore.com/s/1",
        "https://ignore.com/s/2",
        "https://ignore.com/s/3",
      ].map((objId) => {
        return apex.buildActivity(
          "Like",
          testUser.id,
          "https://ignore.com/bob",
          { object: objId }
        );
      });
      likes = await Promise.all(likes);
      likes.forEach((f) => apex.addMeta(f, "collection", testUser.liked[0]));
      for (const like of likes) {
        await apex.store.saveActivity(like);
      }
      firstActivity = await apex.store.db
        .collection("streams")
        .findOne({}, { sort: { _id: 1 } });
    });
    it("returns liked collection", async function () {
      const res = await request(app)
        .get("/liked/test")
        .set("Accept", "application/activity+json")
        .expect(200);
      const standard = {
        "@context": [
          "https://www.w3.org/ns/activitystreams",
          "https://w3id.org/security/v1",
        ],
        id: "https://localhost/liked/test",
        type: "OrderedCollection",
        totalItems: 3,
        first: "https://localhost/liked/test?page=true",
      };
      expect(res.body).toEqual(standard);
    });
    it("page returns liked objects", async function () {
      const res = await request(app)
        .get("/liked/test?page=true")
        .set("Accept", "application/activity+json")
        .expect(200);
      const standard = {
        "@context": [
          "https://www.w3.org/ns/activitystreams",
          "https://w3id.org/security/v1",
        ],
        id: "https://localhost/liked/test?page=true",
        type: "OrderedCollectionPage",
        partOf: "https://localhost/liked/test",
        next: `https://localhost/liked/test?page=${firstActivity._id}`,
        orderedItems: [
          "https://ignore.com/s/3",
          "https://ignore.com/s/2",
          "https://ignore.com/s/1",
        ],
      };
      expect(res.body).toEqual(standard);
    });
  });
  describe("activity special collections", function () {
    describe("shares", function () {
      it("adds shares collection to created activities", async function () {
        const act = await apex.buildActivity(
          "Create",
          testUser.id,
          testUser.followers,
          {
            object: {
              id: apex.utils.objectIdToIRI(),
              type: "Note",
              content: "hello",
            },
          }
        );
        expect(act.shares).toEqual([await apex.getShares(act)]);
      });
      it("get page returns announces for activity", async function () {
        const act = await apex.buildActivity(
          "Create",
          testUser.id,
          testUser.followers,
          {
            object: {
              id: apex.utils.objectIdToIRI(),
              type: "Note",
              content: "hello",
            },
          }
        );
        const announce = await apex.buildActivity(
          "Announce",
          "https://ignore.com/bob",
          testUser.id,
          {
            object: act.id,
          }
        );
        await apex.addMeta(
          announce,
          "collection",
          apex.objectIdFromValue(act.shares)
        );
        await apex.store.saveActivity(act);
        await apex.store.saveActivity(announce);
        try {
          const res = await request(app)
            .get(`${act.id}/shares?page=true`.replace("https://localhost", ""))
            .set("Accept", "application/activity+json")
            .expect(200);
          const standard = await TestUtils.toExternalJSONLD(
            apex,
            announce,
            true
          );
          standard.actor = actors.find((act) => act.id === announce.actor[0]);
          expect(res.body.orderedItems).toEqual([standard]);
        } catch (e) {
          throw e;
        }
      });
    });
    describe("likes", function () {
      it("adds likes collection to created activities", async function () {
        const act = await apex.buildActivity(
          "Create",
          testUser.id,
          testUser.followers,
          {
            object: {
              id: apex.utils.objectIdToIRI(),
              type: "Note",
              content: "hello",
            },
          }
        );
        expect(act.likes).toEqual([await apex.getLikes(act)]);
      });
      it("returns likes for activity", async function () {
        const act = await apex.buildActivity(
          "Create",
          testUser.id,
          testUser.followers,
          {
            object: {
              id: apex.utils.objectIdToIRI(),
              type: "Note",
              content: "hello",
            },
          }
        );
        const like = await apex.buildActivity(
          "Like",
          "https://ignore.com/bob",
          testUser.id,
          {
            object: act.id,
          }
        );
        await apex.addMeta(
          like,
          "collection",
          apex.objectIdFromValue(act.likes)
        );
        await apex.store.saveActivity(act);
        await apex.store.saveActivity(like);
        const res = await request(app)
          .get(`${act.id}/likes?page=true`.replace("https://localhost", ""))
          .set("Accept", "application/activity+json")
          .expect(200);
        const standard = await TestUtils.toExternalJSONLD(apex, like, true);
        standard.actor = actors.find((act) => act.id === like.actor[0]);
        expect(res.body.orderedItems).toEqual([standard]);
      });
    });
  });
  describe("misc collections", function () {
    it("gets collection items", async function () {
      const col = `${testUser.id}/c/cool-stuff`;
      const act = await apex.buildActivity(
        "Create",
        testUser.id,
        testUser.followers,
        {
          object: {
            id: "https://localhost/o/cool-doc",
            type: "Document",
            name: "Cool document",
          },
        }
      );
      // convert to output format for test standard
      const actOut = await TestUtils.toExternalJSONLD(
        apex,
        apex.mergeJSONLD(act, { actor: [testUser] }),
        true
      );
      apex.addMeta(act, "collection", col);
      await apex.store.saveActivity(act);
      const res = await request(app)
        .get(`${col.replace("https://localhost", "")}?page=true`)
        .set("Accept", "application/activity+json")
        .expect(200);
      expect(res.body.orderedItems).toEqual([actOut]);
    });
  });
  describe("internal special collections", function () {
    it("blocked gets blocked actor ids", async function () {
      const baddies = [
        "https://ignore.com/u/chud",
        "https://ignore.com/u/reply-guy",
        "https://ignore.com/u/terf",
      ];
      let blocks = baddies.map((objId) => {
        return apex.buildActivity("Block", testUser.id, null, {
          object: objId,
        });
      });
      blocks = await Promise.all(blocks);
      blocks.forEach((f) =>
        apex.addMeta(
          f,
          "collection",
          apex.utils.nameToBlockedIRI(testUser.preferredUsername)
        )
      );
      for (const block of blocks) {
        await apex.store.saveActivity(block);
      }
      const blockList = await apex.getBlocked(testUser, Infinity, true);
      expect(blockList.orderedItems).toEqual(baddies.reverse());
    });
    it("rejections gets actors rejected activity ids", async function () {
      const meanies = [
        "https://ignore.com/u/blue-check",
        "https://ignore.com/u/celeb",
        "https://ignore.com/u/leet",
      ];
      let follows = meanies.map((objId) => {
        return apex.buildActivity("Follow", testUser.id, null, {
          object: objId,
        });
      });
      follows = await Promise.all(follows);
      follows.forEach((f) =>
        apex.addMeta(
          f,
          "collection",
          apex.utils.nameToRejectionsIRI(testUser.preferredUsername)
        )
      );
      for (const follow of follows) {
        await apex.store.saveActivity(follow);
      }
      const rejections = await apex.getRejections(testUser, Infinity, true);
      expect(rejections.orderedItems).toEqual(
        follows.map((f) => f.id).reverse()
      );
    });
    it("rejected gets ids for activities rejected by actor", async function () {
      const baddies = [
        "https://ignore.com/u/chud",
        "https://ignore.com/u/reply-guy",
        "https://ignore.com/u/terf",
      ];
      let follows = baddies.map((objId) => {
        return apex.buildActivity("Follow", testUser.id, testUser.id, {
          object: testUser.id,
        });
      });
      follows = await Promise.all(follows);
      follows.forEach((f) =>
        apex.addMeta(
          f,
          "collection",
          apex.utils.nameToRejectedIRI(testUser.preferredUsername)
        )
      );
      for (const follow of follows) {
        await apex.store.saveActivity(follow);
      }
      const rejected = await apex.getRejected(testUser, Infinity, true);
      expect(rejected.orderedItems).toEqual(follows.map((a) => a.id).reverse());
    });
    it("blocked c2s endpoint returns collection", async function (done) {
      request(app)
        .get("/u/test/blocked")
        .set("Accept", "application/activity+json")
        .expect(200)
        .end(function (err, res) {
          const standard = {
            "@context": [
              "https://www.w3.org/ns/activitystreams",
              "https://w3id.org/security/v1",
            ],
            id: "https://localhost/u/test/blocked",
            type: "OrderedCollection",
            totalItems: 0,
            first: "https://localhost/u/test/blocked?page=true",
          };
          expect(res.body).toEqual(standard);
          done(err);
        });
    });
    it("rejected c2s endpoint returns collection", async function (done) {
      request(app)
        .get("/u/test/rejected")
        .set("Accept", "application/activity+json")
        .expect(200)
        .end(function (err, res) {
          const standard = {
            "@context": [
              "https://www.w3.org/ns/activitystreams",
              "https://w3id.org/security/v1",
            ],
            id: "https://localhost/u/test/rejected",
            type: "OrderedCollection",
            totalItems: 0,
            first: "https://localhost/u/test/rejected?page=true",
          };
          expect(res.body).toEqual(standard);
          done(err);
        });
    });
    it("rejections c2s endpoint returns collection", async function (done) {
      request(app)
        .get("/u/test/rejections")
        .set("Accept", "application/activity+json")
        .expect(200)
        .end(function (err, res) {
          const standard = {
            "@context": [
              "https://www.w3.org/ns/activitystreams",
              "https://w3id.org/security/v1",
            ],
            id: "https://localhost/u/test/rejections",
            type: "OrderedCollection",
            totalItems: 0,
            first: "https://localhost/u/test/rejections?page=true",
          };
          expect(res.body).toEqual(standard);
          done(err);
        });
    });
  });
});
