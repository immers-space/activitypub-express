module.exports = {
  activity,
  jsonld,
  outboxActivity,
  targetActor,
  targetActorWithMeta
}

function activity (req, res, next) {
  if (!req.__apex.pub.utils.validateActivity(req.body)) {
    return res.status(400).send('Invalid activity')
  }
  if (!req.body._meta) {
    req.body._meta = {}
  }
  req.__apexLocal.activity = true
  next()
}

async function jsonld (req, res, next) {
  const apex = req.__apex
  // rule out */* requests
  if (req.method === 'GET' && !req.accepts('text/html') && req.accepts(apex.pub.consts.jsonldTypes)) {
    return next()
  }
  if (req.method === 'POST' && req.is(apex.pub.consts.jsonldTypes)) {
    try {
      req.body = await apex.pub.utils.fromJSONLD(req.body, apex.context)
    } catch (err) {
      console.error('jsonld validation', err)
      res.status(400).send('Request body is not valid JSON-LD')
    }
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

// help prevent accidental disclosure of actor private keys by only
// including them when explicitly requested
async function targetActorWithMeta (req, res, next) {
  const apex = req.__apex
  const actor = req.params[apex.actorParam]
  const actorIRI = apex.utils.usernameToIRI(actor)
  let actorObj
  try {
    actorObj = await apex.store.object.get(actorIRI, true)
  } catch (err) { return next(err) }
  if (!actorObj) {
    return res.status(404).send(`'${actor}' not found on this instance`)
  }
  req.__apexLocal.target = actorObj
  next()
}

function outboxActivity (req, res, next) {
  const apex = req.__apex
  const actorIRI = req.__apexLocal.target.id
  const activityIRI = apex.utils.activityIdToIRI()
  let activity = req.body
  let object
  activity.id = activityIRI
  if (!apex.pub.utils.validateActivity(activity)) {
    // if not valid activity, check for valid object and wrap in Create
    object = activity
    object.id = apex.utils.objectIdToIRI()
    if (!apex.pub.utils.validateObject(object)) {
      return res.status(400).send('Invalid activity')
    }
    object.attributedTo = actorIRI
    const extras = {}
    activity = apex.pub.activity
      .build(activityIRI, 'Create', actorIRI, object, object.to, object.cc, extras)
    req.body = activity
  } else if (activity.object) {
    object = activity.object
    object.id = apex.utils.objectIdToIRI()
    // per spec, ensure attributedTo and audience fields in object are correct
    object.attributedTo = actorIRI
    ;['to', 'bto', 'cc', 'bcc', 'audience'].forEach(t => {
      if (t in activity) {
        object[t] = activity[t]
      } else {
        delete object[t]
      }
    })
  }
  req.__apexLocal.activity = true
  next()
}
