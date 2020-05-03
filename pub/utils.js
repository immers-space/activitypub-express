'use strict'
const jsonld = require('jsonld')

module.exports = {
  addMeta,
  collectionIRIToActorName,
  idToIRIFactory,
  nameToActorStreamsFactory,
  toJSONLD,
  fromJSONLD,
  actorIdFromActivity,
  objectIdFromActivity,
  validateActivity,
  validateObject
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
  const pattern = this.settings.routes[collectionType]
    .replace(`:${this.actorParam}`, '([^/]+)')
  const result = new RegExp(`^https://${this.domain}${pattern}$`).exec(id)
  return result && result[1]
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
  // strip context and graph wrapper for easier access
  return compact['@graph'][0]
}
// convert working objects to json-ld for transport
function toJSONLD (obj) {
  return jsonld.compact(obj, this.context, {
    // must supply initial context because it was stripped for easy handling
    expandContext: this.context,
    // unbox arrays on federated objects, in case other apps aren't using real json-ld
    compactArrays: true
  })
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

function nameToActorStreamsFactory (domain, routes, actorParam) {
  const colonParam = `:${actorParam}`
  const streamNames = ['inbox', 'outbox', 'following', 'followers', 'liked']
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

function validateObject (object) {
  if (object && object.id && object.type) {
    return true
  }
}

function validateActivity (object) {
  if (validateObject(object) && Array.isArray(object.actor) && object.actor.length) {
    return true
  }
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
