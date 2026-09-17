BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(120) NOT NULL,
    [email] NVARCHAR(160) NOT NULL,
    [passwordHash] NVARCHAR(255) NOT NULL,
    [role] NVARCHAR(20) NOT NULL CONSTRAINT [users_role_df] DEFAULT 'OPERATOR',
    [active] BIT NOT NULL CONSTRAINT [users_active_df] DEFAULT 1,
    [customerId] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [users_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [users_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[shipments] (
    [id] INT NOT NULL IDENTITY(1,1),
    [cargoCode] NVARCHAR(40) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [shipments_status_df] DEFAULT 'CREATED',
    [originCity] NVARCHAR(120) NOT NULL,
    [originCountry] NVARCHAR(80) NOT NULL,
    [originLatitude] DECIMAL(9,6),
    [originLongitude] DECIMAL(9,6),
    [destinationCity] NVARCHAR(120) NOT NULL,
    [destinationCountry] NVARCHAR(80) NOT NULL,
    [destinationLatitude] DECIMAL(9,6),
    [destinationLongitude] DECIMAL(9,6),
    [currentLocationText] NVARCHAR(255),
    [currentLatitude] DECIMAL(9,6),
    [currentLongitude] DECIMAL(9,6),
    [geocodedAt] DATETIME2,
    [geocodeProvider] NVARCHAR(20),
    [departureDate] DATETIME2 NOT NULL,
    [estimatedDeliveryDate] DATETIME2 NOT NULL,
    [deliveredAt] DATETIME2,
    [customerId] INT NOT NULL,
    [handledById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [shipments_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [shipments_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [shipments_cargoCode_key] UNIQUE NONCLUSTERED ([cargoCode])
);

-- CreateTable
CREATE TABLE [dbo].[shipment_events] (
    [id] INT NOT NULL IDENTITY(1,1),
    [shipmentId] INT NOT NULL,
    [status] NVARCHAR(20) NOT NULL,
    [occurredAt] DATETIME2 NOT NULL CONSTRAINT [shipment_events_occurredAt_df] DEFAULT CURRENT_TIMESTAMP,
    [locationText] NVARCHAR(255) NOT NULL,
    [latitude] DECIMAL(9,6),
    [longitude] DECIMAL(9,6),
    [notes] NVARCHAR(500),
    [createdById] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [shipment_events_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [shipment_events_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [users_role_active_idx] ON [dbo].[users]([role], [active]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [users_customerId_idx] ON [dbo].[users]([customerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [shipments_status_idx] ON [dbo].[shipments]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [shipments_customerId_status_idx] ON [dbo].[shipments]([customerId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [shipments_handledById_idx] ON [dbo].[shipments]([handledById]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [shipments_departureDate_estimatedDeliveryDate_idx] ON [dbo].[shipments]([departureDate], [estimatedDeliveryDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [shipments_status_estimatedDeliveryDate_idx] ON [dbo].[shipments]([status], [estimatedDeliveryDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [shipment_events_shipmentId_occurredAt_idx] ON [dbo].[shipment_events]([shipmentId], [occurredAt] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [shipment_events_status_idx] ON [dbo].[shipment_events]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [shipment_events_occurredAt_idx] ON [dbo].[shipment_events]([occurredAt] DESC);

-- AddForeignKey
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [dbo].[customers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[shipments] ADD CONSTRAINT [shipments_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [dbo].[customers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[shipments] ADD CONSTRAINT [shipments_handledById_fkey] FOREIGN KEY ([handledById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[shipment_events] ADD CONSTRAINT [shipment_events_shipmentId_fkey] FOREIGN KEY ([shipmentId]) REFERENCES [dbo].[shipments]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[shipment_events] ADD CONSTRAINT [shipment_events_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
