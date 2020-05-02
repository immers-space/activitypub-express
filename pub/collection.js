'use strict'

module.exports = {
  getCollection
}

async function getCollection (collectionId, remapper, metaFilterProperty) {
  let stream = await this.store.stream.getStream(collectionId, metaFilterProperty)
  if (remapper) {
    stream = stream.map(remapper)
  }
  return this.fromJSONLD({
    id: collectionId,
    type: 'OrderedCollection',
    totalItems: stream.length,
    orderedItems: stream
  })
}
