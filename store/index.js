'use strict'
const mongo = require('mongodb')
const { escape, unescape } = require('mongo-escape')
const merge = require('deepmerge')
const IApexStore = require('./interface')
function escapeClone (obj) {
  return escape(merge({}, obj))
}

class ApexStore extends IApexStore {
  constructor () {
    super()
    this.projection = { _id: 0, _meta: 0 }
    this.metaProj = { _id: 0 }
  }

  async deliveryEnqueue (actorId, body, addresses, signingKey) {
    if (!addresses || !addresses.length) return
    if (!Array.isArray(addresses)) { addresses = [addresses] }
    const docs = addresses.map(address => ({
      address,
      actorId,
      signingKey,
      body,
      attempt: 0,
      after: new Date()
    }))
    await this.db.collection('deliveryQueue')
      .insertMany(docs, { ordered: false, forceServerObjectId: true })
    // TODO maybe catch errored docs and retry?
    return true
  }

  async deliveryDequeue () {
    const queryOptions = {
      sort: { after: 1, _id: 1 },
      projection: { _id: 0 }
    }
    const result = await this.db.collection('deliveryQueue')
      .findOneAndDelete({ after: { $lte: new Date() } }, queryOptions)
    if (result.value) {
      return result.value
    }
    // if no deliveries available now, check for scheduled deliveries
    const next = await this.db.collection('deliveryQueue')
      .findOne({}, { sort: { after: 1 }, projection: { after: 1 } })
    return next ? { waitUntil: next.after } : null
  }

  async deliveryRequeue (delivery) {
    const nextTime = delivery.after.getTime() + Math.pow(10, delivery.attempt++)
    delivery.after = new Date(nextTime)
    const result = await this.db.collection('deliveryQueue')
      .insertOne(delivery, { forceServerObjectId: true })
    return result.insertedCount
  }

  async setup (initialUser) {
    const db = this.db
    // inbox
    await db.collection('streams').createIndex({
      id: 1
    }, {
      name: 'streams-primary',
      unique: true
    })
    await db.collection('streams').createIndex({
      '_meta.collection': 1,
      _id: -1
    }, {
      name: 'collections'
    })
    // object lookup
    await db.collection('objects')
      .createIndex({ id: 1 }, { unique: true, name: 'objects-primary' })
    await db.collection('deliveryQueue')
      .createIndex({ after: 1, _id: 1 }, { name: 'delivery-dequeue' })
    // TODO: index stream.object.id for updates
    // also need partial index on stream.object.object.id for object updates when
    // type is  'announce', 'like', 'add', 'reject' (denormalized collection types)
    if (initialUser) {
      return db.collection('objects').findOneAndReplace(
        { id: initialUser.id },
        initialUser,
        {
          upsert: true,
          returnOriginal: false
        }
      )
    }
  }

  getObject (id, includeMeta) {
    return this.db
      .collection('objects')
      .find({ id: id })
      .limit(1)
      // strict comparison as we don't want to return private keys on accident
      .project(includeMeta === true ? this.metaProj : this.projection)
      .next()
      .then(obj => unescape(obj))
  }

  async saveObject (object) {
    return this.db.collection('objects')
      .insertOne(escapeClone(object), { forceServerObjectId: true })
      .then(result => {
        return !!result.insertedCount
      })
      .catch(err => {
        if (!(err.code === 11000 && err.name === 'MongoError')) {
          throw err
        }
        return false
      })
  }

  async updateObject (obj, actorId, fullReplace) {
    const updated = await this
      .updateObjectSource(escapeClone(obj), actorId, fullReplace)
    if (updated) {
      // propogate update to all copies in streams
      await this.updateObjectCopies(updated)
    }
    return unescape(updated)
  }

  getActivity (id, includeMeta) {
    return this.db.collection('streams')
      .find({ id: id })
      .limit(1)
      .project(includeMeta ? this.metaProj : this.projection)
      .next()
      .then(act => unescape(act))
  }

  findActivityByCollectionAndObjectId (collection, objectId, includeMeta) {
    return this.db.collection('streams')
      .find({ '_meta.collection': collection, object: objectId })
      .limit(1)
      .project(includeMeta ? this.metaProj : this.projection)
      .next()
      .then(act => unescape(act))
  }

  findActivityByCollectionAndActorId (collection, actorId, includeMeta) {
    return this.db.collection('streams')
      .find({ '_meta.collection': collection, actor: actorId })
      .limit(1)
      .project(includeMeta ? this.metaProj : this.projection)
      .next()
      .then(act => unescape(act))
  }

  getContext (documentUrl) {
    return this.db.collection('contexts')
      .findOne({ documentUrl }, { projection: { _id: 0 } })
  }

  saveContext (context) {
    const { documentUrl } = context
    return this.db.collection('contexts')
      .replaceOne({ documentUrl }, context, { forceServerObjectId: true, upsert: true })
  }

  getStream (collectionId, limit, after, blockList) {
    const pipeline = []
    const filter = { '_meta.collection': collectionId }
    if (after) {
      filter._id = { $lt: new mongo.ObjectId(after) }
    }
    if (blockList?.length) {
      filter.actor = { $nin: blockList }
    }
    pipeline.push({ $match: filter })
    pipeline.push({ $sort: { _id: -1 } })
    if (limit) {
      pipeline.push({ $limit: limit })
    }
    pipeline.push({
      $lookup: {
        from: 'objects',
        localField: 'actor',
        foreignField: 'id',
        as: 'actor'
      }
    }, {
      // filter if missing actor
      $match: { actor: { $ne: [] } }
    }, {
      $project: {
        _meta: 0,
        'object._id': 0,
        'object._meta': 0,
        'actor._meta': 0,
        'actor._id': 0
      }
    })

    const query = this.db.collection('streams').aggregate(pipeline)
    return query.toArray().then(stream => unescape(stream))
  }

  getStreamCount (collectionId) {
    return this.db
      .collection('streams')
      .countDocuments({ '_meta.collection': collectionId })
  }

  async saveActivity (activity) {
    let inserted
    try {
      const insertResult = await this.db.collection('streams')
        .insertOne(escapeClone(activity), { forceServerObjectId: true })
      inserted = insertResult.insertedCount
    } catch (err) {
      // if duplicate key error, ignore and return undefined
      if (err.name !== 'MongoError' || err.code !== 11000) throw (err)
    }
    return inserted
  }

  removeActivity (activity, actorId) {
    return this.db.collection('streams')
      .deleteMany({ id: activity.id, actor: actorId })
  }

  async updateActivity (activity, fullReplace) {
    const query = { id: activity.id }
    let result
    activity = escapeClone(activity)
    if (fullReplace) {
      result = await this.db.collection('streams')
        .replaceOne(query, escapeClone(activity))
    } else {
      result = await this.db.collection('streams')
        .findOneAndUpdate(query, this.objectToUpdateDoc(activity), {
          returnOriginal: false,
          projection: this.metaProj
        })
      activity = result?.value ?? activity
    }
    if (result.modifiedCount) {
      await this.updateObjectCopies(activity)
    }
    return unescape(activity)
  }

  async updateActivityMeta (activity, key, value, remove) {
    const op = {}
    if (remove) {
      op.$pull = { [`_meta.${key}`]: value }
    } else {
      op.$addToSet = { [`_meta.${key}`]: value }
    }
    const q = { id: activity.id }
    const result = await this.db.collection('streams')
      .findOneAndUpdate(q, op, { projection: this.metaProj, returnOriginal: false })
    if (!result.ok || !result.value) {
      throw new Error('Error updating activity meta: not found')
    }
    return unescape(result.value)
  }

  generateId () {
    return new mongo.ObjectId().toHexString()
  }

  // class methods
  objectToUpdateDoc (object) {
    let doSet = false
    let doUnset = false
    const set = {}
    const unset = {}
    const op = {}
    for (const [key, value] of Object.entries(object)) {
      if (key === 'id') continue
      if (value === null) {
        doUnset = true
        unset[key] = ''
      } else {
        doSet = true
        set[key] = value
      }
    }
    if (doSet) {
      op.$set = set
    }
    if (doUnset) {
      op.$unset = unset
    }
    return op
  }

  updateObjectSource (object, actorId, fullReplace) {
    // limit udpates to owners of objects
    const q = { id: object.id }
    if (fullReplace) {
      return this.db.collection('objects')
        .replaceOne(q, object)
        .then(result => {
          if (result.modifiedCount > 0) {
            return object
          }
        })
    }
    return this.db.collection('objects')
      .findOneAndUpdate(q, this.objectToUpdateDoc(object), {
        returnOriginal: false,
        projection: this.projection
      })
      .then(result => result.value)
  }

  // for denormalized storage model, must update all activities with copy of updated object
  async updateObjectCopies (object) {
    await this.db.collection('streams').updateMany(
      { 'object.id': object.id },
      { $set: { 'object.$[element]': object } },
      { arrayFilters: [{ 'element.id': object.id }] }
    )
    // these activities have an activity as their object which may in turn
    // include the object being updated
    await this.db.collection('streams').updateMany(
      {
        type: { $in: ['Announce', 'Like', 'Add', 'Reject'] },
        'object.object.id': object.id
      },
      { $set: { 'object.$[].object.$[element]': object } },
      { arrayFilters: [{ 'element.id': object.id }] }
    )
    if (object._meta?.privateKey) {
      // just in case actor keypairs are updated while deliveries are queued
      await this.db.collection('deliveryQueue').updateMany(
        { actorId: object.id },
        { $set: { signingKey: object._meta.privateKey } }
      )
    }
  }
}

module.exports = ApexStore
