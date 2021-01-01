/* global describe, beforeAll, beforeEach, it, expect */
const request = require('supertest')

describe('collections', function () {
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
    app.get('/followers/:actor', apex.net.followers.get)
    app.get('/following/:actor', apex.net.following.get)
    app.get('/liked/:actor', apex.net.liked.get)
    app.get('/s/:id/shares', apex.net.shares.get)
    app.get('/s/:id/likes', apex.net.likes.get)
    app.get('/u/:actor/c/:id', apex.net.collections.get)
  })
  beforeEach(function () {
    return global.resetDb(apex, client, testUser)
  })
  describe('followers', function () {
    let firstActivity
    beforeEach(async function () {
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
      firstActivity = await apex.store.db.collection('streams')
        .findOne({}, { sort: { _id: 1 } })
    })
    it('returns followers collection', function (done) {
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
            first: 'https://localhost/followers/test?page=true'
          }
          expect(res.body).toEqual(standard)
          done(err)
        })
    })
    it('page returns accepted followers', function (done) {
      request(app)
        .get('/followers/test?page=true')
        .set('Accept', 'application/activity+json')
        .expect(200)
        .end(function (err, res) {
          const standard = {
            '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
            id: 'https://localhost/followers/test?page=true',
            type: 'OrderedCollectionPage',
            partOf: 'https://localhost/followers/test',
            orderedItems: ['https://ignore.com/sue', 'https://ignore.com/bob'],
            next: `https://localhost/followers/test?page=${firstActivity._id}`

          }
          expect(res.body).toEqual(standard)
          done(err)
        })
    })
  })
  describe('following', function () {
    let firstActivity
    beforeEach(async function () {
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
      firstActivity = await apex.store.db.collection('streams')
        .findOne({}, { sort: { _id: 1 } })
    })
    it('returns following collection', async function (done) {
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
            first: 'https://localhost/following/test?page=true'
          }
          expect(res.body).toEqual(standard)
          done(err)
        })
    })
    it('page returns accepted following', async function (done) {
      request(app)
        .get('/following/test?page=true')
        .set('Accept', 'application/activity+json')
        .expect(200)
        .end(function (err, res) {
          const standard = {
            '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
            id: 'https://localhost/following/test?page=true',
            type: 'OrderedCollectionPage',
            partOf: 'https://localhost/following/test',
            orderedItems: ['https://ignore.com/sue', 'https://ignore.com/bob'],
            next: `https://localhost/following/test?page=${firstActivity._id}`
          }
          expect(res.body).toEqual(standard)
          done(err)
        })
    })
  })
  describe('liked collection', function () {
    let firstActivity
    beforeEach(async function () {
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
      firstActivity = await apex.store.db.collection('streams')
        .findOne({}, { sort: { _id: 1 } })
    })
    it('returns liked collection', async function (done) {
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
            first: 'https://localhost/liked/test?page=true'
          }
          expect(res.body).toEqual(standard)
          done(err)
        })
    })
    it('page returns liked objects', async function (done) {
      request(app)
        .get('/liked/test?page=true')
        .set('Accept', 'application/activity+json')
        .expect(200)
        .end(function (err, res) {
          const standard = {
            '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
            id: 'https://localhost/liked/test?page=true',
            type: 'OrderedCollectionPage',
            partOf: 'https://localhost/liked/test',
            next: `https://localhost/liked/test?page=${firstActivity._id}`,
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
      it('get page returns announces for activity', async function (done) {
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
          .get(`${act.id}/shares?page=true`.replace('https://localhost', ''))
          .set('Accept', 'application/activity+json')
          .expect(200)
          .end(function (err, res) {
            expect(res.body.orderedItems).toEqual([announce.id])
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
          .get(`${act.id}/likes?page=true`.replace('https://localhost', ''))
          .set('Accept', 'application/activity+json')
          .expect(200)
          .end(function (err, res) {
            expect(res.body.orderedItems).toEqual([like.id])
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
        .get(`${col.replace('https://localhost', '')}?page=true`)
        .set('Accept', 'application/activity+json')
        .expect(200)
        .end(function (err, res) {
          expect(res.body.orderedItems).toEqual([actOut])
          done(err)
        })
    })
  })
  describe('internal special collections', function () {
    it('blocked gets blocked actor ids', async function () {
      const baddies = ['https://ignore.com/u/chud', 'https://ignore.com/u/reply-guy', 'https://ignore.com/u/terf']
      let blocks = baddies.map(objId => {
        return apex
          .buildActivity('Block', testUser.id, null, { object: objId })
      })
      blocks = await Promise.all(blocks)
      blocks.forEach(f => apex.addMeta(f, 'collection', apex.utils.nameToBlockedIRI(testUser.preferredUsername)))
      for (const block of blocks) {
        await apex.store.saveActivity(block)
      }
      const blockList = await apex.getBlocked(testUser, Infinity)
      expect(blockList.orderedItems).toEqual(baddies.reverse())
    })
    it('rejections gets actors rejected activity ids', async function () {
      const meanies = ['https://ignore.com/u/blue-check', 'https://ignore.com/u/celeb', 'https://ignore.com/u/leet']
      let follows = meanies.map(objId => {
        return apex
          .buildActivity('Follow', testUser.id, null, { object: objId })
      })
      follows = await Promise.all(follows)
      follows.forEach(f => apex.addMeta(f, 'collection', apex.utils.nameToRejectionsIRI(testUser.preferredUsername)))
      for (const follow of follows) {
        await apex.store.saveActivity(follow)
      }
      const rejections = await apex.getRejections(testUser, Infinity)
      expect(rejections.orderedItems).toEqual(follows.map(f => f.id).reverse())
    })
    it('rejected gets ids for activities rejected by actor', async function () {
      const baddies = ['https://ignore.com/u/chud', 'https://ignore.com/u/reply-guy', 'https://ignore.com/u/terf']
      let follows = baddies.map(objId => {
        return apex
          .buildActivity('Follow', testUser.id, testUser.id, { object: testUser.id })
      })
      follows = await Promise.all(follows)
      follows.forEach(f => apex.addMeta(f, 'collection', apex.utils.nameToRejectedIRI(testUser.preferredUsername)))
      for (const follow of follows) {
        await apex.store.saveActivity(follow)
      }
      const rejected = await apex.getRejected(testUser, Infinity)
      expect(rejected.orderedItems).toEqual(follows.map(a => a.id).reverse())
    })
  })
})
