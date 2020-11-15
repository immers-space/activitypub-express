/* global describe, beforeAll, beforeEach, it */
const request = require('supertest')
const express = require('express')
const { MongoClient } = require('mongodb')

const ActivitypubExpress = require('../../index')

const app = express()
const apex = ActivitypubExpress({
  domain: 'localhost',
  actorParam: 'actor',
  objectParam: 'id',
  activityParam: 'id',
  routes: {
    actor: '/u/:actor',
    object: '/o/:id',
    activity: '/s/:id',
    inbox: '/inbox/:actor',
    outbox: '/outbox/:actor',
    shares: '/s/:id/shares',
    likes: '/s/:id/likes'
  }
})
const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true, useNewUrlParser: true })

app.use(apex)
app.get('/.well-known/webfinger', apex.net.webfinger.get)
app.use(function (err, req, res, next) {
  console.log(err)
  next(err)
})

describe('webfinger', function () {
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
        }, done)
    })
  })
})
