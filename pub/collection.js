'use strict'

module.exports = {
  getCollection,
  getInbox,
  getOutbox,
  getFollowers,
  getFollowing,
  getLiked,
  getShares,
  getLikes
}

async function getCollection (collectionId, remapper) {
  let stream = await this.store.getStream(collectionId)
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
  return this.getCollection(actor.inbox[0])
}

function getOutbox (actor) {
  return this.getCollection(actor.outbox[0])
}

function getFollowers (actor) {
  return this.getCollection(actor.followers[0], this.actorIdFromActivity)
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

// non-exported utils
function idRemapper (object) {
  return object.id
}
