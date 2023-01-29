/* global describe, beforeAll, beforeEach, it, expect */
const nock = require('nock')

describe('utils', function () {
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
  describe('hasMeta util', function () {
    it('returns false when object does not have metadata', function () {
      const obj = { _meta: { collection: [] } }
      expect(apex.hasMeta(obj, 'collection', testUser.inbox[0])).toBe(true)
    })
  })
  describe('removeMeta', function () {
    it('returns when object does not have the metadata', function () {
      const obj = { }
      expect(apex.removeMeta(obj, 'collection', testUser.inbox[0])).toBe(undefined)
    })
    it('removes the medata', function () {
      const obj = { _meta: { collection: [testUser.inbox[0]] } }
      apex.removeMeta(obj, 'collection', testUser.inbox[0])
      expect(obj._meta.collection).toEqual([])
    })
  })
  describe('actorIdFromActivity', function () {
    it('returns id from object', function () {
      expect(apex.actorIdFromActivity({ actor: [{ id: testUser.id }] }))
        .toBe(testUser.id)
    })
    it('returns href from link', function () {
      expect(apex.actorIdFromActivity({ actor: [{ type: 'Link', href: [testUser.id] }] }))
        .toBe(testUser.id)
    })
  })
  describe('objectIdFromActivity', function () {
    it('returns id from object', function () {
      expect(apex.objectIdFromActivity({ object: [{ id: testUser.id }] }))
        .toBe(testUser.id)
    })
    it('returns href from link', function () {
      expect(apex.objectIdFromActivity({ object: [{ type: 'Link', href: [testUser.id] }] }))
        .toBe(testUser.id)
    })
  })
  describe('jsonld processing', function () {
    it('handles context arrays with language tag', async function () {
      const processed = await apex.fromJSONLD({
        '@context': [
          'https://www.w3.org/ns/activitystreams',
          {
            '@language': 'und'
          }
        ],
        // simple string
        name: 'Username',
        // language mappable string
        preferredUsername: 'Display name',
        type: 'Person'
      })
      expect(processed.name).toEqual(['Username'])
      expect(processed.preferredUsername).toEqual(['Display name'])
    })
    it('handles single contexts with language tag', async function () {
      const processed = await apex.fromJSONLD({
        '@context': {
          '@language': 'und'
        },
        // simple string
        'https://www.w3.org/ns/activitystreams#name': 'Username',
        // language mappable string
        'https://www.w3.org/ns/activitystreams#preferredUsername': 'Display name',
        type: 'Person'
      })
      expect(processed.name).toEqual(['Username'])
      expect(processed.preferredUsername).toEqual(['Display name'])
    })
  })
  describe('jsonld context caching', function () {
    let context
    beforeEach(function () {
      context = {
        '@context': {
          m: 'https://mocked.com/context/v1#',
          id: '@id',
          type: '@type',
          customProp: {
            '@id': 'm:customProp',
            '@type': '@id'
          }
        }
      }
    })
    it('fetches and caches new contexts', async function () {
      nock('https://mocked.com')
        .get('/context/v1')
        .reply(200, context)
      const doc = {
        '@context': 'https://mocked.com/context/v1',
        id: 'https://mocked.com/s/abc123',
        customProp: 'https://mocked.com/s/123abc'
      }
      const ld = await apex.toJSONLD(doc)
      expect(ld).toEqual({
        '@context': apex.context,
        id: 'https://mocked.com/s/abc123',
        'https://mocked.com/context/v1#customProp': {
          id: 'https://mocked.com/s/123abc'
        }
      })
      expect(await apex.store.getContext('https://mocked.com/context/v1')).toEqual({
        documentUrl: 'https://mocked.com/context/v1',
        document: context,
        contextUrl: null
      })
    })
    it('caches redirected contexts by original url', async function () {
      nock('https://mocked.com')
        .get('/context/v1')
        .reply(302, undefined, {
          Location: 'http://redirect.com/context/v1'
        })
      nock('http://redirect.com')
        .get('/context/v1')
        .reply(200, context)
      const doc = {
        '@context': 'https://mocked.com/context/v1',
        id: 'https://mocked.com/s/abc123',
        customProp: 'https://mocked.com/s/123abc'
      }
      const ld = await apex.toJSONLD(doc)
      expect(ld).toEqual({
        '@context': apex.context,
        id: 'https://mocked.com/s/abc123',
        'https://mocked.com/context/v1#customProp': {
          id: 'https://mocked.com/s/123abc'
        }
      })
      expect(await apex.store.getContext('https://mocked.com/context/v1')).toEqual({
        documentUrl: 'https://mocked.com/context/v1',
        document: context,
        contextUrl: null
      })
    })
    it('uses cached context', async function () {
      await apex.store.saveContext({
        documentUrl: 'https://mocked.com/context/v1',
        document: JSON.stringify(context),
        contextUrl: null
      })
      const doc = {
        '@context': 'https://mocked.com/context/v1',
        id: 'https://mocked.com/s/abc123',
        customProp: 'https://mocked.com/s/123abc'
      }
      // without the nock, this would throw due to unresolvable url
      // if the cache didn't prevent fetching
      const ld = await apex.toJSONLD(doc)
      expect(ld).toEqual({
        '@context': apex.context,
        id: 'https://mocked.com/s/abc123',
        'https://mocked.com/context/v1#customProp': {
          id: 'https://mocked.com/s/123abc'
        }
      })
    })
  })
  describe('validateOwner', function () {
    it('establishes collection ownerhip via actor properties', async function () {
      testUser.streams = [{
        custom: apex.utils.userCollectionIdToIRI(testUser.preferredUsername, 'custom')
      }]
      const otherUser = await apex.createActor('other', 'Other user', '')
      const testFollowers = await apex.getFollowers(testUser)
      const testCustom = await apex.getAdded(testUser, 'custom')
      expect(apex.validateOwner(testFollowers, testUser)).toBeTrue()
      expect(apex.validateOwner(testCustom, testUser)).toBeTrue()
      expect(apex.validateOwner(testFollowers, otherUser)).toBeFalse()
      expect(apex.validateOwner(testCustom, otherUser)).toBeFalse()
    })
  })
  describe('iriToCollectionInfoFactory', function () {
    it('decode IRIs', function () {
      expect(apex.utils.iriToCollectionInfo('https://localhost/inbox/test')).toEqual({
        name: 'inbox',
        actor: 'test'
      })
      expect(apex.utils.iriToCollectionInfo('https://localhost/followers/test')).toEqual({
        name: 'followers',
        actor: 'test'
      })
      expect(apex.utils.iriToCollectionInfo('https://localhost/s/abc123/shares')).toEqual({
        name: 'shares',
        activity: 'abc123'
      })
      expect(apex.utils.iriToCollectionInfo('https://localhost/u/test/c/stuff')).toEqual({
        name: 'collections',
        actor: 'test',
        id: 'stuff'
      })
    })
  })
})
