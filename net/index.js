'use strict'
// express middleware
const validators = require('./validators')
const responders = require('./responders')
const security = require('./security')
const activity = require('./activity')
const collection = require('./collection')
const wellKnown = require('./well-known')

module.exports = {
  validators,
  security,
  activity,
  wellKnown,
  // meta - colletions of middleware to complete activitypub actions
  activityStream: {
    get: [validators.jsonld, validators.targetActivity, responders.target]
  },
  actor: {
    get: [validators.jsonld, validators.targetActor, responders.target]
  },
  inbox: {
    post: [
      validators.jsonld,
      validators.targetActor,
      validators.inboxActivity,
      security.verifySignature,
      activity.save,
      activity.inboxSideEffects,
      responders.ok
    ],
    get: [
      validators.jsonld,
      validators.targetActor,
      collection.inbox,
      responders.result
    ]
  },
  object: {
    get: [validators.jsonld, validators.targetObject, responders.target]
  },
  outbox: {
    post: [
      validators.jsonld,
      validators.targetActorWithMeta,
      validators.outboxActivity,
      activity.save,
      activity.outboxSideEffects,
      responders.ok
    ],
    get: [
      validators.jsonld,
      validators.targetActor,
      collection.outbox,
      responders.result
    ]
  },
  webfinger: {
    get: [
      wellKnown.parseWebfinger,
      validators.targetActor,
      wellKnown.respondWebfinger
    ]
  }
}
