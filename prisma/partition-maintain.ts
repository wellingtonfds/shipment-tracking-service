// Manutenção de partições mensais de shipment_events (docs/DATABASE.md — Particionamento).
// Execução: npm run db:partition
// Comportamento:
// - Idempotente: consulta sys.partition_range_values e faz SPLIT RANGE apenas até existirem
//   MONTHS_AHEAD meses futuros de fronteiras vazias.
// - Split SOMENTE de fronteira futura (mês > corrente): partição vazia, operação metadata-only.
// - Sem NEXT USED: o scheme foi criado com ALL TO ([PRIMARY]) (single filegroup; ver doc).
// - Modo degradado: se não rodar, o mês novo cai na última partição (overflow) e o próximo
//   split regulariza — nada quebra.
import 'dotenv/config';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';

const PARTITION_FUNCTION = 'pf_OccurredAt_Monthly';
const MONTHS_AHEAD = 24;

// Primeiro dia do mês deslocado em `offset` meses a partir do mês corrente (UTC).
function firstDayOfMonth(offset: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}

function toBoundaryLiteral(date: Date): string {
  // YYYYMMDD evita dependência do language/dateformat da sessão do MSSQL
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}${m}01`;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL missing from environment');
  }

  const prisma = new PrismaClient({ adapter: new PrismaMssql(url) });

  try {
    const rows = await prisma.$queryRaw<Array<{ boundary: Date }>>(
      Prisma.sql`SELECT CAST(v.[value] AS datetime2(7)) AS boundary
                 FROM sys.partition_functions f
                 JOIN sys.partition_range_values v ON v.[function_id] = f.[function_id]
                 WHERE f.[name] = ${PARTITION_FUNCTION}
                 ORDER BY v.[boundary_id] ASC`,
    );
    const boundaries = rows.map((r) => new Date(r.boundary));
    if (boundaries.length === 0) {
      throw new Error(`Partition function ${PARTITION_FUNCTION} not found in database`);
    }

    const target = firstDayOfMonth(MONTHS_AHEAD);
    let last = boundaries[boundaries.length - 1];

    if (last.getTime() >= target.getTime()) {
      console.log(`Partition maintenance: nothing to do (last boundary ${toBoundaryLiteral(last)} >= target ${toBoundaryLiteral(target)}).`);
      return;
    }

    let splitCount = 0;
    while (last.getTime() < target.getTime()) {
      const nextMonth = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1));
      // Guarda de segurança: split apenas de fronteira futura vazia
      if (nextMonth.getTime() <= firstDayOfMonth(0).getTime()) {
        throw new Error(`Refusing to split non-future boundary ${toBoundaryLiteral(nextMonth)}`);
      }
      const literal = toBoundaryLiteral(nextMonth);
      await prisma.$executeRawUnsafe(
        `ALTER PARTITION FUNCTION ${PARTITION_FUNCTION}() SPLIT RANGE ('${literal}')`,
      );
      splitCount += 1;
      last = nextMonth;
      console.log(`Partition maintenance: SPLIT RANGE (${literal}) applied.`);
    }
    console.log(`Partition maintenance done: ${splitCount} boundary(ies) added, now covering 24 future months.`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
