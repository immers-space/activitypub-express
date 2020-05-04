'use strict'

module.exports = {
  async save (req, res, next) {
    if (!res.locals.apex.activity) {
      return next()
    }
    const apex = req.app.locals.apex
    try {
      const saveResult = await apex.store.saveActivity(req.body)
      res.locals.apex.isNewActivity = saveResult
      if (!saveResult) {
        // add additional target collection to activity
        const actorId = apex.actorIdFromActivity(req.body)
        const newTarget = req.body._meta.collection[0]
        await apex.store.updateActivityMeta(req.body.id, actorId, 'collection', newTarget)
      }
      next()
    } catch (err) {
      next(err)
    }
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
        toDo.push(
          apex.store.getActivity(apex.objectIdFromActivity(activity), true).then(targetActivity => {
            resLocal.eventMessage.object = targetActivity
            if (!targetActivity || targetActivity.type !== 'Follow') return
            // Add orignal follow activity to following collection
            apex.addMeta(targetActivity, 'collection', recipient.following[0])
            return apex.store.updateActivity(targetActivity, true)
          }).then(updated => {
            // publish update to following count
            resLocal.postWork.push(async () => {
              const act = await apex.buildActivity(
                'Update',
                recipient.id,
                recipient.followers[0],
                { object: await apex.getFollowing(recipient), cc: actorId }
              )
              return apex.addToOutbox(recipient, act)
            })
          })
        )
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
      case 'accept':
        resLocal.eventName = 'apex-accept'
        toDo.push(
          apex.store.getActivity(apex.objectIdFromActivity(activity), true).then(targetActivity => {
            resLocal.eventMessage.object = targetActivity
            if (!targetActivity || targetActivity.type !== 'Follow') return
            // add accepted follows to followers collection
            apex.addMeta(targetActivity, 'collection', actor.followers[0])
            return apex.store.updateActivity(targetActivity, true)
          }).then(() => {
            // publish update to followers count
            resLocal.postWork.push(async () => {
              const act = await apex.buildActivity(
                'Update',
                actor.id,
                actor.followers[0],
                { object: await apex.getFollowers(actor) }
              )
              return apex.addToOutbox(actor, act)
            })
          })
        )
        break
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
