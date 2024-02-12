/* global jasmine, describe, beforeAll, beforeEach, afterEach, it, spyOn, expect */
const request = require('supertest')

describe('nodeinfo', function () {
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
    app.get('/.well-known/nodeinfo', apex.net.nodeInfoLocation.get)
    app.get('/nodeinfo/:version', apex.net.nodeInfo.get)
  })
  beforeEach(function () {
    return global.resetDb(apex, client, testUser)
  })

  describe('location get', function () {
    // validators jsonld
    it('returns link to nodeinfo', function (done) {
      request(app)
        .get('/.well-known/nodeinfo')
        .expect(200, {
          links: [
            {
              rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
              href: 'https://localhost/nodeinfo/2.1'
            },
            {
              rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0',
              href: 'https://localhost/nodeinfo/2.0'
            }
          ]
        }, err => global.failOrDone(err, done))
    })
  })
  describe('document get', function () {
    beforeEach(function () {
      jasmine.clock().install()
    })
    afterEach(function () {
      jasmine.clock().uninstall()
    })
    it('returns nodeinfo document', function (done) {
      request(app)
        .get('/nodeinfo/2.1')
        .expect(200, {
          version: '2.1',
          software: {
            name: 'Apex Test Suite',
            version: process.env.npm_package_version
          },
          protocols: ['activitypub'],
          services: { inbound: [], outbound: [] },
          openRegistrations: false,
          usage: { users: { total: 1 } },
          metadata: {
            foo: 'bar'
          }
        }, err => global.failOrDone(err, done))
    })
    it('caches response for 1 day', async function () {
      jasmine.clock().mockDate(new Date())
      const count = (await apex.generateNodeInfo('2.0')).usage.users.total
      const user = await apex.createActor('newuser', 'New user')
      await apex.store.saveObject(user)
      const querySpy = spyOn(apex.store, 'getUserCount').and.callThrough()
      expect((await apex.generateNodeInfo('2.0')).usage.users.total).toBe(count)
      expect(querySpy).toHaveBeenCalledTimes(0)
      jasmine.clock().mockDate(new Date(Date.now() + 23 * 60 * 60 * 1000))
      expect((await apex.generateNodeInfo('2.0')).usage.users.total).toBe(count)
      expect(querySpy).toHaveBeenCalledTimes(0)
      jasmine.clock().mockDate(new Date(Date.now() + 1 * 60 * 60 * 1000 + 1))
      expect((await apex.generateNodeInfo('2.0')).usage.users.total).toBe(count + 1)
      expect(querySpy).toHaveBeenCalledTimes(1)
    })
    it('404s on 1.x nodeinfo requests', function (done) {
      request(app)
        .get('/nodeinfo/1.0')
        .expect(404, err => global.failOrDone(err, done))
    })
  })
})
