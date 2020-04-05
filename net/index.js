'use strict'
// express middleware
const validators = require('./validators')
const security = require('./security')
const activity = require('./activity')
const collection = require('./collection')

module.exports = {
  validators,
  security,
  activity,
  // meta - colletions of middleware to complete activitypub actions
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
      validators.targetActor,
      validators.outboxActivity,
      activity.save,
      activity.outboxSideEffects
    ],
    get: [
      validators.jsonld,
      validators.targetActor,
      collection.outbox
    ]
  }
}
