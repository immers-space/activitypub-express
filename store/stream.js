'use strict'
const connection = require('./connection')
module.exports = {
  get,
  getStream,
  remove,
  save,
  updateObject
}

function get (id) {
  const db = connection.getDb()
  return db.collection('streams')
    .find({ id: id })
    .limit(1)
    .project({ _id: 0, _meta: 0 })
    .next()
}

function getStream (actorId, idIsTargetActor) {
  const query = connection.getDb()
    .collection('streams')
    .find({ [idIsTargetActor ? '_meta._target' : 'actor']: actorId })
    .sort({ _id: -1 })
    .project({ _id: 0, _meta: 0, '@context': 0, 'object._id': 0, 'object.@context': 0, 'object._meta': 0 })
  // TODO: pagination
  return query.toArray()
}

async function save (activity) {
  const db = connection.getDb()
  const q = { id: activity.id }
  // activities may be duplicated for multiple local targets
  if (activity._meta && activity._meta._target) {
    q['_meta._target'] = activity._meta._target
  }
  const exists = await db.collection('streams')
    .find(q)
    .project({ _id: 1 })
    .limit(1)
    .hasNext()
  if (exists) {
    return false
  }

  return db.collection('streams')
    // server object ID avoids mutating local copy of document
    .insertOne(activity, { forceServerObjectId: true })
}

function remove (activity, actor) {
  return connection.getDb().collection('streams')
    .deleteMany({ id: activity.id, actor: actor })
}

// for denormalized storage model, must update all activities with copy of updated object
function updateObject (object) {
  return connection.getDb().collection('streams')
    .updateMany({ 'object.0.id': object.id }, { $set: { object: [object] } })
}
