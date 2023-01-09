'use strict'
const onFinished = require('on-finished')
const pub = require('./pub')
const net = require('./net')
const ApexStore = require('./store')

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
  if (settings.baseUrl !== undefined) {
    apex.baseUrl = settings.baseUrl
    const url = new URL(apex.baseUrl)
    apex.domain = url.hostname
    if (url.port !== '') {
      apex.domain += ':' + url.port
    }
  } else {
    // Assumes settings.domain is set (backward-compatible)
    apex.baseUrl = `https://${settings.domain}`
    apex.domain = settings.domain
  }
  apex.context = settings.context
    ? pub.consts.ASContext.concat(settings.context)
    : pub.consts.ASContext
  apex.net = net
  apex.store = settings.store || new ApexStore()
  apex.actorParam = settings.actorParam
  apex.objectParam = settings.objectParam
  apex.activityParam = settings.activityParam || settings.objectParam
  apex.collectionParam = settings.collectionParam || settings.objectParam
  apex.pageParam = settings.pageParam || 'page'
  apex.itemsPerPage = settings.itemsPerPage || 20
  apex.threadDepth = settings.threadDepth || 10
  apex.systemUser = settings.systemUser
  apex.logger = settings.logger || console
  apex.offlineMode = settings.offlineMode
  apex.requestTimeout = settings.requestTimeout ?? 5000
  apex.utils = {
    usernameToIRI: apex.idToIRIFactory(apex.baseUrl, settings.routes.actor, apex.actorParam),
    objectIdToIRI: apex.idToIRIFactory(apex.baseUrl, settings.routes.object, apex.objectParam),
    activityIdToIRI: apex.idToIRIFactory(apex.baseUrl, settings.routes.activity, apex.activityParam),
    userCollectionIdToIRI: apex.userAndIdToIRIFactory(apex.baseUrl, settings.routes.collections, apex.actorParam, apex.collectionParam),
    nameToActorStreams: apex.nameToActorStreamsFactory(apex.baseUrl, settings.routes, apex.actorParam),
    nameToBlockedIRI: apex.idToIRIFactory(apex.baseUrl, settings.routes.blocked, apex.actorParam),
    nameToRejectedIRI: apex.idToIRIFactory(apex.baseUrl, settings.routes.rejected, apex.actorParam),
    nameToRejectionsIRI: apex.idToIRIFactory(apex.baseUrl, settings.routes.rejections, apex.actorParam),
    idToActivityCollections: apex.idToActivityCollectionsFactory(apex.baseUrl, settings.routes, apex.activityParam),
    iriToCollectionInfo: apex.iriToCollectionInfoFactory(apex.baseUrl, settings.routes, apex.actorParam, apex.activityParam, apex.collectionParam)
  }

  function onFinishedHandler (err, res) {
    if (err) return
    const apexLocal = res.locals.apex
    // execute postWork tasks in sequence (not parallel)
    apexLocal.postWork
      .reduce((acc, task) => acc.then(() => task(res)), Promise.resolve())
      .then(() => {
        if (apexLocal.eventName) {
          res.app.emit(apexLocal.eventName, apexLocal.eventMessage)
        }
      })
      .catch(err => {
        apex.logger.error('post-response error:', err.message)
      })
  }

  return apex
}
