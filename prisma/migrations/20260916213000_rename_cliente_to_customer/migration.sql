BEGIN TRY

BEGIN TRAN;

-- Rename table clientes -> customers (preserves data)
EXEC sp_rename '[dbo].[clientes]', 'customers';

-- Rename columns (nome -> name, telefone -> phone, endereco -> address)
EXEC sp_rename '[dbo].[customers].[nome]', 'name', 'COLUMN';
EXEC sp_rename '[dbo].[customers].[telefone]', 'phone', 'COLUMN';
EXEC sp_rename '[dbo].[customers].[endereco]', 'address', 'COLUMN';

-- Rename constraints/indexes to match Prisma naming for model Customer
-- (both are constraint objects: PK and UNIQUE constraint)
EXEC sp_rename 'clientes_pkey', 'customers_pkey', 'OBJECT';
EXEC sp_rename 'clientes_email_key', 'customers_email_key', 'OBJECT';
EXEC sp_rename 'clientes_createdAt_df', 'customers_createdAt_df', 'OBJECT';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
