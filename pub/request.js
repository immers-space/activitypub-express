'use strict';

const crypto = require('crypto')
const {createAuthzHeader, createSignatureString} = require('http-signature-header');

const compose = require('request-compose');
const Request = compose.Request
const Response = compose.Response

// Request with http-signature-header signing
const request = async (spec) => compose(
    Request.defaults(),
    Request.url(spec.url),
    split(spec),
    addDigest(),
    addHttpSignature(),
    Request.send(),
    Response.buffer(),
    Response.string(),
    Response.parse(),
    // ({res, body}) => Object.assign({}, res, body),
)(spec)

const split = (spec) => ({options}) => new Promise((resolve, reject) => {
  const { body } = spec
  Object.assign(options, spec)
  resolve({options, body})
})

const addDigest = () => ({options, body}) => new Promise((resolve, reject) => {
  if (!options.mastodonCompatible) resolve({options, body})
  const digest = crypto.createHash('sha256')
    .update(body)
    .digest('base64')

  options.headers = options.headers || {}
  options.headers['Digest'] = `SHA-256=${digest}`

  if (!options.httpSignature.includeHeaders || !options.httpSignature.includeHeaders.includes('digest')) {
    options.appendIncludeHeaders = options.appendIncludeHeaders || []
    options.appendIncludeHeaders.push('digest')
  }
  resolve({options, body})
})

const addHttpSignature = () => ({options, body}) => new Promise((resolve, reject) => {
  if (!options.httpSignature) resolve({options, body})
  if (!options.httpSignature.key || !options.httpSignature.keyId) 
    reject(new Error('missing httpSignature key or keyId'))

  const authorizationHeaderName = options.httpSignature.authorizationHeaderName || 'Signature'
  const algorithm = options.httpSignature.algorithm || 'rsa-sha256'
  const defaultIncludeHeaders = options.httpSignature.includeHeaders || ['(request-target)', 'host', 'date']
  const includeHeaders = defaultIncludeHeaders.concat(options.appendIncludeHeaders || [])
  if (includeHeaders.includes('date') && !options.headers.date) {
    options.headers.date = new Date().toUTCString()
  }
  options.httpSignature.includeHeaders = includeHeaders
  const stringToSign = createSignatureString({includeHeaders, requestOptions: options})

  let signer
  switch (algorithm) {
    case 'rsa-sha256':
      signer = crypto.createSign('sha256');
      break;
    default:
      signer = crypto.createSign('sha256');
      break;
  }
  signer.update(stringToSign);
  const signatureHash = signer.sign(options.httpSignature.key).toString('base64');

  let authz = createAuthzHeader({
    algorithm: algorithm,
    includeHeaders: includeHeaders,
    keyId: options.httpSignature.keyId,
    signature: signatureHash
  });
  if (authorizationHeaderName.toLowerCase() === 'Signature'.toLowerCase()) {
    authz = authz.substr('Signature '.length)
  }
  options.headers[authorizationHeaderName] = authz

  resolve({options, body})
})

/* Example Use
const reqSpec = {
  method: 'POST',
  url: 'https://example.org/test',
  headers: {
    'Content-Type': 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
  },
  mastodonCompatible: true,
  httpSignature: {
    key: '-----BEGIN RSA PRIVATE KEY-----MIIEpAIB...',
    keyId: 'key-1',
  },
  body: 'some body here'
}
const result = await request(reqSpec)
*/
module.exports = request;