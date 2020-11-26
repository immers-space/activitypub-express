'use strict'

module.exports = {
  activityObject,
  actor,
  inboxActivity,
  jsonld,
  outboxActivity,
  outboxActivityObject,
  outboxCreate,
  targetActivity,
  targetActor,
  targetActorWithMeta,
  targetObject
}

const needsResolveObject = ['create']
const needsResolveActivity = ['announce', 'like']
const needsLocalActivity = ['accept', 'reject', 'undo']
const needsLocalObject = ['delete']
const needsInlineObject = ['update']
const requiresObject = ['update']
const requiresActivityObject = ['accept', 'announce', 'like', 'reject']

function activityObject (req, res, next) {
  const apex = req.app.locals.apex
  const resLocal = res.locals.apex
  const activity = req.body
  let object
  if (!apex.validateActivity(activity)) return next()

  const type = req.body.type.toLowerCase()
  if (needsResolveObject.includes(type) && activity.object) {
    object = apex.resolveObject(activity.object[0], true)
  } else if (needsResolveActivity.includes(type) && activity.object) {
    object = apex.resolveActivity(activity.object[0], true)
  } else if (needsLocalActivity.includes(type)) {
    object = apex.store.getActivity(apex.objectIdFromActivity(activity), true)
  } else if (needsLocalObject.includes(type)) {
    object = apex.store.getObject(apex.objectIdFromActivity(activity), true)
  } else if (needsInlineObject.includes(type) && apex.validateObject(activity.object)) {
    object = activity.object[0]
  }
  Promise.resolve(object).then(obj => {
    resLocal.object = obj
    next()
  }).catch(next)
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
  const object = resLocal.object
  const actor = resLocal.actor
  const recipient = resLocal.target
  if (!apex.validateActivity(activity)) {
    resLocal.status = 400
    resLocal.statusMessage = 'Invalid activity'
    return next()
  }
  // aditional validation for specific activites
  const type = activity.type.toLowerCase()
  if (requiresActivityObject.includes(type) && !apex.validateActivity(object)) {
    resLocal.status = 400
    resLocal.statusMessage = `Activity type object requried for ${activity.type} activity`
    return next()
  }
  if (requiresObject.includes(type) && !apex.validateObject(object)) {
    resLocal.status = 400
    resLocal.statusMessage = `Object requried for ${activity.type} activity`
    return next()
  }
  if (type === 'update') {
    if (apex.validateActivity(object)) {
      resLocal.status = 400
      resLocal.statusMessage = 'Updates to activities not supported'
      return next()
    }
    if (!apex.validateOwner(object, actor.id)) {
      resLocal.status = 403
      resLocal.statusMessage = 'Objects can only be updated by attributedTo actor'
      return next()
    }
  } else if (type === 'delete' && object) {
    if (apex.validateActivity(object)) {
      resLocal.status = 400
      resLocal.statusMessage = 'Activities cannot be deleted, use Undo'
      return next()
    }
    if (!apex.validateOwner(object, actor.id)) {
      resLocal.status = 403
      resLocal.statusMessage = 'Objects can only be deleted by attributedTo actor'
      return next()
    }
  } else if (type === 'accept') {
    // the activity being accepted was sent to the actor trying to accept it
    if (!object.to.includes(actor.id)) {
      resLocal.status = 403
      return next()
    }
    // for follows, also confirm the follow object was the actor trying to accept it
    const isFollow = object.type.toLowerCase() === 'follow'
    if (isFollow && !apex.validateTarget(object, actor.id)) {
      resLocal.status = 403
      return next()
    }
  } else if (type === 'undo' && object) {
    if (!apex.validateOwner(object, actor.id)) {
      resLocal.status = 403
      return next()
    }
  }
  apex.addMeta(req.body, 'collection', recipient.inbox[0])
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

const obxNeedsResolveObject = ['follow']
const obxNeedsResolveActivity = ['accept', 'add', 'like', 'reject', 'remove']
const obxNeedsLocalObject = ['delete', 'update']
const obxNeedsLocalActivity = []
const obxNeedsInlineObject = ['create']
const obxRequiresObject = ['create', 'delete']
const obxRequiresActivityObject = ['add', 'accept', 'like', 'reject', 'remove']
const obxRequiresTarget = ['add', 'remove']

function outboxCreate (req, res, next) {
  if (!res.locals.apex.target) {
    return next()
  }
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
      return next()
    }
    object.attributedTo = [actorIRI]
    const extras = { object }
    ;['bto', 'cc', 'bcc', 'audience'].forEach(t => {
      if (t in object) {
        extras[t] = object[t]
      }
    })
    activity = apex.buildActivity('Create', actorIRI, object.to, extras)
  } else if (activity.type.toLowerCase() === 'create' && activity.object) {
    activity.object[0].id = apex.utils.objectIdToIRI()
  }
  Promise.resolve(activity).then(actResolved => {
    req.body = actResolved
    next()
  })
}

function outboxActivityObject (req, res, next) {
  const apex = req.app.locals.apex
  const resLocal = res.locals.apex
  const activity = req.body
  if (!resLocal.target || !apex.validateActivity(activity)) {
    return next()
  }
  const type = activity.type.toLowerCase()
  let object
  if (obxNeedsResolveObject.includes(type) && activity.object) {
    object = apex.resolveObject(activity.object[0], true)
  } else if (obxNeedsResolveActivity.includes(type) && activity.object) {
    object = apex.resolveActivity(activity.object[0], true)
  } else if (obxNeedsLocalActivity.includes(type)) {
    object = apex.store.getActivity(apex.objectIdFromActivity(activity), true)
  } else if (obxNeedsLocalObject.includes(type)) {
    object = apex.store.getObject(apex.objectIdFromActivity(activity), true)
  } else if (obxNeedsInlineObject.includes(type) && apex.validateObject(activity.object)) {
    object = activity.object[0]
    object.id = apex.utils.objectIdToIRI()
  }
  Promise.resolve(object).then(obj => {
    resLocal.object = obj
    next()
  })
}
async function outboxActivity (req, res, next) {
  if (!res.locals.apex.target) {
    return next()
  }
  const apex = req.app.locals.apex
  const resLocal = res.locals.apex
  const actor = resLocal.target
  const activity = req.body
  const object = resLocal.object
  if (!apex.validateActivity(activity)) {
    resLocal.status = 400
    resLocal.statusMessage = 'Invalid activity'
    return next()
  }
  const type = activity.type.toLowerCase()
  activity.id = apex.utils.activityIdToIRI()
  if (obxRequiresActivityObject.includes(type) && !apex.validateActivity(object)) {
    resLocal.status = 400
    resLocal.statusMessage = `Activity type object requried for ${activity.type} activity`
    return next()
  }
  if (obxRequiresObject.includes(type) && !apex.validateObject(object)) {
    resLocal.status = 400
    resLocal.statusMessage = `Object requried for ${activity.type} activity`
    return next()
  }
  if (obxRequiresTarget.includes(type) && !activity.target) {
    resLocal.status = 400
    resLocal.statusMessage = `Target required for ${activity.type} activity`
    return next()
  }
  if (type === 'accept') {
    // the activity being accepted was sent to the actor trying to accept it
    if (!object.to.includes(actor.id)) {
      resLocal.status = 403
      return next()
    }
    // for follows, also confirm the follow object was the actor trying to accept it
    const isFollow = object.type.toLowerCase() === 'follow'
    if (isFollow && !apex.validateTarget(object, actor.id)) {
      resLocal.status = 403
      return next()
    }
  } else if (type === 'create') {
    // per spec, ensure attributedTo and audience fields in object are correct
    object.attributedTo = [actor.id]
    ;['to', 'bto', 'cc', 'bcc', 'audience'].forEach(t => {
      if (t in activity) {
        object[t] = activity[t]
      } else {
        delete object[t]
      }
    })
  } else if (type === 'delete') {
    if (apex.validateActivity(object)) {
      resLocal.status = 400
      resLocal.statusMessage = 'Activities cannot be deleted, use Undo'
      return next()
    }
    if (!apex.validateOwner(object, actor.id)) {
      resLocal.status = 403
      return next()
    }
  } else if (type === 'update') {
    if (!apex.validateOwner(object, actor.id)) {
      resLocal.status = 403
      return next()
    }
    // outbox updates can be partial, do merge
    resLocal.object = apex.mergeJSONLD(object, activity.object[0])
    activity.object = [resLocal.object]
  } else if (type === 'add' || type === 'remove') {
    if (!apex.validateCollectionOwner(activity.target, actor.id)) {
      resLocal.status = 403
      return next()
    }
  }
  apex.addMeta(req.body, 'collection', resLocal.target.outbox[0])
  resLocal.activity = true
  next()
}
