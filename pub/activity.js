'use strict'

const merge = require('deepmerge')
module.exports = {
  address,
  addToOutbox,
  buildActivity,
  undoActivity
}

function buildActivity (iri, type, actorId, object, to, etc = {}) {
  const act = merge({
    id: iri,
    type,
    actor: actorId,
    object,
    to,
    published: new Date().toISOString()
  }, etc)
  return this.fromJSONLD(act).then(activity => {
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
    return this.resolveObject(t)
  })
  audience = await Promise.all(audience).then(addresses => {
    // TODO: spec says only deliver to actor-owned collections
    addresses = addresses.map(t => {
      if (t && t.inbox) {
        return t
      }
      if (t && t.items) {
        return t.items.map(this.resolveObject)
      }
      if (t && t.orderedItems) {
        return t.orderedItems.map(this.resolveObject)
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

async function addToOutbox (actor, activity) {
  const tasks = [this.address(activity), this.toJSONLD(activity)]
  const [addresses, outgoingActivity] = await Promise.all(tasks)
  delete outgoingActivity._meta
  return this.deliver(actor, outgoingActivity, addresses)
}

function undoActivity (activity, undoActor) {
  if (!this.validateActivity(activity)) {
    if (!activity || Object.prototype.toString.call(activity) !== '[object String]') {
      throw new Error('Invalid undo target')
    }
    activity = { id: activity }
  }
  // matches the target activity with the actor from the undo
  // so actors can only undo their own activities
  return this.store.removeActivity(activity, undoActor)
}
