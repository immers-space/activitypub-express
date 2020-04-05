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
  const actIRI = req.__apex.utils.activityIdToIRI()
  req.body.id = actIRI
  if (!pub.utils.validateActivity(req.body)) {
    req.body.id = req.__apex.utils.objectIdToIRI()
    if (!pub.utils.validateObject(req.body)) {
      return res.status(400).send('Invalid activity')
    }
    req.body.attributedTo = req.__apexLocal.target.id
    const extras = {}
    req.body = req.__apex.pub.activity
      .build(actIRI, 'Create', req.__apexLocal.target.id, req.body, req.body.to, req.body.cc, extras)
  } else if (req.body.object) {
    req.body.object.id = req.__apex.utils.objectIdToIRI()
  }
  if (!req.body._meta) {
    req.body._meta = {}
  }
  req.__apexLocal.activity = true
  next()
}
