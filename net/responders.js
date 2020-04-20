'use strict'

const assert = require('assert')

module.exports = {
  result,
  target
}

// sends other output as jsonld
async function result (req, res) {
  assert(res.locals.apex.responseType)
  const apex = req.app.locals.apex
  const result = res.locals.apex.result
  if (!result) {
    return res.sendStatus(404)
  }
  const body = JSON.stringify(await apex.pub.utils.toJSONLD(result, apex.context), skipMeta)
  res.type(res.locals.apex.responseType)
  res.status(200).send(body)
}

// sends the target object as jsonld
async function target (req, res) {
  assert(res.locals.apex.responseType)
  const apex = req.app.locals.apex
  const target = res.locals.apex.target
  if (!target) {
    return res.sendStatus(404)
  }
  const body = JSON.stringify(await apex.pub.utils.toJSONLD(target, apex.context), skipMeta)
  res.type(res.locals.apex.responseType)
  res.status(200).send(body)
}

// strip any _meta properties to keeping jsonld valid and not leak private keys
function skipMeta (key, value) {
  if (key === '_meta' || key === '_id') {
    return undefined
  }
  return value
}
