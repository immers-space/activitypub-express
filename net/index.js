'use strict'
// express middleware
const validators = require('./validators')
const security = require('./security')
const activity = require('./activity')

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
      activity.getTargetActor,
      activity.save,
      activity.sideEffects
    ]
  }
}
