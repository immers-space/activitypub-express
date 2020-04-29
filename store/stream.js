'use strict'
const connection = require('./connection')
module.exports = {
  getActivity,
  getStream,
  remove,
  save,
  updateObject
}

function getActivity (id) {
  const db = connection.getDb()
  return db.collection('streams')
    .find({ id: id })
    .limit(1)
    .project({ _id: 0, _meta: 0 })
    .next()
}

function getStream (collectionId, filterFlag) {
  const q = { '_meta.collection': collectionId }
  if (filterFlag) {
    q[`_meta.${filterFlag}`] = { $exists: true }
  }
  const query = connection.getDb()
    .collection('streams')
    .find(q)
    .sort({ _id: -1 })
    .project({ _id: 0, _meta: 0, 'object._id': 0, 'object._meta': 0 })
  return query.toArray()
}

async function save (activity) {
  const db = connection.getDb()
  const q = { id: activity.id }
  // activities may be duplicated with different target collections
  if (activity._meta.collection) {
    q['_meta.collection'] = { $all: activity._meta.collection }
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
