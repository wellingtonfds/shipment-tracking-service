-- Particionamento mensal de shipment_events por occurredAt.
-- Modelo: docs/DATABASE.md — seção "Particionamento de shipment_events".
-- Regras:
-- - RANGE RIGHT: todo o histórico anterior à primeira fronteira fica na partição 1;
--   24 meses futuros são pré-criados vazios (split de partição vazia = metadata-only).
-- - ALL TO ([PRIMARY]): único filegroup (Docker); sem NEXT USED. Variante multi-filegroup no doc.
-- - PK vira composta (id, occurredAt): exigência do MSSQL para chaves únicas em tabelas
--   particionadas. O índice clusterizado passa a alinhar-se ao partition scheme.
-- Prisma não conhece partition scheme: migrations futuras que tocarem shipment_events
-- devem usar `migrate dev --create-only` e revisar o SQL manualmente.

BEGIN TRY

BEGIN TRAN;

-- 1) PK composta (model: @@id([id, occurredAt]))
ALTER TABLE [dbo].[shipment_events] DROP CONSTRAINT [shipment_events_pkey];

-- 2) Partition function — fronteira inicial: primeiro dia do mês seguinte ao deploy (2026-10-01),
--    mais 24 meses futuros
CREATE PARTITION FUNCTION [pf_OccurredAt_Monthly] (datetime2(7)) AS RANGE RIGHT FOR VALUES (
    '20261001', '20261101', '20261201',
    '20270101', '20270201', '20270301', '20270401', '20270501', '20270601',
    '20270701', '20270801', '20270901', '20271001', '20271101', '20271201',
    '20280101', '20280201', '20280301', '20280401', '20280501', '20280601',
    '20280701', '20280801', '20280901'
);

-- 3) Partition scheme (single filegroup: sem NEXT USED)
CREATE PARTITION SCHEME [ps_OccurredAt_Monthly] AS PARTITION [pf_OccurredAt_Monthly] ALL TO ([PRIMARY]);

-- 4) Índice clusterizado alinhado à partição (reorganiza o armazenamento da tabela)
CREATE CLUSTERED INDEX [CI_shipment_events_occurredAt] ON [dbo].[shipment_events] ([occurredAt], [id])
    ON [ps_OccurredAt_Monthly] ([occurredAt]);

-- 5) PK volta como NONCLUSTERED (com a coluna de partição)
ALTER TABLE [dbo].[shipment_events]
    ADD CONSTRAINT [shipment_events_pkey] PRIMARY KEY NONCLUSTERED ([id], [occurredAt]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
