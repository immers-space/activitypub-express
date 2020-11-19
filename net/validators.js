'use strict'

const assert = require('assert')

module.exports = {
  actor,
  inboxActivity,
  jsonld,
  outboxActivity,
  targetActivity,
  targetActor,
  targetActorWithMeta,
  targetObject
}

// confirm activity actor is sender
// TODO: alternative authorization via JSON-LD signatures for forwarding
async function actor (req, res, next) {
  if (!res.locals.apex.sender) return next()
  const apex = req.app.locals.apex
  const resLocal = res.locals.apex
  let actor
  if (req.body.actor) {
    const actorId = apex.actorIdFromActivity(req.body)
    actor = await apex.resolveObject(actorId)
  }
  if (actor.id === resLocal.sender.id) {
    resLocal.actor = actor
  }
  next()
}

function inboxActivity (req, res, next) {
  if (!res.locals.apex.target || !res.locals.apex.actor) return next()
  const apex = req.app.locals.apex
  const resLocal = res.locals.apex
  const activity = req.body
  if (!apex.validateActivity(activity)) {
    resLocal.status = 400
    resLocal.statusMessage = 'Invalid activity'
    return next()
  }
  // aditional validation for specific activites
  const type = activity.type.toLowerCase()
  if (type === 'update') {
    if (!apex.validateObject(activity.object)) {
      resLocal.status = 400
      resLocal.statusMessage = 'Updates must include resolved object'
      return next()
    }
    if (apex.validateActivity(activity.object)) {
      resLocal.status = 400
      resLocal.statusMessage = 'Updates to activities not yet supported'
      return next()
    }
    if (!apex.validateOwner(activity.object, resLocal.actor.id)) {
      resLocal.status = 403
      resLocal.statusMessage = 'Objects can only be updated by attributedTo actor'
      return next()
    }
  } else if (type === 'delete') {
    if (apex.validateActivity(activity.object)) {
      resLocal.status = 400
      resLocal.statusMessage = 'Activities cannot be deleted, use Undo'
      return next()
    }
    if (!apex.validateOwner(activity.object, resLocal.actor.id)) {
      resLocal.status = 403
      resLocal.statusMessage = 'Objects can only be deleted by attributedTo actor'
      return next()
    }
  } else if (type === 'undo') {

  }
  apex.addMeta(req.body, 'collection', res.locals.apex.target.inbox[0])
  res.locals.apex.activity = true
  next()
}

async function jsonld (req, res, next) {
  const apex = req.app.locals.apex
  const jsonldAccepted = req.accepts(apex.consts.jsonldTypes)
  // rule out */* requests
  if (req.method === 'GET' && !req.accepts('text/html') && jsonldAccepted) {
    res.locals.apex.responseType = jsonldAccepted
    return next()
  }
  if (req.method === 'POST' && req.is(apex.consts.jsonldTypes)) {
    try {
      const obj = await apex.fromJSONLD(req.body)
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
    activity = await apex.store.getActivity(activityIRI)
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
    actorObj = await apex.store.getObject(actorIRI)
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
    actorObj = await apex.store.getObject(actorIRI, true)
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
    obj = await apex.store.getObject(objIRI)
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
  if (!apex.validateActivity(activity)) {
    // if not valid activity, check for valid object and wrap in Create
    object = activity
    object.id = apex.utils.objectIdToIRI()
    if (!apex.validateObject(object)) {
      return res.status(400).send('Invalid activity')
    }
    object.attributedTo = [actorIRI]
    const extras = { object }
    ;['bto', 'cc', 'bcc', 'audience'].forEach(t => {
      if (t in object) {
        extras[t] = object[t]
      }
    })
    activity = await apex
      .buildActivity('Create', actorIRI, object.to, extras)
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
  apex.addMeta(req.body, 'collection', res.locals.apex.target.outbox[0])
  res.locals.apex.activity = true
  next()
}
