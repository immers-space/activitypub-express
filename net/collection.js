const assert = require('assert')

module.exports = {
  inbox,
  outbox
}

function inbox (req, res, next) {
  assert(res.locals.apex.target)
  req.app.locals.apex.store.stream.getStream(res.locals.apex.target.id, true)
    .then(stream => res.json(req.app.locals.apex.pub.utils.arrayToCollection(stream, true)))
    .catch(err => {
      console.log(err.message)
      return res.status(500).send()
    })
}

function outbox (req, res, next) {
  assert(res.locals.apex.target)
  req.app.locals.apex.store.stream.getStream(res.locals.apex.target.id)
    .then(stream => res.json(req.app.locals.apex.pub.utils.arrayToCollection(stream, true)))
    .catch(err => {
      console.log(err.message)
      return res.status(500).send()
    })
}
