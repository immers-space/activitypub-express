/* global beforeEach, afterEach */
const nock = require("nock");
beforeEach(() => {
  nock("https://ignore.com")
    .get((uri) => uri.startsWith("/s/"))
    .reply(200, (uri) => ({
      id: `https://ignore.com${uri}`,
      type: "Activity",
      actor: "https://ignore.com/u/bob",
    }))
    .persist()
    .get((uri) => !uri.startsWith("/s/"))
    .reply(200, (uri) => ({ id: `https://ignore.com${uri}`, type: "Object" }))
    .persist()
    .post(() => true)
    .reply(200)
    .persist();
});
afterEach(() => {
  nock.cleanAll();
});
