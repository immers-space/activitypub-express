'use strict'
const stream = require('./stream')
const object = require('./object')

module.exports = {
  updateObject
}

async function updateObject (obj, actorId, fullReplace) {
  let updated
  if (fullReplace) {
    throw new Error('not implemented')
  } else {
    updated = await object.update(obj, actorId)
  }
  if (updated) {
    // propogate update to all copies in streams
    await stream.updateObject(obj)
  }
  return updated
}
