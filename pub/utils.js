'use strict'
const jsonld = require('jsonld')
const merge = require('deepmerge')
const actorStreamNames = ['inbox', 'outbox', 'following', 'followers', 'liked', 'blocked']

module.exports = {
  addPageToIRI,
  addMeta,
  decodeCollectionIRI,
  hasMeta,
  idToActivityCollectionsFactory,
  idToIRIFactory,
  userAndIdToIRIFactory,
  isLocalCollection,
  isLocalIRI,
  isLocalhostIRI,
  isProductionEnv,
  isString,
  mergeJSONLD,
  nameToActorStreamsFactory,
  removeMeta,
  toJSONLD,
  fromJSONLD,
  jsonldContextLoader,
  actorIdFromActivity,
  objectIdFromActivity,
  stringifyPublicJSONLD,
  validateActivity,
  validateObject,
  validateOwner,
  validateTarget
}

function addPageToIRI (id, pageId) {
  const url = new URL(id)
  const query = new URLSearchParams(url.search)
  query.set(this.pageParam, pageId)
  url.search = query.toString()
  return url.toString()
}

function addMeta (obj, key, value) {
  if (!obj._meta) {
    obj._meta = {}
  }
  if (!obj._meta[key]) {
    obj._meta[key] = [value]
  } else {
    obj._meta[key].push(value)
  }
}

function hasMeta (obj, key, value) {
  if (!obj._meta || !Array.isArray(obj._meta[key])) {
    return false
  }
  return obj._meta[key].includes(value)
}

function removeMeta (obj, key, value) {
  if (!obj._meta || !Array.isArray(obj._meta[key])) {
    return
  }
  const i = obj._meta[key].indexOf(value)
  if (i !== -1) {
    obj._meta[key].splice(i, 1)
  }
}

function actorIdFromActivity (activity) {
  const actor = activity.actor[0]
  if (Object.prototype.toString.call(actor) === '[object String]') {
    return actor
  }
  if (actor.type === 'Link') {
    return actor.href[0]
  }
  return actor.id
}

function decodeCollectionIRI (id, collectionType) {
  const pActor = `:${this.actorParam}`
  const pCol = `:${this.collectionParam}`
  let pattern = this.settings.routes[collectionType]
  const isActorFirst = pattern.indexOf(pCol) === -1 || pattern.indexOf(pActor) < pattern.indexOf(pCol)
  pattern = pattern.replace(pActor, '([^/]+)').replace(pCol, '([^/]+)')
  let result = new RegExp(`^https://${this.domain}${pattern}$`).exec(id)
  if (!result) {
    return false
  }
  result = result.slice(1, 3)
  if (!isActorFirst) {
    result = result.reverse()
  }
  return {
    actor: result[0],
    collection: result[1] || collectionType
  }
}

function objectIdFromActivity (activity) {
  const object = activity.object && activity.object[0]
  if (!object) {
    return null
  }
  if (Object.prototype.toString.call(object) === '[object String]') {
    return object
  }
  if (object.type === 'Link') {
    return object.href[0]
  }
  return object.id
}

// convert incoming json-ld to local context and
// partially expanded format for consistent property access
async function fromJSONLD (obj) {
  const opts = {
    // don't unbox arrays so that object structure will be predictable
    compactArrays: false,
    documentLoader: this.jsonldContextLoader
  }
  if (!('@context' in obj)) {
    // if context is missing, try filling in ours
    opts.expandContext = this.context
  }
  const compact = await jsonld.compact(obj, this.context, opts)
  // strip context and graph wrapper for easier access
  return compact['@graph'][0]
}
// convert working objects to json-ld for transport
function toJSONLD (obj) {
  return jsonld.compact(obj, this.context, {
    // must supply initial context because it was stripped for easy handling
    expandContext: this.context,
    // unbox arrays on federated objects, in case other apps aren't using real json-ld
    compactArrays: true,
    documentLoader: this.jsonldContextLoader
  })
}

function stringifyPublicJSONLD (obj) {
  return JSON.stringify(obj, skipPrivate)
}

function idToIRIFactory (domain, route, param) {
  const colonParam = `:${param}`
  return id => {
    if (!id) {
      id = this.store.generateId()
    }
    return `https://${domain}${route.replace(colonParam, id)}`.toLowerCase()
  }
}

function userAndIdToIRIFactory (domain, route, userParam, param) {
  param = `:${param}`
  userParam = `:${userParam}`
  return (user, id) => {
    if (!id) {
      id = this.store.generateId()
    }
    return `https://${domain}${route.replace(param, id).replace(userParam, user)}`.toLowerCase()
  }
}

function isLocalCollection (object) {
  if (!object) return false
  const isCollection = object.type === 'Collection' || object.type === 'OrderedCollection'
  return isCollection && this.isLocalIRI(object.id)
}

function isLocalIRI (id) {
  return id.startsWith(`https://${this.domain}`)
}

function isString (obj) {
  return (Object.prototype.toString.call(obj) === '[object String]')
}

/* just checking a subset of cases becuase others (like no protocol)
 * would error anyway during request and we don't have to bog down
 * federation with additional regex or url parsing
 */
const localhosts = [
  'https://localhost',
  'https://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1'
]
function isLocalhostIRI (id) {
  return localhosts.some(lh => id.startsWith(lh))
}

function isProductionEnv () {
  return process.env.NODE_ENV === 'production'
}

const overwriteArrays = {
  arrayMerge: (destinationArray, sourceArray, options) => sourceArray
}

function mergeJSONLD (target, source) {
  return merge(target, source, overwriteArrays)
}

function nameToActorStreamsFactory (domain, routes, actorParam) {
  const colonParam = `:${actorParam}`
  const streamTemplates = {}
  actorStreamNames.forEach(s => {
    streamTemplates[s] = `https://${domain}${routes[s]}`
  })
  return name => {
    const streams = {}
    actorStreamNames.forEach(s => {
      streams[s] = streamTemplates[s].replace(colonParam, name)
    })
    return streams
  }
}

function idToActivityCollectionsFactory (domain, routes, activityParam) {
  const colonParam = `:${activityParam}`
  const streamNames = ['shares', 'likes']
  const streamTemplates = {}
  streamNames.forEach(s => {
    streamTemplates[s] = `https://${domain}${routes[s]}`
  })
  return id => {
    const streams = {}
    streamNames.forEach(s => {
      streams[s] = streamTemplates[s].replace(colonParam, id)
    })
    return streams
  }
}

function validateObject (object) {
  if (Array.isArray(object)) {
    object = object[0]
  }
  if (object && object.id && object.type) {
    return true
  }
}

function validateActivity (object) {
  if (Array.isArray(object)) {
    object = object[0]
  }
  if (validateObject(object) && Array.isArray(object.actor) && object.actor.length) {
    return true
  }
}

function validateOwner (object, actor) {
  if (Array.isArray(object)) {
    object = object[0]
  }
  if (!validateObject(object)) return false
  if (object.id === actor.id) return true
  if (Array.isArray(object.actor) && object.actor[0] === actor.id) return true
  if (Array.isArray(object.attributedTo) && object.attributedTo[0] === actor.id) {
    return true
  }
  // collections don't have owner in a property, but should be in actor object
  if (object.type === 'Collection' || object.type === 'OrderedCollection') {
    // standard collections
    if (actorStreamNames.some(c => actor[c] && actor[c].includes(object.id))) {
      return true
    }
    // custom collections
    if (actor.streams && Object.values(actor.streams).includes(object.id)) {
      return true
    }
  }
  return false
}

// Can be used to check activity.target instead of activity.object by specifying prop
function validateTarget (object, targetId, prop = 'object') {
  if (Array.isArray(object)) {
    object = object[0]
  }
  if (!validateObject(object) || !Array.isArray(object[prop]) || !object[prop][0]) {
    return false
  }
  if (object[prop][0] === targetId || object[prop][0].id === targetId) {
    return true
  }
  return false
}

// cached JSONLD contexts to reduce requests an eliminate
// failures caused when context servers are unavailable
const nodeDocumentLoader = jsonld.documentLoaders.node()
async function jsonldContextLoader (url, options) {
  try {
    const cached = await this.store.getContext(url)
    if (cached) {
      return cached
    }
  } catch (err) {
    this.logger.error('Error checking jsonld context cache', err.message)
  }
  const context = await nodeDocumentLoader(url)
  if (context && context.document) {
    try {
      await this.store.saveContext(context)
    } catch (err) {
      this.logger.error('Error saving jsonld contact cache', err.message)
    }
  }
  // call the default documentLoader
  return context
}

// non-exported utils
// strip any _meta or private properties to keep jsonld valid and not leak private keys
const privateActivityProps = ['bto', 'bcc']
function skipPrivate (key, value) {
  if (key.startsWith('_') || privateActivityProps.includes(key)) {
    return undefined
  }
  return value
}
