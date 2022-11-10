/* global describe, beforeAll, beforeEach, it, expect, spyOn */
const nock = require('nock')

describe('activity utils', function () {
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
    app.route('/outbox/:actor')
      .get(apex.net.outbox.get)
      .post(apex.net.outbox.post)
  })
  beforeEach(function () {
    return global.resetDb(apex, client, testUser)
  })
  describe('addressing', function () {
    it('gets actor and object addresses from custom collections', async function () {
      spyOn(apex, 'getAdded').and.resolveTo({
        orderedItems: [{
          type: 'Follow',
          actor: ['https://mocked.com/u/bob'],
          object: [testUser.id]
        }, {
          type: 'Follow',
          actor: [testUser.id],
          object: ['https://mocked.com/u/sally']
        }]
      })
      const act = await apex
        .buildActivity('Create', testUser.id, 'https://localhost/u/test/c/besties')
      nock('https://mocked.com')
        .get('/u/bob')
        .reply(200, { id: 'https://mocked.com/u/bob', inbox: ['https://mocked.com/u/bob/inbox'] })
        .get('/u/sally')
        .reply(200, { id: 'https://mocked.com/u/sally', inbox: ['https://mocked.com/u/sally/inbox'] })
      const addresses = await apex.address(act, testUser)
      expect(addresses).toEqual([
        'https://mocked.com/u/bob/inbox',
        'https://mocked.com/u/sally/inbox'
      ])
    })
    it('finds an de-dupes sharedInboxes when available', async function () {
      const actors = await Promise.all(
        ['bob', 'sally', 'sandro'].map(un => apex.createActor(un, un, 'actor'))
      )
      actors[0].sharedInbox = actors[1].sharedInbox = ['https://test.com/sharedInbox']
      await Promise.all(actors.map(a => apex.store.saveObject(a)))
      const act = await apex
        .buildActivity('Create', testUser.id, actors.map(a => a.id))
      const addresses = await apex.address(act, testUser)
      expect(addresses).toEqual([
        'https://test.com/sharedInbox',
        'https://localhost/inbox/sandro'
      ])
    })
  })
})
