const assert = require('assert')

module.exports = {
  inbox,
  outbox,
  followers,
  following,
  liked
}

function inbox (req, res, next) {
  if (!res.locals.apex.target) return next()
  const apex = req.app.locals.apex
  apex.pub.collection.get(apex.context, res.locals.apex.target.inbox[0])
    .then(col => {
      res.locals.apex.result = col
      next()
    })
}

function outbox (req, res, next) {
  if (!res.locals.apex.target) return next()
  const apex = req.app.locals.apex
  apex.pub.collection.get(apex.context, res.locals.apex.target.outbox[0])
    .then(col => {
      res.locals.apex.result = col
      next()
    })
}

function followers (req, res, next) {
  if (!res.locals.apex.target) return next()
  const apex = req.app.locals.apex
  const followersId = res.locals.apex.target.followers[0]
  apex.pub.collection.get(apex.context, followersId, apex.pub.utils.actorIdFromActivity, 'accepted')
    .then(col => {
      res.locals.apex.result = col
      next()
    })
}

function following (req, res, next) {
  if (!res.locals.apex.target) return next()
  const apex = req.app.locals.apex
  const followingId = res.locals.apex.target.following[0]
  apex.pub.collection.get(apex.context, followingId, apex.pub.utils.objectIdFromActivity, 'accepted')
    .then(col => {
      res.locals.apex.result = col
      next()
    })
}

function liked (req, res, next) {
  if (!res.locals.apex.target) return next()
  const apex = req.app.locals.apex
  const likedId = res.locals.apex.target.liked[0]
  apex.pub.collection.get(apex.context, likedId, apex.pub.utils.objectIdFromActivity)
    .then(col => {
      res.locals.apex.result = col
      next()
    })
}
