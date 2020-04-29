const assert = require('assert')

module.exports = {
  inbox,
  outbox,
  followers,
  following,
  liked
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

function followers (req, res, next) {
  assert(res.locals.apex.target)
  const apex = req.app.locals.apex
  const followersId = res.locals.apex.target.followers[0]
  apex.store.stream.getStream(followersId, 'accepted')
    .then(stream => {
      const actors = stream.map(apex.pub.utils.actorIdFromActivity)
      return apex.pub.utils.arrayToCollection(apex.context, followersId, actors, true)
    })
    .then(col => {
      res.locals.apex.result = col
      next()
    })
}

function following (req, res, next) {
  assert(res.locals.apex.target)
  const apex = req.app.locals.apex
  const followingId = res.locals.apex.target.following[0]
  apex.store.stream.getStream(followingId, 'accepted')
    .then(stream => {
      const recipients = stream.map(apex.pub.utils.objectIdFromActivity)
      return apex.pub.utils.arrayToCollection(apex.context, followingId, recipients, true)
    })
    .then(col => {
      res.locals.apex.result = col
      next()
    })
}

function liked (req, res, next) {
  assert(res.locals.apex.target)
  const apex = req.app.locals.apex
  const likedId = res.locals.apex.target.liked[0]
  apex.store.stream.getStream(likedId)
    .then(stream => {
      const objects = stream.map(apex.pub.utils.objectIdFromActivity)
      return apex.pub.utils.arrayToCollection(apex.context, likedId, objects, true)
    })
    .then(col => {
      res.locals.apex.result = col
      next()
    })
}
