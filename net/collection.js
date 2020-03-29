const assert = require('assert')

module.exports = {
  inbox,
  outbox,
}

function inbox (req, res, next) {
  assert(req.__apexLocal.target)
  req.__apex.store.stream.getStream(req.__apexLocal.target.id, true)
    .then(stream => res.json(req.__apex.pub.utils.arrayToCollection(stream, true)))
    .catch(err => {
      console.log(err.message)
      return res.status(500).send()
    })
}

function outbox (req, res, next) {
  assert(req.__apexLocal.target)
  req.__apex.store.stream.getStream(req.__apexLocal.target.id)
    .then(stream => res.json(req.__apex.pub.utils.arrayToCollection(stream, true)))
    .catch(err => {
      console.log(err.message)
      return res.status(500).send()
    })
}
