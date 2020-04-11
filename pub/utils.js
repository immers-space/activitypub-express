'use strict'
const store = require('../store')
const pubConsts = require('./consts')

module.exports = {
  idToIRIFactory,
  toJSONLD,
  arrayToCollection,
  actorFromActivity,
  validateActivity,
  validateObject
}

function actorFromActivity (activity) {
  if (Object.prototype.toString.call(activity.actor) === '[object String]') {
    return activity.actor
  }
  if (activity.actor.type === 'Link') {
    return activity.actor.href
  }
  return activity.actor.id
}

function arrayToCollection (arr, ordered) {
  return {
    '@context': pubConsts.ASContext,
    totalItems: arr.length,
    type: ordered ? 'OrderedCollection' : 'Collection',
    [ordered ? 'orderedItems' : 'items']: arr
  }
}

function toJSONLD (obj) {
  obj['@context'] = obj['@context'] || pubConsts.ASContext
  return obj
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

function validateObject (object) {
  if (object && object.id && object.type) {
    return true
  }
}

function validateActivity (object) {
  if (object && object.id && object.actor) {
    return true
  }
}
