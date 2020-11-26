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
    liked: '/liked/:actor',
    shares: '/s/:id/shares',
    likes: '/s/:id/likes',
    collections: '/u/:actor/c/:id'
  }
})
const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true, useNewUrlParser: true })

app.use(apex)
app.get('/followers/:actor', apex.net.followers.get)
app.get('/following/:actor', apex.net.following.get)
app.get('/liked/:actor', apex.net.liked.get)
app.get('/s/:id/shares', apex.net.shares.get)
app.get('/s/:id/likes', apex.net.likes.get)
app.get('/u/:actor/c/:id', apex.net.collections.get)
app.use(function (err, req, res, next) {
  console.error(err)
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
            .buildActivity('Follow', followerId, testUser.id, { object: testUser.id })
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
            .buildActivity('Follow', testUser.id, followerId, { object: followerId })
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
  })
  describe('liked collection', function () {
    it('returns liked objects', async function (done) {
      let likes = ['https://ignore.com/s/1', 'https://ignore.com/s/2', 'https://ignore.com/s/3']
        .map(objId => {
          return apex
            .buildActivity('Like', testUser.id, 'https://ignore.com/bob', { object: objId })
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
            orderedItems: ['https://ignore.com/s/3', 'https://ignore.com/s/2', 'https://ignore.com/s/1']
          }
          expect(res.body).toEqual(standard)
          done(err)
        })
    })
  })
  describe('activity special collections', function () {
    describe('shares', function () {
      it('adds shares collection to created activities', async function () {
        const act = await apex.buildActivity('Create', testUser.id, testUser.followers, {
          object: {
            id: apex.utils.objectIdToIRI(),
            type: 'Note',
            content: 'hello'
          }
        })
        expect(act.shares).toEqual([`${act.id}/shares`])
      })
      it('get returns announces for activity', async function (done) {
        const act = await apex.buildActivity('Create', testUser.id, testUser.followers, {
          object: {
            id: apex.utils.objectIdToIRI(),
            type: 'Note',
            content: 'hello'
          }
        })
        const announce = await apex.buildActivity('Announce', 'https://ignore.com/bob', testUser.id, {
          object: act.id
        })
        await apex.addMeta(announce, 'collection', act.shares[0])
        await apex.store.saveActivity(act)
        await apex.store.saveActivity(announce)
        request(app)
          .get(`${act.id}/shares`.replace('https://localhost', ''))
          .set('Accept', 'application/activity+json')
          .expect(200)
          .end(function (err, res) {
            const standard = {
              '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
              id: `${act.id}/shares`,
              type: 'OrderedCollection',
              totalItems: 1,
              orderedItems: [announce.id]
            }
            expect(res.body).toEqual(standard)
            done(err)
          })
      })
    })
    describe('likes', function () {
      it('adds likes collection to created activities', async function () {
        const act = await apex.buildActivity('Create', testUser.id, testUser.followers, {
          object: {
            id: apex.utils.objectIdToIRI(),
            type: 'Note',
            content: 'hello'
          }
        })
        expect(act.likes).toEqual([`${act.id}/likes`])
      })
      it('returns likes for activity', async function (done) {
        const act = await apex.buildActivity('Create', testUser.id, testUser.followers, {
          object: {
            id: apex.utils.objectIdToIRI(),
            type: 'Note',
            content: 'hello'
          }
        })
        const like = await apex.buildActivity('Like', 'https://ignore.com/bob', testUser.id, {
          object: act.id
        })
        await apex.addMeta(like, 'collection', act.likes[0])
        await apex.store.saveActivity(act)
        await apex.store.saveActivity(like)
        request(app)
          .get(`${act.id}/likes`.replace('https://localhost', ''))
          .set('Accept', 'application/activity+json')
          .expect(200)
          .end(function (err, res) {
            const standard = {
              '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
              id: `${act.id}/likes`,
              type: 'OrderedCollection',
              totalItems: 1,
              orderedItems: [like.id]
            }
            expect(res.body).toEqual(standard)
            done(err)
          })
      })
    })
  })
  describe('misc collections', function () {
    it('gets collection items', async function (done) {
      const col = `${testUser.id}/c/cool-stuff`
      const act = await apex.buildActivity('Create', testUser.id, testUser.followers, {
        object: {
          id: 'https://localhost/o/cool-doc',
          type: 'Document',
          name: 'Cool document'
        }
      })
      // convert to output format for test standard
      const actOut = await apex.toJSONLD(act)
      delete actOut._meta
      delete actOut['@context']
      apex.addMeta(act, 'collection', col)
      await apex.store.saveActivity(act)
      request(app)
        .get(col.replace('https://localhost', ''))
        .set('Accept', 'application/activity+json')
        .expect(200)
        .end(function (err, res) {
          const standard = {
            '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
            id: col,
            type: 'OrderedCollection',
            totalItems: 1,
            orderedItems: [actOut]
          }
          expect(res.body).toEqual(standard)
          done(err)
        })
    })
  })
})
