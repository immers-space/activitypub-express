/* global describe, beforeAll, beforeEach, it, expect */

const httpSignature = require('http-signature')
const {parseRequest} = require('http-signature-header');
const http = require('http')
const request = require('../../pub/request')

const privateKeyPEMs = {}

privateKeyPEMs['key-1'] =
  '-----BEGIN RSA PRIVATE KEY-----\n' +
  'MIIEpAIBAAKCAQEAzWSJl+Z9Bqv00FVL5N3+JCUoqmQPjIlya1BbeqQroNQ5yG1i\n' +
  'VbYTTnMRa1zQtR6r2fNvWeg94DvxivxIG9diDMnrzijAnYlTLOl84CK2vOxkj5b6\n' +
  '8zrLH9b/Gd6NOHsywo8IjvXvCeTfca5WUHcuVi2lT9VjygFs1ILG4RyeX1BXUumu\n' +
  'Y8fzmposxLYdMxCqUTzAn0u9Saq2H2OVj5u114wS7OQPigu6G99dpn/iPHa3zBm8\n' +
  '7baBWDbqZWRW0BP3K6eqq8sut1+NLhNW8ADPTdnO/SO+kvXy7fqd8atSn+HlQcx6\n' +
  'tW42dhXf3E9uE7K78eZtW0KvfyNGAjsI1Fft2QIDAQABAoIBAG1exe3/LEBrPLfb\n' +
  'U8iRdY0lxFvHYIhDgIwohC3wUdMYb5SMurpNdEZn+7Sh/fkUVgp/GKJViu1mvh52\n' +
  'bKd2r52DwG9NQBQjVgkqY/auRYSglIPpr8PpYNSZlcneunCDGeqEY9hMmXc5Ssqs\n' +
  'PQYoEKKPN+IlDTg6PguDgAfLR4IUvt9KXVvmB/SSgV9tSeTy35LECt1Lq3ozbUgu\n' +
  '30HZI3U6/7H+X22Pxxf8vzBtzkg5rRCLgv+OeNPo16xMnqbutt4TeqEkxRv5rtOo\n' +
  '/A1i9khBeki0OJAFJsE82qnaSZodaRsxic59VnN8sWBwEKAt87tEu5A3K3j4XSDU\n' +
  '/avZxAECgYEA+pS3DvpiQLtHlaO3nAH6MxHRrREOARXWRDe5nUQuUNpS1xq9wte6\n' +
  'DkFtba0UCvDLic08xvReTCbo9kH0y6zEy3zMpZuJlKbcWCkZf4S5miYPI0RTZtF8\n' +
  'yps6hWqzYFSiO9hMYws9k4OJLxX0x3sLK7iNZ32ujcSrkPBSiBr0gxkCgYEA0dWl\n' +
  '637K41AJ/zy0FP0syq+r4eIkfqv+/t6y2aQVUBvxJYrj9ci6XHBqoxpDV8lufVYj\n' +
  'fUAfeI9/MZaWvQJRbnYLre0I6PJfLuCBIL5eflO77BGso165AF7QJZ+fwtgKv3zv\n' +
  'ZX75eudCSS/cFo0po9hlbcLMT4B82zEkgT8E2MECgYEAnz+3/wrdOmpLGiyL2dff\n' +
  '3GjsqmJ2VfY8z+niSrI0BSpbD11tT9Ct67VlCBjA7hsOH6uRfpd6/kaUMzzDiFVq\n' +
  'VDAiFvV8QD6zNkwYalQ9aFvbrvwTTPrBpjl0vamMCiJ/YC0cjq1sGr2zh3sar1Ph\n' +
  'S43kP+s97dcZeelhaiJHVrECgYEAsx61q/loJ/LDFeYzs1cLTVn4V7I7hQY9fkOM\n' +
  'WM0AhInVqD6PqdfXfeFYpjJdGisQ7l0BnoGGW9vir+nkcyPvb2PFRIr6+B8tsU5j\n' +
  '7BeVgjDoUfQkcrEBK5fEBtnj/ud9BUkY8oMZZBjVNLRuI7IMwZiPvMp0rcj4zAN/\n' +
  'LfUlpgECgYArBvFcBxSkNAzR3Rtteud1YDboSKluRM37Ey5plrn4BS0DD0jm++aD\n' +
  '0pG2Hsik000hibw92lCkzvvBVAqF8BuAcnPlAeYfsOaa97PGEjSKEN5bJVWZ9/om\n' +
  '9FV1axotRN2XWlwrhixZLEaagkREXhgQc540FS5O8IaI2Vpa80Atzg==\n' +
  '-----END RSA PRIVATE KEY-----'

const publicKeyPEMs = {}

publicKeyPEMs['key-1'] =
  '-----BEGIN PUBLIC KEY-----\n' +
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzWSJl+Z9Bqv00FVL5N3+\n' +
  'JCUoqmQPjIlya1BbeqQroNQ5yG1iVbYTTnMRa1zQtR6r2fNvWeg94DvxivxIG9di\n' +
  'DMnrzijAnYlTLOl84CK2vOxkj5b68zrLH9b/Gd6NOHsywo8IjvXvCeTfca5WUHcu\n' +
  'Vi2lT9VjygFs1ILG4RyeX1BXUumuY8fzmposxLYdMxCqUTzAn0u9Saq2H2OVj5u1\n' +
  '14wS7OQPigu6G99dpn/iPHa3zBm87baBWDbqZWRW0BP3K6eqq8sut1+NLhNW8ADP\n' +
  'TdnO/SO+kvXy7fqd8atSn+HlQcx6tW42dhXf3E9uE7K78eZtW0KvfyNGAjsI1Fft\n' +
  '2QIDAQAB\n' +
  '-----END PUBLIC KEY-----'

publicKeyPEMs['key-2'] =
  '-----BEGIN PUBLIC KEY-----\n' +
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqp04VVr9OThli9b35Omz\n' +
  'VqSfWbsoQuRrgyWsrNRn3XkFmbWw4FzZwQ42OgGMzQ84Ta4d9zGKKQyFriTiPjPf\n' +
  'xhhrsaJnDuybcpVhcr7UNKjSZ0S59tU3hpRiEz6hO+Nc/OSSLkvalG0VKrxOln7J\n' +
  'LK/h3rNS/l6wDZ5S/KqsI6CYtV2ZLpn3ahLrizvEYNY038Qcm38qMWx+VJAvZ4di\n' +
  'qqmW7RLIsLT59SWmpXdhFKnkYYGhxrk1Mwl22dBTJNY5SbriU5G3gWgzYkm8pgHr\n' +
  '6CtrXch9ciJAcDJehPrKXNvNDOdUh8EW3fekNJerF1lWcwQg44/12v8sDPyfbaKB\n' +
  'dQIDAQAB\n' +
  '-----END PUBLIC KEY-----'


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
