/* global describe, beforeAll, beforeEach, it, expect */

const httpSignature = require('http-signature')
const {parseRequest} = require('http-signature-header');
const http = require('http')
const request = require('../../pub/request')
const crypto = require('crypto')
const { promisify } = require('util')

const generateKeyPairPromise = promisify(crypto.generateKeyPair)

const privateKeyPEMs = {}
const publicKeyPEMs = {}

const obj = { 
  '@id': 'https://example.org/personID',
  '@type': 'https://www.w3.org/ns/activitystreams#Person',
  'https://w3id.org/security#publicKey': {
    '@id': 'https://example.org/personID#main-key',
    'https://w3id.org/security#owner': 'https://example.org/personID'
  }
}
let port = 8080
let server
let reqSpec

describe('request parsed by', function () {

  beforeAll(async function () {
    server = http.createServer((req, res) => server.tester(req, res)).listen(port)
    server.tester = (req, res) => res.writeHead(200).end('boom!')
    const pair = await generateKeyPairPromise('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    })
    privateKeyPEMs['key-1'] = pair.privateKey
    publicKeyPEMs['key-1'] = pair.publicKey
  })
  afterAll(async function () {
    return server.close()
  })
  beforeEach(async function () {
    reqSpec = {
      method: 'POST',
      url: 'http://localhost' + (port ? ':' : '') + port + '/test',
      headers: {
        'Content-Type': 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
      },
      mastodonCompatible: true,
      httpSignature: {
        key: privateKeyPEMs['key-1'],
        keyId: 'key-1',
        // algorithm: 'rsa-sha256',
        // authorizationHeaderName: 'Signature',
        // includeHeaders: ['(request-target)', 'host', 'date', 'digest'],
      },
      body: JSON.stringify(obj)
    }
  })
  describe('http-signature lib', function () {
    // * patched http-signature version fails to parse path in this case
    // * this is correctly parsed in original http-signature
    // * Opposite to the rest of the tests!

    it('using Authorization Header', async function () {
      reqSpec.httpSignature.authorizationHeaderName = 'Authorization'

      server.tester = function (req, res) {
        let verified = true
        const parsed = httpSignature.parseRequest(req)
        // uncomment to see the test pass:
        // parsed.signingString = parsed.signingString.replace(/undefined/g, '/test');
        // console.log(req.headers[reqSpec.httpSignature.authorizationHeaderName.toLowerCase()])
        // console.log('Parsed with http-signature:', parsed)
        const publicKeyPEM = publicKeyPEMs[parsed.keyId]
        verified = httpSignature.verifySignature(parsed, publicKeyPEM)

        res.writeHead(verified ? 200 : 400).end()
      }

      const result = await request(reqSpec)
      expect(result.res.statusCode).toBe(200);
    })

    it('using Signature Header', async function () {
      reqSpec.httpSignature.authorizationHeaderName = 'Signature'

      server.tester = function (req, res) {
        let verified = true
        const parsed = httpSignature.parseRequest(req)
        // uncomment to see the test pass:
        // parsed.signingString = parsed.signingString.replace(/undefined/g, '/test');
        // console.log('Parsed with http-signature:', parsed)
        const publicKeyPEM = publicKeyPEMs[parsed.keyId]
        verified = httpSignature.verifySignature(parsed, publicKeyPEM)

        res.writeHead(verified ? 200 : 400).end()
      }

      const result = await request(reqSpec)
      expect(result.res.statusCode).toBe(200);
    })
  })
  describe('http-signature-header lib', function () {
    // * http-signature-header will fail when signature header is used:
    // * Signature: 'keyId=...'

    it('using Authorization Header', async function () {
      reqSpec.httpSignature.authorizationHeaderName = 'Authorization'
      const signHeaderName = reqSpec.httpSignature.authorizationHeaderName.toLowerCase()

      server.tester = function (req, res) {
        let verified = true
        const expectedHeaders = ['(request-target)', 'host', 'date', 'digest']
        const parsed = parseRequest(
          req, {headers: expectedHeaders, authorizationHeaderName: signHeaderName});
        // console.log(req.headers[reqSpec.httpSignature.authorizationHeaderName.toLowerCase()])
        // console.log('Parsed with http-signature-header:', parsed)
        const publicKeyPEM = publicKeyPEMs[parsed.keyId]
        verified = httpSignature.verifySignature(parsed, publicKeyPEM)

        res.writeHead(verified ? 200 : 400).end()
      }

      const result = await request(reqSpec)
      expect(result.res.statusCode).toBe(200);
    })

    it('using Signature Header', async function () {
      reqSpec.httpSignature.authorizationHeaderName = 'Signature'
      const signHeaderName = reqSpec.httpSignature.authorizationHeaderName.toLowerCase()

      server.tester = function (req, res) {
        let verified = true
        const expectedHeaders = ['(request-target)', 'host', 'date', 'digest']
        const parsed = parseRequest(
          req, {headers: expectedHeaders, authorizationHeaderName: signHeaderName});
        // console.log(req.headers[reqSpec.httpSignature.authorizationHeaderName.toLowerCase()])
        // console.log('Parsed with http-signature-header:', parsed)
        const publicKeyPEM = publicKeyPEMs[parsed.keyId]
        verified = httpSignature.verifySignature(parsed, publicKeyPEM)

        res.writeHead(verified ? 200 : 400).end()
      }

      const result = await request(reqSpec)
      expect(result.res.statusCode).toBe(200);
    })
  })

})
