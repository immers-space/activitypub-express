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
  responders,
  security,
  activity,
  collection,
  wellKnown,
  // meta - colletions of middleware to complete activitypub actions
  activityStream: {
    get: [validators.jsonld, validators.targetActivity, responders.target]
  },
  actor: {
    get: [validators.jsonld, validators.targetActor, responders.target]
  },
  blocked: {
    get: [validators.jsonld, validators.targetActor, collection.blocked, responders.result]
  },
  collections: {
    get: [validators.jsonld, validators.targetActor, collection.added, responders.result]
  },
  followers: {
    get: [
      validators.jsonld,
      validators.targetActorWithMeta,
      collection.followers,
      responders.result
    ]
  },
  following: {
    get: [
      validators.jsonld,
      validators.targetActor,
      collection.following,
      responders.result
    ]
  },
  inbox: {
    post: [
      validators.jsonld,
      validators.targetActorWithMeta,
      security.verifySignature,
      validators.actor,
      validators.activityObject,
      validators.inboxActivity,
      activity.save,
      activity.inboxSideEffects,
      responders.status
    ],
    get: [
      validators.jsonld,
      validators.targetActorWithMeta,
      collection.inbox,
      responders.result
    ]
  },
  liked: {
    get: [
      validators.jsonld,
      validators.targetActor,
      collection.liked,
      responders.result
    ]
  },
  shares: {
    get: [
      validators.jsonld,
      validators.targetActivity,
      collection.shares,
      responders.result
    ]
  },
  likes: {
    get: [
      validators.jsonld,
      validators.targetActivity,
      collection.likes,
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
      validators.outboxCreate,
      validators.outboxActivityObject,
      validators.outboxActivity,
      activity.save,
      activity.outboxSideEffects,
      responders.status
    ],
    get: [
      validators.jsonld,
      validators.targetActor,
      collection.outbox,
      responders.result
    ]
  },
  rejected: {
    get: [validators.jsonld, validators.targetActor, collection.rejected, responders.result]
  },
  rejections: {
    get: [validators.jsonld, validators.targetActor, collection.rejections, responders.result]
  },
  webfinger: {
    get: [
      wellKnown.parseWebfinger,
      validators.targetActor,
      wellKnown.respondWebfinger
    ]
  }
}
