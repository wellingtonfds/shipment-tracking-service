-- Current location is no longer stored on shipments: it is derived from the
-- latest shipment_events row (ordered by occurredAt DESC, id DESC).
-- Every status/location/delivery write records the location in the event,
-- so dropping these columns loses no history.
ALTER TABLE [dbo].[shipments] DROP COLUMN [currentLocationText], [currentLatitude], [currentLongitude];
