const { MongoClient } = require('mongodb')
const express = require('express')
const ActivitypubExpress = require('../../index')

global.initApex = async function initApex () {
  const routes = {
    actor: '/u/:actor',
    object: '/o/:id',
    activity: '/s/:id',
    inbox: '/inbox/:actor',
    outbox: '/outbox/:actor',
    followers: '/followers/:actor',
    following: '/following/:actor',
    liked: '/liked/:actor',
    shares: '/s/:id/shares',
    likes: '/s/:id/likes',
    collections: '/u/:actor/c/:id',
    blocked: '/u/:actor/blocked',
    rejections: '/u/:actor/rejections',
    rejected: '/u/:actor/rejected'
  }
  const app = express()
  const apex = ActivitypubExpress({
    domain: 'localhost',
    context: [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1'
    ],
    actorParam: 'actor',
    objectParam: 'id',
    activityParam: 'id',
    routes
  })

  app.use(express.json({ type: apex.consts.jsonldTypes }), apex)
  app.use(function (err, req, res, next) {
    console.log(err)
    next(err)
  })

  const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true, useNewUrlParser: true })
  await client.connect({ useNewUrlParser: true })
  apex.store.db = client.db('apexTestingTempDb')
  const testUser = await apex.createActor('test', 'test', 'test user')

  return { app, apex, client, testUser, routes }
}

global.resetDb = async function (apex, client, testUser) {
  // reset db for each test
  await client.db('apexTestingTempDb').dropDatabase()
  apex.store.db = client.db('apexTestingTempDb')
  delete testUser._local
  await apex.store.setup(testUser)
  testUser._local = { blockList: [] }
}
