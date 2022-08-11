/* global describe, beforeAll, beforeEach, it, expect */

describe('default store', function () {
  let testUser
  let apex
  let client
  beforeAll(async function () {
    const init = await global.initApex()
    testUser = init.testUser
    apex = init.apex
    client = init.client
  })
  beforeEach(function () {
    return global.resetDb(apex, client, testUser)
  })
  describe('denormalized updates', function () {
    it('udpates doubly nested objects', async function () {
      const create = await apex.buildActivity('Create', testUser.id, [testUser.id], {
        object: [{
          id: 'https://localhost/o/abc123',
          attributedTo: testUser.id,
          type: 'Note',
          content: 'Hello'
        }, {
          id: 'https://localhost/o/notupdated',
          attributedTo: testUser.id,
          type: 'Note',
          content: 'Goodbye'
        }]
      })
      await apex.store.saveActivity(create)
      await apex.store.saveObject(create.object[0])
      const announce = await apex.buildActivity('Announce', testUser.id, [testUser.id], {
        object: [create]
      })
      await apex.store.saveActivity(announce)
      const updated = {
        id: 'https://localhost/o/abc123',
        type: 'Note',
        attributedTo: [testUser.id],
        content: ['Hello again']
      }
      const notUpdated = {
        id: 'https://localhost/o/notupdated',
        type: 'Note',
        attributedTo: [testUser.id],
        content: ['Goodbye']
      }
      await apex.store.updateObject(updated, testUser.id, true)
      const newCreate = await apex.store.getActivity(create.id)
      expect(newCreate.object).toEqual([updated, notUpdated])
      const newAnnounce = await apex.store.getActivity(announce.id)
      expect(newAnnounce.object[0].object).toEqual([updated, notUpdated])
    })
    it('updates queued signing keys', async function () {
      await apex.store
        .deliveryEnqueue(testUser.id, 'hello', testUser.inbox, testUser._meta.privateKey)
      testUser._meta.privateKey = 'newkey'
      await apex.store.updateObject(testUser, testUser.id, true)
      const updated = await apex.store.deliveryDequeue()
      delete updated.after
      expect(updated).toEqual({
        actorId: testUser.id,
        body: 'hello',
        address: testUser.inbox[0],
        attempt: 0,
        signingKey: 'newkey'
      })
    })
  })
  describe('getStream', function () {
    it('applies optional query argument to aggregation pipeline', async function () {
      const create = await apex.buildActivity('Create', testUser.id, [testUser.id], {
        object: [{
          id: 'https://localhost/o/abc123',
          attributedTo: testUser.id,
          type: 'Note',
          content: 'Hello'
        }]
      })
      apex.addMeta(create, 'collection', testUser.outbox[0])
      await apex.store.saveActivity(create)
      const arrive = await apex.buildActivity('Arrive', testUser.id, [testUser.id], {
        target: [{
          id: 'https://localhost/o/immer',
          type: 'Place',
          url: 'https://localhost'
        }]
      })
      apex.addMeta(arrive, 'collection', testUser.outbox[0])
      await apex.store.saveActivity(arrive)
      const filtered = await apex.store.getStream(testUser.outbox[0], 10, null, null, [{ $match: { type: 'Arrive' }}])
      expect(filtered.length).toBe(1)
      expect(filtered[0].type).toBe('Arrive')
      const unfiltered = await apex.store.getStream(testUser.outbox[0], 10)
      expect(unfiltered.length).toBe(2)
    })
  })
})
