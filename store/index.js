'use strict'
const mongo = require('mongodb')
const IApexStore = require('./interface')

class ApexStore extends IApexStore {
  constructor () {
    super()
    this.projection = { _id: 0, _meta: 0 }
    this.metaProj = { _id: 0 }
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
    await db.collection('objects').createIndex({ id: 1 }, { unique: true, name: 'objects-primary' })
    if (initialUser) {
      return db.collection('objects').findOneAndReplace(
        { preferredUsername: initialUser.preferredUsername },
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
  }

  async saveObject (object) {
    const db = this.db
    const exists = await db.collection('objects')
      .find({ id: object.id })
      .project({ _id: 1 })
      .limit(1)
      .hasNext()
    if (exists) {
      return false
    }
    return db.collection('objects')
      .insertOne(object, { forceServerObjectId: true })
  }

  async updateObject (obj, actorId, fullReplace) {
    let updated
    if (fullReplace) {
      throw new Error('not implemented')
    } else {
      updated = await this.updateObjectSource(obj, actorId)
    }
    if (updated.value) {
      // propogate update to all copies in streams
      await this.updateObjectCopies(updated.value)
    }
    return updated.value
  }

  getActivity (id, includeMeta) {
    return this.db.collection('streams')
      .find({ id: id })
      .limit(1)
      .project(includeMeta ? this.metaProj : this.projection)
      .next()
  }

  getStream (collectionId) {
    const query = this.db
      .collection('streams')
      .find({ '_meta.collection': collectionId })
      .sort({ _id: -1 })
      .project({ _id: 0, _meta: 0, 'object._id': 0, 'object._meta': 0 })
    return query.toArray()
  }

  async saveActivity (activity) {
    let inserted
    try {
      const insertResult = await this.db.collection('streams')
        .insertOne(activity, { forceServerObjectId: true })
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
    if (!fullReplace) {
      throw new Error('not implemented')
    }
    const result = await this.db.collection('streams')
      .replaceOne({ id: activity.id }, activity)
    return result.modifiedCount
  }

  async updateActivityMeta (activityId, actorId, key, value, remove) {
    const op = {}
    if (remove) {
      op.$pull = { [`_meta.${key}`]: value }
    } else {
      op.$addToSet = { [`_meta.${key}`]: value }
    }
    // limit udpates to owners of objects
    const q = { id: activityId, actor: actorId }
    const result = await this.db.collection('streams')
      .updateOne(q, op)
    return result.modifiedCount
  }

  generateId () {
    return new mongo.ObjectId().toHexString()
  }

  // class methods
  updateObjectSource (object, actorId) {
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
    // limit udpates to owners of objects
    const q = object.id === actorId
      ? { id: object.id }
      : { id: object.id, attributedTo: actorId }
    return this.db.collection('objects')
      .findOneAndUpdate(q, op, { returnOriginal: false, projection: this.projection })
  }

  // for denormalized storage model, must update all activities with copy of updated object
  updateObjectCopies (object) {
    return this.db.collection('streams')
      .updateMany({ 'object.0.id': object.id }, { $set: { object: [object] } })
  }
}

module.exports = ApexStore
