const assert = require('assert')

module.exports = {
  inbox,
  outbox
}

function inbox (req, res, next) {
  assert(res.locals.apex.target)
  const apex = req.app.locals.apex
  const inboxId = res.locals.apex.target.inbox[0]
  apex.store.stream.getStream(inboxId)
    .then(stream => apex.pub.utils.arrayToCollection(apex.context, inboxId, stream, true))
    .then(col => {
      res.locals.apex.result = col
      next()
    })
}

function outbox (req, res, next) {
  assert(res.locals.apex.target)
  const apex = req.app.locals.apex
  const outboxId = res.locals.apex.target.outbox[0]
  apex.store.stream.getStream(outboxId)
    .then(stream => apex.pub.utils.arrayToCollection(apex.context, outboxId, stream, true))
    .then(col => {
      res.locals.apex.result = col
      next()
    })
}
