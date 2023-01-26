module.exports = {
  ASContext: [
    'https://www.w3.org/ns/activitystreams',
    'https://w3id.org/security/v1'
  ],
  formUrlType: 'application/x-www-form-urlencoded',
  jsonldTypes: [
    'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
    'application/activity+json'
  ],
  // type-is is not able to match this pattern
  jsonldOutgoingType: 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
  // since we use json-ld procedding, it will always appear this way regardless of input format
  publicAddress: 'as:Public'
}
