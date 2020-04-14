const crypto = require('crypto')
const { promisify } = require('util')

const pubUtils = require('./utils')

const generateKeyPairPromise = promisify(crypto.generateKeyPair)

module.exports = {
  create
}

async function create (context, id, routes, username, displayName, summary, icon, type = 'Person') {
  const pair = await generateKeyPairPromise('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  })
  let actor = {
    id,
    type,
    following: routes.following,
    followers: routes.followers,
    liked: routes.liked,
    inbox: routes.inbox,
    outbox: routes.outbox,
    preferredUsername: username,
    name: displayName,
    summary,
    publicKey: {
      id: `${id}#main-key`,
      owner: id,
      publicKeyPem: pair.publicKey
    }
  }
  if (icon) {
    actor.icon = icon
  }
  actor = await pubUtils.fromJSONLD(actor, context)
  actor._meta = { privateKey: pair.privateKey }
  return actor
}
