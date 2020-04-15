/* global describe, beforeAll, beforeEach, afterEach, it, expect */
const request = require('supertest')
const express = require('express')
const nock = require('nock')
const httpSignature = require('http-signature')
const { MongoClient } = require('mongodb')
const merge = require('deepmerge')

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
    outbox: '/outbox/:actor'
  }
})
const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true, useNewUrlParser: true })
const activity = {
  '@context': [
    'https://www.w3.org/ns/activitystreams',
    'https://w3id.org/security/v1'
  ],
  type: 'Create',
  to: 'https://ignore.com/u/ignored',
  actor: 'https://localhost/u/test',
  object: {
    type: 'Note',
    attributedTo: 'https://localhost/u/test',
    to: 'https://ignore.com/u/ignored',
    content: 'Say, did you finish reading that book I lent you?'
  }
}

const activityNormalized = {
  type: 'Create',
  actor: [
    'https://localhost/u/test'
  ],
  object: [
    {
      type: 'Note',
      attributedTo: [
        'https://localhost/u/test'
      ],
      content: [
        'Say, did you finish reading that book I lent you?'
      ],
      to: [
        'https://ignore.com/u/ignored'
      ]
    }
  ],
  to: [
    'https://ignore.com/u/ignored'
  ]
}
app.use(express.json({ type: apex.pub.consts.jsonldTypes }), apex)
app.route('/outbox/:actor')
  .get(apex.net.outbox.get)
  .post(apex.net.outbox.post)
app.use(function (err, req, res, next) {
  console.log(err)
  next(err)
})

describe('outbox', function () {
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
    // block federation attempts
    nock('https://ignore.com')
      .get(() => true)
      .reply(200, {})
      .persist()
      .post(() => true)
      .reply(200)
      .persist()
    // reset db for each test
    client.db('apexTestingTempDb').dropDatabase()
      .then(() => {
        apex.store.connection.setDb(client.db('apexTestingTempDb'))
        return apex.store.setup(testUser)
      })
      .then(done)
  })
  afterEach(function () {
    nock.cleanAll()
  })
  describe('post', function () {
    // validators jsonld
    it('ignores invalid body types', function (done) {
      request(app)
        .post('/outbox/test')
        .send({})
        .expect(404, done)
    })
    // validators activity
    it('errors invalid activities', function (done) {
      request(app)
        .post('/outbox/test')
        .set('Content-Type', 'application/activity+json')
        .send({ actor: 'bob', '@context': 'https://www.w3.org/ns/activitystreams' })
        .expect(400, 'Invalid activity', done)
    })
    // activity getTargetActor
    it('errors on unknown actor', function (done) {
      request(app)
        .post('/outbox/noone')
        .set('Content-Type', 'application/activity+json')
        .send(activity)
        .expect(404, '\'noone\' not found on this instance', done)
    })
    // activity save
    it('saves activity in stream', function (done) {
      request(app)
        .post('/outbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(activity)
        .expect(200)
        .then(() => {
          return apex.store.connection.getDb()
            .collection('streams')
            .findOne({ actor: 'https://localhost/u/test' })
        })
        .then(act => {
          delete act._meta
          delete act._id
          delete act.id
          delete act.object[0].id
          expect(act).toEqual(activityNormalized)
          done()
        })
        .catch(done)
    })
    it('saves object from activity', function (done) {
      request(app)
        .post('/outbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(activity)
        .expect(200)
        .then(() => {
          return apex.store.connection.getDb()
            .collection('objects')
            .findOne({ attributedTo: ['https://localhost/u/test'] })
        })
        .then(o => {
          delete o._meta
          delete o._id
          expect(o.id).not.toBeFalsy()
          delete o.id
          expect(o).toEqual(activityNormalized.object[0])
          done()
        })
        .catch(done)
    })
    it('wraps a bare object in a create activity', function (done) {
      const bareObj = merge({}, activity.object)
      bareObj['@context'] = 'https://www.w3.org/ns/activitystreams'
      request(app)
        .post('/outbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(bareObj)
        .expect(200)
        .then(() => {
          return apex.store.connection.getDb()
            .collection('streams')
            .findOne({ actor: 'https://localhost/u/test' })
        })
        .then(act => {
          expect(act.type).toBe('Create')
          delete act.object[0].id
          expect(act.object[0]).toEqual(activityNormalized.object[0])
          done()
        })
        .catch(done)
    })
    it('delivers messages to federation targets', function (done) {
      const act = merge({}, activity)
      act.to = act.object.to = 'https://mocked.com/user/mocked'
      nock('https://mocked.com')
        .get('/user/mocked')
        .reply(200, { id: 'https://mocked.com/user/mocked', inbox: 'https://mocked.com/inbox/mocked' })
      nock('https://mocked.com').post('/inbox/mocked')
        .reply(200)
        .on('request', (req, interceptor, body) => {
          // correctly formed activity sent
          const sentActivity = JSON.parse(body)
          delete sentActivity.id
          delete sentActivity.object.id
          expect(sentActivity).toEqual(act)
          // valid signature
          req.originalUrl = req.path
          const sigHead = httpSignature.parse(req)
          expect(httpSignature.verifySignature(sigHead, testUser.publicKey[0].publicKeyPem[0])).toBeTruthy()
          done()
        })
      request(app)
        .post('/outbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(act)
        .expect(200)
        .end(function (err) {
          if (err) throw err
        })
    })
    // activity side effects
    it('fires create event', function (done) {
      app.once('apex-create', msg => {
        expect(msg.actor).toEqual(testUser)
        delete msg.activity.id
        delete msg.object.id
        expect(msg.activity).toEqual(activityNormalized)
        expect(msg.object).toEqual(activityNormalized.object[0])
        done()
      })
      request(app)
        .post('/outbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(activity)
        .expect(200)
        .end(err => { if (err) done(err) })
    })
    it('fires other activity event', function (done) {
      const arriveAct = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Arrive',
        to: ['https://ignore.com/u/ignored'],
        actor: 'https://localhost/u/test',
        location: {
          type: 'Place',
          name: 'Here'
        }
      }
      app.once('apex-arrive', msg => {
        expect(msg.actor).toEqual(testUser)
        delete msg.activity.id
        expect(msg.activity).toEqual({
          type: 'Arrive',
          to: ['https://ignore.com/u/ignored'],
          actor: ['https://localhost/u/test'],
          location: [{
            type: 'Place',
            name: ['Here']
          }]
        })
        done()
      })
      request(app)
        .post('/outbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(arriveAct)
        .expect(200)
        .end(err => { if (err) done(err) })
    })
  })
  describe('get', function () {
    it('returns outbox as ordered collection', (done) => {
      const outbox = [1, 2, 3].map(i => {
        const a = Object.assign({}, activity, { id: `${activity.id}${i}` })
        a.object = Object.assign({}, a.object, { id: `${a.object.id}${i}` })
        return a
      })
      apex.store.connection.getDb()
        .collection('streams')
        .insertMany(outbox)
        .then(inserted => {
          const outboxCollection = {
            '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
            type: 'OrderedCollection',
            totalItems: 3,
            // sort chronological, and remove internal artifacts
            orderedItems: outbox.reverse().map(act => {
              delete act['@context']
              delete act._id
              // delete act._meta
              return act
            })
          }
          expect(inserted.insertedCount).toBe(3)
          request(app)
            .get('/outbox/test')
            .set('Accept', 'application/activity+json')
            .expect(200, outboxCollection, done)
        })
    })
  })
})
