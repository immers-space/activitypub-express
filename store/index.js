'use strict'
// database interface
module.exports = {
  setup: require('./setup'),
  object: require('./object'),
  stream: require('./stream'),
  combined: require('./combined'),
  connection: require('./connection'),
  utils: require('./utils')
}
