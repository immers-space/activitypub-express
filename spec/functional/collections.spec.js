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
app.get('/followers/:actor', apex.net.followers.get)
app.get('/following/:actor', apex.net.following.get)
app.get('/liked/:actor', apex.net.liked.get)
app.use(function (err, req, res, next) {
  console.log(err)
  next(err)
})

describe('collections', function () {
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
  describe('follows', function () {
    it('returns accepted followers', async function (done) {
      let followers = ['https://ignore.com/bob', 'https://ignore.com/mary', 'https://ignore.com/sue']
        .map(followerId => {
          return apex
            .buildActivity(apex.utils.activityIdToIRI(), 'Follow', followerId, testUser.id, testUser.id)
        })
      followers = await Promise.all(followers)
      followers.forEach(f => apex.addMeta(f, 'collection', testUser.inbox[0]))
      apex.addMeta(followers[0], 'collection', testUser.followers[0])
      apex.addMeta(followers[2], 'collection', testUser.followers[0])
      for (const follower of followers) {
        await apex.store.saveActivity(follower)
      }
      request(app)
        .get('/followers/test')
        .set('Accept', 'application/activity+json')
        .expect(200)
        .end(function (err, res) {
          const standard = {
            '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
            id: 'https://localhost/followers/test',
            type: 'OrderedCollection',
            totalItems: 2,
            orderedItems: ['https://ignore.com/sue', 'https://ignore.com/bob']
          }
          expect(res.body).toEqual(standard)
          done(err)
        })
    })
    it('returns accepted following', async function (done) {
      let follows = ['https://ignore.com/bob', 'https://ignore.com/mary', 'https://ignore.com/sue']
        .map(followerId => {
          return apex
            .buildActivity(apex.utils.activityIdToIRI(), 'Follow', testUser.id, followerId, followerId)
        })
      follows = await Promise.all(follows)
      follows.forEach(f => apex.addMeta(f, 'collection', testUser.outbox[0]))
      apex.addMeta(follows[0], 'collection', testUser.following[0])
      apex.addMeta(follows[2], 'collection', testUser.following[0])
      for (const follow of follows) {
        await apex.store.saveActivity(follow)
      }
      request(app)
        .get('/following/test')
        .set('Accept', 'application/activity+json')
        .expect(200)
        .end(function (err, res) {
          const standard = {
            '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
            id: 'https://localhost/following/test',
            type: 'OrderedCollection',
            totalItems: 2,
            orderedItems: ['https://ignore.com/sue', 'https://ignore.com/bob']
          }
          expect(res.body).toEqual(standard)
          done(err)
        })
    })
    it('returns liked objects', async function (done) {
      let likes = ['https://ignore.com/o/1', 'https://ignore.com/o/2', 'https://ignore.com/o/3']
        .map(objId => {
          return apex
            .buildActivity(apex.utils.activityIdToIRI(), 'Like', testUser.id, objId, 'https://ignore.com/bob')
        })
      likes = await Promise.all(likes)
      likes.forEach(f => apex.addMeta(f, 'collection', testUser.liked[0]))
      for (const like of likes) {
        await apex.store.saveActivity(like)
      }
      request(app)
        .get('/liked/test')
        .set('Accept', 'application/activity+json')
        .expect(200)
        .end(function (err, res) {
          const standard = {
            '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
            id: 'https://localhost/liked/test',
            type: 'OrderedCollection',
            totalItems: 3,
            orderedItems: ['https://ignore.com/o/3', 'https://ignore.com/o/2', 'https://ignore.com/o/1']
          }
          expect(res.body).toEqual(standard)
          done(err)
        })
    })
  })
})
