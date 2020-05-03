'use strict'

module.exports = {
  save (req, res, next) {
    if (!res.locals.apex.activity) {
      return next()
    }
    req.app.locals.apex.store.saveActivity(req.body).then(saveResult => {
      res.locals.apex.isNewActivity = saveResult
      next()
    }).catch(next)
  },
  inboxSideEffects (req, res, next) {
    if (!(res.locals.apex.activity && res.locals.apex.sender)) {
      return next()
    }
    const toDo = []
    const apex = req.app.locals.apex
    const activity = req.body
    const actorId = apex.actorIdFromActivity(activity)
    const recipient = res.locals.apex.target
    const resLocal = res.locals.apex
    resLocal.status = 200
    if (!res.locals.apex.isNewActivity) {
      // ignore duplicate deliveries
      return next()
    }
    // configure event hook to be triggered after response sent
    resLocal.eventMessage = { actor: actorId, activity, recipient }

    switch (activity.type.toLowerCase()) {
      case 'accept':
        resLocal.eventName = 'apex-accept'
        // Mark target as accepted (adds to following collection)
        toDo.push(apex.store.updateActivityMeta(
          apex.objectIdFromActivity(activity),
          recipient.id,
          'accepted',
          activity.actor[0]
        ).then(updateResult => {
          // TODO: this should send discriminate what was accepted before sending following update
          if (!updateResult) return
          // publish update to following count
          resLocal.postWork.push(async () => {
            const act = await apex.buildActivity(
              apex.utils.activityIdToIRI(),
              'Update',
              recipient.id,
              await apex.getFollowing(recipient),
              recipient.followers[0],
              { cc: actorId }
            )
            return apex.addToOutbox(recipient, act)
          })
        }))
        break
      case 'create':
        resLocal.eventName = 'apex-create'
        toDo.push(apex.resolveObject(activity.object[0]).then(object => {
          resLocal.eventMessage.object = object
        }))
        break
      case 'undo':
        resLocal.eventName = 'apex-undo'
        toDo.push(apex.undoActivity(activity.object[0], actorId))
        break
      default:
        // follow included here because it's the Accept that causes the side-effect
        resLocal.eventName = `apex-${activity.type.toLowerCase()}`
        break
    }
    Promise.all(toDo).then(() => {
      next()
    }).catch(next)
  },
  outboxSideEffects (req, res, next) {
    if (!res.locals.apex.activity) {
      return next()
    }
    const toDo = []
    const apex = req.app.locals.apex
    const activity = req.body
    const actor = res.locals.apex.target
    const resLocal = res.locals.apex
    resLocal.status = 200
    if (!resLocal.isNewActivity) {
      // ignore duplicate deliveries
      return next()
    }

    // configure event hook to be triggered after response sent
    resLocal.eventMessage = { actor, activity }

    switch (activity.type.toLowerCase()) {
      case 'create':
        resLocal.eventName = 'apex-create'
        // save created object
        toDo.push(apex.resolveObject(activity.object[0]).then(object => {
          resLocal.eventMessage.object = object
        }))
        break
      case 'update':
        resLocal.eventName = 'apex-update'
        toDo.push(apex.store.updateObject(activity.object[0], actor.id).then(updated => {
          if (!updated) {
            throw new Error('Update target object not found or not authorized')
          }
          activity.object[0] = updated // send full replacement object when federating
          resLocal.eventMessage.object = updated
        }))

        break
      default:
        // follow included here because it's the Accept that causes the side-effect
        resLocal.eventName = `apex-${activity.type.toLowerCase()}`
        break
    }
    resLocal.postWork.push(() => apex.addToOutbox(actor, activity))
    Promise.all(toDo).then(() => {
      next()
    }).catch(next)
  }
}
