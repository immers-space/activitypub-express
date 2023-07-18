'use strict'

module.exports = {
  result,
  status,
  target
}

// sends other output as jsonld
async function result (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  const result = locals.result
  if (locals.status >= 400) {
    return res.status(locals.status)
      .send(locals.statusMessage || null)
  }
  if (!locals.responseType || !result) {
    return next()
  }
  const body = apex.stringifyPublicJSONLD(await apex.toJSONLD(result))
  res.type(res.locals.apex.responseType)
  res.status(target.type === 'Tombstone' ? 410 : 200).send(body)
}

function status (req, res) {
  const locals = res.locals.apex
  if (locals.createdLocation) {
    res.set('Location', locals.createdLocation)
  }
  res.status(locals.status ?? 400)
    .send(res.locals.apex.statusMessage || null)
}

// sends the target object as jsonld
async function target (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  const target = locals.target
  if (locals.status >= 400) {
    return res.status(locals.status)
      .send(locals.statusMessage || null)
  }
  if (!locals.responseType || !target) {
    return next()
  }
  const body = apex.stringifyPublicJSONLD(await apex.toJSONLD(target))
  res.type(locals.responseType)
  res.status(target.type === 'Tombstone' ? 410 : 200).send(body)
}
