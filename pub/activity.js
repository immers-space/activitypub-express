'use strict'

const merge = require('deepmerge')
module.exports = {
  acceptFollow,
  address,
  addToOutbox,
  buildActivity,
  buildTombstone,
  publishUpdate,
  resolveActivity
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
// TODO: track errors during address resolution for redelivery attempts
async function address (activity, sender) {
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
    if (t === sender.followers[0]) {
      return this.getFollowers(sender)
    }
    return this.resolveObject(t)
  })
  audience = await Promise.allSettled(audience).then(results => {
    // TODO: spec says only deliver to actor-owned collections
    const addresses = results
      .filter(r => r.status === 'fulfilled')
      .map(r => {
        if (r.value && r.value.inbox) {
          return r.value
        }
        if (r.value && r.value.items) {
          return r.value.items.map(this.resolveObject)
        }
        if (r.value && r.value.orderedItems) {
          return r.value.orderedItems.map(this.resolveObject)
        }
      })
    // flattens and resolves collections
    return Promise.allSettled(addresses.flat(2))
  })
  audience = audience
    .filter(result => {
      if (result.status !== 'fulfilled' || !result.value) return false
      if (sender._local.blockList.includes(result.value.id)) return false
      if (!result.value.inbox) return false
      return true
    })
    .map(r => r.value.inbox[0])
  // de-dupe
  return Array.from(new Set(audience))
}

async function addToOutbox (actor, activity) {
  const tasks = [this.address(activity, actor), this.toJSONLD(activity)]
  const [addresses, outgoingActivity] = await Promise.all(tasks)
  delete outgoingActivity._meta
  return this.deliver(actor, outgoingActivity, addresses)
}

// follow accept side effects: add to followers, publish updated followers
async function acceptFollow (actor, targetActivity) {
  const updated = await this.store
    .updateActivityMeta(targetActivity, 'collection', actor.followers[0])
  const postTask = async () => {
    return this.publishUpdate(actor, await this.getFollowers(actor))
  }
  return { postTask, updated }
}

async function publishUpdate (actor, object, cc) {
  const act = await this.buildActivity(
    'Update',
    actor.id,
    actor.followers[0],
    { object, cc }
  )
  return this.addToOutbox(actor, act)
}

async function resolveActivity (id, includeMeta) {
  let activity
  if (this.validateActivity(id)) {
    // already activity
    activity = id
  } else {
    activity = await this.store.getActivity(id, includeMeta)
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
