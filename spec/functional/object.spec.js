/* global describe, beforeAll, beforeEach, it, expect */
const request = require('supertest')

describe('resources', function () {
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
    app.get('/u/:actor', apex.net.actor.get)
    app.get('/o/:id', apex.net.object.get)
    app.get('/s/:id', apex.net.activityStream.get)
  })
  beforeEach(function () {
    return global.resetDb(apex, client, testUser)
  })
  describe('get actor', function () {
    it('returns actor object', function (done) {
      request(app)
        .get('/u/test')
        .set('Accept', 'application/activity+json')
        .expect(200)
        .end(function (err, res) {
          const standard = {
            '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
            id: 'https://localhost/u/test',
            type: 'Person',
            name: 'test',
            preferredUsername: 'test',
            summary: 'test user',
            inbox: 'https://localhost/inbox/test',
            outbox: 'https://localhost/outbox/test',
            followers: 'https://localhost/followers/test',
            following: 'https://localhost/following/test',
            liked: 'https://localhost/liked/test',
            publicKey: {
              id: 'https://localhost/u/test#main-key',
              owner: 'https://localhost/u/test',
              publicKeyPem: testUser.publicKey[0].publicKeyPem[0]
            },
            endpoints: {
              id: 'https://localhost/u/test#endpoints',
              uploadMedia: 'https://localhost/upload',
              oauthAuthorizationEndpoint: 'https://localhost/auth/authorize'
            }
          }
          expect(res.body).toEqual(standard)
          done(err)
        })
    })
  })
  describe('get object', function () {
    it('returns the object', async function (done) {
      const oid = apex.utils.objectIdToIRI()
      let obj = {
        id: oid,
        type: 'Note',
        content: 'Hello.',
        attributedTo: 'https://localhost/u/test',
        to: 'https://ignore.com/u/ignored'
      }
      obj = await apex.fromJSONLD(obj)
      await apex.store.saveObject(obj)
      request(app)
        .get(oid.replace('https://localhost', ''))
        .set('Accept', apex.consts.jsonldTypes[0])
        .expect(200)
        .end(function (err, res) {
          const standard = {
            '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
            id: oid,
            type: 'Note',
            content: 'Hello.',
            attributedTo: 'https://localhost/u/test',
            to: 'https://ignore.com/u/ignored'
          }
          expect(res.get('content-type').includes('application/ld+json')).toBeTrue()
          expect(res.body).toEqual(standard)
          done(err)
        })
    })
  })
  describe('get activity', function () {
    it('returns the activity', async function (done) {
      const aid = apex.utils.activityIdToIRI()
      const activityInput = {
        id: aid,
        type: 'Create',
        to: 'https://ignore.com/u/ignored',
        actor: 'https://localhost/u/test',
        object: {
          id: apex.utils.objectIdToIRI(),
          type: 'Note',
          attributedTo: 'https://localhost/u/test',
          to: 'https://ignore.com/u/ignored',
          content: 'Say, did you finish reading that book I lent you?'
        }
      }
      const activity = await apex.fromJSONLD(activityInput)
      activity._meta = { collection: [] }
      await apex.store.saveActivity(activity)
      request(app)
        .get(aid.replace('https://localhost', ''))
        .set('Accept', apex.consts.jsonldTypes[0])
        .expect(200)
        .end(function (err, res) {
          activityInput['@context'] = ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1']
          expect(res.get('content-type').includes('application/ld+json')).toBeTrue()
          expect(res.body).toEqual(activityInput)
          done(err)
        })
    })
    it('returns activity with embedded collections', async function (done) {
      const activity = await apex.buildActivity('Create', testUser.id, ['https://ignore.com/u/ignored'], {
        object: {
          id: apex.utils.objectIdToIRI(),
          type: 'Note',
          attributedTo: 'https://localhost/u/test',
          to: 'https://ignore.com/u/ignored',
          content: 'Say, did you finish reading that book I lent you?'
        }
      })
      await apex.store.saveActivity(activity)
      request(app)
        .get(activity.id.replace('https://localhost', ''))
        .set('Accept', apex.consts.jsonldTypes[0])
        .expect(200)
        .end(function (err, res) {
          expect(res.body.shares).toEqual({
            id: `${activity.id}/shares`,
            type: 'OrderedCollection',
            totalItems: 0,
            first: `${activity.id}/shares?page=true`
          })
          expect(res.body.likes).toEqual({
            id: `${activity.id}/likes`,
            type: 'OrderedCollection',
            totalItems: 0,
            first: `${activity.id}/likes?page=true`
          })
          done(err)
        })
    })
  })
})
