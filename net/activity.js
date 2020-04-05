const assert = require('assert')
module.exports = {
  setTargetActor (req, res, next) {
    assert(req.__apexLocal.activity)
    assert(req.__apexLocal.target)
    req.body._meta._target = req.__apexLocal.target.id
    next()
  },
  save (req, res, next) {
    assert(req.__apexLocal.activity)
    req.__apex.store.stream.save(req.body).then(saveResult => {
      req.__apexLocal.isNewActivity = saveResult
      next()
    }).catch(next)
  },
  inboxSideEffects (req, res, next) {
    assert(req.__apexLocal.activity)
    if (!req.__apexLocal.isNewActivity) {
      // ignore duplicate deliveries
      return res.status(200).send()
    }
    const toDo = []
    const apex = req.__apex
    const activity = req.body
    const actor = apex.pub.utils.actorFromActivity(activity)
    const recipient = req.__apexLocal.target
    // configure event hook to be triggered after response sent
    const resLocal = res.__apexLocal
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
        toDo.push(apex.pub.object.resolve(activity.object).then(object => {
          resLocal.eventMessage.object = object
        }))
        break
      case 'undo':
        resLocal.eventName = 'apex-undo'
        toDo.push(apex.pub.activity.undo(req.body.object, req.body.actor))
        break
    }
    Promise.all(toDo).then(() => {
      res.status(200).send()
    }).catch(next)
  },
  outboxSideEffects (req, res, next) {
    assert(req.__apexLocal.activity)
    if (!req.__apexLocal.isNewActivity) {
      // ignore duplicate deliveries
      return res.status(200).send()
    }
    const toDo = []
    const apex = req.__apex
    const activity = req.body
    const actor = req.__apexLocal.target
    // configure event hook to be triggered after response sent
    const resLocal = res.__apexLocal
    resLocal.eventMessage = { actor, activity }

    switch (activity.type.toLowerCase()) {
      case 'create':
        resLocal.eventName = 'apex-create'
        toDo.push(apex.pub.object.resolve(activity.object).then(object => {
          resLocal.eventMessage.object = object
        }))
        break
    }
    Promise.all(toDo).then(() => {
      res.status(200).send()
    }).catch(next)
  }
}
