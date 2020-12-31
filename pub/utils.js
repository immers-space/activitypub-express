'use strict'
const jsonld = require('jsonld')
const merge = require('deepmerge')
const { escape, unescape } = require('mongo-escape')

module.exports = {
  addMeta,
  collectionIRIToActorName,
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
  actorIdFromActivity,
  objectIdFromActivity,
  stringifyPublicJSONLD,
  validateActivity,
  validateObject,
  validateCollectionOwner,
  validateOwner,
  validateTarget
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

function collectionIRIToActorName (id, collectionType) {
  const pActor = `:${this.actorParam}`
  const pCol = `:${this.collectionParam}`
  let pattern = this.settings.routes[collectionType]
  const isActorFirst = pattern.indexOf(pCol) === -1 || pattern.indexOf(pActor) < pattern.indexOf(pCol)
  pattern = pattern.replace(pActor, '([^/]+)').replace(pCol, '([^/]+)')
  const result = new RegExp(`^https://${this.domain}${pattern}$`).exec(id)
  return result && (isActorFirst ? result[1] : result[2])
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
    compactArrays: false
  }
  if (!('@context' in obj)) {
    // if context is missing, try filling in ours
    opts.expandContext = this.context
  }
  const compact = await jsonld.compact(obj, this.context, opts)
  // strip context and graph wrapper for easier access, escape mongo special characters
  return escape(compact['@graph'][0])
}
// convert working objects to json-ld for transport
async function toJSONLD (obj) {
  return unescape(await jsonld.compact(obj, this.context, {
    // must supply initial context because it was stripped for easy handling
    expandContext: this.context,
    // unbox arrays on federated objects, in case other apps aren't using real json-ld
    compactArrays: true
  }))
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
  const streamNames = ['inbox', 'outbox', 'following', 'followers', 'liked', 'blocked']
  const streamTemplates = {}
  streamNames.forEach(s => {
    streamTemplates[s] = `https://${domain}${routes[s]}`
  })
  return name => {
    const streams = {}
    streamNames.forEach(s => {
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

function validateCollectionOwner (collectionId, ownerId) {
  if (Array.isArray(collectionId)) {
    collectionId = collectionId[0]
  }
  if (Object.prototype.toString.call(collectionId) !== '[object String]') {
    return false
  }
  const user = this.collectionIRIToActorName(collectionId, 'collections')
  return !!user && this.utils.usernameToIRI(user) === ownerId
}

function validateOwner (object, ownerId) {
  if (Array.isArray(object)) {
    object = object[0]
  }
  if (!validateObject(object)) return false
  if (object.id === ownerId) return true
  if (Array.isArray(object.actor) && object.actor[0] === ownerId) return true
  if (Array.isArray(object.attributedTo) && object.attributedTo[0] === ownerId) {
    return true
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

// TODO: enable caching and/or local copies of contexts for json-ld processor
/*
// how to override the default document loader with a custom one -- for
// example, one that uses pre-loaded contexts:

// define a mapping of context URL => context doc
const CONTEXTS = {
  "http://example.com": {
    "@context": ...
  }, ...
};

// grab the built-in node.js doc loader
const nodeDocumentLoader = jsonld.documentLoaders.node();
// or grab the XHR one: jsonld.documentLoaders.xhr()

// change the default document loader
const customLoader = async (url, options) => {
  if (url in CONTEXTS) {
    return {
      contextUrl: null, // this is for a context via a link header
      document: CONTEXTS[url], // this is the actual document that was loaded
      documentUrl: url // this is the actual context URL after redirects
    };
  }
  // call the default documentLoader
  return nodeDocumentLoader(url);
};
jsonld.documentLoader = customLoader;
*/

// non-exported utils
// strip any _meta or private properties to keep jsonld valid and not leak private keys
const privateActivityProps = ['bto', 'bcc']
function skipPrivate (key, value) {
  if (key.startsWith('_') || privateActivityProps.includes(key)) {
    return undefined
  }
  return value
}
