/* global describe, beforeAll, beforeEach, it, expect */
const request = require('supertest')
const express = require('express')
const { MongoClient } = require('mongodb')

const ActivitypubExpress = require('../../index')

const app = express()
const apex = ActivitypubExpress({
  domain: 'localhost',
  context: [
    'https://www.w3.org/ns/activitystreams',
    'https://w3id.org/security/v1'
  ],
  actorParam: 'actor',
  objectParam: 'id',
  activityParam: 'id',
  routes: {
    actor: '/u/:actor',
    object: '/o/:id',
    activity: '/s/:id',
    inbox: '/inbox/:actor',
    outbox: '/outbox/:actor',
    followers: '/followers/:actor',
    following: '/following/:actor',
    liked: '/liked/:actor'
  }
})
const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true, useNewUrlParser: true })

app.use(apex)
app.get('/u/:actor', apex.net.actor.get)
app.get('/o/:id', apex.net.object.get)
app.get('/s/:id', apex.net.activityStream.get)
app.use(function (err, req, res, next) {
  console.log(err)
  next(err)
})

describe('resources', function () {
  let testUser
  beforeAll(function (done) {
    const actorName = 'test'
    apex.createActor(actorName, actorName, 'test user')
      .then(actor => {
        testUser = actor
        return client.connect({ useNewUrlParser: true })
      })
      .then(done)
  })
  beforeEach(function (done) {
    // reset db for each test
    client.db('apexTestingTempDb').dropDatabase()
      .then(() => {
        apex.store.db = client.db('apexTestingTempDb')
        return apex.store.setup(testUser)
      })
      .then(done)
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
  })
})
