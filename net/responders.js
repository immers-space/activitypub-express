"use strict";

const debug = require("debug")("apex:net:responders");

module.exports = {
  result,
  status,
  target,
};

// sends other output as jsonld
async function result(req, res) {
  debug("result");
  const apex = req.app.locals.apex;
  const locals = res.locals.apex;
  const result = locals.result;
  if (locals.status >= 400) {
    return res.status(locals.status).send(locals.statusMessage || null);
  }
  if (!locals.responseType || !result) {
    return res.sendStatus(404);
  }
  const body = apex.stringifyPublicJSONLD(await apex.toJSONLD(result));
  res.type(res.locals.apex.responseType);
  res.status(target.type === "Tombstone" ? 410 : 200).send(body);
}

function status(req, res) {
  debug("status");
  const locals = res.locals.apex;
  if (locals.createdLocation) {
    res.set("Location", locals.createdLocation);
  }
  res.status(locals.status ?? 400).send(res.locals.apex.statusMessage || null);
}

// sends the target object as jsonld
async function target(req, res) {
  debug("target");
  const apex = req.app.locals.apex;
  const locals = res.locals.apex;
  const target = locals.target;
  if (locals.status >= 400) {
    return res.status(locals.status).send(locals.statusMessage || null);
  }
  if (!locals.responseType || !target) {
    return res.sendStatus(404);
  }
  const body = apex.stringifyPublicJSONLD(await apex.toJSONLD(target));
  res.type(locals.responseType);
  res.status(target.type === "Tombstone" ? 410 : 200).send(body);
}
