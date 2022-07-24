/* global describe, beforeAll, beforeEach, it */
const request = require("supertest");

describe("nodeinfo", function () {
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
    app.get("/.well-known/nodeinfo", apex.net.nodeInfoLocation.get);
    app.get("/nodeinfo/:version", apex.net.nodeInfo.get);
  });
  beforeEach(function () {
    return global.resetDb(apex, client, testUser);
  });

  describe("location get", function () {
    // validators jsonld
    it("returns link to nodeinfo", function (done) {
      request(app)
        .get("/.well-known/nodeinfo")
        .expect(
          200,
          {
            links: [
              {
                rel: "http://nodeinfo.diaspora.software/ns/schema/2.1",
                href: "https://localhost/nodeinfo/2.1",
              },
              {
                rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
                href: "https://localhost/nodeinfo/2.0",
              },
            ],
          },
          done
        );
    });
  });
  describe("document get", function () {
    it("returns nodeinfo document", function (done) {
      request(app)
        .get("/nodeinfo/2.1")
        .expect(
          200,
          {
            version: "2.1",
            software: {
              name: "Apex Test Suite",
              version: process.env.npm_package_version,
            },
            protocols: ["activitypub"],
            services: { inbound: [], outbound: [] },
            openRegistrations: false,
            usage: { users: { total: 1 } },
            metadata: {
              foo: "bar",
            },
          },
          done
        );
    });
    it("404s on 1.x nodeinfo requests", function (done) {
      request(app).get("/nodeinfo/1.0").expect(404, done);
    });
  });
});
