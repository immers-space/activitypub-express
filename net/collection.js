module.exports = {
  inbox,
  outbox,
  followers,
  following,
  liked,
  shares,
  likes
}

function inbox (req, res, next) {
  if (!res.locals.apex.target) return next()
  const apex = req.app.locals.apex
  apex.getInbox(res.locals.apex.target).then(col => {
    res.locals.apex.result = col
    next()
  })
}

function outbox (req, res, next) {
  if (!res.locals.apex.target) return next()
  const apex = req.app.locals.apex
  apex.getOutbox(res.locals.apex.target).then(col => {
    res.locals.apex.result = col
    next()
  })
}

function followers (req, res, next) {
  if (!res.locals.apex.target) return next()
  const apex = req.app.locals.apex
  apex.getFollowers(res.locals.apex.target).then(col => {
    res.locals.apex.result = col
    next()
  })
}

function following (req, res, next) {
  if (!res.locals.apex.target) return next()
  const apex = req.app.locals.apex
  apex.getFollowing(res.locals.apex.target).then(col => {
    res.locals.apex.result = col
    next()
  })
}

function liked (req, res, next) {
  if (!res.locals.apex.target) return next()
  const apex = req.app.locals.apex
  apex.getLiked(res.locals.apex.target).then(col => {
    res.locals.apex.result = col
    next()
  })
}

function shares (req, res, next) {
  if (!res.locals.apex.target) return next()
  const apex = req.app.locals.apex
  apex.getShares(res.locals.apex.target).then(col => {
    res.locals.apex.result = col
    next()
  })
}

function likes (req, res, next) {
  if (!res.locals.apex.target) return next()
  const apex = req.app.locals.apex
  apex.getLikes(res.locals.apex.target).then(col => {
    res.locals.apex.result = col
    next()
  })
}
