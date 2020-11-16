/* global describe, beforeAll, beforeEach, it, expect, spyOn */
const request = require('supertest')
const express = require('express')
const merge = require('deepmerge')
const nock = require('nock')
const { MongoClient } = require('mongodb')

const ActivitypubExpress = require('../../index')
const { target } = require('../../net/responders')

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
    likes: '/s/:id/likes'
  }
})
const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true, useNewUrlParser: true })

const activity = {
  '@context': 'https://www.w3.org/ns/activitystreams',
  type: 'Create',
  id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d3',
  to: ['https://localhost/u/test'],
  actor: 'https://localhost/u/test',
  object: {
    type: 'Note',
    id: 'https://localhost/o/49e2d03d-b53a-4c4c-a95c-94a6abf45a19',
    attributedTo: 'https://localhost/u/test',
    to: ['https://localhost/u/test'],
    content: 'Say, did you finish reading that book I lent you?'
  },
  shares: 'https://localhost/shares/a29a6843-9feb-4c74-a7f7-081b9c9201d3',
  likes: 'https://localhost/likes/a29a6843-9feb-4c74-a7f7-081b9c9201d3'
}

const activityNormalized = {
  id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d3',
  type: 'Create',
  actor: [
    'https://localhost/u/test'
  ],
  object: [
    {
      id: 'https://localhost/o/49e2d03d-b53a-4c4c-a95c-94a6abf45a19',
      type: 'Note',
      attributedTo: [
        'https://localhost/u/test'
      ],
      content: [
        'Say, did you finish reading that book I lent you?'
      ],
      to: [
        'https://localhost/u/test'
      ]
    }
  ],
  shares: [
    'https://localhost/shares/a29a6843-9feb-4c74-a7f7-081b9c9201d3'
  ],
  likes: [
    'https://localhost/likes/a29a6843-9feb-4c74-a7f7-081b9c9201d3'
  ],
  to: [
    'https://localhost/u/test'
  ]
}

app.use(express.json({ type: apex.consts.jsonldTypes }), apex)
app.route('/inbox/:actor')
  .post(apex.net.inbox.post)
  .get(apex.net.inbox.get)
app.use(function (err, req, res, next) {
  console.log(err)
  next(err)
})

describe('inbox', function () {
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
  describe('post', function () {
    // validators jsonld
    it('ignores invalid body types', function (done) {
      request(app)
        .post('/inbox/test')
        .send({})
        .expect(404, done)
    })
    // validators activity
    it('errors invalid activities', function (done) {
      request(app)
        .post('/inbox/test')
        .set('Content-Type', 'application/activity+json')
        .send({ actor: 'https://ignore.com/bob', '@context': 'https://www.w3.org/ns/activitystreams' })
        .expect(400, 'Invalid activity', done)
    })
    // activity getTargetActor
    it('errors on unknown actor', function (done) {
      request(app)
        .post('/inbox/noone')
        .set('Content-Type', 'application/activity+json')
        .send(activity)
        .expect(404, '\'noone\' not found on this instance', done)
    })
    // activity save
    it('saves activity', function (done) {
      request(app)
        .post('/inbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(activity)
        .expect(200)
        .then(() => {
          return apex.store.db
            .collection('streams')
            .findOne({ id: activity.id })
        })
        .then(act => {
          expect(act._meta.collection).toEqual(['https://localhost/inbox/test'])
          delete act._meta
          delete act._id
          expect(act).toEqual(activityNormalized)
          done()
        })
        .catch(done)
    })
    it('consolidates repeated deliveries', async function (done) {
      const first = merge({ _meta: { collection: ['https://localhost/u/bob'] } }, activityNormalized)
      await apex.store.saveActivity(first)
      request(app)
        .post('/inbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(activity)
        .expect(200)
        .then(() => {
          return apex.store.db
            .collection('streams')
            .findOne({ id: activity.id })
        })
        .then(act => {
          expect(act._meta.collection).toEqual([
            'https://localhost/u/bob',
            'https://localhost/inbox/test'

          ])
          done()
        })
        .catch(done)
    })
    // activity sideEffects
    it('fires create event', function (done) {
      app.once('apex-inbox', msg => {
        expect(msg.actor.id).toEqual(testUser.id)
        expect(msg.recipient).toEqual(testUser)
        const act = Object.assign({ _meta: { collection: ['https://localhost/inbox/test'] } }, activityNormalized)
        expect(msg.activity).toEqual(act)
        expect(msg.object).toEqual(activityNormalized.object[0])
        done()
      })
      request(app)
        .post('/inbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(activity)
        .expect(200)
        .end(err => { if (err) done(err) })
    })
    it('saves created object', function (done) {
      request(app)
        .post('/inbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(activity)
        .expect(200)
        .then(() => {
          return apex.store.db
            .collection('objects')
            .findOne({ id: activity.object.id })
        })
        .then(obj => {
          delete obj._id
          expect(obj).toEqual(activityNormalized.object[0])
          done()
        })
        .catch(done)
    })
    describe('accept', function () {
      let follow
      let accept
      beforeEach(function () {
        follow = merge({}, activityNormalized)
        follow.type = 'Follow'
        follow.to = ['https://ignore.com/bob']
        follow.id = apex.utils.activityIdToIRI()
        follow._meta = { collection: testUser.outbox }
        accept = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Accept',
          id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d3',
          to: ['https://localhost/u/test'],
          actor: 'https://ignore.com/bob',
          object: follow.id
        }
      })
      it('fires accept event', async function (done) {
        await apex.store.saveActivity(follow)
        app.once('apex-inbox', msg => {
          expect(msg.object.id).toEqual(follow.id)
          done()
        })
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(accept)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
      it('updates accepted activity', async function (done) {
        app.once('apex-inbox', async () => {
          const updated = await apex.store.db.collection('streams').findOne({ id: follow.id })
          expect(updated._meta.collection).toEqual([testUser.outbox[0], testUser.following[0]])
          done()
        })
        await apex.store.saveActivity(follow)
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(accept)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
      it('publishes collection update', async function (done) {
        const mockedUser = 'https://mocked.com/user/mocked'
        nock('https://mocked.com')
          .get('/user/mocked')
          .reply(200, { id: mockedUser, inbox: 'https://mocked.com/inbox/mocked' })
        nock('https://mocked.com').post('/inbox/mocked')
          .reply(200)
          .on('request', (req, interceptor, body) => {
            // correctly formed activity sent
            const sentActivity = JSON.parse(body)
            expect(sentActivity.id).toContain('https://localhost')
            delete sentActivity.id
            delete sentActivity.likes
            delete sentActivity.shares
            expect(new Date(sentActivity.published).toString()).not.toBe('Invalid Date')
            delete sentActivity.published
            expect(sentActivity).toEqual({
              '@context': apex.context,
              type: 'Update',
              actor: testUser.id,
              to: 'https://localhost/followers/test',
              cc: 'https://mocked.com/user/mocked',
              object: {
                id: testUser.following[0],
                type: 'OrderedCollection',
                totalItems: 1,
                orderedItems: [mockedUser]
              }
            })
            done()
          })
        follow.to = [mockedUser]
        follow.object = [mockedUser]
        accept.actor = mockedUser
        await apex.store.saveActivity(follow)
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(accept)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
    })
    it('fires follow event', function (done) {
      app.once('apex-inbox', () => {
        done()
      })
      const follow = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Follow',
        id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d3',
        to: ['https://localhost/u/test'],
        actor: 'https://localhost/u/test',
        object: 'https://localhost/u/test'
      }
      request(app)
        .post('/inbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(follow)
        .expect(200)
        .end(err => { if (err) done(err) })
    })
    it('fires undo event', function (done) {
      app.once('apex-inbox', () => {
        done()
      })
      const undo = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Undo',
        id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d4',
        to: ['https://localhost/u/test'],
        actor: 'https://localhost/u/test',
        object: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d3'
      }
      request(app)
        .post('/inbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(undo)
        .expect(200)
        .end(err => { if (err) done(err) })
    })
    it('removes undone activity', async function (done) {
      const undone = await apex
        .buildActivity('fake', 'https://localhost/u/test', 'https://localhost/u/test')
      undone.id = 'https://localhost/s/to-undo'
      const undo = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Undo',
        id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d4',
        to: ['https://localhost/u/test'],
        actor: ['https://localhost/u/test'],
        object: ['https://localhost/s/to-undo']
      }
      const db = apex.store.db
      const inserted = await db.collection('streams')
        .insertOne(undone)
      expect(inserted.insertedCount).toBe(1)
      await request(app)
        .post('/inbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(undo)
        .expect(200)
      const result = await db.collection('streams')
        .findOne({ id: 'https://localhost/s/to-undo' })
      expect(result).toBeFalsy()
      done()
    })
    it('fires other activity event', function (done) {
      const arriveAct = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Arrive',
        id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d3',
        to: ['https://localhost/u/test'],
        actor: 'https://localhost/u/test',
        location: {
          type: 'Place',
          name: 'Here'
        }
      }
      app.once('apex-inbox', msg => {
        expect(msg.actor.id).toBe('https://localhost/u/test')
        expect(msg.recipient).toEqual(testUser)
        expect(msg.activity).toEqual({
          _meta: { collection: ['https://localhost/inbox/test'] },
          type: 'Arrive',
          id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d3',
          to: ['https://localhost/u/test'],
          actor: ['https://localhost/u/test'],
          location: [{
            type: 'Place',
            name: ['Here']
          }]
        })
        done()
      })
      request(app)
        .post('/inbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(arriveAct)
        .expect(200)
        .end(err => { if (err) done(err) })
    })
    describe('announce', function () {
      let targetAct
      let announce
      let addrSpy
      beforeEach(function () {
        targetAct = merge({}, activityNormalized)
        announce = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Announce',
          id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-announce',
          to: ['https://localhost/u/test'],
          actor: 'https://localhost/u/test',
          object: targetAct.id
        }
        // stubs followers collection to avoid resolving objects
        addrSpy = spyOn(apex, 'address').and.callFake(async () => ['https://ignore.com/inbox/ignored'])
      })
      it('fires announce event', async function (done) {
        await apex.store.saveActivity(targetAct)
        app.once('apex-inbox', msg => {
          expect(msg.object.id).toEqual(targetAct.id)
          done()
        })
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(announce)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
      it('adds to shares collection if local', async function (done) {
        app.once('apex-inbox', async () => {
          const act = await apex.store.db.collection('streams').findOne({ id: announce.id })
          expect(act._meta.collection).toEqual([testUser.inbox[0], targetAct.shares[0]])
          done()
        })
        await apex.store.saveActivity(targetAct)
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(announce)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
      it('does not add to shares collection if remote', async function (done) {
        targetAct.id = 'https://ignore.com/o/123-abc'
        announce.object = targetAct.id
        await apex.store.saveActivity(targetAct)
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(announce)
          .expect(200)
          .then(() => apex.store.db.collection('streams').findOne({ id: announce.id }))
          .then(act => {
            expect(act._meta.collection).toEqual([testUser.inbox[0]])
            done()
          })
      })
      it('publishes shares collection update', async function (done) {
        nock('https://mocked.com').post('/inbox/mocked')
          .reply(200)
          .on('request', (req, interceptor, body) => {
            // correctly formed activity sent
            const sentActivity = JSON.parse(body)
            expect(sentActivity.id).toContain('https://localhost')
            delete sentActivity.id
            delete sentActivity.likes
            delete sentActivity.shares
            expect(new Date(sentActivity.published).toString()).not.toBe('Invalid Date')
            delete sentActivity.published
            delete announce['@context']
            expect(sentActivity).toEqual({
              '@context': apex.context,
              type: 'Update',
              actor: testUser.id,
              to: 'https://localhost/followers/test',
              cc: announce.actor,
              object: {
                id: targetAct.shares[0],
                type: 'OrderedCollection',
                totalItems: 1,
                orderedItems: ['https://localhost/s/a29a6843-9feb-4c74-a7f7-announce']
              }
            })
            done()
          })
        // mocks followers collection
        addrSpy.and.callFake(async () => ['https://mocked.com/inbox/mocked'])
        await apex.store.saveActivity(targetAct)
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(announce)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
    })
    describe('like', function () {
      let targetAct
      let like
      let addrSpy
      beforeEach(function () {
        targetAct = merge({}, activityNormalized)
        like = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Like',
          id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-like',
          to: ['https://localhost/u/test'],
          actor: 'https://localhost/u/test',
          object: targetAct.id
        }
        // mocks followers collection to avoid resolving objects
        addrSpy = spyOn(apex, 'address').and.callFake(async () => ['https://ignore.com/inbox/ignored'])
      })
      it('fires like event', async function (done) {
        await apex.store.saveActivity(targetAct)
        app.once('apex-inbox', msg => {
          expect(msg.object.id).toEqual(targetAct.id)
          done()
        })
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(like)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
      it('adds to likes collection if local', async function (done) {
        app.once('apex-inbox', async () => {
          const act = await apex.store.db.collection('streams').findOne({ id: like.id })
          expect(act._meta.collection).toEqual([testUser.inbox[0], targetAct.likes[0]])
          done()
        })
        await apex.store.saveActivity(targetAct)
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(like)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
      it('does not add to likes collection if remote', async function (done) {
        targetAct.id = 'https://ignore.com/o/123-abc'
        like.object = targetAct.id
        await apex.store.saveActivity(targetAct)
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(like)
          .expect(200)
          .then(() => apex.store.db.collection('streams').findOne({ id: like.id }))
          .then(act => {
            expect(act._meta.collection).toEqual([testUser.inbox[0]])
            done()
          })
      })
      it('publishes likes collection update', async function (done) {
        nock('https://mocked.com').post('/inbox/mocked')
          .reply(200)
          .on('request', (req, interceptor, body) => {
            // correctly formed activity sent
            const sentActivity = JSON.parse(body)
            expect(sentActivity.id).toContain('https://localhost')
            delete sentActivity.id
            delete sentActivity.likes
            delete sentActivity.shares
            expect(new Date(sentActivity.published).toString()).not.toBe('Invalid Date')
            delete sentActivity.published
            delete like['@context']
            expect(sentActivity).toEqual({
              '@context': apex.context,
              type: 'Update',
              actor: testUser.id,
              to: 'https://localhost/followers/test',
              cc: like.actor,
              object: {
                id: targetAct.likes[0],
                type: 'OrderedCollection',
                totalItems: 1,
                orderedItems: ['https://localhost/s/a29a6843-9feb-4c74-a7f7-like']
              }
            })
            done()
          })
        // mocks followers collection
        addrSpy.and.callFake(async () => ['https://mocked.com/inbox/mocked'])
        await apex.store.saveActivity(targetAct)
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(like)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
    })
    describe('update', function () {
      let targetObj
      let update
      beforeEach(function () {
        targetObj = merge({}, activityNormalized.object[0])
        update = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Update',
          id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-announce',
          to: ['https://localhost/u/test'],
          actor: 'https://localhost/u/test',
          object: merge({}, targetObj)
        }
      })
      it('fires update event', async function (done) {
        await apex.store.saveObject(targetObj)
        app.once('apex-inbox', msg => {
          expect(msg.object.id).toEqual(targetObj.id)
          done()
        })
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(update)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
      it('403 if updater is not owner', async function (done) {
        update.actor = 'https://ignore.com/bob'
        await apex.store.saveObject(targetObj)
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(update)
          .expect(403, done)
      })
      it('updates the object in storage', async function (done) {
        await apex.store.saveObject(targetObj)
        update.object.content = ['I have been updated']
        app.once('apex-inbox', async msg => {
          expect(msg.object.content).toEqual(['I have been updated'])
          expect((await apex.store.getObject(targetObj.id)).content)
            .toEqual(['I have been updated'])
          done()
        })
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(update)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
      it('updates the object in streams', async function (done) {
        await apex.store.saveActivity(activityNormalized)
        await apex.store.saveObject(targetObj)
        update.object.content = ['I have been updated']
        app.once('apex-inbox', async msg => {
          expect(msg.object.content).toEqual(['I have been updated'])
          const upd = await apex.store.getActivity(activityNormalized.id)
          expect(upd.object[0].content).toEqual(['I have been updated'])
          done()
        })
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(update)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
    })
    describe('delete', function () {
      let targetObj
      let del
      beforeEach(function () {
        targetObj = merge({}, activityNormalized.object[0])
        del = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Delete',
          id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-announce',
          to: ['https://localhost/u/test'],
          actor: 'https://localhost/u/test',
          object: merge({}, targetObj)
        }
      })
      it('fires delete event', async function (done) {
        await apex.store.saveObject(targetObj)
        app.once('apex-inbox', msg => {
          expect(msg.object.id).toEqual(targetObj.id)
          done()
        })
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(del)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
      it('403 if updater is not owner', async function (done) {
        del.actor = 'https://ignore.com/bob'
        await apex.store.saveObject(targetObj)
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(del)
          .expect(403, done)
      })
      it('replaces object in storage with tombstone', async function (done) {
        await apex.store.saveObject(targetObj)
        app.once('apex-inbox', async msg => {
          expect(msg.object.content).toEqual(['Say, did you finish reading that book I lent you?'])
          const tomb = await apex.store.getObject(targetObj.id)
          expect(new Date(tomb.deleted).toString()).not.toBe('Invalid Date')
          delete tomb.deleted
          delete tomb.updated
          delete tomb.published
          expect(tomb).toEqual({
            id: targetObj.id,
            type: 'Tombstone'
          })
          done()
        })
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(del)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
      it('replaces object in streams with tombstone', async function (done) {
        await apex.store.saveObject(targetObj)
        await apex.store.saveActivity(activityNormalized)
        app.once('apex-inbox', async msg => {
          expect(msg.object.content).toEqual(['Say, did you finish reading that book I lent you?'])
          const tomb = (await apex.store.getActivity(activityNormalized.id)).object[0]
          expect(new Date(tomb.deleted).toString()).not.toBe('Invalid Date')
          delete tomb.deleted
          delete tomb.updated
          delete tomb.published
          expect(tomb).toEqual({
            id: targetObj.id,
            type: 'Tombstone'
          })
          done()
        })
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(del)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
    })
  })
  describe('get', function () {
    it('returns inbox as ordered collection', (done) => {
      const inbox = []
      const meta = { collection: ['https://localhost/inbox/test'] }
      ;[1, 2, 3].forEach(i => {
        inbox.push(Object.assign({}, activity, { id: `${activity.id}${i}`, _meta: meta }))
      })
      apex.store.db
        .collection('streams')
        .insertMany(inbox)
        .then(inserted => {
          const inboxCollection = {
            '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
            id: 'https://localhost/inbox/test',
            type: 'OrderedCollection',
            totalItems: 3,
            orderedItems: [3, 2, 1].map(i => ({
              type: 'Create',
              id: `https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d3${i}`,
              to: 'https://localhost/u/test',
              actor: 'https://localhost/u/test',
              object: {
                type: 'Note',
                id: 'https://localhost/o/49e2d03d-b53a-4c4c-a95c-94a6abf45a19',
                attributedTo: 'https://localhost/u/test',
                to: 'https://localhost/u/test',
                content: 'Say, did you finish reading that book I lent you?'
              },
              shares: 'https://localhost/shares/a29a6843-9feb-4c74-a7f7-081b9c9201d3',
              likes: 'https://localhost/likes/a29a6843-9feb-4c74-a7f7-081b9c9201d3'
            }))
          }
          expect(inserted.insertedCount).toBe(3)
          request(app)
            .get('/inbox/test')
            .set('Accept', 'application/activity+json')
            .expect(200)
            .end((err, res) => {
              expect(res.body).toEqual(inboxCollection)
              done(err)
            })
        })
    })
  })
})
