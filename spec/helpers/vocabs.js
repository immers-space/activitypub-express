/* global beforeEach, afterEach */
const fs = require('fs')
const nock = require('nock')
const activities = fs.readFileSync('vocab/as.json')
const security = fs.readFileSync('vocab/security.json')
beforeEach(() => {
  nock('https://www.w3.org')
    .get('/ns/activitystreams')
    .reply(200, activities)
    .persist(true)
  nock('https://w3id.org')
    .get('/security/v1')
    .reply(200, security) // TODO get copy of real security vocab
    .persist(true)
})
afterEach(() => {
  nock.cleanAll()
})
