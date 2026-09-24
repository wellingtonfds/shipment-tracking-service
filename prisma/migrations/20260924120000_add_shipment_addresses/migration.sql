ALTER TABLE [shipments] ADD
  [originAddress] NVARCHAR(255) NULL,
  [destinationAddress] NVARCHAR(255) NULL;

EXEC sp_executesql N'
  UPDATE [shipments]
  SET
    [originAddress] = CONCAT([originCity], '', '', [originCountry]),
    [destinationAddress] = CONCAT([destinationCity], '', '', [destinationCountry]);
';

ALTER TABLE [shipments] ALTER COLUMN [originAddress] NVARCHAR(255) NOT NULL;
ALTER TABLE [shipments] ALTER COLUMN [destinationAddress] NVARCHAR(255) NOT NULL;
