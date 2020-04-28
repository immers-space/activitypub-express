'use strict'
const connection = require('./connection')
module.exports = async function dbSetup (testUser) {
  const db = connection.getDb()
  // inbox
  await db.collection('streams').createIndex({
    '_meta.collection': 1,
    _id: -1
  }, {
    name: 'inbox'
  })
  // followers
  await db.collection('streams').createIndex({
    '_meta.collection': 1
  }, {
    partialFilterExpression: { type: 'Follow' },
    name: 'followers'
  })
  // outbox
  await db.collection('streams').createIndex({
    actor: 1,
    _id: -1
  })
  // object lookup
  await db.collection('objects').createIndex({
    id: 1
  })
  if (testUser) {
    return db.collection('objects').findOneAndReplace(
      { preferredUsername: testUser.preferredUsername },
      testUser,
      {
        upsert: true,
        returnOriginal: false
      }
    )
  }
}
