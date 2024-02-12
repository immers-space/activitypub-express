'use strict'

const USER_COUNT_FREQ = 24 * 60 * 60 * 1000
let lastUserCountTime = 0
let lastUserCount = Promise.resolve(0)

function getUserCountWithCache (store) {
  const now = Date.now()
  if (lastUserCountTime + USER_COUNT_FREQ < now) {
    lastUserCountTime = now
    lastUserCount = store.getUserCount()
  }
  return lastUserCount
}

module.exports = {
  async generateNodeInfo (version) {
    return {
      version,
      software: {
        name: `${this.settings.name}`,
        version: `${this.settings.version}`
      },
      protocols: ['activitypub'],
      services: { inbound: [], outbound: [] },
      openRegistrations: !!this.settings.openRegistrations,
      usage: { users: { total: await getUserCountWithCache(this.store) } },
      metadata: this.settings.nodeInfoMetadata || {}
    }
  }
}
