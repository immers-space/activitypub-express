'use strict'
const store = require('../store')
const jsonld = require('jsonld')

module.exports = {
  addMeta,
  idToIRIFactory,
  nameToActorStreamsFactory,
  toJSONLD,
  fromJSONLD,
  arrayToCollection,
  actorFromActivity,
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
    obj._meta.push(value)
  }
}

function actorFromActivity (activity) {
  const actor = activity.actor[0]
  if (Object.prototype.toString.call(actor) === '[object String]') {
    return actor
  }
  if (activity.actor.type === 'Link') {
    return actor.href
  }
  return actor.id
}

function arrayToCollection (context, id, arr, ordered) {
  return fromJSONLD({
    id,
    type: ordered ? 'OrderedCollection' : 'Collection',
    totalItems: arr.length,
    [ordered ? 'orderedItems' : 'items']: arr
  }, context)
}
// convert incoming json-ld to local context and
// partially expanded format for consistent property access
async function fromJSONLD (obj, targetContext) {
  const opts = {
    // don't unbox arrays so that object structure will be predictable
    compactArrays: false
  }
  if (!('@context' in obj)) {
    // if context is missing, try filling in ours
    opts.expandContext = targetContext
  }
  const compact = await jsonld.compact(obj, targetContext, opts)
  // strip context and graph wrapper for easier access
  return compact['@graph'][0]
}
// convert working objects to json-ld for transport
function toJSONLD (obj, targetContext) {
  return jsonld.compact(obj, targetContext, {
    // must supply initial context because it was stripped for easy handling
    expandContext: targetContext,
    // unbox arrays on federated objects, in case other apps aren't using real json-ld
    compactArrays: true
  })
}

function idToIRIFactory (domain, route, param) {
  const colonParam = `:${param}`
  return id => {
    if (!id) {
      id = store.utils.generateId()
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
