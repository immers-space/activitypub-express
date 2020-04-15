const assert = require('assert')

module.exports = {
  inbox,
  outbox
}

function inbox (req, res, next) {
  const apex = req.app.locals.apex
  assert(res.locals.apex.target)
  apex.store.stream.getStream(res.locals.apex.target.id, true)
    .then(stream => apex.pub.utils.arrayToCollection(stream, apex.context, true))
    .then(coll => res.json(coll))
    .catch(err => {
      console.log(err.message)
      return res.status(500).send()
    })
}

function outbox (req, res, next) {
  const apex = req.app.locals.apex
  assert(res.locals.apex.target)
  apex.store.stream.getStream(res.locals.apex.target.id)
    .then(stream => apex.pub.utils.arrayToCollection(stream, apex.context, true))
    .then(coll => res.json(coll))
    .catch(err => {
      console.log(err.message)
      return res.status(500).send()
    })
}
