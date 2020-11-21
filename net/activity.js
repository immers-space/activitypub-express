'use strict'

module.exports = {
  save (req, res, next) {
    if (!res.locals.apex.activity || !res.locals.apex.target) {
      return next()
    }
    const apex = req.app.locals.apex
    const resLocal = res.locals.apex
    apex.store.saveActivity(req.body).then(saveResult => {
      resLocal.isNewActivity = !!saveResult
      if (!saveResult) {
        const actorId = apex.actorIdFromActivity(req.body)
        const newTarget = req.body._meta.collection[0]
        return apex.store
          .updateActivityMeta(req.body.id, actorId, 'collection', newTarget)
      }
    }).then(updated => {
      if (updated) {
        resLocal.isNewActivity = 'new collection'
      }
      next()
    }).catch(next)
  },
  inboxSideEffects (req, res, next) {
    if (!(res.locals.apex.activity && res.locals.apex.actor)) {
      return next()
    }
    const toDo = []
    const apex = req.app.locals.apex
    const activity = req.body
    const resLocal = res.locals.apex
    const recipient = resLocal.target
    const actor = resLocal.actor
    const object = resLocal.object
    const actorId = actor.id
    resLocal.status = 200
    if (!res.locals.apex.isNewActivity) {
      // ignore duplicate deliveries
      return next()
    }
    // configure event hook to be triggered after response sent
    resLocal.eventName = 'apex-inbox'
    resLocal.eventMessage = { actor, activity, recipient, object }
    switch (activity.type.toLowerCase()) {
      case 'accept':
        if (object.type.toLowerCase() === 'follow') {
          // Add orignal follow activity to following collection
          apex.addMeta(object, 'collection', recipient.following[0])
          toDo.push(
            apex.store.updateActivity(object, true).then(() => {
              // publish update to following count
              resLocal.postWork.push(async () => {
                return apex.publishUpdate(recipient, await apex.getFollowing(recipient), actorId)
              })
            })
          )
        }
        break
      case 'reject':
        apex.addMeta(object, 'rejection', activity.id)
        // reject is also the undo of a follow accept
        if (object.type.toLowerCase() === 'follow') {
          apex.removeMeta(object, 'collection', recipient.following[0])
        }
        toDo.push(apex.store.updateActivity(object, true))
        break
      case 'undo':
        if (object) {
          // deleting the activity also removes it from all collections
          toDo.push(apex.undoActivity(object, actorId))
          // TODO: publish appropriate collection updates (after #8)
        }
        break
      case 'announce':
        toDo.push((async () => {
          const targetActivity = object
          // add to object shares collection, increment share count
          if (apex.isLocalIRI(targetActivity.id) && targetActivity.shares) {
            await apex.store
              .updateActivityMeta(activity.id, actorId, 'collection', targetActivity.shares[0])
            // publish update to shares count
            resLocal.postWork.push(async () => {
              return apex.publishUpdate(recipient, await apex.getShares(targetActivity), actorId)
            })
          }
        })())
        break
      case 'like':
        toDo.push((async () => {
          const targetActivity = object
          // add to object likes collection, incrementing like count
          if (apex.isLocalIRI(targetActivity.id) && targetActivity.likes) {
            await apex.store
              .updateActivityMeta(activity.id, actorId, 'collection', targetActivity.likes[0])
            // publish update to shares count
            resLocal.postWork.push(async () => {
              return apex.publishUpdate(recipient, await apex.getLikes(targetActivity), actorId)
            })
          }
        })())
        break
      case 'update':
        toDo.push(apex.store.updateObject(object, actorId, true))
        break
      case 'delete':
        // if we don't have the object, no action needed
        if (object) {
          toDo.push(
            apex.buildTombstone(object)
              .then(tombstone => apex.store.updateObject(tombstone, actorId, true))
          )
        }
        break
      default:
        // follow included here because it's the Accept that causes the side-effect
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
    resLocal.eventName = 'apex-outbox'

    switch (activity.type.toLowerCase()) {
      case 'accept':
        toDo.push(
          apex.store.getActivity(apex.objectIdFromActivity(activity), true)
            .then(targetActivity => {
              resLocal.eventMessage.object = targetActivity
              if (!targetActivity || targetActivity.type !== 'Follow') return
              return apex.acceptFollow(actor, targetActivity)
            })
            .then(postTask => resLocal.postWork.push(postTask))
            .catch(err => next(err))
        )
        break
      case 'create':
        // save created object
        toDo.push(apex.resolveObject(activity.object[0]).then(object => {
          resLocal.eventMessage.object = object
        }))
        break
      case 'update':
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
        break
    }
    resLocal.postWork.push(() => apex.addToOutbox(actor, activity))
    Promise.all(toDo).then(() => {
      next()
    }).catch(next)
  }
}
