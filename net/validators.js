'use strict'

const assert = require('assert')

module.exports = {
  inboxActivity,
  jsonld,
  outboxActivity,
  targetActivity,
  targetActor,
  targetActorWithMeta,
  targetObject
}

function inboxActivity (req, res, next) {
  assert(res.locals.apex.target)
  const apex = req.app.locals.apex
  if (!apex.pub.utils.validateActivity(req.body)) {
    return res.status(400).send('Invalid activity')
  }
  apex.pub.utils.addMeta(req.body, 'collection', res.locals.apex.target.inbox[0])
  res.locals.apex.activity = true
  next()
}

async function jsonld (req, res, next) {
  const apex = req.app.locals.apex
  const jsonldAccepted = req.accepts(apex.pub.consts.jsonldTypes)
  // rule out */* requests
  if (req.method === 'GET' && !req.accepts('text/html') && jsonldAccepted) {
    res.locals.apex.responseType = jsonldAccepted
    return next()
  }
  if (req.method === 'POST' && req.is(apex.pub.consts.jsonldTypes)) {
    try {
      const obj = await apex.pub.utils.fromJSONLD(req.body, apex.context)
      if (!obj) {
        return res.status(400).send('Request body is not valid JSON-LD')
      }
      req.body = obj
    } catch (err) {
      // potential fetch errors on context sources
      console.error('jsonld validation', err)
      return res.status(500).send('Error processing request JSON-LD')
    }
    return next()
  }
  next('route')
}

async function targetActivity (req, res, next) {
  const apex = req.app.locals.apex
  const aid = req.params[apex.activityParam]
  const activityIRI = apex.utils.activityIdToIRI(aid)
  let activity
  try {
    activity = await apex.store.stream.getActivity(activityIRI)
  } catch (err) { return next(err) }
  if (!activity) {
    return res.status(404).send(`'${aid}' not found`)
  }
  res.locals.apex.target = activity
  next()
}

async function targetActor (req, res, next) {
  const apex = req.app.locals.apex
  const actor = req.params[apex.actorParam]
  const actorIRI = apex.utils.usernameToIRI(actor)
  let actorObj
  try {
    actorObj = await apex.store.object.get(actorIRI)
  } catch (err) { return next(err) }
  if (!actorObj) {
    return res.status(404).send(`'${actor}' not found on this instance`)
  }
  res.locals.apex.target = actorObj
  next()
}

// help prevent accidental disclosure of actor private keys by only
// including them when explicitly requested
async function targetActorWithMeta (req, res, next) {
  const apex = req.app.locals.apex
  const actor = req.params[apex.actorParam]
  const actorIRI = apex.utils.usernameToIRI(actor)
  let actorObj
  try {
    actorObj = await apex.store.object.get(actorIRI, true)
  } catch (err) { return next(err) }
  if (!actorObj) {
    return res.status(404).send(`'${actor}' not found on this instance`)
  }
  res.locals.apex.target = actorObj
  next()
}

async function targetObject (req, res, next) {
  const apex = req.app.locals.apex
  const oid = req.params[apex.objectParam]
  const objIRI = apex.utils.objectIdToIRI(oid)
  let obj
  try {
    obj = await apex.store.object.get(objIRI)
  } catch (err) { return next(err) }
  if (!obj) {
    return res.status(404).send(`'${oid}' not found`)
  }
  res.locals.apex.target = obj
  next()
}

async function outboxActivity (req, res, next) {
  assert(res.locals.apex.target)
  const apex = req.app.locals.apex
  const actorIRI = res.locals.apex.target.id
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
    object.attributedTo = [actorIRI]
    const extras = {}
    activity = await apex.pub.activity
      .build(apex.context, activityIRI, 'Create', actorIRI, object, object.to, object.cc, extras)
    req.body = activity
  } else if (activity.type === 'Create') {
    // validate content of created objects
    object = activity.object[0]
    object.id = apex.utils.objectIdToIRI()
    // per spec, ensure attributedTo and audience fields in object are correct
    object.attributedTo = [actorIRI]
    ;['to', 'bto', 'cc', 'bcc', 'audience'].forEach(t => {
      if (t in activity) {
        object[t] = activity[t]
      } else {
        delete object[t]
      }
    })
  }
  apex.pub.utils.addMeta(req.body, 'collection', res.locals.apex.target.outbox[0])
  res.locals.apex.activity = true
  next()
}
