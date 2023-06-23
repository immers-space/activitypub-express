/* global describe, beforeAll, beforeEach, it, expect */
describe('object utils', function () {
  let testUser
  let app
  let apex
  let client
  beforeAll(async function () {
    const init = await global.initApex()
    testUser = init.testUser
    app = init.app
    apex = init.apex
    client = init.client
    app.route('/outbox/:actor')
      .get(apex.net.outbox.get)
      .post(apex.net.outbox.post)
  })
  beforeEach(function () {
    return global.resetDb(apex, client, testUser)
  })
  describe('resolveObject', function () {
    it('finds cached object even if provided IRI has a hash', async function () {
      const cached = await apex.resolveObject(`${testUser.id}#main-key`)
      expect(cached?.id).toBe(testUser.id)
    })
  })
})
