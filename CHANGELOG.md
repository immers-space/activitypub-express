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
