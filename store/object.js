'use strict'
const connection = require('./connection')
module.exports = {
  get,
  save
}

const proj = { _id: 0, _meta: 0 }
const metaProj = { _id: 0 }

function get (id, includeMeta) {
  return connection.getDb()
    .collection('objects')
    .find({ id: id })
    .limit(1)
    // strict comparison as we don't want to return private keys on accident
    .project(includeMeta === true ? metaProj : proj)
    .next()
}

async function save (object) {
  const db = connection.getDb()
  const exists = await db.collection('objects')
    .find({ id: object.id })
    .project({ _id: 1 })
    .limit(1)
    .hasNext()
  if (exists) {
    return false
  }
  return db.collection('objects')
    .insertOne(object, { forceServerObjectId: true })
}
