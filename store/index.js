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
      '_meta.collection': 1,
      _id: -1
    }, {
      name: 'inbox'
    })
    // followers
    await db.collection('streams').createIndex({
      '_meta.collection': 1
    }, {
      partialFilterExpression: { type: 'Follow' },
      name: 'followers'
    })
    // outbox
    await db.collection('streams').createIndex({
      actor: 1,
      _id: -1
    })
    // object lookup
    await db.collection('objects').createIndex({
      id: 1
    })
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

  getActivity (id) {
    return this.db.collection('streams')
      .find({ id: id })
      .limit(1)
      .project({ _id: 0, _meta: 0 })
      .next()
  }

  getStream (collectionId, filterFlag) {
    const q = { '_meta.collection': collectionId }
    if (filterFlag) {
      q[`_meta.${filterFlag}`] = { $exists: true }
    }
    const query = this.db
      .collection('streams')
      .find(q)
      .sort({ _id: -1 })
      .project({ _id: 0, _meta: 0, 'object._id': 0, 'object._meta': 0 })
    return query.toArray()
  }

  async saveActivity (activity) {
    const q = { id: activity.id }
    // activities may be duplicated with different target collections
    if (activity._meta.collection) {
      q['_meta.collection'] = { $all: activity._meta.collection }
    }
    const exists = await this.db.collection('streams')
      .find(q)
      .project({ _id: 1 })
      .limit(1)
      .hasNext()
    if (exists) {
      return false
    }

    return this.db.collection('streams')
      // server object ID avoids mutating local copy of document
      .insertOne(activity, { forceServerObjectId: true })
  }

  removeActivity (activity, actorId) {
    return this.db.collection('streams')
      .deleteMany({ id: activity.id, actor: actorId })
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
    const result = await this.db.collection('streams').updateMany(q, op)
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
