'use strict'

const store = require('../store')
const pubUtils = require('./utils')

module.exports = {
  get
}

async function get (context, collectionId, remapper, metaFilterProperty) {
  let stream = await store.stream.getStream(collectionId, metaFilterProperty)
  if (remapper) {
    stream = stream.map(remapper)
  }
  return pubUtils.fromJSONLD({
    id: collectionId,
    type: 'OrderedCollection',
    totalItems: stream.length,
    orderedItems: stream
  }, context)
}
