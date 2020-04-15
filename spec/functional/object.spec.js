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
app.use(function (err, req, res, next) {
  console.log(err)
  next(err)
})

describe('actor', function () {
  let testUser
  beforeAll(function (done) {
    const actorName = 'test'
    const actorIRI = apex.utils.usernameToIRI(actorName)
    const actorRoutes = apex.utils.nameToActorStreams(actorName)
    apex.pub.actor.create(apex.context, actorIRI, actorRoutes, actorName, actorName, 'test user')
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
        apex.store.connection.setDb(client.db('apexTestingTempDb'))
        return apex.store.setup(testUser)
      })
      .then(done)
  })
  describe('get', function () {
    // validators jsonld
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
})
