/* global describe, it, expect */

const ActivitypubExpress = require('../../index')

const routes = {
  actor: '/u/:actor',
  object: '/o/:id',
  activity: '/s/:id',
  inbox: '/inbox/:actor',
  outbox: '/outbox/:actor',
  followers: '/followers/:actor',
  following: '/following/:actor',
  liked: '/liked/:actor',
  shares: '/s/:id/shares',
  likes: '/s/:id/likes',
  collections: '/u/:actor/c/:id',
  blocked: '/u/:actor/blocked',
  rejections: '/u/:actor/rejections',
  rejected: '/u/:actor/rejected',
  nodeinfo: '/nodeinfo'
}

describe('apex', function () {
  it('should use base URL if set and no domain', function () {
    const apex = ActivitypubExpress({
      baseUrl: 'https://localhost',
      routes
    })
    expect(apex.domain).toBe('localhost')
    expect(apex.baseUrl).toBe('https://localhost')
  })

  it('should use domain if set and no base URL', function () {
    const apex = ActivitypubExpress({
      domain: 'somedomain:4321',
      routes
    })
    expect(apex.domain).toBe('somedomain:4321')
    expect(apex.baseUrl).toBe('https://somedomain:4321')
  })

  it('should prefer baseURL if domain is also set', function () {
    const apex = ActivitypubExpress({
      domain: 'somedomain',
      baseUrl: 'https://someotherdomain:9876',
      routes
    })
    expect(apex.domain).toBe('someotherdomain:9876')
    expect(apex.baseUrl).toBe('https://someotherdomain:9876')
  })
})
