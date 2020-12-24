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
    // TODO check max retries, update list of deceased nodes
    await this.store.deliveryRequeue(toDeliver).catch(err => {
      console.error('Failed to requeue delivery', err.message)
    })
  }
  process.nextTick(() => this.runDelivery())
}
