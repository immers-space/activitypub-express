'use strict'

const overlaps = require('overlaps')

module.exports = {
  getCollection,
  getInbox,
  getOutbox,
  getFollowers,
  getFollowing,
  getLiked,
  getShares,
  getLikes,
  getAdded,
  getBlocked
}

async function getCollection (collectionId, remapper, blockList) {
  let stream = await this.store.getStream(collectionId)
  if (blockList) {
    stream = stream.filter(act => !overlaps(blockList, act.actor))
  }
  if (remapper) {
    stream = stream.map(remapper)
  }
  return this.fromJSONLD({
    id: collectionId,
    type: 'OrderedCollection',
    totalItems: stream.length,
    orderedItems: stream
  })
}

function getInbox (actor) {
  return this.getCollection(actor.inbox[0], null, actor._local.blockList)
}

function getOutbox (actor) {
  return this.getCollection(actor.outbox[0])
}

function getFollowers (actor) {
  return this.getCollection(actor.followers[0], this.actorIdFromActivity, actor._local.blockList)
}

function getFollowing (actor) {
  return this.getCollection(actor.following[0], this.objectIdFromActivity)
}

function getLiked (actor) {
  return this.getCollection(actor.liked[0], this.objectIdFromActivity)
}

function getShares (object) {
  return this.getCollection(object.shares[0], idRemapper)
}

function getLikes (object) {
  return this.getCollection(object.likes[0], idRemapper)
}

function getAdded (actor, colId) {
  const collectionIRI = this.utils.userCollectionIdToIRI(actor.preferredUsername, colId)
  return this.getCollection(collectionIRI)
}

function getBlocked (actor) {
  const blockedIRI = this.utils.nameToBlockedIRI(actor.preferredUsername)
  return this.getCollection(blockedIRI, this.objectIdFromActivity)
}

// non-exported utils
function idRemapper (object) {
  return object.id
}
