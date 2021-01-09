'use strict'

module.exports = {
  result,
  status,
  target
}

// sends other output as jsonld
async function result (req, res) {
  const apex = req.app.locals.apex
  const resLocal = res.locals.apex
  const result = resLocal.result
  if (!resLocal.responseType || !result) {
    return res.sendStatus(404)
  }
  const body = apex.stringifyPublicJSONLD(await apex.toJSONLD(result))
  res.type(res.locals.apex.responseType)
  res.status(target.type === 'Tombstone' ? 410 : 200).send(body)
}

function status (req, res) {
  res.status(res.locals.apex.status || 400)
    .send(res.locals.apex.statusMessage || null)
}

// sends the target object as jsonld
async function target (req, res) {
  const apex = req.app.locals.apex
  const target = res.locals.apex.target
  if (!res.locals.apex.responseType || !target) {
    return res.sendStatus(404)
  }
  const body = apex.stringifyPublicJSONLD(await apex.toJSONLD(target))
  res.type(res.locals.apex.responseType)
  res.status(target.type === 'Tombstone' ? 410 : 200).send(body)
}
