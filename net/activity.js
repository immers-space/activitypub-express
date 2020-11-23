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
      case 'delete':
        // if we don't have the object, no action needed
        if (object) {
          toDo.push(
            apex.buildTombstone(object)
              .then(tombstone => apex.store.updateObject(tombstone, actorId, true))
          )
        }
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
      case 'update':
        toDo.push(apex.store.updateObject(object, actorId, true))
        break
    }
    Promise.all(toDo).then(() => {
      next()
    }).catch(next)
  },
  outboxSideEffects (req, res, next) {
    if (!res.locals.apex.target || !res.locals.apex.activity) {
      return next()
    }
    const toDo = []
    const apex = req.app.locals.apex
    const resLocal = res.locals.apex
    const activity = req.body
    const actor = resLocal.target
    const object = resLocal.object
    resLocal.status = 200
    if (!resLocal.isNewActivity) {
      // ignore duplicate deliveries
      return next()
    }

    // configure event hook to be triggered after response sent
    resLocal.eventMessage = { actor, activity, object }
    resLocal.eventName = 'apex-outbox'

    switch (activity.type.toLowerCase()) {
      case 'accept':
        if (object.type.toLowerCase() === 'follow') {
          toDo.push(
            apex.acceptFollow(actor, object)
              .then(postTask => resLocal.postWork.push(postTask))
          )
        }
        break
      case 'create':
        toDo.push(apex.store.saveObject(object))
        break
      case 'delete':
        toDo.push(
          apex.buildTombstone(object)
            .then(tombstone => apex.store.updateObject(tombstone, actor.id, true))
        )
        break
      case 'like':
        toDo.push((async () => {
          // add to object liked collection
          await apex.store
            .updateActivityMeta(activity.id, actor.id, 'collection', actor.liked[0])
          // publish update to shares count
          resLocal.postWork.push(async () => {
            return apex.publishUpdate(actor, await apex.getLiked(actor))
          })
        })())
        break
      case 'update':
        toDo.push(apex.store.updateObject(object, actor.id, true))
        break
    }
    Promise.all(toDo).then(() => {
      resLocal.postWork.push(() => apex.addToOutbox(actor, activity))
      next()
    }).catch(next)
  }
}
