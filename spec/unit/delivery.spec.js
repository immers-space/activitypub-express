/* global describe, beforeAll, beforeEach, afterEach, jasmine, it, expect, spyOn */

describe('delivery', function () {
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
    app.route('/outbox/:actor')
      .get(apex.net.outbox.get)
      .post(apex.net.outbox.post)
  })
  beforeEach(function () {
    return global.resetDb(apex, client, testUser)
  })
  describe('queueing', function () {
    let body
    let addresses
    beforeEach(async function () {
      jasmine.clock().install().mockDate(new Date(1))
      const act = await apex.buildActivity('Create', testUser.id, ['https://ignore.com/bob'], {
        object: {
          type: 'Note',
          content: 'Hello'
        }
      })
      body = await apex.toJSONLD(act)
      addresses = ['https://ignore.com/bob/inbox', 'https://ignore.com/sally/inbox']
      spyOn(apex, 'runDelivery')
      await apex.queueForDelivery(testUser, body, addresses)
    })
    afterEach(function () {
      jasmine.clock().uninstall()
    })
    it('adds queued items to db', async function () {
      const queued = await apex.store.db.collection('deliveryQueue')
        .find({})
        .sort({ _id: 1 })
        .project({ _id: 0 })
        .toArray()
      expect(queued).toEqual(addresses.map(address => ({
        actorId: testUser.id,
        address,
        body: apex.stringifyPublicJSONLD(body),
        signingKey: testUser._meta.privateKey,
        attempt: 0,
        after: new Date()
      })))
    })
    it('dequeues items in FIFO order', async function () {
      await apex.queueForDelivery(testUser, body, ['https://ignore.com/lee/inbox'])
      const first = await apex.store.deliveryDequeue()
      const second = await apex.store.deliveryDequeue()
      const third = await apex.store.deliveryDequeue()
      const fourth = await apex.store.deliveryDequeue()
      const standard = [...addresses, 'https://ignore.com/lee/inbox'].map(address => ({
        actorId: testUser.id,
        address,
        body: apex.stringifyPublicJSONLD(body),
        signingKey: testUser._meta.privateKey,
        attempt: 0,
        after: new Date()
      }))
      // fourth should be null as queue is empty
      standard.push(null)
      expect([first, second, third, fourth]).toEqual(standard)
    })
    it('requeues items at the end and increases attempt count & time', async function () {
      const delivery = await apex.store.deliveryDequeue()
      await apex.store.deliveryRequeue(delivery)
      const queued = await apex.store.db.collection('deliveryQueue')
        .find({})
        .sort({ _id: 1 })
        .project({ _id: 0 })
        .toArray()
      expect(queued).toEqual([{
        address: addresses[1],
        actorId: testUser.id,
        body: apex.stringifyPublicJSONLD(body),
        signingKey: testUser._meta.privateKey,
        attempt: 0,
        after: new Date()
      }, {
        address: addresses[0],
        actorId: testUser.id,
        body: apex.stringifyPublicJSONLD(body),
        signingKey: testUser._meta.privateKey,
        attempt: 1,
        after: new Date(2) // mocked start date (1) + 10^0 ms delay (1)
      }])
    })
  })
  describe('background delivery process', function () {
    let body
    let bodyString
    let addresses
    beforeEach(async function () {
      const act = await apex.buildActivity('Create', testUser.id, ['https://ignore.com/bob'], {
        object: {
          type: 'Note',
          content: 'Hello'
        }
      })
      body = await apex.toJSONLD(act)
      bodyString = apex.stringifyPublicJSONLD(body)
      addresses = ['https://mocked.com/bob/inbox', 'https://ignore.com/sally/inbox']
    })
    it('starts delivery process after queueing', async function () {
      spyOn(apex, 'runDelivery')
      await apex.queueForDelivery(testUser, body, addresses)
      expect(apex.runDelivery).toHaveBeenCalled()
    })
    it('continues delivering until queue is empty', async function (done) {
      spyOn(apex, 'deliver').and.resolveTo({ statusCode: 200 })
      await apex.queueForDelivery(testUser, body, addresses)
      setTimeout(() => {
        expect(apex.deliver).toHaveBeenCalledTimes(2)
        expect(apex.deliver)
          .toHaveBeenCalledWith(testUser.id, bodyString, addresses[0], testUser._meta.privateKey)
        expect(apex.deliver)
          .toHaveBeenCalledWith(testUser.id, bodyString, addresses[1], testUser._meta.privateKey)
        done()
      }, 100)
    })
    it('retries failed delivery', async function (done) {
      spyOn(apex.store, 'deliveryRequeue').and.callThrough()
      spyOn(apex, 'deliver').and.returnValues(
        { statusCode: 500 },
        { statusCode: 200 },
        null,
        { statusCode: 200 }
      )
      await apex.queueForDelivery(testUser, body, addresses)
      setTimeout(() => {
        const lastCall = apex.store.deliveryRequeue.calls.mostRecent().args[0]
        delete lastCall.after
        expect(lastCall).toEqual({
          actorId: testUser.id,
          body: bodyString,
          address: addresses[0],
          signingKey: testUser._meta.privateKey,
          attempt: 2
        })
        expect(apex.deliver).toHaveBeenCalledTimes(4)
        expect(apex.deliver.calls.argsFor(3))
          .toEqual([testUser.id, bodyString, addresses[0], testUser._meta.privateKey])
        done()
      }, 100)
    })
    it('backs off repeated attempts', async function (done) {
      spyOn(apex.store, 'deliveryRequeue').and.callThrough()
      spyOn(apex, 'deliver').and.returnValues(
        { statusCode: 200 }, // deliver to first address
        { statusCode: 500 }, // fail on second address repeatedly
        { statusCode: 500 },
        { statusCode: 500 },
        { statusCode: 200 }
      )
      await apex.queueForDelivery(testUser, body, addresses)
      setTimeout(() => {
        expect(apex.deliver).toHaveBeenCalledTimes(3)
      }, 9)
      setTimeout(() => {
        expect(apex.deliver).toHaveBeenCalledTimes(4)
      }, 99)
      setTimeout(() => {
        expect(apex.deliver).toHaveBeenCalledTimes(5)
        done()
      }, 115)
    })
    it('can restart delivery while retries are pending', async function (done) {
      spyOn(apex.store, 'deliveryRequeue').and.callThrough()
      spyOn(apex, 'deliver').and.returnValues(
        { statusCode: 200 }, // deliver to first address
        { statusCode: 500 }, // fail on second address repeatedly
        { statusCode: 500 },
        { statusCode: 500 },
        { statusCode: 200 }, // new delivery
        { statusCode: 200 } // retry finally succeeds
      )
      await apex.queueForDelivery(testUser, body, addresses)
      setTimeout(() => {
        expect(apex.deliver).toHaveBeenCalledTimes(4)
        apex.queueForDelivery(testUser, body, addresses.slice(0, 1))
      }, 20)
      setTimeout(() => {
        expect(apex.deliver).toHaveBeenCalledTimes(5)
      }, 30)
      setTimeout(() => {
        expect(apex.deliver).toHaveBeenCalledTimes(6)
        // const last = apex.deliver.calls.mostRecent().args
        // delete last.after
        expect(apex.deliver.calls.mostRecent().args).toEqual([
          testUser.id,
          bodyString,
          addresses[1],
          testUser._meta.privateKey
        ])
        done()
      }, 115)
    })
    it('does not retry 4xx failed delivery', async function (done) {
      spyOn(apex.store, 'deliveryRequeue').and.callThrough()
      spyOn(apex, 'deliver').and.returnValues(
        { statusCode: 400 },
        { statusCode: 200 }
      )
      await apex.queueForDelivery(testUser, body, addresses)
      setTimeout(() => {
        expect(apex.store.deliveryRequeue).not.toHaveBeenCalled()
        expect(apex.deliver).toHaveBeenCalledTimes(2)
        expect(apex.deliver)
          .toHaveBeenCalledWith(testUser.id, bodyString, addresses[0], testUser._meta.privateKey)
        expect(apex.deliver)
          .toHaveBeenCalledWith(testUser.id, bodyString, addresses[1], testUser._meta.privateKey)
        done()
      }, 100)
    })
  })
})
