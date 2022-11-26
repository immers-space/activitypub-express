/* global describe, beforeAll, beforeEach, it, expect */

describe("actor utils", function () {
  let testUser;
  let app;
  let apex;
  let client;
  beforeAll(async function () {
    const init = await global.initApex();
    testUser = init.testUser;
    app = init.app;
    apex = init.apex;
    client = init.client;
    app
      .route("/outbox/:actor")
      .get(apex.net.outbox.get)
      .post(apex.net.outbox.post);
  });
  beforeEach(function () {
    return global.resetDb(apex, client, testUser);
  });
  describe("createActor", function () {
    it("includes endpoints", async function () {
      expect(testUser.endpoints).toEqual([
        {
          id: "https://localhost/u/test#endpoints",
          uploadMedia: ["https://localhost/upload"],
          oauthAuthorizationEndpoint: ["https://localhost/auth/authorize"],
          proxyUrl: ["https://localhost/proxy"],
        },
      ]);
      expect((await apex.toJSONLD(testUser)).endpoints).toEqual({
        id: "https://localhost/u/test#endpoints",
        uploadMedia: "https://localhost/upload",
        oauthAuthorizationEndpoint: "https://localhost/auth/authorize",
        proxyUrl: "https://localhost/proxy",
      });
    });
  });
});
