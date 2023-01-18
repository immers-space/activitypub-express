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
  }).catch(err => {
    if (err.message === 'ApexStore: invalid page value') {
      locals.status = 400
      locals.statusMessage = 'invalid page value'
      apex.logger.info('Invalid collection page request: ', req.originalUrl)
      next()
    } else {
      next(err)
    }
  })
}

function inbox (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getInbox(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  }).catch(err => {
    if (err.message === 'ApexStore: invalid page value') {
      locals.status = 400
      locals.statusMessage = 'invalid page value'
      apex.logger.info('Invalid collection page request: ', req.originalUrl)
      next()
    } else {
      next(err)
    }
  })
}

function outbox (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getOutbox(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  }).catch(err => {
    if (err.message === 'ApexStore: invalid page value') {
      locals.status = 400
      locals.statusMessage = 'invalid page value'
      apex.logger.info('Invalid collection page request: ', req.originalUrl)
      next()
    } else {
      next(err)
    }
  })
}

function followers (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getFollowers(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  }).catch(err => {
    if (err.message === 'ApexStore: invalid page value') {
      locals.status = 400
      locals.statusMessage = 'invalid page value'
      apex.logger.info('Invalid collection page request: ', req.originalUrl)
      next()
    } else {
      next(err)
    }
  })
}

function following (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getFollowing(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  }).catch(err => {
    if (err.message === 'ApexStore: invalid page value') {
      locals.status = 400
      locals.statusMessage = 'invalid page value'
      apex.logger.info('Invalid collection page request: ', req.originalUrl)
      next()
    } else {
      next(err)
    }
  })
}

function liked (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getLiked(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  }).catch(err => {
    if (err.message === 'ApexStore: invalid page value') {
      locals.status = 400
      locals.statusMessage = 'invalid page value'
      apex.logger.info('Invalid collection page request: ', req.originalUrl)
      next()
    } else {
      next(err)
    }
  })
}

function shares (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getShares(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  }).catch(err => {
    if (err.message === 'ApexStore: invalid page value') {
      locals.status = 400
      locals.statusMessage = 'invalid page value'
      apex.logger.info('Invalid collection page request: ', req.originalUrl)
      next()
    } else {
      next(err)
    }
  })
}

function likes (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getLikes(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  }).catch(err => {
    if (err.message === 'ApexStore: invalid page value') {
      locals.status = 400
      locals.statusMessage = 'invalid page value'
      apex.logger.info('Invalid collection page request: ', req.originalUrl)
      next()
    } else {
      next(err)
    }
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
  }).catch(err => {
    if (err.message === 'ApexStore: invalid page value') {
      locals.status = 400
      locals.statusMessage = 'invalid page value'
      apex.logger.info('Invalid collection page request: ', req.originalUrl)
      next()
    } else {
      next(err)
    }
  })
}

function rejected (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getRejected(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  }).catch(err => {
    if (err.message === 'ApexStore: invalid page value') {
      locals.status = 400
      locals.statusMessage = 'invalid page value'
      apex.logger.info('Invalid collection page request: ', req.originalUrl)
      next()
    } else {
      next(err)
    }
  })
}

function rejections (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (!locals.target) return next()
  apex.getRejections(locals.target, req.query.page, locals.authorized).then(col => {
    locals.result = col
    next()
  }).catch(err => {
    if (err.message === 'ApexStore: invalid page value') {
      locals.status = 400
      locals.statusMessage = 'invalid page value'
      apex.logger.info('Invalid collection page request: ', req.originalUrl)
      next()
    } else {
      next(err)
    }
  })
}
