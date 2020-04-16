module.exports = {
  ASContext: [
    'https://www.w3.org/ns/activitystreams',
    'https://w3id.org/security/v1'
  ],
  jsonldTypes: [
    'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
    'application/activity+json'
  ],
  // since we use json-ld procedding, it will always appear this way regardless of input format
  publicAddress: 'as:Public'
}
