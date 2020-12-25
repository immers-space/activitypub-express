'use strict'
const request = require('request-promise-native')

// federation communication utilities
module.exports = {
  deliver,
  queueForDelivery,
  requestObject,
  runDelivery,
  startDelivery
}

let isDelivering = false
let nextDelivery = null

function requestObject (id) {
  return request({
    url: id,
    headers: { Accept: 'application/activity+json' },
    json: true
  }).then(this.fromJSONLD)
}

function deliver (actorId, activity, address, signingKey) {
  return request({
    method: 'POST',
    url: address,
    headers: {
      'Content-Type': this.consts.jsonldOutgoingType,
      Accept: this.consts.jsonldTypes.join(', ')
    },
    httpSignature: {
      key: signingKey,
      keyId: actorId,
      headers: ['(request-target)', 'host', 'date'],
      authorizationHeaderName: 'Signature'
    },
    resolveWithFullResponse: true,
    simple: false,
    body: activity
  })
}

async function queueForDelivery (actor, activity, addresses) {
  // custom stringify strips meta props
  const outgoingBody = this.stringifyPublicJSONLD(activity)
  await this.store
    .deliveryEnqueue(actor.id, outgoingBody, addresses, actor._meta.privateKey)
  // returning promise makes first delivery complete during postWork (easier testing)
  return this.startDelivery()
}

function startDelivery () {
  if (isDelivering) return
  return this.runDelivery()
}

async function runDelivery () {
  isDelivering = true
  const toDeliver = await this.store.deliveryDequeue()
  if (!toDeliver) {
    isDelivering = false
    return
  }
  // only future-dated items left, resume then
  if (toDeliver.waitUntil) {
    const wait = toDeliver.waitUntil.getTime() - Date.now()
    nextDelivery = setTimeout(() => this.startDelivery(), wait)
    isDelivering = false
    return
  }
  // if new delivery run starts while another is pending,
  // it will add another timer when it finishes
  clearTimeout(nextDelivery)
  try {
    const { actorId, body, address, signingKey } = toDeliver
    const result = await this.deliver(actorId, body, address, signingKey)
    console.log('delivery:', address, result.statusCode)
    if (result.statusCode >= 500) {
      // 5xx errors will get requeued
      throw new Error(`Request status ${result.statusCode}`)
    }
  } catch (err) {
    console.log(`Delivery error ${err.message}, requeuing`)
    // 11 tries over ~5 months
    if (toDeliver.attempt < 11) {
      await this.store.deliveryRequeue(toDeliver).catch(err => {
        console.error('Failed to requeue delivery', err.message)
      })
    }
    // TODO: consider tracking unreachable servers, removing followers
  }
  setTimeout(() => this.runDelivery(), 0)
}
