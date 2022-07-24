/* global describe, beforeAll, beforeEach, it, expect */

describe("default store", function () {
  let testUser;
  let apex;
  let client;
  beforeAll(async function () {
    const init = await global.initApex();
    testUser = init.testUser;
    apex = init.apex;
    client = init.client;
  });
  beforeEach(function () {
    return global.resetDb(apex, client, testUser);
  });
  describe("denormalized updates", function () {
    it("udpates doubly nested objects", async function () {
      const create = await apex.buildActivity(
        "Create",
        testUser.id,
        [testUser.id],
        {
          object: [
            {
              id: "https://localhost/o/abc123",
              attributedTo: testUser.id,
              type: "Note",
              content: "Hello",
            },
            {
              id: "https://localhost/o/notupdated",
              attributedTo: testUser.id,
              type: "Note",
              content: "Goodbye",
            },
          ],
        }
      );
      await apex.store.saveActivity(create);
      await apex.store.saveObject(create.object[0]);
      const announce = await apex.buildActivity(
        "Announce",
        testUser.id,
        [testUser.id],
        {
          object: [create],
        }
      );
      await apex.store.saveActivity(announce);
      const updated = {
        id: "https://localhost/o/abc123",
        type: "Note",
        attributedTo: [testUser.id],
        content: ["Hello again"],
      };
      const notUpdated = {
        id: "https://localhost/o/notupdated",
        type: "Note",
        attributedTo: [testUser.id],
        content: ["Goodbye"],
      };
      await apex.store.updateObject(updated, testUser.id, true);
      const newCreate = await apex.store.getActivity(create.id);
      expect(newCreate.object).toEqual([updated, notUpdated]);
      const newAnnounce = await apex.store.getActivity(announce.id);
      expect(newAnnounce.object[0].object).toEqual([updated, notUpdated]);
    });
    it("updates queued signing keys", async function () {
      await apex.store.deliveryEnqueue(
        testUser.id,
        "hello",
        testUser.inbox,
        testUser._meta.privateKey
      );
      testUser._meta.privateKey = "newkey";
      await apex.store.updateObject(testUser, testUser.id, true);
      const updated = await apex.store.deliveryDequeue();
      delete updated.after;
      expect(updated).toEqual({
        actorId: testUser.id,
        body: "hello",
        address: testUser.inbox[0],
        attempt: 0,
        signingKey: "newkey",
      });
    });
  });
});
