'use strict'

const assert = require('assert')
module.exports = {
  save (req, res, next) {
    assert(res.locals.apex.activity)
    req.app.locals.apex.store.stream.save(req.body).then(saveResult => {
      res.locals.apex.isNewActivity = saveResult
      next()
    }).catch(next)
  },
  inboxSideEffects (req, res, next) {
    assert(res.locals.apex.activity)
    if (!res.locals.apex.isNewActivity) {
      // ignore duplicate deliveries
      return next()
    }
    const toDo = []
    const apex = req.app.locals.apex
    const activity = req.body
    const actor = apex.pub.utils.actorIdFromActivity(activity)
    const recipient = res.locals.apex.target
    // configure event hook to be triggered after response sent
    const resLocal = res.locals.apex
    resLocal.eventMessage = { actor, activity, recipient }

    switch (activity.type.toLowerCase()) {
      case 'accept':
        resLocal.eventName = 'apex-accept'
        // TODO - side effect necessary for following collection?
        break
      case 'follow':
        // TODO resolve object and ensure specified target matches inbox user
        // req.body._meta._target = req.body.object.id
        resLocal.eventName = 'apex-follow'
        break
      case 'create':
        resLocal.eventName = 'apex-create'
        toDo.push(apex.pub.object.resolve(activity.object[0]).then(object => {
          resLocal.eventMessage.object = object
        }))
        break
      case 'undo':
        resLocal.eventName = 'apex-undo'
        toDo.push(apex.pub.activity.undo(activity.object[0], actor))
        break
      default:
        resLocal.eventName = `apex-${activity.type.toLowerCase()}`
        break
    }
    Promise.all(toDo).then(() => {
      next()
    }).catch(next)
  },
  outboxSideEffects (req, res, next) {
    assert(res.locals.apex.activity)
    if (!res.locals.apex.isNewActivity) {
      // ignore duplicate deliveries
      return next()
    }
    const toDo = []
    const apex = req.app.locals.apex
    const activity = req.body
    const actor = res.locals.apex.target
    const resLocal = res.locals.apex
    // configure event hook to be triggered after response sent
    resLocal.eventMessage = { actor, activity }

    switch (activity.type.toLowerCase()) {
      case 'create':
        resLocal.eventName = 'apex-create'
        // save created object
        toDo.push(apex.pub.object.resolve(activity.object[0]).then(object => {
          resLocal.eventMessage.object = object
        }))
        break
      case 'update':
        resLocal.eventName = 'apex-update'
        toDo.push(apex.store.combined.updateObject(activity.object[0], actor.id).then(updated => {
          if (!updated) {
            throw new Error('Update target object not found or not authorized')
          }
          activity.object[0] = updated // send full replacement object when federating
          resLocal.eventMessage.object = updated
        }))

        break
      default:
        resLocal.eventName = `apex-${activity.type.toLowerCase()}`
        break
    }
    resLocal.postWork.push(() => apex.pub.activity.addToOutbox(actor, activity, apex.context))
    Promise.all(toDo).then(() => {
      next()
    }).catch(next)
  }
}
