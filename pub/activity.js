'use strict'

const merge = require('deepmerge')
const store = require('../store')
const pubUtils = require('./utils')
const pubObject = require('./object')
const pubFederation = require('./federation')
module.exports = {
  address,
  addToOutbox,
  build,
  undo
}

function build (context, iri, type, actorId, object, to, etc = {}) {
  const act = merge({
    id: iri,
    type,
    actor: actorId,
    object,
    to,
    published: new Date().toISOString()
  }, etc)
  return pubUtils.fromJSONLD(act, context).then(activity => {
    activity._meta = {}
    return activity
  })
}

async function address (activity) {
  let audience = []
  ;['to', 'bto', 'cc', 'bcc', 'audience'].forEach(t => {
    if (activity[t]) {
      audience = audience.concat(activity[t])
    }
  })
  audience = audience.map(t => {
    if (t === 'https://www.w3.org/ns/activitystreams#Public') {
      return null
    }
    return pubObject.resolve(t)
  })
  audience = await Promise.all(audience).then(addresses => {
    // TODO: spec says only deliver to actor-owned collections
    addresses = addresses.map(t => {
      if (t && t.inbox) {
        return t
      }
      if (t && t.items) {
        return t.items.map(pubObject.resolve)
      }
      if (t && t.orderedItems) {
        return t.orderedItems.map(pubObject.resolve)
      }
    })
    // flattens and resolves collections
    return Promise.all([].concat(...addresses))
  })
  audience = audience.filter(t => t && t.inbox)
    .map(t => t.inbox)
  // de-dupe
  return Array.from(new Set(audience))
}

async function addToOutbox (actor, activity, context) {
  const tasks = [address(activity), pubUtils.toJSONLD(activity, context)]
  const [addresses, outgoingActivity] = await Promise.all(tasks)
  delete outgoingActivity._meta
  return pubFederation.deliver(actor, outgoingActivity, addresses)
}

function undo (activity, undoActor) {
  if (!pubUtils.validateActivity(activity)) {
    if (!activity || Object.prototype.toString.call(activity) !== '[object String]') {
      throw new Error('Invalid undo target')
    }
    activity = { id: activity }
  }
  // matches the target activity with the actor from the undo
  // so actors can only undo their own activities
  return store.stream.remove(activity, undoActor)
}
