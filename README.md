# activitypub-express

Modular implementation of the ActivityPub decentralized social networking protocol,
written for NodeJS as ExpressJS middleware.
Includes a interchangable storage interface with a default MongoDB implemenation.

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
  * [ ] Outbox GET
    * [ ] Security
      * [ ] Permission-based filtering
  * [ ] Resource GET
    * [ ] Object & Actor
    * [ ] Activity
    * [ ] Collection
* [ ] Client-to-server
  * [x] Inbox GET
    * [ ] Security
      * [ ] Permission-based filtering
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
    * [ ] Delivery
      * [ ] Request signing
      * [ ] Addressing
      * [ ] Redelivery attempts
* [ ] Other
  * [ ] Security
    * [ ] Authentication and authorization
  * [ ] Related standards
    * [x] https-signature
    * [ ] webfinger
    * [ ] oauth


