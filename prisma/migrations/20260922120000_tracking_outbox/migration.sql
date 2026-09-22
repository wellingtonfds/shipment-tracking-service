CREATE TABLE [tracking_outbox] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [tracking_outbox_id_df] DEFAULT NEWID(),
    [shipmentId] INT NOT NULL,
    [eventType] NVARCHAR(20) NOT NULL,
    [payload] NVARCHAR(MAX) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [tracking_outbox_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [dispatchedAt] DATETIME2 NULL,
    [processedAt] DATETIME2 NULL,
    [attempts] INT NOT NULL CONSTRAINT [tracking_outbox_attempts_df] DEFAULT 0,
    CONSTRAINT [tracking_outbox_pkey] PRIMARY KEY ([id])
);
CREATE INDEX [tracking_outbox_dispatchedAt_createdAt_idx] ON [tracking_outbox]([dispatchedAt], [createdAt]);
CREATE INDEX [tracking_outbox_shipmentId_eventType_processedAt_createdAt_idx] ON [tracking_outbox]([shipmentId], [eventType], [processedAt], [createdAt] DESC);

CREATE TABLE [tracking_idempotency_keys] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [tracking_idempotency_keys_id_df] DEFAULT NEWID(),
    [shipmentId] INT NOT NULL,
    [key] NVARCHAR(128) NOT NULL,
    [payloadHash] CHAR(64) NOT NULL,
    [outboxId] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [tracking_idempotency_keys_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [expiresAt] DATETIME2 NOT NULL,
    CONSTRAINT [tracking_idempotency_keys_pkey] PRIMARY KEY ([id])
);
CREATE UNIQUE INDEX [tracking_idempotency_keys_shipmentId_key_key] ON [tracking_idempotency_keys]([shipmentId], [key]);
CREATE INDEX [tracking_idempotency_keys_expiresAt_idx] ON [tracking_idempotency_keys]([expiresAt]);
