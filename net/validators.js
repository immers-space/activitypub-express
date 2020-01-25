const pub = require('../pub')

module.exports = {
  activity,
  jsonld,
  outboxActivity,
  targetActor
}

function activity (req, res, next) {
  if (!pub.utils.validateActivity(req.body)) {
    return res.status(400).send('Invalid activity')
  }
  if (!req.body._meta) {
    req.body._meta = {}
  }
  req.__apexLocal.activity = true
  next()
}

function jsonld (req, res, next) {
  // rule out */* requests
  if (req.method === 'GET' && !req.accepts('text/html') && req.accepts(pub.consts.jsonldTypes)) {
    return next()
  }
  if (req.method === 'POST' && req.is(pub.consts.jsonldTypes)) {
    return next()
  }
  next('route')
}

async function targetActor (req, res, next) {
  const apex = req.__apex
  const actor = req.params[apex.actorParam]
  const actorIRI = apex.utils.usernameToIRI(actor)
  let actorObj
  try {
    actorObj = await apex.store.object.get(actorIRI)
  } catch (err) { return next(err) }
  if (!actorObj) {
    return res.status(404).send(`'${actor}' not found on this instance`)
  }
  req.__apexLocal.target = actorObj
  next()
}

function outboxActivity (req, res, next) {
  if (!pub.utils.validateActivity(req.body)) {
    if (!pub.utils.validateObject(req.body)) {
      return res.status(400).send('Invalid activity')
    }
    const actor = pub.utils.usernameToIRI(req.user)
    const extras = {}
    if (req.body.bcc) {
      extras.bcc = req.body.bcc
    }
    if (req.body.audience) {
      extras.audience = req.body.audience
    }
    req.body = pub.activity
      .build('Create', actor, req.body, req.body.to, req.body.cc, extras)
  }
  next()
}
