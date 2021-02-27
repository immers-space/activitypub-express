2.0.0

Improved client-to-server usability

**Breaking changes**
* The form of some collection items have been updated to provide resolved objects instead of IDs
  * inbox, outbox, shares, likes, added: activity with embedded actor object
  * followers: followed actor as object
  * liked: liked activity as object (actor not embedded)
  * following, blocked, rejected, rejections: continue to return ID string


1.0.2

Bugfixes and usability improvements

Improvements:
* `offlineMode` setting to disable federated delivery, allowing migrations to populate deliveryQueue with items to be sent when server is back online

Bugfixes:

* Fix internal collection use failing to specify authorized flag
* Fill in missing actor local blocklist copy in `address` so that it (and utils that call it) can be called directly


1.0.1

Bugfixes and usability improvements

- require authorization on outbox post
- fix bug with validating actor.streams collection ownership
- fix outbox post response wrong code (200 -> 201) and missing location header
- make context truly optional and also in-addition-to rather than replace the defaults
- publishing utility clarification:
  - addToOutbox now does all steps to add a newly created activity to outbox (for implementations to publish auto-generated activities)
  - split off specific addressing, preparing, queueing work into publishActivity (more for internal use)
- fix generated activities not appearing outbox, resume adding blocks to outbox collection (still does not deliver) now that we have permission-based filtering to control display of blocks
- remove follow and block from denormalize list - dont really need a bunch of copies of my own actor object in my inbox follows
- test & fix addressing to followers not pulling non-public followers
- do not add meta in `buildActivity` so that it can be used by implementations to prepare outbox activities


1.0.0

First major release includes all "must" and "should" directives from the ActivityPub spec.

0.1.0

* **Breaking change** Side-effect events refactored. There are now only 2 events,
'apex-inbox' and 'apex-outbox'. Activity type is available on the `activity`
message property for filtering behavior by event. 
