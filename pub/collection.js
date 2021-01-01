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
  getBlocked,
  getRejected,
  getRejections
}

/* page: MongoDB _id of item to begin querying after (i.e. last item of last page) or
 *  one of two special values:
 *    'true' - get first page
 *    Infinity - get all items (internal use only)
 */
async function getCollection (collectionId, page, remapper, blockList) {
  if (!page) {
    // if page isn't specified, just collection description is served
    return this.fromJSONLD({
      id: collectionId,
      type: 'OrderedCollection',
      totalItems: await this.store.getStreamCount(collectionId),
      first: this.addPageToIRI(collectionId, true)
    })
  }
  let after = page
  let limit = this.itemsPerPage
  if (page === 'true') {
    after = null
  }
  if (page === Infinity) {
    after = null
    limit = null
  }
  const pageObj = {
    id: this.addPageToIRI(collectionId, page),
    partOf: collectionId,
    type: 'OrderedCollectionPage'
  }
  let stream = await this.store.getStream(collectionId, limit, after)
  if (stream.length) {
    pageObj.next = this.addPageToIRI(collectionId, stream[stream.length - 1]._id)
  }
  if (blockList) {
    stream = stream.filter(act => !overlaps(blockList, act.actor))
  }
  if (remapper) {
    stream = stream.map(remapper)
  }
  pageObj.orderedItems = stream
  return this.fromJSONLD(pageObj)
}

function getInbox (actor, page) {
  return this.getCollection(actor.inbox[0], page, null, actor._local.blockList)
}

function getOutbox (actor, page) {
  return this.getCollection(actor.outbox[0], page)
}

function getFollowers (actor, page) {
  return this.getCollection(actor.followers[0], page, this.actorIdFromActivity, actor._local.blockList)
}

function getFollowing (actor, page) {
  return this.getCollection(actor.following[0], page, this.objectIdFromActivity)
}

function getLiked (actor, page) {
  return this.getCollection(actor.liked[0], page, this.objectIdFromActivity)
}

function getShares (object, page) {
  return this.getCollection(object.shares[0], page, idRemapper)
}

function getLikes (object, page) {
  return this.getCollection(object.likes[0], page, idRemapper)
}

function getAdded (actor, colId, page) {
  const collectionIRI = this.utils.userCollectionIdToIRI(actor.preferredUsername, colId)
  return this.getCollection(collectionIRI, page)
}

function getBlocked (actor, page) {
  const blockedIRI = this.utils.nameToBlockedIRI(actor.preferredUsername)
  return this.getCollection(blockedIRI, page, this.objectIdFromActivity)
}

function getRejected (actor, page) {
  const rejectedIRI = this.utils.nameToRejectedIRI(actor.preferredUsername)
  return this.getCollection(rejectedIRI, page, idRemapper)
}

function getRejections (actor, page) {
  const rejectionsIRI = this.utils.nameToRejectionsIRI(actor.preferredUsername)
  return this.getCollection(rejectionsIRI, page, idRemapper)
}

// non-exported utils
function idRemapper (object) {
  return object.id
}
