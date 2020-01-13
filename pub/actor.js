const crypto = require('crypto')
const { promisify } = require('util')

const pubUtils = require('./utils')

const generateKeyPairPromise = promisify(crypto.generateKeyPair)

module.exports = {
  create
}

function create (name, type) {
  return generateKeyPairPromise('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  }).then(pair => {
    const actorBase = pubUtils.usernameToIRI(name)
    return {
      _meta: {
        privateKey: pair.privateKey
      },
      id: `${actorBase}`,
      type: type,
      following: `${actorBase}/following`,
      followers: `${actorBase}/followers`,
      liked: `${actorBase}/liked`,
      inbox: `${actorBase}/inbox`,
      outbox: `${actorBase}/outbox`,
      preferredUsername: name,
      // name: `${name} group`,
      // summary: `I'm a group about ${name}. Follow me to get all the group posts. Tag me to share with the group. Create other groups by searching for or tagging @yourGroupName@${config.DOMAIN}`,
      // icon: {
      //   type: 'Image',
      //   mediaType: 'image/jpeg',
      //   url: `https://${config.DOMAIN}/f/guppe.png`
      // },
      publicKey: {
        id: `${actorBase}#main-key`,
        owner: `${actorBase}`,
        publicKeyPem: pair.publicKey
      }
    }
  })
}
