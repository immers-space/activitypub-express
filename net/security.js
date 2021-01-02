'use strict'
const httpSignature = require('http-signature')
// http communication middleware
module.exports = {
  verifyActor,
  verifySignature
}

function verifyActor (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  const actor = apex.actorIdFromActivity(req.body)
  if (locals.sender && locals.sender.id === actor) {
    locals.verified = true
  }
  // TODO: LD-signatures verification and/or check for valid inbox forwarding cases
}

async function verifySignature (req, res, next) {
  try {
    const apex = req.app.locals.apex
    // support for apps not using signature extension to ActivityPub
    if (!req.get('authorization') && !req.get('signature')) {
      const actor = await apex.resolveObject(apex.actorIdFromActivity(req.body))
      if (actor.publicKey && req.app.get('env') !== 'development') {
        apex.logger.warn('Request rejected: missing http signature')
        return res.status(400).send('Missing http signature')
      }
      res.locals.apex.sender = actor
      return next()
    }
    const sigHead = httpSignature.parse(req)
    const signer = await apex.resolveObject(sigHead.keyId)
    const valid = httpSignature.verifySignature(sigHead, signer.publicKey[0].publicKeyPem[0])
    if (!valid) {
      apex.logger.warn('Request rejected: invalid http signature')
      return res.status(403).send('Invalid http signature')
    }
    res.locals.apex.sender = signer
    next()
  } catch (err) {
    if (req.body.type.toLowerCase() === 'delete' && /^(410|404)/.test(err.message)) {
      // user delete message that can't be verified because we don't have the user cached
      return res.status(200).send()
    }
    this.logger.warn('error during signature verification', err.message)
    return res.status(500).send()
  }
}
