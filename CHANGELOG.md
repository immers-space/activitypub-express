## v4.4.2 (2024-02-12)

### Changed
* Nodeinfo will only count users from database up to once per day, using a cached count for subsequent requests within 24 hours.
This can help limit query targeting warnings from mongo

### Ops
* Add [nock fetch work around](https://github.com/nock/nock/issues/2397) to fix tests in node 18.
* Adjust workflow to run tests using node 18 and 16. Don't run tests against 14.

## v4.4.1 (2023-06-23)

### Fixed
* Fix unverifiable delete detection when object is a tombstone
* Also handle unverifiable updates

## v4.4.0 (2023-06-23)

### Added
* Added ability to verify signatures from remote actors that have changed their signature keys (blind key rotation)
### Fixed
* Fix bug not finding already cached actors keys and refetching from remote server unnecessarily
* Handle inbox unverifiable deletes without trying to fetch remote actor object (Mastodon compat)
* Avoid error when receiving an embedded object for the object property when an activity object is expected (Hubzilla compat)

## v4.3.0 (2023-05-26)

### Added
* Federation http requests now include a User-Agent string formed from your apex settings: `${settings.name}/${settings.version} (+http://${settings.domain})`

## v4.2.2 (2023-01-28)

### Fixed

* Fix jsonld validator no longer accepting `application/ld+json; profile="https://www.w3.org/ns/activitystreams"` for POST

## v4.2.1 (2023-01-27)

### Fixed

* Fix jsonld validator not accepting `application/ld+json; profile="https://www.w3.org/ns/activitystreams"` for GET

### Security

* Update cookiejar for GHSA-h452-7996-h45h

## v4.2.0 (2023-01-18)

### Added

* new `baseUrl` config option that allows you to specify server origin instead of `domain` which specifies the host but assumes https protocol

### Fixed

* Unhandled error from invalid inputs in collection page requests

## v4.1.2 (2023-01-06)

### Changed

* Updated depenencies
  * jsold included [breaking changes (from v5.2.0 -> v8.1.0)](https://github.com/digitalbazaar/jsonld.js/blob/main/CHANGELOG.md), but not to any features currently used by apex

## v4.1.1 (2022-11-09)

### Fixed

* Fixed not finding shared inbox endpoints due to looking in the wrong place

## v4.1.0 (2022-11-09)

### Added

* Implement delivery consolidation to shared inboxes where available

## v4.0.1 (2022-11-05)
### Changed

* Update operations no longer try to update object.object.id (i.e. an Object of an Activity that is itself nested as the object of another activity). This un-indexed query was consuming a lot of cpu and always turned up empty anyway.

## v4.0.0 (2022-11-02)

### Changed

* lockfile udpated to v2 and engines minimum to node 16/npm 7
* http-signatures fork dependency changed to explicitly use https instead of ssh so package can be installed in CI with npm >=7

This version may still work with node 14/npm 6, but marking change as breaking because it sometimes fails to handle v2 lockfiles correctly

## v3.3.0 (2022-08-11)

# Added

* New index on `streams.object.id` to cover Update on embedded objects (expect a one-time slow startup to build the index)
* getCollection gains optional `query` argument which is passsed
through to store.getStream to allow additional filtering or
aggregation to be applied
## v3.2.0 (2022-06-23)

* Undo activity can now take a blocked user IRI as its object and will resolve to that block activity to allow easily unblocking withough knowing the original block activity IRI

## v3.1.2

* Ignore incoming JSON-LD default language to fix processing for activities coming from Pleroma

## v3.1.1

* Fix inbox undo not succeeding if the object was already deleted
* Update dependencies

For previous release notes, see [Github releases](https://github.com/immers-space/activitypub-express/releases)
