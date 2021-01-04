'use strict'

const merge = require('deepmerge')
module.exports = {
  acceptFollow,
  address,
  addToOutbox,
  buildActivity,
  buildTombstone,
  publishUndoUpdate,
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
async function address (activity, sender, audienceOverride) {
  let audience
  if (audienceOverride) {
    audience = audienceOverride
  } else {
    // de-dupe here to avoid resolving collections twice
    audience = Array.from(new Set(this.audienceFromActivity(activity)))
  }
  audience = audience.map(t => {
    if (t === 'https://www.w3.org/ns/activitystreams#Public') {
      return null
    }
    if (t === sender.followers[0]) {
      return this.getFollowers(sender, Infinity)
    }
    /* Allow addressing to sender's custom collections, e.g. a concept like a list
     * of specific friends could be represented by a collection of Follow
     * activities
     * 7.1.1 "the server MUST target and deliver to... Collections owned by the actor."
     */
    const miscCol = this.utils.iriToCollectionInfo(t)
    if (miscCol?.name === 'collections') {
      if (!sender.preferredUsername.includes(miscCol.actor)) {
        return null
      }
      return this.getAdded(t, Infinity).then(col => {
        col.orderedItems = col.orderedItems.reduce((actors, activity) => {
          return actors.concat(
            activity.actor,
            // in some cases, e.g. outgoing follows, the object is the actor
            // of interest
            activity.object ? activity.object.filter(o => this.isString(o)) : []
          )
        }, [])
        return col
      })
    }
    return this.resolveObject(t)
  })
  audience = await Promise.allSettled(audience).then(results => {
    const addresses = results
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => {
        if (result.value.inbox) {
          return result.value
        }
        if (result.value.items) {
          return result.value.items.map(this.resolveObject)
        }
        if (result.value.orderedItems) {
          return result.value.orderedItems.map(this.resolveObject)
        }
        return undefined
      })
    // flattens and resolves collections
    return Promise.allSettled(addresses.flat(2))
  })
  audience = audience
    .filter(result => {
      if (result.status !== 'fulfilled' || !result.value) return false
      if (sender._local.blockList.includes(result.value.id)) return false
      if (!result.value.inbox) return false
      // 7.1 exclude self
      if (result.value.inbox[0] === sender.inbox[0]) return false
      return true
    })
    .map(result => result.value.inbox[0])
  // 7.1 de-dupe
  return Array.from(new Set(audience))
}
/* audienceOverride: array of IRIs, used in inbox forwarding to
 * skip normall addressing and deliver to specific audience
 */
async function addToOutbox (actor, activity, audienceOverride) {
  const tasks = [
    this.address(activity, actor, audienceOverride),
    this.toJSONLD(activity)
  ]
  const [addresses, outgoingActivity] = await Promise.all(tasks)
  if (addresses.length) {
    return this.queueForDelivery(actor, outgoingActivity, addresses)
  }
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

async function publishUndoUpdate (colId, actor, audience) {
  const info = this.utils.iriToCollectionInfo(colId)
  let actorId
  if (!['followers', 'following', 'liked', 'likes', 'shares'].includes(info?.name)) {
    return
  }
  if (info.activity) {
    const activityIRI = this.utils.activityIdToIRI(info.activity)
    actorId = (await this.store.getActivity(activityIRI))?.actor[0]
  }
  if (actor.id === (actorId ?? this.utils.usernameToIRI(info.actor))) {
    const colUpdate = await this.getCollection(colId)
    return this.publishUpdate(actor, colUpdate, audience)
  }
  return undefined
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
