"use strict";

module.exports = {
  acceptFollow,
  address,
  addToOutbox,
  buildActivity,
  buildTombstone,
  embedCollections,
  publishActivity,
  publishUndoUpdate,
  publishUpdate,
  resolveActivity,
};

async function buildActivity(type, actorId, to, etc = {}) {
  const activityId = this.store.generateId();
  const collections = this.utils.idToActivityCollections(activityId);
  let activity = this.mergeJSONLD(
    {
      id: this.utils.activityIdToIRI(activityId),
      type,
      actor: actorId,
      to,
      published: new Date().toISOString(),
    },
    etc
  );
  activity = await this.fromJSONLD(activity);
  for (const key in collections) {
    activity[key] = [await this.buildCollection(collections[key], true, 0)];
  }
  return activity;
}

async function buildTombstone(object) {
  const deleted = new Date().toISOString();
  return {
    id: object.id,
    type: "Tombstone",
    deleted,
    published: deleted,
    updated: deleted,
  };
}
// TODO: track errors during address resolution for redelivery attempts
async function address(activity, sender, audienceOverride) {
  // ensure blocklist is available (e.g. if called outside of route)
  if (!sender._local?.blockList) {
    sender._local = sender._local ?? {};
    sender._local.blockList = (
      await this.getBlocked(sender, Infinity, true)
    ).orderedItems;
  }
  let audience;
  if (audienceOverride) {
    audience = audienceOverride;
  } else {
    // de-dupe here to avoid resolving collections twice
    audience = Array.from(new Set(this.audienceFromActivity(activity)));
  }
  audience = audience.map((t) => {
    if (t === this.consts.publicAddress) {
      return null;
    }
    if (t === sender.followers[0]) {
      return this.getFollowers(sender, Infinity, true);
    }
    /* Allow addressing to sender's custom collections, e.g. a concept like a list
     * of specific friends could be represented by a collection of Follow
     * activities
     * 7.1.1 "the server MUST target and deliver to... Collections owned by the actor."
     */
    const miscCol = this.utils.iriToCollectionInfo(t);
    if (miscCol?.name === "collections") {
      if (!sender.preferredUsername.includes(miscCol.actor)) {
        return null;
      }
      return this.getAdded(t, Infinity, true).then((col) => {
        col.orderedItems = col.orderedItems.reduce((actors, activity) => {
          return actors.concat(
            activity.actor,
            // in some cases, e.g. outgoing follows, the object is the actor
            // of interest
            activity.object
              ? activity.object.filter((o) => this.isString(o))
              : []
          );
        }, []);
        return col;
      });
    }
    return this.resolveObject(t);
  });
  audience = await Promise.allSettled(audience).then((results) => {
    const addresses = results
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => {
        if (result.value.inbox || result.value.endpoints?.[0]?.sharedInbox) {
          return result.value
        }
        if (result.value.items) {
          return result.value.items.map((id) => this.resolveObject(id));
        }
        if (result.value.orderedItems) {
          return result.value.orderedItems.map((id) => this.resolveObject(id));
        }
        return undefined;
      });
    // flattens and resolves collections
    return Promise.allSettled(addresses.flat(2));
  });
  audience = audience
    .filter((result) => {
      if (result.status !== "fulfilled" || !result.value) return false;
      if (sender._local.blockList.includes(result.value.id)) return false;
      if (!result.value.inbox) return false;
      // 7.1 exclude self
      if (result.value.inbox[0] === sender.inbox[0]) return false;
      return true;
    })
    .map(result => result.value.endpoints?.[0]?.sharedInbox?.[0] || result.value.inbox[0])
  // 7.1 de-dupe
  return Array.from(new Set(audience));
}

/** addToOutbox
 * Given a newly created activity, add it to the actor's outbox and publish it
 * @param  {object} actor
 * @param  {object} activity
 */
async function addToOutbox(actor, activity) {
  this.addMeta(activity, "collection", actor.outbox[0]);
  await this.store.saveActivity(activity);
  return this.publishActivity(actor, activity);
}

// follow accept side effects: add to followers, publish updated followers
async function acceptFollow(actor, targetActivity) {
  const updated = await this.store.updateActivityMeta(
    targetActivity,
    "collection",
    actor.followers[0]
  );
  const postTask = async () => {
    return this.publishUpdate(actor, await this.getFollowers(actor));
  };
  return { postTask, updated };
}

async function embedCollections(activity) {
  if (this.isLocalIRI(activity.id)) {
    if (this.isString(activity.shares?.[0])) {
      activity.shares = [await this.getCollection(activity.shares)];
    }
    if (this.isString(activity.likes?.[0])) {
      activity.likes = [await this.getCollection(activity.likes)];
    }
  } else {
    if (this.isString(activity.shares?.[0])) {
      activity.shares = [
        await this.resolveObject(activity.shares, false, true),
      ];
    }
    // if not paged, don't duplicate items in embedded copies
    delete activity.shares?.[0]?.orderedItems;
    if (this.isString(activity.likes?.[0])) {
      activity.likes = [await this.resolveObject(activity.likes, false, true)];
    }
    delete activity.likes?.[0]?.orderedItems;
  }
  return activity;
}

/** publishActivity
 * Prepare an activity for federated delivery, resolve addresses, and add
 * to delivery queue
 * @param  {object} actor - actor object with meta for request signing
 * @param  {object} activity - activity object
 * @param  {string[]} audienceOverride - array of IRIs, used in inbox forwarding to
 * skip normall addressing and deliver to specific audience
 */
async function publishActivity(actor, activity, audienceOverride) {
  const tasks = [
    this.address(activity, actor, audienceOverride),
    this.toJSONLD(activity),
  ];
  const [addresses, outgoingActivity] = await Promise.all(tasks);
  if (addresses.length) {
    return this.queueForDelivery(actor, outgoingActivity, addresses);
  }
}

// undo may need to publish updates on behalf of multiple
// actors to completely clear the activity
async function publishUndoUpdate(colId, actor, audience) {
  const info = this.utils.iriToCollectionInfo(colId);
  let updated;
  let updatedActorId;
  if (
    !["followers", "following", "liked", "likes", "shares"].includes(info?.name)
  ) {
    return;
  }
  if (info.activity) {
    updated = await this.updateCollection(colId);
    updatedActorId = updated.actor[0];
  } else {
    updated = await this.getCollection(colId);
    updatedActorId = this.utils.usernameToIRI(info.actor);
  }
  if (actor.id === updatedActorId) {
    return this.publishUpdate(actor, updated, audience);
  } else {
    return this.publishUpdate(
      await this.store.getObject(updatedActorId, true),
      updated,
      audience
    );
  }
}

async function publishUpdate(actor, object, cc) {
  const act = await this.buildActivity("Update", actor.id, actor.followers[0], {
    object,
    cc,
  });
  return this.addToOutbox(actor, act);
}

async function resolveActivity(id, includeMeta) {
  let activity;
  if (this.validateActivity(id)) {
    // already activity
    activity = id;
  } else {
    activity = await this.store.getActivity(id, includeMeta);
    if (activity) {
      return activity;
    }
    // resolve remote activity object
    activity = await this.requestObject(id);
  }
  // avoid saving non-acticity objects to streams collection
  // if they are encountered during activity validation
  if (this.validateActivity(activity)) {
    await this.store.saveActivity(activity);
    return activity;
  }
}
