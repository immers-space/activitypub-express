const crypto = require('crypto')
const { promisify } = require('util')

const generateKeyPairPromise = promisify(crypto.generateKeyPair)

module.exports = {
  createActor
}

async function createActor (username, displayName, summary, icon, type = 'Person') {
  username = username.toLowerCase()
  const id = this.utils.usernameToIRI(username)
  const routes = this.utils.nameToActorStreams(username)
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
  actor = await this.fromJSONLD(actor)
  actor._meta = { privateKey: pair.privateKey, blocked: routes.blocked }
  return actor
}
