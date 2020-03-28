# activitypub-express

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
const apex = ActivitypubExpress({
  domain: 'localhost'
})
const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true, useNewUrlParser: true })

app.use(express.json({ type: apex.pub.consts.jsonldTypes }), apex)
// define routes using prepacakged middleware collections
app.post('/inbox/:actor', apex.net.inbox.post)
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
  * [ ] Outbox GET
  * [ ] Resource GET
    * [ ] Object & Actor
    * [ ] Activity
    * [ ] Collection
      * [ ] Pagination
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
    * [x] Security
      * [x] Signature validation
  * [ ] Delivery
    * [ ] Request signing
    * [ ] Addressing
    * [ ] Redelivery attempts
* [ ] Client-to-server
  * [ ] Outbox POST
    * [ ] Activity side-effects
      * [ ] Create
      * [ ] Update
      * [ ] Delete
      * [ ] Follow
      * [ ] Add
      * [ ] Remove
      * [ ] Like
      * [ ] Block
      * [ ] Undo
    * [ ] Security
      * [ ] Authorization
* [ ] Other
  * [ ] Security
    * [ ] Authentication
  * [ ] Related standards
    * [x] https-signature
    * [ ] webfinger
    * [ ] oauth
