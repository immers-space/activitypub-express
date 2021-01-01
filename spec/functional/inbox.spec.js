/* global describe, beforeAll, beforeEach, it, expect, spyOn */
const request = require('supertest')
const merge = require('deepmerge')
const nock = require('nock')

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

describe('inbox', function () {
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
    app.route('/inbox/:actor')
      .post(apex.net.inbox.post)
      .get(apex.net.inbox.get)
  })
  beforeEach(function () {
    // don't let failed deliveries pollute later tests
    spyOn(apex.store, 'deliveryRequeue').and.resolveTo(undefined)
    return global.resetDb(apex, client, testUser)
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
    it('ignores blocked actors', async function (done) {
      const block = merge({}, activityNormalized)
      block.type = 'Block'
      block.object = ['https://ignore.com/u/chud']
      block._meta = { collection: [apex.utils.nameToBlockedIRI(testUser.preferredUsername)] }
      await apex.store.saveActivity(block)
      const act = merge({}, activity)
      act.actor = ['https://ignore.com/u/chud']
      request(app)
        .post('/inbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(act)
        .expect(200)
        .end(async (err) => {
          if (err) return done(err)
          const inbox = await apex.getInbox(testUser, Infinity)
          expect(inbox.orderedItems.length).toBe(0)
          done()
        })
    })
    it('forwards from inbox', async function (done) {
      const mockedUser = 'https://mocked.com/u/mocked'
      spyOn(apex, 'getFollowers').and
        .resolveTo({ orderedItems: [mockedUser] })
      await apex.store.saveActivity(activityNormalized)
      const reply = await apex.buildActivity(
        'Create',
        'https://ignore.com/bob',
        [testUser.id, testUser.followers[0]],
        { object: { id: 'https://ignore.com/o/abc123', type: 'Note', inReplyTo: activityNormalized.id } }
      )
      reply.id = 'https://ignore.com/s/123abc'
      nock('https://mocked.com')
        .get('/u/mocked')
        .reply(200, { id: mockedUser, inbox: 'https://mocked.com/inbox/mocked' })
      nock('https://mocked.com').post('/inbox/mocked')
        .reply(200)
        .on('request', (req, interceptor, body) => {
          expect(JSON.parse(body).id).toBe('https://ignore.com/s/123abc')
          done()
        })
      request(app)
        .post('/inbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(await apex.toJSONLD(reply))
        .expect(200)
        .end(err => { if (err) done(err) })
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
        follow.object = ['https://ignore.com/bob']
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
          expect(msg.object._meta.collection).toContain(testUser.following[0])
          done()
        })
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(accept)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
      it('rejects accept from non-recipients of original activity', async function (done) {
        follow.to = ['https://ignore.com/sally']
        await apex.store.saveActivity(follow)
        app.once('apex-inbox', msg => {
          expect(msg.object.id).toEqual(follow.id)
          done()
        })
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(accept)
          .expect(403, done)
      })
      it('rejects accept from non-target of original follow', async function (done) {
        follow.object = ['https://ignore.com/sally']
        await apex.store.saveActivity(follow)
        app.once('apex-inbox', msg => {
          expect(msg.object.id).toEqual(follow.id)
          done()
        })
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(accept)
          .expect(403, done)
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
                first: 'https://localhost/following/test?page=true'
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
    describe('undo', function () {
      let undo
      let undone
      beforeEach(function () {
        undone = merge({}, activityNormalized)
        undo = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Undo',
          id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d4',
          to: ['https://localhost/u/test'],
          actor: 'https://localhost/u/test',
          object: undone.id
        }
      })
      it('fires undo event', async function (done) {
        await apex.store.saveActivity(undone)
        app.once('apex-inbox', () => {
          done()
        })
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(undo)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
      it('rejects undo with owner mismatch', async function (done) {
        undone.actor = ['https://ignore.com/bob']
        await apex.store.saveActivity(undone)
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(undo)
          .expect(403, done)
      })
      it('removes undone activity', async function (done) {
        await apex.store.saveActivity(undone)
        await request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(undo)
          .expect(200)
        const result = await apex.store.getActivity(undone.id)
        expect(result).toBeFalsy()
        done()
      })
      it('publishes related collection updates')
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
    it('fires Add event', function (done) {
      const actId = 'https://ignore.com/s/abc123'
      const addAct = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Add',
        id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d3',
        to: ['https://localhost/u/test'],
        actor: 'https://localhost/u/test',
        object: actId,
        target: 'https://localhost/u/test/c/testCollection'
      }
      app.once('apex-inbox', msg => {
        expect(msg.actor.id).toBe('https://localhost/u/test')
        expect(msg.recipient).toEqual(testUser)
        expect(msg.activity).toEqual({
          _meta: { collection: ['https://localhost/inbox/test'] },
          type: 'Add',
          id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d3',
          to: ['https://localhost/u/test'],
          actor: ['https://localhost/u/test'],
          object: [actId],
          target: ['https://localhost/u/test/c/testCollection']
        })
        done()
      })
      request(app)
        .post('/inbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(addAct)
        .expect(200)
        .end(err => { if (err) done(err) })
    })
    it('fires Remove event', function (done) {
      const actId = 'https://ignore.com/s/abc123'
      const remAct = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Remove',
        id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d3',
        to: ['https://localhost/u/test'],
        actor: 'https://localhost/u/test',
        object: actId,
        target: 'https://localhost/u/test/c/testCollection'
      }
      app.once('apex-inbox', msg => {
        expect(msg.actor.id).toBe('https://localhost/u/test')
        expect(msg.recipient).toEqual(testUser)
        expect(msg.activity).toEqual({
          _meta: { collection: ['https://localhost/inbox/test'] },
          type: 'Remove',
          id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-081b9c9201d3',
          to: ['https://localhost/u/test'],
          actor: ['https://localhost/u/test'],
          object: [actId],
          target: ['https://localhost/u/test/c/testCollection']
        })
        done()
      })
      request(app)
        .post('/inbox/test')
        .set('Content-Type', 'application/activity+json')
        .send(remAct)
        .expect(200)
        .end(err => { if (err) done(err) })
    })
    describe('reject', function () {
      it('fires Reject event', async function (done) {
        await apex.store.saveActivity(activityNormalized)
        const rejAct = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Reject',
          id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-reject',
          to: ['https://localhost/u/test'],
          actor: 'https://localhost/u/test',
          object: activityNormalized.id
        }
        app.once('apex-inbox', msg => {
          expect(msg.actor.id).toBe('https://localhost/u/test')
          expect(msg.recipient).toEqual(testUser)
          expect(msg.activity).toEqual({
            _meta: { collection: ['https://localhost/inbox/test'] },
            type: 'Reject',
            id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-reject',
            to: ['https://localhost/u/test'],
            actor: ['https://localhost/u/test'],
            object: [activityNormalized.id]
          })
          const actRejected = merge(
            { _meta: { collection: [apex.utils.nameToRejectionsIRI(testUser.preferredUsername)] } },
            activityNormalized
          )
          expect(msg.object).toEqual(actRejected)
          done()
        })
        request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(rejAct)
          .expect(200)
          .end(err => { if (err) done(err) })
      })
      it('updates rejected activity meta', async function () {
        await apex.store.saveActivity(activityNormalized)
        const rejAct = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Reject',
          id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-reject',
          to: ['https://localhost/u/test'],
          actor: 'https://localhost/u/test',
          object: activityNormalized.id
        }
        return request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(rejAct)
          .expect(200)
          .then(async () => {
            const target = await apex.store.getActivity(activityNormalized.id, true)
            expect(target._meta).toBeTruthy()
            expect(target._meta.collection).toContain(apex.utils.nameToRejectionsIRI(testUser.preferredUsername))
          })
      })
      it('does not add rejected follow to following', async function () {
        const follow = merge({}, activityNormalized)
        follow.type = 'Follow'
        follow.object = ['https://localhost/u/meanface']
        await apex.store.saveActivity(follow)
        const rejAct = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Reject',
          id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-reject',
          to: ['https://localhost/u/test'],
          actor: 'https://localhost/u/test',
          object: follow.id
        }
        return request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(rejAct)
          .expect(200)
          .then(async () => {
            const target = await apex.store.getActivity(follow.id, true)
            expect(target._meta).toBeTruthy()
            expect(target._meta.collection).not.toContain(testUser.following[0])
          })
      })
      it('undoes prior follow accept', async function () {
        const follow = merge({}, activityNormalized)
        follow.type = 'Follow'
        follow.object = ['https://localhost/u/flipflopper']
        follow._meta = { collection: testUser.following }
        await apex.store.saveActivity(follow)
        const rejAct = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Reject',
          id: 'https://localhost/s/a29a6843-9feb-4c74-a7f7-reject',
          to: ['https://localhost/u/test'],
          actor: 'https://localhost/u/test',
          object: follow.id
        }
        return request(app)
          .post('/inbox/test')
          .set('Content-Type', 'application/activity+json')
          .send(rejAct)
          .expect(200)
          .then(async () => {
            const target = await apex.store.getActivity(follow.id, true)
            expect(target._meta).toBeTruthy()
            expect(target._meta.collection).not.toContain(testUser.following[0])
          })
      })
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
                first: 'https://localhost/shares/a29a6843-9feb-4c74-a7f7-081b9c9201d3?page=true'
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
                first: 'https://localhost/likes/a29a6843-9feb-4c74-a7f7-081b9c9201d3?page=true'
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
    let inbox
    beforeEach(async function () {
      inbox = []
      const meta = { collection: ['https://localhost/inbox/test'] }
      ;[1, 2, 3].forEach(i => {
        inbox.push(merge.all([{}, activityNormalized, { id: `${activity.id}${i}`, _meta: meta }]))
      })
      await apex.store.db
        .collection('streams')
        .insertMany(inbox)
    })
    it('returns inbox as ordered collection', (done) => {
      const inboxCollection = {
        '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
        id: 'https://localhost/inbox/test',
        type: 'OrderedCollection',
        totalItems: 3,
        first: 'https://localhost/inbox/test?page=true'
      }
      request(app)
        .get('/inbox/test')
        .set('Accept', 'application/activity+json')
        .expect(200)
        .end((err, res) => {
          expect(res.body).toEqual(inboxCollection)
          done(err)
        })
    })
    it('returns page as ordered collection page', (done) => {
      const inboxCollectionPage = {
        '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
        id: 'https://localhost/inbox/test?page=true',
        type: 'OrderedCollectionPage',
        partOf: 'https://localhost/inbox/test',
        next: `https://localhost/inbox/test?page=${inbox[0]._id}`,
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
      request(app)
        .get('/inbox/test?page=true')
        .set('Accept', 'application/activity+json')
        .expect(200)
        .end((err, res) => {
          expect(res.body).toEqual(inboxCollectionPage)
          done(err)
        })
    })
    it('filters blocked actors', async function (done) {
      const meta = { collection: ['https://localhost/inbox/test'] }
      const blocked = merge.all([
        {},
        activityNormalized,
        { id: `${activity.id}b`, _meta: meta, actor: ['https://localhost/u/blocked'] }
      ])
      await apex.store.db
        .collection('streams')
        .insertOne(blocked)
      spyOn(apex, 'getBlocked')
        .and.returnValue({ orderedItems: ['https://localhost/u/blocked'] })
      const inboxCollection = {
        '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
        id: 'https://localhost/inbox/test?page=true',
        type: 'OrderedCollectionPage',
        partOf: 'https://localhost/inbox/test',
        next: `https://localhost/inbox/test?page=${inbox[0]._id}`,
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
      request(app)
        .get('/inbox/test?page=true')
        .set('Accept', 'application/activity+json')
        .expect(200)
        .end((err, res) => {
          expect(res.body).toEqual(inboxCollection)
          done(err)
        })
    })
  })
})
