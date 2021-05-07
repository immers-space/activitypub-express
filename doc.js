/**
 * @typedef {object} ApexRoutes
 * @property {string} actor - Actor profile route & IRI pattern (must include actorParam)
 * @property {string} object  Object retrieval route & IRI pattern (must include objectParam)
 * @property {string} activity - Activity retrieval route & IRI pattern (must include activityParam)
 * @property {string} inbox - Actor inbox route (must include actorParam)
 * @property {string} outbox - Actor outbox route (must include actorParam)
 * @property {string} following - Actor following collection route (must include actorParam)
 * @property {string} followers - Actor followers collection route (must include actorParam)
 * @property {string} liked - Actor liked collection route (must include actorParam)
 * @property {string} blocked - Actor's blocklist (must include actorParam)
 * @property {string} rejected - Activities rejected by actor (must include actorParam)
 * @property {string} rejections - Actor's activities that were rejected by recipient (must include actorParam)
 * @property {string} shares - Activity shares collection route (must include activityParam)
 * @property {string} likes - Activity likes collection route (must include activityParam)
 * @property {string} collections - Actors' miscellaneous collections route (must include actorParam and collectionParam)
 */

/**
 * @typedef {object} endpoints
 * @property {?string} proxyUrl
 * @property {?string} oauthAuthorizationEndpoint
 * @property {?string} oauthTokenEndpoint
 * @property {?string} provideClientKey
 * @property {?string} signClientKey
 * @property {?string} sharedInbox
 * @property {?string} uploadMedia
 */

/**
 * @typedef {object} logger
 * @property {function} info
 * @property {function} warn
 * @property {function} error
 */

/**
 * @typedef {object} ApexOptions
 * @property {string} domain - Hostname for your app
 * @property {string} actorParam - Express route parameter used for actor name
 * @property {string} objectParam - Express route parameter used for object id
 * @property {ApexRoutes} routes - templates for routes and identifiers
 * @property {?string} activityParam - Express route parameter used for activity id (defaults to objectParam)
 * @property {?string} collectionParam - Express route parameter used for collection id (defaults to objectParam)
 * @property {?string} pageParam - Query parameter used for collection page identifier (default 'page')
 * @property {?number} itemsPerPage - Count of items in each collection page (default 20)
 * @property {?string|object|Array} context - JSON-LD context(s) to use with your app in addition to the base AcivityStreams + Security vocabs
 * @property {?endpoints} endpoints - Standard ActivityPub endpoints included in actor objects
 * @property {?logger} logger - replace console with custom logger
 * @property {?IApexStore} store - replace default apex store
 * @property {?number} threadDepth - Controls how far up apex will follow links in incoming activities in order to display the conversation thread & check for inbox forwarding needs  (default 10)
 * @property {?object} systemUser - Actor object representing system and used for signing GETs
 * @property {?boolean} offlineMode - Disable delivery. Useful for running migrations and queueing deliveries to be sent when app is running
 */
