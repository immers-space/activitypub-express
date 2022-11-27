# activitypub-express

[![npm](https://img.shields.io/npm/v/activitypub-express)](https://npmjs.com/activitypub-express)
[![npm](https://img.shields.io/npm/dw/activitypub-express)](https://npmjs.com/activitypub-express)
[![Build Status](https://app.travis-ci.com/immers-space/activitypub-express.svg?branch=master)](https://travis-ci.com/github/immers-space/activitypub-express)
[![Coverage Status](https://coveralls.io/repos/github/immers-space/activitypub-express/badge.svg)](https://coveralls.io/github/immers-space/activitypub-express)
[![Matrix](https://img.shields.io/matrix/immers-space:matrix.org?label=Matrix%20chat)](https://matrix.to/#/#immers-space:matrix.org)
[![Open Collective](https://opencollective.com/immers-space/tiers/badge.svg)](https://opencollective.com/immers-space)


Modular implementation of the ActivityPub decentralized social networking protocol,
written for NodeJS as ExpressJS middleware.
Includes a interchangeable storage interface with a default MongoDB implementation.

## Installation

In order for http request signing to function correctly, a patched version of the `http-signature`
library is required. To ensure that the `request` library is using the correct version for its sub-dependency,
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
  inbox: '/u/:actor/inbox',
  outbox: '/u/:actor/outbox',
  followers: '/u/:actor/followers',
  following: '/u/:actor/following',
  liked: '/u/:actor/liked',
  collections: '/u/:actor/c/:id',
  blocked: '/u/:actor/blocked',
  rejections: '/u/:actor/rejections',
  rejected: '/u/:actor/rejected',
  shares: '/s/:id/shares',
  likes: '/s/:id/likes'
}
const apex = ActivitypubExpress({
  name: 'Apex Example',
  version: '1.0.0',
  domain: 'localhost',
  actorParam: 'actor',
  objectParam: 'id',
  activityParam: 'id',
  routes,
  endpoints: {
    proxyUrl: 'https://localhost/proxy'
  }
})
const client = new MongoClient('mongodb://localhost:27017')

app.use(
  express.json({ type: apex.consts.jsonldTypes }),
  express.urlencoded({ extended: true }),
  apex
)
// define routes using prepacakged middleware collections
app.route(routes.inbox)
  .get(apex.net.inbox.get)
  .post(apex.net.inbox.post)
app.route(routes.outbox)
  .get(apex.net.outbox.get)
  .post(apex.net.outbox.post)
app.get(routes.actor, apex.net.actor.get)
app.get(routes.followers, apex.net.followers.get)
app.get(routes.following, apex.net.following.get)
app.get(routes.liked, apex.net.liked.get)
app.get(routes.object, apex.net.object.get)
app.get(routes.activity, apex.net.activityStream.get)
app.get(routes.shares, apex.net.shares.get)
app.get(routes.likes, apex.net.likes.get)
app.get('/.well-known/webfinger', apex.net.webfinger.get)
app.get('/.well-known/nodeinfo', apex.net.nodeInfoLocation.get)
app.get('/nodeinfo/:version', apex.net.nodeInfo.get)
app.post('/proxy', apex.net.proxy.post)
// custom side-effects for your app
app.on('apex-outbox', msg => {
  if (msg.activity.type === 'Create') {
    console.log(`New ${msg.object.type} from ${msg.actor}`)
  }
})
app.on('apex-inbox', msg => {
  if (msg.activity.type === 'Create') {
    console.log(`New ${msg.object.type} from ${msg.actor} to ${msg.recipient}`)
  }
})

client.connect()
  .then(() => {
    apex.store.db = client.db('DB_NAME')
    return apex.store.setup()
  })
  .then(() => {
    app.listen(port, () => console.log(`apex app listening on port ${port}`))
  })
```

## API

### ActivitypubExpress initializer

Configures and returns an express middleware function that must be added to the route
before any other apex middleware. It needs to be configured with the routes you will use
in order to correctly generate IRIs and actor profiles

```
const ActivitypubExpress = require('activitypub-express')
const apex = ActivitypubExpress(options)
app.use(apex)
```

Option | Description
--- | ---
**Required** |
name | String. Name of your app to list in nodeinfo
version | String. Version of your app to list in nodeinfo
domain | String. Hostname for your app
actorParam | String. Express route parameter used for actor name
objectParam | String. Express route parameter used for object id
routes | Object. The routes your app uses for ActivityPub endpoints (including parameter). Details below
routes.actor | Actor profile route & IRI pattern
routes.object | Object retrieval route & IRI pattern
routes.activity | Activity retrieval route & IRI pattern
routes.inbox | Actor inbox route
routes.outbox | Actor outbox route
routes.following | Actor following collection route
routes.followers | Actor followers collection route
routes.liked | Actor liked collection route
routes.blocked | Actor's blocklist
routes.rejected | Activities rejected by actor
routes.rejections | Actor's activities that were rejected by recipient
routes.shares | Activity shares collection route
routes.likes | Activity likes collection route
routes.collections | Actors' miscellaneous collections route (must include `actorParam` and `collectionParam`)
**Optional** |
activityParam | String. Express route parameter used for activity id (defaults to `objectParam`)
collectionParam | String. Express route parameter used for collection id (defaults to `objectParam`)
pageParam | String. Query parameter used for collection page identifier (defaults to `page`)
itemsPerPage | Number. Count of items in each collection page (default `20`)
context | String, Object, Array. JSON-LD context(s) to use with your app in addition to the base AcivityStreams + Security vocabs
endpoints | Object. Optional system-wide api endpoint URLs included in [actor objects](https://www.w3.org/TR/activitypub/#actor-objects): `proxyUrl`, `oauthAuthorizationEndpoint`, `oauthTokenEndpoint`, `provideClientKey`, `signClientKey`, `sharedInbox`, `uploadMedia`
logger | Object with `info`, `warn`, `error` methods to replace `console`
store | Replace the default storage model & database backend with your own (see `store/interface.js` for API)
threadDepth | Controls how far up apex will follow links in incoming activities in order to display the conversation thread & check for inbox forwarding needs  (default 10)
systemUser | Actor object representing system and used for signing GETs (see below)
offlineMode | Disable delivery. Useful for running migrations and queueing deliveries to be sent when app is running
requestTimeout | Timeout for requests to other servers, ms (default 5000)
openRegistrations | Advertise via nodeinfo if an instance allows instant registration (default false)
nodeInfoMetadata | Object of additional data to provde in nodeinfo reponses

Blocked, rejections, and rejected: these routes must be defined in order to track
these items internally for each actor, but they do not need to be exposed endpoints
(and probably should not be public even then)

### System User / GET authentication

Some federated apps may require http signature authentication on GET requests.
To enable this functionality, set the `systemUser` property on your apex instance
equal to an actor created with `createActor` (generally of type 'Service')
and saved to your object store.
Its keys will be used to sign all federated object retrieval requests.
This property can be set after initializing your apex instance, as
you will need access to the `createActor` method and a database connection.

```
const ActivitypubExpress = require('activitypub-express')
const apex = ActivitypubExpress(options)
// ... connect to db
apex.createActor('system-user', 'System user', '', null, 'Service')
  .then(async actor => {
    await apex.store.saveObject(actor)
    apex.systemUser = actor
  })
```

## FAQ

Q: How do I resolve this error seen when receiving/delivering activities or running the federation tests: `Uncaught exception: InvalidHeaderError: bad param format`

A: Run `npm dedupe` to ensure that the `request` library is using the patched version of the `http-signature` library.

## Implementation status

* [ ] Shared server- & client-to-server
  * [x] Inbox GET
  * [x] Outbox GET
  * [ ] Shared inbox GET
  * [x] Resource GET
    * [x] Object
    * [x] Actor
    * [x] Activity
    * [x] Collections
      * [x] Special collections
        * [x] Inbox
        * [x] Outbox
        * [x] Followers
        * [x] Following
        * [x] Liked
        * [x] Likes
        * [x] Shares
      * [x] Misc collections (of activities)
      * [x] Pagination
    * [x] Relay requests for remote objects
    * [x] Response code 410 for Tombstones
  * [x] Security
    * [x] Permission-based filtering
* [ ] Server-to-server
  * [x] Inbox POST
    * [x] Activity side-effects
      * [x] Create
      * [x] Update
      * [x] Delete
      * [x] Follow
      * [x] Accept
      * [x] Reject[*](#implementation-notes)
      * [x] Add[*](#implementation-notes)
      * [x] Remove[*](#implementation-notes)
      * [x] Like
      * [x] Announce
      * [x] Undo
      * [x] Other acivity types
    * [x] Security
      * [x] Signature validation
      * [x] Honor recipient blocklist
    * [x] Recursive resolution of related objects
    * [x] Forwarding from inbox
  * [ ] Shared inbox POST
    * [ ] Delivery to targeted local inboxes
  * [x] Delivery
    * [x] Request signing
    * [x] Addressing
      * [x] Shared inbox optmization
      * [ ] Direct delivery to local inboxes
    * [x] Redelivery attempts
* [ ] Client-to-server
  * [x] Outbox POST
    * [x] Auto-Create for bare objects
    * [x] Activity side-effects
      * [x] Create
      * [x] Update
      * [x] Delete
      * [x] Follow
      * [x] Accept
      * [x] Reject
      * [x] Add
      * [x] Remove
      * [x] Like
      * [x] Block[*](#implementation-notes)
      * [x] Undo
      * [x] Other acivity types
  * [ ] Media upload
* [ ] Other
  * [x] Actor creation
    * [x] Key generation
  * [x] Security
    * [x] Verification
    * [x] localhost block
    * [x] Recursive object resolution depth limit
  * [ ] Related standards
    * [x] http-signature
    * [x] webfinger
    * [x] json-ld
      * [x] Context cache
    * [x] nodeinfo
    * [ ] Linked data signatures
  * [x] Storage model (denormalized MongoDB)
    * [ ] Index coverage for all queries
    * [ ] Fully interchangeable with documented API

### Implementation notes

* `actor.streams` miscellaneous collections: Add/Remove activities create custom collections
on the fly using the id scheme in `routes.collections`, but these are not publicized by default.
To make a custom collection public, you'll need to publish Updates to the collection object with each Add/Remove. However, for those updates to be verified, the actor must demonstrate ownership
by adding the collection id as a property value in `actor.streams` (and publishing the actor object update)

* Addressing collections: in addition to followers, apex can also address to miscellaneous
collections. It will add actors from the actor and/or object fields of each activity in the
collection to the audience.

* Inbox Add/Remove: I don't see a general purpose
(i.e. a remote actor being able to modify local collections);
specific uses can be added in the implementation via the event handler.

* Reject: Activity is added to the actor's rejected (outbox) or rejection (inbox) collection.
If the object is a Follow that was previously accepted, this will also remove it from
the followers (outbox) or following (inbox) collection.

* Block: Activity is added to the actor's blocked collection.
Per spec, future activities from blocked actors will be silently ignored.
Additionally, past activities will be filtered from display in the inbox and followers
collections, but they are not permanently deleted, so they would re-appear after undo of block.

* Rate limits: not included in `activitpub-express`; should be handled in the specific implementation

* Content sanitization: the apex default store will sanitize for storage in MongoDB,
but display sanitization is not included in `activitpub-express`.
This should be handled in the specific implementation

* Authorization: the prepacked GET middlewares will only return items that are
publicly addressed unless the request is authorized.
**Determining the requesting user**: By default, apex will check for
[PassportJS](http://www.passportjs.org/)-style authentication,
where `request.user.username` has the `preferredUsername` of the authorized actor.
Override this by setting `response.locals.apex.authorizedUserId` to an actor IRI.
**Determining authorization**: By default, a request is considered authorized
if the `authorizedUserId` is the item's owner.
Override this by setting `response.locals.apex.authorized` to `true` (allow) or `false` (deny)

* Client-to-server unfollow and unblock:
to remove an actor from followers, following, or blocked, an "Undo" must be sent with
the object being the prior outgoing Follow/Accept/Block. As these past activity ids are
not readily available to clients, the client may send the undo (unfollow/unblock) or
reject (remove from followers) with an Actor IRI as
the object, and the server will find the related Follow/Accept/Block and substitute it before publishing.

### Federation notes

* **http signatures**
  * In production mode, incoming POST requests without valid http signatures will be
  rejected (401 if missing, 403 if invalid)
  * Outoing POST requests are signed ('(request-target)', 'host', 'date', 'digest')
  with the actor's keypair using the `Signature` header
  * When using the `systemUser` config option, outgoing GET requests are signed
  ('(request-target)', 'host', 'date') with the system user's keypair using the
  `Signature` header
* **Synchronizing collections**
  * An apex server does not modify collections that belong to other servers
   and does not expect other servers to maintain the state of its collections.
  * Instead, an Update activity is published whenever the content of
  a collection changes.
  * If it is an actor collection (e.g. followers), the Update
  object will be the `OrderedCollection` itself. Other servers can verify ownership
  by checking that the `Actor` object of the sender contains a reference to
  the collection.
  * If it is an activity collection (likes/shares), the Update object
  will be the activity itself with the collection objects embedded.
