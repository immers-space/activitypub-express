'use strict'
const acctReg = /acct:[@~]?([^@]+)@?(.*)/

module.exports = {
  respondNodeInfo,
  respondNodeInfoLocation,
  parseWebfinger,
  respondWebfinger
}

async function respondNodeInfo (req, res, next) {
  const apex = req.app.locals.apex
  try {
    const version = req.params.version || '2.1'
    if (version[0] !== '2') {
      return res.status(404).send('Only nodeinfo 2.x supported')
    }
    res.json(await apex.generateNodeInfo(version))
  } catch (err) {
    console.error('Error generating nodeInfo', err.message)
    res.sendStatus(500)
  }
}

function respondNodeInfoLocation (req, res, next) {
  const apex = req.app.locals.apex
  res.json({
    links: [
      {
        rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
        href: `https://${apex.domain}/nodeinfo/2.1`
      },
      {
        rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0',
        href: `https://${apex.domain}/nodeinfo/2.0`
      }
    ]
  })
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
