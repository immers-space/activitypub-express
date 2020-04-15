/* global describe, beforeAll, beforeEach, it, expect */
const request = require('supertest')
const express = require('express')
const merge = require('deepmerge')
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
  }
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
  to: [
    'https://localhost/u/test'
  ]
}

app.use(express.json({ type: apex.pub.consts.jsonldTypes }), apex)
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
        .send({ actor: 'bob', '@context': 'https://www.w3.org/ns/activitystreams' })
        .expect(400, 'Invalid activity', done)
    })
    // security verifySignature
    // it('todo', function () {

    // })
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
          return apex.store.connection.getDb()
            .collection('streams')
            .findOne({ id: activity.id })
        })
        .then(act => {
          expect(act._meta._target).toBe('https://localhost/u/test')
          delete act._meta
          delete act._id
          expect(act).toEqual(activityNormalized)
          done()
        })
        .catch(done)
    })
    // activity sideEffects
    it('fires create event', function (done) {
      const recipient = merge({}, testUser)
      delete recipient._meta
      app.once('apex-create', msg => {
        expect(msg.actor).toBe('https://localhost/u/test')
        expect(msg.recipient).toEqual(recipient)
        const act = Object.assign({ _meta: { _target: 'https://localhost/u/test' } }, activityNormalized)
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
          return apex.store.connection.getDb()
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
    it('fires accept event', function (done) {
      app.once('apex-accept', () => {
        done()
      })
      const accept = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Accept',
        id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d3',
        to: ['https://localhost/u/test'],
        actor: 'https://localhost/u/test',
        object: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d4'
      }
      request(app)
        .post('/inbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(accept)
        .expect(200)
        .end(err => { if (err) done(err) })
    })
    it('fires follow event', function (done) {
      app.once('apex-follow', () => {
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
      app.once('apex-undo', () => {
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
      const undone = await apex.pub.activity
        .build(apex.context, 'https://localhost/s/to-undo', 'fake', 'https://localhost/u/test', 'https://localhost/u/test')
      const undo = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Undo',
        id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d4',
        to: ['https://localhost/u/test'],
        actor: 'https://localhost/u/test',
        object: 'https://localhost/s/to-undo'
      }
      const db = apex.store.connection.getDb()
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
      const recipient = merge({}, testUser)
      delete recipient._meta
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
      app.once('apex-arrive', msg => {
        expect(msg.actor).toBe('https://localhost/u/test')
        expect(msg.recipient).toEqual(recipient)
        expect(msg.activity).toEqual({
          _meta: { _target: 'https://localhost/u/test' },
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
  })
  describe('get', function () {
    it('returns inbox as ordered collection', (done) => {
      const inbox = []
      const meta = { _target: 'https://localhost/u/test' }
      ;[1, 2, 3].forEach(i => {
        inbox.push(Object.assign({}, activity, { id: `${activity.id}${i}`, _meta: meta }))
      })
      apex.store.connection.getDb()
        .collection('streams')
        .insertMany(inbox)
        .then(inserted => {
          const inboxCollection = {
            '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
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
              }
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
