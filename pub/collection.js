'use strict'

module.exports = {
  buildCollection,
  buildCollectionPage,
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
  getRejections,
  updateCollection
}

function buildCollection (id, isOrdered, totalItems) {
  return this.fromJSONLD({
    id,
    type: isOrdered ? 'OrderedCollection' : 'Collection',
    totalItems,
    first: this.addPageToIRI(id, true)
  })
}

async function buildCollectionPage (collectionId, page, isOrdered, lastItemId) {
  return this.fromJSONLD({
    id: this.addPageToIRI(collectionId, page),
    partOf: collectionId,
    type: isOrdered ? 'OrderedCollectionPage' : 'CollectionPage',
    next: lastItemId ? this.addPageToIRI(collectionId, lastItemId) : null
  })
}

/**
 * Get a collection object or collection page objct
 * @param  {string} collectionId
 * @param  {string | Infinity} [page] MongoDB _id of item to begin querying after (i.e. last item of last page)
 *   or one of two special values: 'true' - get first page, Infinity - get all items (internal use only)
 * @param  {function} [remapper]
 * @param  {boolean} [includePrivate]
 * @param  {string[]} [blockList]
 * @param  {object[]} [query] - additional filtering/aggregation passed through to store.getStream
 */
async function getCollection (collectionId, page, remapper, includePrivate, blockList, query) {
  collectionId = this.objectIdFromValue(collectionId)
  if (!page) {
    // if page isn't specified, just collection description is served
    const totalItems = await this.store.getStreamCount(collectionId)
    return this.buildCollection(collectionId, true, totalItems)
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
  let stream = await this.store.getStream(collectionId, limit, after, blockList, query)
  const pageObj = await this.buildCollectionPage(
    collectionId,
    page,
    true,
    // determine next page prior to filtering so
    // you can pass large blocks of filtered activities
    stream[stream.length - 1]?._id
  )
  if (!includePrivate) {
    stream = stream.filter(act => this.isPublic(act))
  }
  if (remapper) {
    stream = stream.map(remapper)
  }
  pageObj.orderedItems = stream
  return pageObj
}

function getInbox (actor, page, includePrivate) {
  return this.getCollection(actor.inbox[0], page, null, includePrivate, actor._local.blockList)
}

function getOutbox (actor, page, includePrivate) {
  return this.getCollection(actor.outbox[0], page, null, includePrivate)
}

function getFollowers (actor, page, includePrivate) {
  return this.getCollection(actor.followers[0], page, actorFromActivity, includePrivate, actor._local.blockList)
}

function getFollowing (actor, page, includePrivate) {
  return this.getCollection(actor.following[0], page, this.objectIdFromActivity, includePrivate)
}

function getLiked (actor, page, includePrivate) {
  return this.getCollection(actor.liked[0], page, objectFromActivity, includePrivate)
}

function getShares (object, page, includePrivate) {
  return this.getCollection(object.shares[0], page, null, includePrivate)
}

function getLikes (object, page, includePrivate) {
  return this.getCollection(object.likes[0], page, null, includePrivate)
}

function getAdded (actor, colId, page, includePrivate) {
  const collectionIRI = this.utils.userCollectionIdToIRI(actor.preferredUsername, colId)
  return this.getCollection(collectionIRI, page, null, includePrivate)
}

function getBlocked (actor, page, includePrivate) {
  const blockedIRI = this.utils.nameToBlockedIRI(actor.preferredUsername)
  return this.getCollection(blockedIRI, page, this.objectIdFromActivity, includePrivate)
}

function getRejected (actor, page, includePrivate) {
  const rejectedIRI = this.utils.nameToRejectedIRI(actor.preferredUsername)
  return this.getCollection(rejectedIRI, page, idRemapper, includePrivate)
}

function getRejections (actor, page, includePrivate) {
  const rejectionsIRI = this.utils.nameToRejectionsIRI(actor.preferredUsername)
  return this.getCollection(rejectionsIRI, page, idRemapper, includePrivate)
}

async function updateCollection (collectionId) {
  collectionId = this.objectIdFromValue(collectionId)
  const info = this.utils.iriToCollectionInfo(collectionId)
  // shares/likes have to be embedded in their activity
  // for verifiable updates because the actor id is not in
  // the collection object
  if (info.activity) {
    // updated embedded copies in activity
    return this.store.updateActivity({
      id: this.utils.activityIdToIRI(info.activity),
      [info.name]: [await this.getCollection(collectionId)]
    }, false)
  }
}

// non-exported utils
function idRemapper (object) {
  return object.id
}
function actorFromActivity (activity) {
  return activity.actor[0]
}
function objectFromActivity (activity) {
  return activity.object[0]
}
