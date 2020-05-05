'use strict'
const request = require('request-promise-native')

// federation communication utilities
module.exports = {
  requestObject,
  deliver
}

function requestObject (id) {
  return request({
    url: id,
    headers: { Accept: 'application/activity+json' },
    json: true
  }).then(this.fromJSONLD)
}

function deliver (actor, activity, addresses) {
  if (activity.bto) {
    delete activity.bto
  }
  if (activity.bcc) {
    delete activity.bcc
  }
  const requests = addresses.map(addr => {
    return request({
      method: 'POST',
      url: addr,
      headers: {
        'Content-Type': this.consts.jsonldOutgoingType
      },
      httpSignature: {
        key: actor._meta.privateKey,
        keyId: actor.id,
        headers: ['(request-target)', 'host', 'date'],
        authorizationHeaderName: 'Signature'
      },
      json: true,
      resolveWithFullResponse: true,
      simple: false,
      body: activity
    })
      .then(result => console.log('delivery:', addr, result.statusCode))
      .catch(err => console.log(err.message))
  })
  return Promise.all(requests)
}
