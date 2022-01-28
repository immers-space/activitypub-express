'use strict'
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
      usage: { users: { total: await this.store.getUserCount() } },
      metadata: this.settings.nodeInfoMetadata || {}
    }
  }
}
