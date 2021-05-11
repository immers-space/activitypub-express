'use strict'
const request = require('./request')

// federation communication utilities
module.exports = {
  deliver,
  queueForDelivery,
  requestObject,
  resolveReferences,
  runDelivery,
  startDelivery
}
const maxTimeout = Math.pow(2, 31) - 1
let isDelivering = false
let nextDelivery = null

async function requestObject (id) {
  if (this.isProductionEnv() && this.isLocalhostIRI(id)) {
    return null
  }
  const req = {
    url: id,
    method: 'GET',
    headers: { Accept: 'application/activity+json' },
  }
  if (this.systemUser) {
    req.httpSignature = {
      key: this.systemUser._meta.privateKey,
      keyId: this.systemUser.id,
      // headers: ['(request-target)', 'host', 'date'],
      // authorizationHeaderName: 'Signature'
    }
  }
  return request(req)
          .then(({body}) => this.fromJSONLD(body))
          .catch((error) => {
            console.error(error)
          })
}

const refProps = ['inReplyTo', 'object', 'target', 'tag']
async function resolveReferences (object, depth = 0) {
  const objectPromises = refProps.map(prop => object[prop])
    .flat() // may have multiple tags to resolve
    .map(o => this.resolveUnknown(o))
    .filter(p => p)
  const objects = (await Promise.allSettled(objectPromises))
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)
  if (!objects.length || depth >= this.threadDepth) {
    return objects
  }
  const nextLevel = objects
    .map(o => this.resolveReferences(o, depth + 1))
  const nextLevelResolved = (await Promise.allSettled(nextLevel))
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)
  return objects.concat(nextLevelResolved.flat())
}

function deliver (actorId, activity, address, signingKey) {
  if (this.isProductionEnv() && this.isLocalhostIRI(address)) {
    return null
  }

  return request({
    method: 'POST',
    url: address,
    headers: {
      'Content-Type': this.consts.jsonldOutgoingType,
    },
    mastodonCompatible: true,
    httpSignature: {
      key: signingKey,
      keyId: actorId,
      // includeHeaders: ['(request-target)', 'host', 'date', 'digest'],
      // authorizationHeaderName: 'Signature'
    },
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
  if (isDelivering || this.offlineMode) {
    return
  }
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
    const wait = Math.min(toDeliver.waitUntil.getTime() - Date.now(), maxTimeout)
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
    const statusCode = result.statusCode || result.res.statusCode
    this.logger.info('delivery:', address, statusCode)
    if (statusCode >= 500) {
      // 5xx errors will get requeued
      throw new Error(`Request status ${statusCode}`)
    }
  } catch (err) {
    this.logger.warn(`Delivery error ${err.message}, requeuing`)
    // 11 tries over ~5 months
    if (toDeliver.attempt < 11) {
      await this.store.deliveryRequeue(toDeliver).catch(err => {
        this.logger.error('Failed to requeue delivery', err.message)
      })
    }
    // TODO: consider tracking unreachable servers, removing followers
  }
  setTimeout(() => this.runDelivery(), 0)
}
