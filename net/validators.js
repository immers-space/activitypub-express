"use strict";

const debug = require("debug")("apex:net:validators");

module.exports = {
  activityObject,
  actor,
  inboxActivity,
  jsonld,
  outboxActivity,
  outboxActivityObject,
  outboxCreate,
  targetActivity,
  targetActor,
  targetActorWithMeta,
  targetObject,
  targetProxied,
};

const needsResolveObject = ["block", "create", "follow"];
const needsResolveActivity = [
  "accept",
  "add",
  "announce",
  "like",
  "reject",
  "remove",
];
const needsLocalActivity = ["undo"];
const needsLocalObject = ["delete"];
const obxNeedsLocalObject = ["delete", "update"];
const needsInlineObject = ["update"];
const obxNeedsInlineObject = ["create"];
const requiresObject = ["create", "delete", "follow", "update"];
const requiresActivityObject = [
  "add",
  "accept",
  "announce",
  "like",
  "reject",
  "remove",
];
const obxRequiresActivityObject = [
  "add",
  "accept",
  "announce",
  "like",
  "reject",
  "remove",
  "undo",
];
const requiresObjectOwnership = ["delete", "undo", "update"];
const requiresTarget = ["add", "remove"];

function activityObject(req, res, next) {
  debug("activityObject");
  const apex = req.app.locals.apex;
  const resLocal = res.locals.apex;
  const activity = req.body;
  let object;
  if (!apex.validateActivity(activity)) return next();

  const type = req.body.type.toLowerCase();
  if (needsResolveObject.includes(type) && activity.object) {
    object = apex.resolveObject(activity.object[0], true);
  } else if (needsResolveActivity.includes(type) && activity.object) {
    object = apex.resolveActivity(activity.object[0], true);
  } else if (needsLocalActivity.includes(type)) {
    object = apex.store.getActivity(apex.objectIdFromActivity(activity), true);
  } else if (needsLocalObject.includes(type)) {
    object = apex.store.getObject(apex.objectIdFromActivity(activity), true);
  } else if (
    needsInlineObject.includes(type) &&
    apex.validateObject(activity.object)
  ) {
    object = activity.object[0];
  }
  Promise.resolve(object)
    .then((obj) => {
      resLocal.object = obj;
      next();
    })
    .catch(next);
}

// confirm activity actor is sender and not blocked
// TODO: alternative authorization via JSON-LD signatures for forwarding
function actor(req, res, next) {
  debug("actor");
  if (!res.locals.apex.sender || !res.locals.apex.target) return next();
  const apex = req.app.locals.apex;
  const resLocal = res.locals.apex;
  if (req.body.actor) {
    const actorId = apex.actorIdFromActivity(req.body);
    if (resLocal.target._local.blockList.includes(actorId)) {
      // skip processing, but don't inform blockee
      resLocal.status = 200;
      return next();
    }
    return apex
      .resolveObject(actorId)
      .then((actor) => {
        if (actor.id === resLocal.sender.id) {
          resLocal.actor = actor;
        }
        next();
      })
      .catch(next);
  }
  next();
}

function inboxActivity(req, res, next) {
  debug("inboxActivity");
  if (!res.locals.apex.target || !res.locals.apex.actor) return next();
  const apex = req.app.locals.apex;
  const resLocal = res.locals.apex;
  const activity = req.body;
  const object = resLocal.object;
  const actor = resLocal.actor;
  const recipient = resLocal.target;
  const tasks = [];
  if (!apex.validateActivity(activity)) {
    resLocal.status = 400;
    resLocal.statusMessage = "Invalid activity";
    return next();
  }
  // aditional validation for specific activites
  const type = activity.type.toLowerCase();
  if (requiresActivityObject.includes(type) && !apex.validateActivity(object)) {
    resLocal.status = 400;
    resLocal.statusMessage = `Activity type object requried for ${activity.type} activity`;
    return next();
  }
  if (requiresObject.includes(type) && !apex.validateObject(object)) {
    resLocal.status = 400;
    resLocal.statusMessage = `Object requried for ${activity.type} activity`;
    return next();
  }
  if (
    requiresObjectOwnership.includes(type) &&
    object &&
    !apex.validateOwner(object, actor)
  ) {
    resLocal.status = 403;
    return next();
  }
  if (type === "update") {
    if (apex.validateActivity(object)) {
      // update activity collection info
      tasks.push(apex.embedCollections(object));
    }
  } else if (type === "delete" && object) {
    if (apex.validateActivity(object)) {
      resLocal.status = 400;
      resLocal.statusMessage = "Activities cannot be deleted, use Undo";
      return next();
    }
  } else if (type === "undo" && object) {
    // only validate object if it was found, undo should succeed
    // if be processed after object was deleted
    if (!apex.validateActivity(object)) {
      resLocal.status = 400;
      resLocal.statusMessage =
        "Undo can only be used on activities, use Delete";
    }
  } else if (type === "accept") {
    // for follows, also confirm the follow object was the actor trying to accept it
    const isFollow = object.type.toLowerCase() === "follow";
    if (isFollow && !apex.validateTarget(object, actor.id)) {
      resLocal.status = 403;
      return next();
    } else if (!isFollow && !object.to?.includes(actor.id)) {
      // the activity being accepted was sent to the actor trying to accept it
      resLocal.status = 403;
      return next();
    }
  }
  tasks.push(apex.embedCollections(activity));
  Promise.all(tasks)
    .then(() => {
      apex.addMeta(req.body, "collection", recipient.inbox[0]);
      res.locals.apex.activity = true;
      next();
    })
    .catch(next);
}

async function jsonld(req, res, next) {
  debug("jsonld");
  const apex = req.app.locals.apex;
  const jsonldAccepted = req.accepts(apex.consts.jsonldTypes);
  // rule out */* requests
  const isJsonLdGet =
    req.method === "GET" && !req.accepts("text/html") && jsonldAccepted;
  const isJsonLdProxy =
    req.method === "POST" && jsonldAccepted && req.is(apex.consts.formUrlType);
  if (isJsonLdGet || isJsonLdProxy) {
    res.locals.apex.responseType = jsonldAccepted;
    return next();
  }
  if (req.method === "POST" && req.is(apex.consts.jsonldTypes)) {
    try {
      const obj = await apex.fromJSONLD(req.body);
      if (!obj) {
        return res.status(400).send("Request body is not valid JSON-LD");
      }
      req.body = obj;
    } catch (err) {
      // potential fetch errors on context sources
      apex.logger.error("jsonld validation", err.message);
      return res.status(500).send("Error processing request JSON-LD");
    }
    return next();
  }
  next("route");
}

async function targetActivity(req, res, next) {
  debug(this.name);
  const apex = req.app.locals.apex;
  const aid = req.params[apex.activityParam];
  const activityIRI = apex.utils.activityIdToIRI(aid);
  let activity;
  try {
    activity = await apex.store.getActivity(activityIRI);
  } catch (err) {
    return next(err);
  }
  if (!activity) {
    return res.status(404).send(`'${aid}' not found`);
  }
  res.locals.apex.target = activity;
  next();
}

async function targetActor(req, res, next) {
  debug("targetActor");
  const apex = req.app.locals.apex;
  const actor = req.params[apex.actorParam];
  const actorIRI = apex.utils.usernameToIRI(actor);
  let actorObj;
  try {
    actorObj = await apex.store.getObject(actorIRI);
  } catch (err) {
    return next(err);
  }
  if (!actorObj) {
    res.locals.apex.status = 404;
    res.locals.apex.statusMessage = `'${actor}' not found on this instance`;
  } else if (actorObj.type === "Tombstone") {
    res.locals.apex.status = 410;
  } else {
    res.locals.apex.target = actorObj;
  }
  next();
}

// help prevent accidental disclosure of actor private keys by only
// including them when explicitly requested
function targetActorWithMeta(req, res, next) {
  debug("targetActorWithMeta");
  const apex = req.app.locals.apex;
  const resLocal = res.locals.apex;
  const actor = req.params[apex.actorParam];
  const actorIRI = apex.utils.usernameToIRI(actor);
  apex.store
    .getObject(actorIRI, true)
    .then((actorObj) => {
      if (!actorObj) {
        res.locals.apex.status = 404;
        res.locals.apex.statusMessage = `'${actor}' not found on this instance`;
        return next();
      } else if (actorObj.type === "Tombstone") {
        res.locals.apex.status = 410;
        return next();
      }
      // for temp in-memory storage
      actorObj._local = {};
      resLocal.target = actorObj;
      return apex.getBlocked(actorObj, Infinity, true);
    })
    .then((blocked) => {
      if (blocked) {
        resLocal.target._local.blockList = blocked.orderedItems;
      }
      next();
    })
    .catch(next);
}

async function targetObject(req, res, next) {
  debug("targetObject");
  const apex = req.app.locals.apex;
  const oid = req.params[apex.objectParam];
  const objIRI = apex.utils.objectIdToIRI(oid);
  let obj;
  try {
    obj = await apex.store.getObject(objIRI);
  } catch (err) {
    return next(err);
  }
  if (!obj) {
    return res.status(404).send(`'${oid}' not found`);
  }
  res.locals.apex.target = obj;
  next();
}

async function targetProxied(req, res, next) {
  debug("targetProxied");
  const apex = req.app.locals.apex;
  const locals = res.locals.apex;
  if (!req.body?.id) {
    locals.status = 400;
    locals.statusMessage =
      'Proxy requests is missing "id" parameter in form body';
    return next();
  }
  try {
    locals.target = await apex.resolveUnknown(req.body.id);
  } catch (err) {
    return next(err);
  }
  next();
}

function outboxCreate(req, res, next) {
  debug("outboxCreate");
  if (!res.locals.apex.target) {
    return next();
  }
  const apex = req.app.locals.apex;
  const actorIRI = res.locals.apex.target.id;
  const activityIRI = apex.utils.activityIdToIRI();
  let activity = req.body;
  let object;
  activity.id = activityIRI;
  if (!apex.validateActivity(activity)) {
    // if not valid activity, check for valid object and wrap in Create
    object = activity;
    object.id = apex.utils.objectIdToIRI();
    if (!apex.validateObject(object)) {
      return next();
    }
    object.attributedTo = [actorIRI];
    const extras = { object };
    ["bto", "cc", "bcc", "audience"].forEach((t) => {
      if (t in object) {
        extras[t] = object[t];
      }
    });
    activity = apex.buildActivity("Create", actorIRI, object.to, extras);
  } else {
    if (activity.type.toLowerCase() === "create" && activity.object) {
      activity.object[0].id = apex.utils.objectIdToIRI();
    }
    // run through builder to format & ensure published, shares, likes included
    activity = apex.buildActivity(
      activity.type,
      actorIRI,
      activity.to,
      activity
    );
  }
  Promise.resolve(activity).then((actResolved) => {
    req.body = actResolved;
    next();
  });
}

function outboxActivityObject(req, res, next) {
  debug("outboxActivityObject");
  const apex = req.app.locals.apex;
  const resLocal = res.locals.apex;
  const activity = req.body;
  if (!resLocal.target || !apex.validateActivity(activity)) {
    return next();
  }
  const type = activity.type.toLowerCase();
  let object;
  if (needsResolveObject.includes(type) && activity.object) {
    object = apex.resolveObject(activity.object[0], true);
  } else if (needsResolveActivity.includes(type) && activity.object) {
    object = apex.resolveActivity(activity.object[0], true);
  } else if (needsLocalActivity.includes(type)) {
    object = apex.store.getActivity(apex.objectIdFromActivity(activity), true);
  } else if (obxNeedsLocalObject.includes(type)) {
    object = apex.store.getObject(apex.objectIdFromActivity(activity), true);
  } else if (
    obxNeedsInlineObject.includes(type) &&
    apex.validateObject(activity.object)
  ) {
    object = activity.object[0];
    object.id = apex.utils.objectIdToIRI();
  }
  Promise.resolve(object)
    .then(async (obj) => {
      resLocal.object = obj;
      // for unfollow/unblock, clients dont have easy access to old activitiy ids,
      // so they can send an actor id and server will find related follow/block
      const actorId = apex.objectIdFromActivity(activity);
      if (
        !obj &&
        type === "undo" &&
        resLocal.target._local.blockList.includes(actorId)
      ) {
        const blockedCollection = apex.utils.nameToBlockedIRI(
          resLocal.target.preferredUsername
        );
        const block = await apex.store.findActivityByCollectionAndObjectId(
          blockedCollection,
          actorId,
          true
        );
        if (block) {
          activity.object = [block];
          resLocal.object = block;
        }
      } else if (!obj && type === "undo") {
        const follow = await apex.store.findActivityByCollectionAndObjectId(
          resLocal.target.following[0],
          actorId,
          true
        );
        if (follow) {
          activity.object = [follow];
          resLocal.object = follow;
        }
      } else if (!obj && type === "reject") {
        const follow = await apex.store.findActivityByCollectionAndActorId(
          resLocal.target.followers[0],
          actorId,
          true
        );
        if (follow) {
          activity.object = [follow];
          resLocal.object = follow;
        }
      }
      next();
    })
    .catch((err) => {
      apex.logger.warn("Error resolving outbox activity object", err.message);
      next();
    });
}
function outboxActivity(req, res, next) {
  debug(this.name);
  if (!res.locals.apex.target) {
    return next();
  }
  const apex = req.app.locals.apex;
  const resLocal = res.locals.apex;
  const actor = resLocal.target;
  const activity = req.body;
  const object = resLocal.object;
  if (!apex.validateActivity(activity)) {
    resLocal.status = 400;
    resLocal.statusMessage = "Invalid activity";
    return next();
  }
  const type = activity.type.toLowerCase();
  activity.id = apex.utils.activityIdToIRI();
  if (
    obxRequiresActivityObject.includes(type) &&
    !apex.validateActivity(object)
  ) {
    resLocal.status = 400;
    resLocal.statusMessage = `Activity type object requried for ${activity.type} activity`;
    return next();
  }
  if (requiresObject.includes(type) && !apex.validateObject(object)) {
    resLocal.status = 400;
    resLocal.statusMessage = `Object requried for ${activity.type} activity`;
    return next();
  }
  if (requiresTarget.includes(type) && !activity.target) {
    resLocal.status = 400;
    resLocal.statusMessage = `Target required for ${activity.type} activity`;
    return next();
  }
  if (
    requiresObjectOwnership.includes(type) &&
    !apex.validateOwner(object, actor)
  ) {
    resLocal.status = 403;
    return next();
  }
  if (type === "accept") {
    // for follows, confirm the follow object was the actor trying to accept it
    const isFollow = object.type.toLowerCase() === "follow";
    if (isFollow && !apex.validateTarget(object, actor.id)) {
      resLocal.status = 403;
      return next();
    } else if (!isFollow && !object.to?.includes(actor.id)) {
      // for other accepts, check the activity being accepted was sent to the actor trying to accept it
      resLocal.status = 403;
      return next();
    }
  } else if (type === "create") {
    // per spec, ensure attributedTo and audience fields in object are correct
    object.attributedTo = [actor.id];
    ["to", "bto", "cc", "bcc", "audience"].forEach((t) => {
      if (t in activity) {
        object[t] = activity[t];
      } else {
        delete object[t];
      }
    });
  } else if (type === "delete") {
    if (apex.validateActivity(object)) {
      resLocal.status = 400;
      resLocal.statusMessage = "Activities cannot be deleted, use Undo";
      return next();
    }
  } else if (type === "update") {
    // outbox updates can be partial, do merge
    resLocal.object = apex.mergeJSONLD(object, activity.object[0]);
    activity.object = [resLocal.object];
  } else if (type === "add" || type === "remove") {
    const colInfo = apex.utils.iriToCollectionInfo(activity.target[0]);
    if (colInfo?.name !== "collections") {
      // only adding to custom collections is implemented
      resLocal.status = 405;
      return next();
    }
    if (!actor.preferredUsername.includes(colInfo?.actor)) {
      resLocal.status = 403;
      return next();
    }
  } else if (type === "block") {
    // block id even if could not resolve
    if (!object) {
      resLocal.object = apex.objectIdFromActivity(activity);
    }
    if (!resLocal.object) {
      resLocal.status = 400;
      resLocal.statusMessage = "Block requires object";
      return next();
    }
    resLocal.doNotPublish = true;
  }
  apex.addMeta(req.body, "collection", resLocal.target.outbox[0]);
  resLocal.activity = true;
  next();
}
