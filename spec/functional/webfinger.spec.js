/* global describe, beforeAll, beforeEach, it */
const request = require('supertest')

describe('webfinger', function () {
  let testUser
  let app
  let apex
  let client
  beforeAll(async function () {
    const init = await global.initApex()
    testUser = init.testUser
    app = init.app
    apex = init.apex
    client = init.client
    app.get('/.well-known/webfinger', apex.net.webfinger.get)
  })
  beforeEach(function () {
    return global.resetDb(apex, client, testUser)
  })

  describe('get', function () {
    // validators jsonld
    it('returns link to profile', function (done) {
      request(app)
        .get('/.well-known/webfinger?resource=acct:test@localhost')
        .expect(200, {
          subject: 'acct:test@localhost',
          links: [{
            rel: 'self',
            type: 'application/activity+json',
            href: 'https://localhost/u/test'
          }]
        }, err => global.failOrDone(err, done))
    })
  })
})
