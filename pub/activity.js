'use strict'

const merge = require('deepmerge')
module.exports = {
  acceptFollow,
  address,
  addToOutbox,
  buildActivity,
  buildTombstone,
  resolveActivity,
  undoActivity
}

function buildActivity (type, actorId, to, etc = {}) {
  const activityId = this.store.generateId()
  const collections = this.utils.idToActivityCollections(activityId)
  const act = merge.all([
    {
      id: this.utils.activityIdToIRI(activityId),
      type,
      actor: actorId,
      to,
      published: new Date().toISOString()
    },
    collections,
    etc
  ])
  return this.fromJSONLD(act).then(activity => {
    activity._meta = {}
    return activity
  })
}

async function buildTombstone (object) {
  const deleted = new Date().toISOString()
  return {
    id: object.id,
    type: 'Tombstone',
    deleted,
    published: deleted,
    updated: deleted
  }
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
    if (this.collectionIRIToActorName(t, 'followers')) {
      return this.getCollection(t, this.actorIdFromActivity)
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
    .map(t => t.inbox[0])
  // de-dupe
  return Array.from(new Set(audience))
}

async function addToOutbox (actor, activity) {
  const tasks = [this.address(activity), this.toJSONLD(activity)]
  const [addresses, outgoingActivity] = await Promise.all(tasks)
  delete outgoingActivity._meta
  return this.deliver(actor, outgoingActivity, addresses)
}

// follow accept side effects: add to followers, publish updated followers
async function acceptFollow (actor, targetActivity) {
  this.addMeta(targetActivity, 'collection', actor.followers[0])
  await this.store.updateActivity(targetActivity, true)
  return async () => {
    const act = await this.buildActivity(
      'Update',
      actor.id,
      actor.followers[0],
      { object: await this.getFollowers(actor) }
    )
    return this.addToOutbox(actor, act)
  }
}

async function resolveActivity (id) {
  let activity
  if (this.validateActivity(id)) {
    // already activity
    activity = id
  } else {
    activity = await this.store.getActivity(id)
    if (activity) {
      return activity
    }
    // resolve remote activity object
    activity = await this.requestObject(id)
  }
  // cache
  await this.store.saveActivity(activity)
  return activity
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
