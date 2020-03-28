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
const activity = {
  '@context': 'https://www.w3.org/ns/activitystreams',
  type: 'Create',
  id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d3',
  to: ['https://localhost/u/dummy'],
  actor: 'https://localhost/u/dummy',
  object: {
    type: 'Note',
    id: 'https://localhost/o/49e2d03d-b53a-4c4c-a95c-94a6abf45a19',
    attributedTo: 'https://localhost/u/dummy',
    to: ['https://localhost/u/dummy'],
    content: 'Say, did you finish reading that book I lent you?'
  }
}

app.use(express.json({ type: apex.pub.consts.jsonldTypes }), apex)
app.post('/inbox/:actor', apex.net.inbox.post)
app.get('/inbox/:actor', apex.net.inbox.get)
app.use(function (err, req, res, next) {
  console.log(err)
  next(err)
})

describe('inbox', function () {
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
  describe('post', function () {
    // validators jsonld
    it('errors invalid body types', function (done) {
      request(app)
        .post('/inbox/dummy')
        .send({})
        .expect(400, done)
    })
    // validators activity
    it('errors invalid activities', function (done) {
      request(app)
        .post('/inbox/dummy')
        .set('Content-Type', 'application/activity+json')
        .send({})
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
        .post('/inbox/dummy')
        .set('Content-Type', 'application/activity+json')
        .send(activity)
        .expect(200)
        .then(() => {
          return apex.store.connection.getDb()
            .collection('streams')
            .findOne({ id: activity.id })
        })
        .then(act => {
          expect(act._meta._target).toBe('https://localhost/u/dummy')
          delete act._meta
          delete act._id
          expect(act).toEqual(activity)
          done()
        })
        .catch(done)
    })
    // activity sideEffects
    it('fires create event', function (done) {
      app.once('apex-create', msg => {
        expect(msg.actor).toBe('https://localhost/u/dummy')
        expect(msg.recipient).toEqual(dummy)
        const act = Object.assign({ _meta: { _target: 'https://localhost/u/dummy' } }, activity)
        expect(msg.activity).toEqual(act)
        expect(msg.object).toEqual(activity.object)
        done()
      })
      request(app)
        .post('/inbox/dummy')
        .set('Content-Type', 'application/activity+json')
        .send(activity)
        .expect(200)
        .end(err => { if (err) done(err) })
    })
    it('saves created object', function (done) {
      request(app)
        .post('/inbox/dummy')
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
          expect(obj).toEqual(activity.object)
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
        to: ['https://localhost/u/dummy'],
        actor: 'https://localhost/u/dummy',
        object: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d4'
      }
      request(app)
        .post('/inbox/dummy')
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
        to: ['https://localhost/u/dummy'],
        actor: 'https://localhost/u/dummy',
        object: 'https://localhost/u/dummy'
      }
      request(app)
        .post('/inbox/dummy')
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
        to: ['https://localhost/u/dummy'],
        actor: 'https://localhost/u/dummy',
        object: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d3'
      }
      request(app)
        .post('/inbox/dummy')
        .set('Content-Type', 'application/activity+json')
        .send(undo)
        .expect(200)
        .end(err => { if (err) done(err) })
    })
    it('removes undone activity', function (done) {
      const undo = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Undo',
        id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d4',
        to: ['https://localhost/u/dummy'],
        actor: 'https://localhost/u/dummy',
        object: 'https://localhost/s/to-undo'
      }
      const db = apex.store.connection.getDb()
      db.collection('streams')
        .insertOne({ id: 'https://localhost/s/to-undo', actor: 'https://localhost/u/dummy' })
        .then(inserted => {
          expect(inserted.insertedCount).toBe(1)
          return request(app)
            .post('/inbox/dummy')
            .set('Content-Type', 'application/activity+json')
            .send(undo)
            .expect(200)
        })
        .then(() => {
          return db.collection('streams')
            .findOne({ id: 'https://localhost/s/to-undo' })
        })
        .then(result => {
          expect(result).toBeFalsy()
          done()
        })
        .catch(done)
    })
  })
  describe('get', function () {
    it('returns inbox as ordered collection', (done) => {
      const inbox = []
      const meta = { _target: 'https://localhost/u/dummy' }
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
            // sort chronological, and remove internal artifacts
            orderedItems: inbox.reverse().map(act => {
              delete act['@context']
              delete act._id
              delete act._meta
              return act
            })
          }
          expect(inserted.insertedCount).toBe(3)
          request(app)
            .get('/inbox/dummy')
            .set('Accept', 'application/activity+json')
            .expect(200, inboxCollection, done)
        })
    })
  })
})
