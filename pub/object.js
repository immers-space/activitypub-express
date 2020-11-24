'use strict'
module.exports = {
  resolveObject
}

// find object in local DB or fetch from origin server
async function resolveObject (id, includeMeta) {
  let object
  if (this.validateObject(id)) {
    // already an object
    object = id
  } else {
    object = await this.store.getObject(id, true)
    if (object) {
      return object
    }
    // resolve remote object from id
    object = await this.requestObject(id)
  }
  // cache
  await this.store.saveObject(object)
  return object
}
