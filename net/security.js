'use strict'
const httpSignature = require('http-signature')
// http communication middleware
module.exports = {
  requireAuthorized,
  requireAuthorizedOrPublic,
  verifyAuthorization,
  verifySignature
}

function requireAuthorized (req, res, next) {
  const locals = res.locals.apex
  if (!locals.authorized) {
    return res.sendStatus(403)
  }
  return next()
}

function requireAuthorizedOrPublic (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  if (locals.target && !(apex.isPublic(locals.target) || locals.authorized)) {
    return res.sendStatus(403)
  }
  return next()
}

function verifyAuthorization (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  // if not already set, check for PassportJS-style auth
  if (locals.authorizedUserId == null) {
    locals.authorizedUserId = req.user?.username &&
      apex.utils.usernameToIRI(req.user.username)
  }
  // if not already set, check authorization via ownership
  if (locals.authorized == null) {
    locals.authorized = locals.target && locals.authorizedUserId &&
      apex.validateOwner(locals.target, { id: locals.authorizedUserId })
  }
  next()
}

async function verifySignature (req, res, next) {
  const apex = req.app.locals.apex
  try {
    if (!req.get('authorization') && !req.get('signature')) {
      if (req.app.get('env') !== 'development') {
        apex.logger.warn('Request rejected: missing http signature')
        return res.status(401).send('Missing http signature')
      }
      const actor = await apex.resolveObject(apex.actorIdFromActivity(req.body))
      res.locals.apex.sender = actor
      return next()
    }
    const sigHead = httpSignature.parse(req)
    console.log("Signature %j %j", sigHead, req.body)
    const validator = (publicKey) => httpSignature.verifySignature(sigHead, publicKey)
    // check local cache only at first to avoid unnecessary fetches
    let cached = true
    let signer = await apex.resolveObject(sigHead.keyId, false, false, true)
    console.log("Checking for unverifiable delete", signer, req.body.type, req.body.type.toLowerCase() === 'delete', !signer && req.body.type.toLowerCase() === 'delete')
    if (req.body.type.toLowerCase() === 'delete' && (!signer || signer.type.toLowerCase() === 'tombstone')) {
      console.log("unerifiable delete found")
      // user delete message that can't be verified because we don't have the user cached
      return res.status(200).send()
    } else if (!signer) {
      console.log("fetching new actor")
      cached = false
      signer = await apex.resolveObject(sigHead.keyId)
    }
    if (!signer) {
      throw new Error("Could not fetch signer", sigHead.keyId)
    }
    let valid = validator(signer.publicKey[0].publicKeyPem[0])
    if (!valid && cached) {
      console.log("refreshing key")
      // try refreshing cached key in case of key rotation
      signer = await apex.resolveObject(sigHead.keyId, false, true)
      valid = validator(signer.publicKey[0].publicKeyPem[0])
    }
    if (!valid) {
      apex.logger.warn('Request rejected: invalid http signature')
      return res.status(403).send('Invalid http signature')
    }
    res.locals.apex.sender = signer
    next()
  } catch (err) {
    apex.logger.warn('error during signature verification', err)
    return res.status(500).send()
  }
}
