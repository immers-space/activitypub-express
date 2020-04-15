'use strict'
// express middleware
const validators = require('./validators')
const security = require('./security')
const activity = require('./activity')
const collection = require('./collection')
const object = require('./object')
const wellKnown = require('./well-known')

module.exports = {
  validators,
  security,
  activity,
  wellKnown,
  // meta - colletions of middleware to complete activitypub actions
  actor: {
    get: [validators.jsonld, validators.targetActor, object.respondActor]
  },
  inbox: {
    post: [
      validators.jsonld,
      validators.activity,
      security.verifySignature,
      validators.targetActor,
      activity.setTargetActor,
      activity.save,
      activity.inboxSideEffects
    ],
    get: [
      validators.jsonld,
      validators.targetActor,
      collection.inbox
    ]
  },
  outbox: {
    post: [
      validators.jsonld,
      validators.targetActorWithMeta,
      validators.outboxActivity,
      activity.save,
      activity.outboxSideEffects
    ],
    get: [
      validators.jsonld,
      validators.targetActor,
      collection.outbox
    ]
  },
  webfinger: [
    wellKnown.parseWebfinger,
    validators.targetActor,
    wellKnown.respondWebfinger
  ]
}
