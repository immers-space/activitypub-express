const assert = require('assert')

module.exports = {
  respondActor
}

async function respondActor (req, res, next) {
  assert(res.locals.apex.target)
  const actor = res.locals.apex.target
  const apex = req.app.locals.apex
  delete actor._meta // double check we don't send private keys
  res.status(200).send(await apex.pub.utils.toJSONLD(actor, apex.context))
}
