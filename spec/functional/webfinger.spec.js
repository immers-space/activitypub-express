/* global describe, beforeAll, beforeEach, it, expect */
const request = require('supertest')
const express = require('express')
const { MongoClient } = require('mongodb')

const ActivitypubExpress = require('../../index')

const app = express()
const apex = ActivitypubExpress({
  domain: 'localhost'
})
const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true, useNewUrlParser: true })
const dummy = {
  id: 'https://localhost/u/dummy',
  type: 'Person',
  following: 'https://localhost/u/dummy/following',
  followers: 'https://localhost/u/dummy/followers',
  liked: 'https://localhost/u/dummy/liked',
  inbox: 'https://localhost/u/dummy/inbox',
  outbox: 'https://localhost/u/dummy/outbox',
  preferredUsername: 'dummy',
  name: 'dummy group',
  summary: 'dummy',
  '@context': [
    'https://www.w3.org/ns/activitystreams',
    'https://w3id.org/security/v1'
  ]
}

app.use(apex)
app.get('/.well-known/webfinger', apex.net.webfinger)
app.use(function (err, req, res, next) {
  console.log(err)
  next(err)
})

describe('webfinger', function () {
  beforeAll(function (done) {
    client.connect({ useNewUrlParser: true }).then(done)
  })
  beforeEach(function (done) {
    // reset db for each test
    client.db('apexTestingTempDb').dropDatabase()
      .then(() => {
        apex.store.connection.setDb(client.db('apexTestingTempDb'))
        return apex.store.setup(dummy)
      })
      .then(done)
  })
  describe('get', function () {
    // validators jsonld
    it('returns link to profile', function (done) {
      request(app)
        .get('/.well-known/webfinger?resource=acct:dummy@localhost')
        .expect(200, {
          subject: 'acct:dummy@localhost',
          links: [{
            rel: 'self',
            type: 'application/activity+json',
            href: 'https://localhost/u/dummy'
          }]
        }, done)
    })
  })
})
