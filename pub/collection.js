'use strict'

module.exports = {
  getCollection,
  getInbox,
  getOutbox,
  getFollowers,
  getFollowing,
  getLiked
}

async function getCollection (collectionId, remapper, metaFilterProperty) {
  let stream = await this.store.getStream(collectionId, metaFilterProperty)
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
  return this.getCollection(actor.followers[0], this.actorIdFromActivity, 'accepted')
}

function getFollowing (actor) {
  return this.getCollection(actor.following[0], this.objectIdFromActivity, 'accepted')
}

function getLiked (actor) {
  return this.getCollection(actor.liked[0], this.objectIdFromActivity)
}
