'use strict'
const acctReg = /acct:[@~]?([^@]+)@?(.*)/

module.exports = {
  parseWebfinger,
  respondWebfinger
}

async function parseWebfinger (req, res, next) {
  const apex = req.app.locals.apex
  const acct = acctReg.exec(req.query.resource)
  if (!acct || acct.length < 2) {
    return res.status(400).send('Bad request. Please make sure "acct:USER@DOMAIN" is what you are sending as the "resource" query parameter.')
  }
  if (acct[2] && acct[2].toLowerCase() !== apex.domain.toLowerCase()) {
    return res.status(400).send('Requested user is not from this domain')
  }
  // store as actor param for validators.targetActor api
  req.params[apex.actorParam] = acct[1]
  next()
}

function respondWebfinger (req, res, next) {
  const resource = req.query.resource
  const actorObj = res.locals.apex.target
  if (!actorObj) {
    return res.status(404).send(`${resource} not found`)
  }
  return res.json({
    subject: resource,
    links: [{
      rel: 'self',
      type: 'application/activity+json',
      href: actorObj.id
    }]
  })
}
