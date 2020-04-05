'use strict'
const mongo = require('mongodb')

module.exports = {
  generateId
}

function generateId () {
  return new mongo.ObjectId().toHexString()
}
