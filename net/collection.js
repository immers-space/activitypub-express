module.exports = {
  added,
  blocked,
  inbox,
  outbox,
  followers,
  following,
  liked,
  likes,
  shares,
  rejected,
  rejections
}

function blocked (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getBlocked(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  })
}

function inbox (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getInbox(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  })
}

function outbox (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getOutbox(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  })
}

function followers (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getFollowers(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  })
}

function following (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getFollowing(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  })
}

function liked (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getLiked(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  })
}

function shares (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getShares(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  })
}

function likes (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getLikes(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  })
}

function added (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  const colId = req.params[apex.collectionParam]
  if (!locals.target || !colId) return next()
  apex.getAdded(locals.target, colId, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  })
}

function rejected (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getRejected(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  })
}

function rejections (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getRejections(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  })
}
