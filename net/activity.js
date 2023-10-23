'use strict'

// For collection display, store with objects resolved
// updates also get their objects denormalized during validation
const denormalizeObject = [
  // object objects
  'create',
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
      if (!saveResult) {
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
        .push(() => apex.publishActivity(resLocal.target, activity, audience))
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
    /* isNewActivity:
      false - this inbox has seen this activity before
      'new collection' - known activity, new inbox
      true - first time seeing this activity
    */
    if (res.locals.apex.isNewActivity === false) {
      // ignore redundant deliveries to same inbox
      return next()
    }
    switch (activity.type.toLowerCase()) {
      case 'accept':
        if (apex.validateOwner(object, recipient) && object.type.toLowerCase() === 'follow') {
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
          if (apex.validateOwner(targetActivity, recipient) && targetActivity.shares) {
            const shares = apex.objectIdFromValue(targetActivity.shares)
            // add to object shares collection, increment share count
            activity = await apex.store
              .updateActivityMeta(activity, 'collection', shares)
            // publish updated object with updated shares count
            const updatedTarget = await apex.updateCollection(shares)
            if (updatedTarget) {
              resLocal.postWork.push(async () => {
                return apex.publishUpdate(recipient, updatedTarget, actorId)
              })
            }
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
          // only owner processes the change so they can publish update
          if (apex.validateOwner(targetActivity, recipient) && targetActivity.likes) {
            const likes = apex.objectIdFromValue(targetActivity.likes)
            // add to object likes collection, incrementing like count
            activity = await apex.store
              .updateActivityMeta(activity, 'collection', likes)
            // publish updated object with updated likes count
            const updatedTarget = await apex.updateCollection(likes)
            if (updatedTarget) {
              resLocal.postWork.push(async () => {
                return apex.publishUpdate(recipient, updatedTarget, actorId)
              })
            }
          }
        })())
        break
      case 'reject':
        if (apex.validateOwner(object, recipient)) {
          toDo.push((async () => {
            const rejectionsIRI = apex.utils.nameToRejectionsIRI(recipient.preferredUsername)
            object = await apex.store
              .updateActivityMeta(object, 'collection', rejectionsIRI)
            // reject is also the undo of a follow accept
            if (apex.hasMeta(object, 'collection', recipient.following[0])) {
              object = await apex.store
                .updateActivityMeta(object, 'collection', recipient.following[0], true)
              resLocal.postWork.push(async () => apex.publishUpdate(recipient, await apex.getFollowers(recipient)))
            }
          })())
        }
        break
      case 'undo':
        // unlike other activities, undo will process updates for all affected actors
        // on first delivery so it can be deleted immediately
        if (object) {
          // deleting the activity also removes it from all collections,
          // undoing follows, blocks, shares, and likes
          toDo.push(apex.store.removeActivity(object, actorId))
          resLocal.postWork.push(() => {
            // update any collections the activity was removed from
            const audience = apex.audienceFromActivity(object).concat(actor.id)
            const updates = object._meta?.collection
              ?.map(colId => apex.publishUndoUpdate(colId, recipient, audience))
            return updates && Promise.allSettled(updates)
          })
        }
        break
      case 'update':
        if (resLocal.isNewActivity === true) {
          if (apex.validateActivity(object)) {
            toDo.push(apex.store.updateActivity(object, true))
          } else {
            toDo.push(apex.store.updateObject(object, actorId, true))
          }
        }
        break
      case 'create':
        let question = resLocal.linked.find(({ type }) => type.toLowerCase() === 'question')
        if (question) {
            const targetActivity = object
            let targetActivityChoice = targetActivity.name[0].toLowerCase()
            let questionType
            if (Object.hasOwn(question, 'oneOf')) {
              questionType = 'oneOf'
            } else if (Object.hasOwn(question, 'anyOf')) {
              questionType = 'anyOf'
            }
            let chosenCollection = question[questionType].find(({ name }) => name[0].toLowerCase() === targetActivityChoice)
            const chosenCollectionId = apex.objectIdFromValue(chosenCollection.replies)
            toDo.push((async () => {
              question = await apex.store.getObject(question.id, true)
              let actorHasVoted = activity._meta.collection.some((obj) => {
                return obj.includes(question.id)
              })
              activity = await apex.store.updateActivityMeta(activity, 'collection', chosenCollectionId)
              let updatedCollection = await apex.getCollection(chosenCollectionId)
              if (updatedCollection && !actorHasVoted){
                question.votersCount = [question.votersCount[0] + 1]
              }
              question[questionType].find(({ replies }) => replies.id === chosenCollectionId).replies = updatedCollection

              if (question._meta) {
                question._meta.votes[0].push(activity.object[0].id)
              } else {
                let votes = []
                votes.push(activity.object[0].id)
                apex.addMeta(question, 'votes', votes)
              }
              
              if (actorHasVoted) {
                // if anyOf, check the votes to make sure they havent already voted an option, if they have, short circuit
                // if oneOf, short circuit.
              }
              let updatedQuestion = await apex.store.updateObject(question, actorId, true)
              if (updatedQuestion) {
                resLocal.postWork.push(async () => {
                  return apex.publishUpdate(recipient, updatedQuestion, actorId)
                })
              }
            })())
        }
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
    resLocal.status = 201
    resLocal.createdLocation = activity.id

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
          resLocal.postWork.push(() => {
            // update any collections the activity was removed from
            const audience = apex.audienceFromActivity(object)
            const updates = object._meta?.collection
              ?.map(colId => apex.publishUndoUpdate(colId, actor, audience))
            return updates && Promise.allSettled(updates)
          })
        }
        break
    }
    Promise.all(toDo).then(() => {
      // configure event hook to be triggered after response sent
      resLocal.eventMessage = { actor, activity, object }
      resLocal.eventName = 'apex-outbox'
      if (!resLocal.doNotPublish) {
        // local activity object may have been updated (e.g. denormalized object);
        // send original req.body to outbox
        resLocal.postWork.unshift(() => apex.publishActivity(actor, req.body))
      }
      next()
    }).catch(next)
  },
  resolveThread (req, res, next) {
    const apex = req.app.locals.apex
    const resLocal = res.locals.apex
    apex.resolveReferences(req.body).then(refs => {
      resLocal.linked = refs
      next()
    }).catch(next)
  }
}
