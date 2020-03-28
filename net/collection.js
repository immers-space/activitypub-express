const assert = require('assert')

module.exports = {
  inbox
}

async function inbox (req, res, next) {
  assert(req.__apexLocal.target)
  throw new Error('inbox collection not implemented')
}
