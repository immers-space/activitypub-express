# activitypub-express

[![Build Status](https://travis-ci.org/wmurphyrd/activitypub-express.svg?branch=master)](https://travis-ci.org/wmurphyrd/activitypub-express)

Modular implementation of the ActivityPub decentralized social networking protocol,
written for NodeJS as ExpressJS middleware.
Includes a interchangable storage interface with a default MongoDB implemenation.

## Installation

In order for http request signing to function correctly, a patched version of the `http-signature`
library is required. To ensure that `request` library is using the correct version for its subdependency,
you may need to dedupe after installation.

```
npm install --save activitypub-express
npm dedupe
```

## Usage

```js
const express = require('express')
const { MongoClient } = require('mongodb')
const ActivitypubExpress = require('activitypub-express')

const port = 8080
const app = express()
const routes = {
  actor: '/u/:actor',
  object: '/o/:id',
  activity: '/s/:id',
  inbox: '/inbox/:actor',
  outbox: '/outbox/:actor'
}
const apex = ActivitypubExpress({
  domain: 'localhost',
  actorParam: 'actor',
  objectParam: 'id',
  activityParam: 'id',
  routes
})
const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true, useNewUrlParser: true })

app.use(express.json({ type: apex.pub.consts.jsonldTypes }), apex)
// define routes using prepacakged middleware collections
app.get(routes.inbox, apex.net.inbox.get)
app.post(routes.inbox, apex.net.inbox.post)
app.get(routes.outbox, apex.net.outbox.get)
app.post(routes.outbox, apex.net.outbox.post)
app.get('/.well-known/webfinger', apex.net.webfinger)
// custom side-effects for your app
app.on('apex-create', msg => {
  console.log(`New ${msg.object.type} from ${msg.actor} to ${msg.recipient}`)
})

client.connect({ useNewUrlParser: true })
  .then(() => {
    apex.store.connection.setDb(client.db('DB_NAME'))
    return apex.store.setup()
  })
  .then(() => {
    app.listen(port, () => console.log(`apex app listening on port ${port}`))
  })
```

## Implementation status

* [ ] Shared server- & client-to-server
  * [x] Inbox GET
  * [x] Outbox GET
  * [ ] Resource GET
    * [ ] Object & Actor
    * [ ] Activity
    * [ ] Collection
      * [ ] Pagination
    * [ ] Relay requests for remote objets
  * [ ] Security
    * [ ] Permission-based filtering
* [ ] Server-to-server
  * [x] Inbox POST
    * [x] Activity side-effects
      * [x] Create
      * [ ] Update
      * [ ] Delete
      * [ ] Follow
      * [ ] Accept
      * [ ] Reject
      * [ ] Add
      * [ ] Remove
      * [ ] Like
      * [ ] Announce
      * [x] Undo
      * [x] Other acivity types
    * [x] Security
      * [x] Signature validation
  * [x] Delivery
    * [x] Request signing
    * [x] Addressing
    * [ ] Redelivery attempts
* [ ] Client-to-server
  * [x] Outbox POST
    * [x] Auto-Create for bare objects
    * [ ] Activity side-effects
      * [x] Create
      * [ ] Update
      * [ ] Delete
      * [ ] Follow
      * [ ] Add
      * [ ] Remove
      * [ ] Like
      * [ ] Block
      * [ ] Undo
      * [x] Other acivity types
* [ ] Other
  * [x] Actor creation
    * [x] Key generation
  * [ ] Security
    * [ ] Verification
    * [ ] Rate limits
    * [ ] localhost block
    * [ ] Content sanitization
  * [ ] Related standards
    * [x] https-signature
    * [x] webfinger
    * [ ] oauth
    * [x] json-ld
      * [ ] Context cache
  * [x] Storage model (denormalized MongoDB)
    * [ ] Index coverage for all common queries
    * [ ] Fully interchangable with documented API


## API

### ActivitypubExpress initializer

Configures and returns an express middleware function that must be added to the route
before any other apex midddleware. It needs to be configured with the routes you will use
in order to correctly generate IRI's and actor profiles

```
const ActivitypubExpress = require('activitypub-express')
const apex = ActivitypubExpress(options)
app.use(apex)
```

Option | Description
--- | ---
**Required** |
domain | String. Hostname for your app
actorParam | String. Express route parameter used for actor name
objectParam | String. Express route parameter used for object id
activityParam | String. Express route parameter used for activity id
routes | Object. The routes your app uses for ActivityPub endpoints (including parameter). Details below
routes.actor | Actor profile route & IRI pattern
routes.object | Object retrieval route & IRI pattern
routes.activity | Activity retrieval route & IRI pattern
routes.inbox | Actor inbox route
routes.outbox | Actor outbox route
routes.following | Actor following collection route
routes.followers | Actor followers collection route
routes.liked | Actor liked collection route
**Optional** |
context | String, Array. JSON-LD context for your app. Defaults to AcivityStreams + Security vocabs
store | Not fully implemented - replace the default storage model & database backend with your own
