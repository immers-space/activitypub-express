'use strict'
const onFinished = require('on-finished')
const pub = require('./pub')
const net = require('./net')
const ApexStore = require('./store')

function onFinishedHandler (err, res) {
  if (err) return
  const apexLocal = res.locals.apex
  Promise.all(apexLocal.postWork.map(task => task.call(res)))
    .then(() => {
      if (apexLocal.eventName) {
        res.app.emit(apexLocal.eventName, apexLocal.eventMessage)
      }
    })
    .catch(err => {
      console.error('post-response error:', err.message)
    })
}

module.exports = function (settings) {
  const apex = function (req, res, next) {
    req.app.locals.apex = apex // apex api object
    res.locals.apex = {
      eventName: null,
      eventMessage: {},
      postWork: []
    }
    onFinished(res, onFinishedHandler)
    next()
  }
  // bind pub methods at top level so their 'this' is apex instance
  for (const prop in pub) {
    if (typeof pub[prop] === 'function') {
      apex[prop] = pub[prop].bind(apex)
    } else {
      apex[prop] = pub[prop]
    }
  }
  apex.settings = settings
  apex.domain = settings.domain
  apex.context = settings.context || pub.consts.ASContext
  apex.net = net
  apex.store = settings.store || new ApexStore()
  apex.actorParam = settings.actorParam
  apex.objectParam = settings.objectParam
  apex.activityParam = settings.activityParam || settings.objectParam
  apex.collectionParam = settings.collectionParam || settings.objectParam
  apex.systemUser = settings.systemUser
  apex.utils = {
    usernameToIRI: apex.idToIRIFactory(apex.domain, settings.routes.actor, apex.actorParam),
    objectIdToIRI: apex.idToIRIFactory(apex.domain, settings.routes.object, apex.objectParam),
    activityIdToIRI: apex.idToIRIFactory(apex.domain, settings.routes.activity, apex.activityParam),
    userCollectionIdToIRI: apex.userAndIdToIRIFactory(apex.domain, settings.routes.collections, apex.actorParam, apex.collectionParam),
    nameToActorStreams: apex.nameToActorStreamsFactory(apex.domain, settings.routes, apex.actorParam),
    nameToBlockedIRI: apex.idToIRIFactory(apex.domain, settings.routes.blocked, apex.actorParam),
    nameToRejectedIRI: apex.idToIRIFactory(apex.domain, settings.routes.rejected, apex.actorParam),
    nameToRejectionsIRI: apex.idToIRIFactory(apex.domain, settings.routes.rejections, apex.actorParam),
    idToActivityCollections: apex.idToActivityCollectionsFactory(apex.domain, settings.routes, apex.activityParam)
  }

  return apex
}
