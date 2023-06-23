'use strict'
module.exports = {
  resolveObject,
  resolveUnknown
}

// find object in local DB or fetch from origin server
async function resolveObject (id, includeMeta, refresh, localOnly) {
  let object
  let cached
  if (Array.isArray(id)) {
    id = id[0]
  }
  if (this.validateObject(id)) {
    // already an object
    object = id
  } else {
    const iri = new URL(id)
    // remove any hash from url
    cached = await this.store.getObject(`${iri.protocol}//${iri.host}${iri.pathname}${iri.search}`, true)
    if (cached && !refresh) {
      return cached
    }
    if (localOnly) {
      return
    }
    // resolve remote object from id
    object = await this.requestObject(id)
  }
  // local collections are generated on-demand; not cached
  if (!this.isLocalCollection(object)) {
    cached
      ? await this.store.updateObject(object, null, true)
      : await this.store.saveObject(object)
  }
  return object
}

async function resolveUnknown (objectOrIRI) {
  let object
  if (!objectOrIRI) return null
  // For Link/Mention, we want to resolved the linked object
  if (objectOrIRI.href) {
    objectOrIRI = objectOrIRI.href[0]
  }
  // check if already cached
  if (this.isString(objectOrIRI)) {
    object = await this.store.getActivity(objectOrIRI)
    if (object) return object
    object = await this.store.getObject(objectOrIRI)
    if (object) return object
    /* As local collections are not represented in the DB, instead being generated
     * on demand, they up getting requested via http below. Perhaps not the most efficient,
     * but it avoids creating duplicative logic to resolve implementation-specific IRIs
     * to collections. Just have to make sure this doesn't get saved back to the object cache
     */
    object = await this.requestObject(objectOrIRI)
  } else {
    object = objectOrIRI
  }
  // cache inline or newly fetched object
  if (this.validateActivity(object)) {
    await this.store.saveActivity(object)
    return object
  }
  if (this.validateObject(object)) {
    // local collections are genreated on-demand; not cached
    if (!this.isLocalCollection(object)) {
      await this.store.saveObject(object)
    }
    return object
  }
  // unable to resolve to a valid object
  return null
}
