'use strict'

// For collection display, store with objects resolved
// updates also get their objects denormalized during validation
const denormalizeObject = [
  // object objects
  'create', 'follow', 'block',
  // activity objects
  'announce', 'like', 'add', 'reject'
]

module.exports = {
  save (req, res, next) {
    if (!res.locals.apex.activity || !res.locals.apex.target) {
      return next()
    }
    const apex = req.app.locals.apex
    const resLocal = res.locals.apex
    let activity = req.body
    if (denormalizeObject.includes(activity.type.toLowerCase())) {
      // save with resolved object for ease of rendering
      activity = [{}, activity, { object: [resLocal.object] }]
        .reduce(apex.mergeJSONLD)
    }
    apex.store.saveActivity(activity).then(saveResult => {
      resLocal.isNewActivity = !!saveResult
      if (!saveResult && !resLocal.skipOutbox) {
        const newTarget = activity._meta.collection[0]
        return apex.store
          .updateActivityMeta(activity, 'collection', newTarget)
      }
    }).then(updated => {
      if (updated) {
        req.body = updated
        resLocal.isNewActivity = 'new collection'
      }
      next()
    }).catch(next)
  },
  forwardFromInbox (req, res, next) {
    const apex = req.app.locals.apex
    const resLocal = res.locals.apex
    const activity = req.body
    if (!(resLocal.activity && resLocal.target)) {
      return next()
    }
    // This is the first time the server has seen this Activity.
    if (resLocal.isNewActivity !== true) {
      return next()
    }
    // The values of inReplyTo, object, target and/or tag are objects owned by the server
    if (!(resLocal.linked && resLocal.linked.some(obj => apex.isLocalIRI(obj.id)))) {
      return next()
    }
    // The values of to, cc, and/or audience contain a Collection owned by the server
    const audience = ['to', 'cc', 'audience']
      .reduce((acc, prop) => {
        return activity[prop] ? acc.concat(activity[prop]) : acc
      }, [])
      /* Spec says any collection, but really only Followers contains actors
      * and is used in addressing. Perhaps also Added, depending on what it is
      * populated with.
      */
      .filter(addr => ['followers', 'collections'].includes(apex.utils.iriToCollectionInfo(addr)?.name))
    if (audience.length) {
      resLocal.postWork
        .push(() => apex.addToOutbox(resLocal.target, activity, audience))
    }
    next()
  },
  inboxSideEffects (req, res, next) {
    if (!(res.locals.apex.activity && res.locals.apex.actor)) {
      return next()
    }
    const toDo = []
    const apex = req.app.locals.apex
    const resLocal = res.locals.apex
    const recipient = resLocal.target
    const actor = resLocal.actor
    const actorId = actor.id
    let activity = req.body
    let object = resLocal.object
    resLocal.status = 200
    if (!res.locals.apex.isNewActivity) {
      // ignore duplicate deliveries
      return next()
    }
    switch (activity.type.toLowerCase()) {
      case 'accept':
        if (object.type.toLowerCase() === 'follow') {
          toDo.push((async () => {
            // Add orignal follow activity to following collection
            object = await apex.store
              .updateActivityMeta(object, 'collection', recipient.following[0])
            resLocal.postWork.push(async () => {
              return apex.publishUpdate(recipient, await apex.getFollowing(recipient), actorId)
            })
          })())
        }
        break
      case 'announce':
        toDo.push((async () => {
          const targetActivity = object
          // add to object shares collection, increment share count
          if (apex.isLocalIRI(targetActivity.id) && targetActivity.shares) {
            activity = await apex.store
              .updateActivityMeta(activity, 'collection', targetActivity.shares[0])
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
            activity = await apex.store
              .updateActivityMeta(activity, 'collection', targetActivity.likes[0])
            // publish update to shares count
            resLocal.postWork.push(async () => {
              return apex.publishUpdate(recipient, await apex.getLikes(targetActivity), actorId)
            })
          }
        })())
        break
      case 'reject':
        toDo.push((async () => {
          const rejectionsIRI = apex.utils.nameToRejectionsIRI(actor.preferredUsername)
          object = await apex.store
            .updateActivityMeta(object, 'collection', rejectionsIRI)
          // reject is also the undo of a follow accept
          if (apex.hasMeta(object, 'collection', recipient.following[0])) {
            object = await apex.store
              .updateActivityMeta(object, 'collection', recipient.following[0], true)
            resLocal.postWork.push(async () => apex.publishUpdate(recipient, await apex.getFollowers(recipient)))
          }
        })())
        break
      case 'undo':
        if (object) {
          // deleting the activity also removes it from all collections,
          // undoing follows, blocks, shares, and likes
          toDo.push(apex.store.removeActivity(object, actorId))
          // TODO: publish appropriate collection updates (after #8)
        }
        break
      case 'update':
        toDo.push(apex.store.updateObject(object, actorId, true))
        break
    }
    Promise.all(toDo).then(() => {
      // configure event hook to be triggered after response sent
      resLocal.eventName = 'apex-inbox'
      resLocal.eventMessage = { actor, activity, recipient, object }
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
    const actor = resLocal.target
    let activity = req.body
    let object = resLocal.object
    resLocal.status = 200
    if (!resLocal.isNewActivity) {
      // ignore duplicate deliveries
      return next()
    }

    switch (activity.type.toLowerCase()) {
      case 'accept':
        if (object.type.toLowerCase() === 'follow') {
          toDo.push(
            apex.acceptFollow(actor, object)
              .then(({ postTask, updated }) => {
                object = updated
                resLocal.postWork.push(postTask)
              })
          )
        }
        break
      case 'block':
        toDo.push((async () => {
          const blockedIRI = apex.utils.nameToBlockedIRI(actor.preferredUsername)
          activity = await apex.store.updateActivityMeta(activity, 'collection', blockedIRI)
        })())
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
          activity = await apex.store
            .updateActivityMeta(activity, 'collection', actor.liked[0])
          // publish update to shares count
          resLocal.postWork.push(async () => {
            return apex.publishUpdate(actor, await apex.getLiked(actor))
          })
        })())
        break
      case 'update':
        toDo.push(apex.store.updateObject(object, actor.id, true))
        break
      case 'add':
        toDo.push((async () => {
          object = await apex.store
            .updateActivityMeta(object, 'collection', activity.target[0])
        })())
        break
      case 'reject':
        toDo.push((async () => {
          const rejectedIRI = apex.utils.nameToRejectedIRI(actor.preferredUsername)
          object = await apex.store
            .updateActivityMeta(object, 'collection', rejectedIRI)
          // undo prior follow accept, if applicable
          if (apex.hasMeta(object, 'collection', actor.followers[0])) {
            object = await apex.store
              .updateActivityMeta(object, 'collection', actor.followers[0], true)
            resLocal.postWork.push(async () => apex.publishUpdate(actor, await apex.getFollowers(actor)))
          }
        })())
        break
      case 'remove':
        toDo.push((async () => {
          object = await apex.store
            .updateActivityMeta(object, 'collection', activity.target[0], true)
        })())
        break
      case 'undo':
        if (object) {
          // deleting the activity also removes it from all collections,
          // undoing follows, blocks, shares, and likes
          toDo.push(apex.store.removeActivity(object, actor.id))
          // TODO: publish appropriate collection updates (after #8)
        }
        break
    }
    Promise.all(toDo).then(() => {
      // configure event hook to be triggered after response sent
      resLocal.eventMessage = { actor, activity, object }
      resLocal.eventName = 'apex-outbox'
      if (!resLocal.skipOutbox) {
        // local activity object may have been updated (e.g. denormalized object);
        // send original req.body to outbox
        resLocal.postWork.unshift(() => apex.addToOutbox(actor, req.body))
      }
      next()
    }).catch(next)
  },
  resolveThread (req, res, next) {
    const apex = req.app.locals.apex
    const resLocal = res.locals.apex
    if (!resLocal.activity) {
      return next()
    }
    apex.resolveReferences(req.body).then(refs => {
      resLocal.linked = refs
      next()
    }).catch(next)
  }
}
