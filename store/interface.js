module.exports = class IApexStore {
  constructor () {
    this.db = null
  }

  setup (optionalActor) {
    throw new Error('Not implemented')
  }

  getObject (id, includeMeta) {
    throw new Error('Not implemented')
  }

  saveObject (object) {
    throw new Error('Not implemented')
  }

  getActivity (id, includeMeta) {
    throw new Error('Not implemented')
  }

  findActivityByCollectionAndObjectId (collection, objectId, includeMeta) {
    throw new Error('Not implemented')
  }

  findActivityByCollectionAndActorId (collection, actorId, includeMeta) {
    throw new Error('Not implemented')
  }

  getStream (collectionId, limit, after) {
    throw new Error('Not implemented')
  }

  getStreamCount (collectionId) {
    throw new Error('Not implemented')
  }

  getContext (documentUrl) {
    throw new Error('Not implemented')
  }

  saveContext (context) {
    throw new Error('Not implemented')
  }

  saveActivity (activity) {
    throw new Error('Not implemented')
  }

  removeActivity (activity, actorId) {
    throw new Error('Not implemented')
  }

  updateActivity (activity, fullReplace) {
    throw new Error('Not implemented')
  }

  updateActivityMeta (activity, key, value, remove) {
    throw new Error('Not implemented')
  }

  generateId () {
    throw new Error('Not implemented')
  }

  updateObject (obj, actorId, fullReplace) {
    throw new Error('Not implemented')
  }

  deliveryDequeue () {
    throw new Error('Not implemented')
  }

  deliveryEnqueue (actorId, body, addresses, signingKey) {
    throw new Error('Not implemented')
  }

  deliveryRequeue (delivery) {
    throw new Error('Not implemented')
  }
}
