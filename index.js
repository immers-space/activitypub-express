'use strict'
const onFinished = require('on-finished')
const pub = require('./pub')
const net = require('./net')
const defaultStore = require('./store')

function onFinishedHandler (err, res) {
  if (err) return
  const apexLocal = res.__apexLocal
  Promise.all(apexLocal.postWork.map(task => task.call(res)))
    .then(() => {
      if (apexLocal.eventName) {
        res.app.emit(apexLocal.eventName, apexLocal.eventMessage)
      }
    })
    .catch(err => console.error('post-response error:', err.message))
}

module.exports = function (settings) {
  const apex = function (req, res, next) {
    req.__apex = apex // apex api object
    // temp request-level storage
    req.__apexLocal = {}
    res.__apexLocal = {
      eventName: null,
      eventMessage: {},
      postWork: []
    }
    onFinished(res, onFinishedHandler)
    next()
  }
  apex.settings = settings
  apex.domain = settings.domain
  apex.pub = pub
  apex.net = net
  apex.store = settings.store || defaultStore
  apex.actorParam = settings.actorParam
  apex.utils = {
    usernameToIRI: pub.utils.idToIRIFactory(settings.domain, settings.routes.actor, settings.actorParam),
    objectIdToIRI: pub.utils.idToIRIFactory(settings.domain, settings.routes.object, settings.objectParam),
    activityIdToIRI: pub.utils.idToIRIFactory(settings.domain, settings.routes.activity, settings.activityParam)
  }
  return apex
}
