const assert = require('assert')

module.exports = {
  respondActor,
  respondObject
}

async function respondActor (req, res) {
  assert(res.locals.apex.target)
  assert(res.locals.apex.responseType)
  const actor = res.locals.apex.target
  const apex = req.app.locals.apex
  delete actor._meta // double check we don't send private keys
  res.set('Content-Type', res.locals.apex.responseType)
  res.status(200).send(await apex.pub.utils.toJSONLD(actor, apex.context))
}

async function respondObject (req, res) {
  assert(res.locals.apex.targetObject)
  assert(res.locals.apex.responseType)
  const apex = req.app.locals.apex
  const obj = res.locals.apex.targetObject
  res.set('Content-Type', res.locals.apex.responseType)
  res.json(await apex.pub.utils.toJSONLD(obj, apex.context))
}
