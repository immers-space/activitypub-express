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
  const body = JSON.stringify(await apex.toJSONLD(result), skipMeta)
  res.type(res.locals.apex.responseType)
  res.status(200).send(body)
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
  const body = JSON.stringify(await apex.toJSONLD(target), skipMeta)
  res.type(res.locals.apex.responseType)
  res.status(200).send(body)
}

// strip any _meta properties to keep jsonld valid and not leak private keys
function skipMeta (key, value) {
  if (key === '_meta' || key === '_id') {
    return undefined
  }
  return value
}
