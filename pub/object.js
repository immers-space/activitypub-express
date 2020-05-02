'use strict'
module.exports = {
  resolveObject
}

// find object in local DB or fetch from origin server
async function resolveObject (id) {
  let object
  if (this.validateObject(id)) {
    // already an object
    object = id
  } else {
    object = await this.store.object.get(id)
    if (object) {
      return object
    }
    // resolve remote object from id
    object = await this.requestObject(id)
  }
  // cache non-collection objects
  if (object.type !== 'Collection' && object.type !== 'OrderedCollection') {
    await this.store.object.save(object)
  }
  return object
}
