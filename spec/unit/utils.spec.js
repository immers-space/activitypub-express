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
        document: JSON.stringify(context),
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
})
