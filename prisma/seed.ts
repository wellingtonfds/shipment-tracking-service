// Seed de customers — dados fixos e idempotentes (upsert por email).
// Execução: npm run db:seed
// Nota: identificadores em inglês (English-only code); dados são reais brasileiros de propósito.
import 'dotenv/config';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '../src/generated/prisma/client.js';

const customers = [
  { name: 'Maria Silva', email: 'maria.silva@example.com', phone: '(11) 98888-7777', address: 'Av. Paulista, 1000 - apto 42, São Paulo/SP' },
  { name: 'João Souza', email: 'joao.souza@example.com', phone: '(21) 97777-6666', address: 'Rua do Ouvidor, 25, Rio de Janeiro/RJ' },
  { name: 'Ana Oliveira', email: 'ana.oliveira@example.com', phone: '(31) 96666-5555', address: 'Rua da Bahia, 530, Belo Horizonte/MG' },
  { name: 'Carlos Pereira', email: 'carlos.pereira@example.com', phone: '(41) 95555-4444', address: 'Av. Batel, 1750, Curitiba/PR' },
  { name: 'Fernanda Costa', email: 'fernanda.costa@example.com', phone: '(51) 94444-3333', address: 'Rua Padre Chagas, 300, Porto Alegre/RS' },
  { name: 'Pedro Almeida', email: 'pedro.almeida@example.com', phone: '(71) 93333-2222', address: 'Av. Oceânica, 2200, Salvador/BA' },
  { name: 'Juliana Rodrigues', email: 'juliana.rodrigues@example.com', phone: '(81) 92222-1111', address: 'Rua da Aurora, 480, Recife/PE' },
  { name: 'Rafael Martins', email: 'rafael.martins@example.com', phone: '(85) 91111-0000', address: 'Av. Beira Mar, 3800, Fortaleza/CE' },
  { name: 'Patrícia Gomes', email: 'patricia.gomes@example.com', phone: '(62) 95555-1234', address: 'Rua 15, 800, Goiânia/GO' },
  { name: 'Bruno Fernandes', email: 'bruno.fernandes@example.com', phone: '(61) 98888-4321', address: 'SQS 108 Bloco A, Brasília/DF' },
  { name: 'Camila Ribeiro', email: 'camila.ribeiro@example.com', phone: '(48) 97777-8765', address: 'Rua Felipe Schmidt, 90, Florianópolis/SC' },
  { name: 'Lucas Barbosa', email: 'lucas.barbosa@example.com', phone: '(92) 96666-7654', address: 'Av. Djalma Batista, 1500, Manaus/AM' },
  { name: 'Beatriz Lima', email: 'beatriz.lima@example.com', phone: '(71) 95555-6543', address: 'Rua Chile, 120, Salvador/BA' },
  { name: 'Gustavo Cardoso', email: 'gustavo.cardoso@example.com', phone: '(19) 94444-5432', address: 'Av. Barão de Itapura, 2100, Campinas/SP' },
  { name: 'Larissa Azevedo', email: 'larissa.azevedo@example.com', phone: '(84) 93333-3210', address: 'Av. Rio Branco, 640, Natal/RN' },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL missing from environment');
  }

  const prisma = new PrismaClient({ adapter: new PrismaMssql(url) });

  try {
    for (const customer of customers) {
      await prisma.customer.upsert({
        where: { email: customer.email },
        update: { name: customer.name, phone: customer.phone, address: customer.address },
        create: customer,
      });
    }
    console.log(`Seed complete: ${customers.length} customers (upsert by email).`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
