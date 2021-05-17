'use strict'
const fs = require('fs')
const path = require('path')
const jsonld = require('jsonld')
const merge = require('deepmerge')
const actorStreamNames = ['inbox', 'outbox', 'following', 'followers', 'liked', 'blocked', 'rejected', 'rejections']
const activityStreamNames = ['shares', 'likes']
const audienceFields = ['to', 'bto', 'cc', 'bcc', 'audience']

module.exports = {
  addPageToIRI,
  addMeta,
  audienceFromActivity,
  hasMeta,
  idToActivityCollectionsFactory,
  idToIRIFactory,
  userAndIdToIRIFactory,
  iriToCollectionInfoFactory,
  isLocalCollection,
  isLocalIRI,
  isLocalhostIRI,
  isProductionEnv,
  isPublic,
  isString,
  mergeJSONLD,
  nameToActorStreamsFactory,
  removeMeta,
  toJSONLD,
  fromJSONLD,
  jsonldContextLoader,
  actorIdFromActivity,
  objectIdFromActivity,
  objectIdFromValue,
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

function audienceFromActivity (activity) {
  return audienceFields.reduce((acc, t) => {
    return activity[t] ? acc.concat(activity[t]) : acc
  }, [])
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

function iriToCollectionInfoFactory (domain, routes, pActor, pActivity, pCollection) {
  pActor = `:${pActor}`
  pActivity = `:${pActivity}`
  pCollection = `:${pCollection}`
  const tests = []
  // custom actor collections
  let pattern = this.settings.routes.collections
  const isActorFirst = pattern.indexOf(pActor) < pattern.indexOf(pCollection)
  pattern = pattern.replace(pActor, '([^/]+)').replace(pCollection, '([^/]+)')
  const re = new RegExp(`^https://${this.domain}${pattern}$`)
  tests.push(iri => {
    const match = re.exec(iri)?.slice(1)
    return match && { name: 'collections', actor: match[+!isActorFirst], id: match[+isActorFirst] }
  })
  // standard actor streams
  actorStreamNames.forEach(name => {
    const pattern = this.settings.routes[name].replace(pActor, '([^/]+)')
    const re = new RegExp(`^https://${this.domain}${pattern}$`)
    tests.push(iri => {
      const actor = re.exec(iri)?.[1]
      return actor && { name, actor }
    })
  })
  // activity object streams
  activityStreamNames.forEach(name => {
    const pattern = this.settings.routes[name].replace(pActivity, '([^/]+)')
    const re = new RegExp(`^https://${this.domain}${pattern}$`)
    tests.push(iri => {
      const activity = re.exec(iri)?.[1]
      return activity && { name, activity }
    })
  })
  return iri => {
    for (const test of tests) {
      const result = test(iri)
      if (result) return result
    }
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

function objectIdFromValue (object) {
  if (this.isString(object)) {
    return object
  }
  if (Array.isArray(object)) {
    object = object[0]
  }
  return object?.id
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

function isPublic (object) {
  return object._meta?.isPublic ||
    this.audienceFromActivity(object).includes(this.consts.publicAddress)
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
  const streamTemplates = {}
  activityStreamNames.forEach(s => {
    streamTemplates[s] = `https://${domain}${routes[s]}`
  })
  return id => {
    const streams = {}
    activityStreamNames.forEach(s => {
      streams[s] = streamTemplates[s].replace(colonParam, id)
    })
    return streams
  }
}

function validateObject (object) {
  if (Array.isArray(object)) {
    object = object[0]
  }
  if (object?.id && object?.type) {
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
    if (actor.streams?.[0] && Object.values(actor.streams[0]).includes(object.id)) {
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

// keep main contexts in memory for speedy access
const coreContexts = {
  'https://w3id.org/security/v1': {
    contextUrl: null,
    documentUrl: 'https://w3id.org/security/v1',
    document: JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vocab/security.json')))
  },
  'https://www.w3.org/ns/activitystreams': {
    contextUrl: null,
    documentUrl: 'https://www.w3.org/ns/activitystreams',
    document: JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vocab/as.json')))
  }
}
// cached JSONLD contexts to reduce requests an eliminate
// failures caused when context servers are unavailable
const nodeDocumentLoader = jsonld.documentLoaders.node()

async function jsonldContextLoader (url, options) {
  if (coreContexts[url]) {
    return coreContexts[url]
  }
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
      // save original url in case of redirects
      context.documentUrl = url
      await this.store.saveContext(context)
    } catch (err) {
      this.logger.error('Error saving jsonld contact cache', err.message)
    }
  }
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
