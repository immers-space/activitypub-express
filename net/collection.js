const assert = require('assert')

module.exports = {
  inbox,
  outbox
}

function inbox (req, res, next) {
  assert(res.locals.apex.target)
  const apex = req.app.locals.apex
  const target = res.locals.apex.target
  apex.store.stream.getStream(target.id, true)
    .then(stream => apex.pub.utils.arrayToCollection(apex.context, target.inbox[0], stream, true))
    .then(col => {
      res.locals.apex.result = col
      next()
    })
}

function outbox (req, res, next) {
  assert(res.locals.apex.target)
  const apex = req.app.locals.apex
  const target = res.locals.apex.target
  apex.store.stream.getStream(target.id)
    .then(stream => apex.pub.utils.arrayToCollection(apex.context, target.outbox[0], stream, true))
    .then(col => {
      res.locals.apex.result = col
      next()
    })
}
