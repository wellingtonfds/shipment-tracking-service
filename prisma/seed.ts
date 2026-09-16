// Seed de clientes — dados fixos e idempotentes (upsert por email).
// Execução: npm run db:seed
import 'dotenv/config';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '../src/generated/prisma/client.js';

const clientes = [
  { nome: 'Maria Silva', email: 'maria.silva@example.com', telefone: '(11) 98888-7777', endereco: 'Av. Paulista, 1000 - apto 42, São Paulo/SP' },
  { nome: 'João Souza', email: 'joao.souza@example.com', telefone: '(21) 97777-6666', endereco: 'Rua do Ouvidor, 25, Rio de Janeiro/RJ' },
  { nome: 'Ana Oliveira', email: 'ana.oliveira@example.com', telefone: '(31) 96666-5555', endereco: 'Rua da Bahia, 530, Belo Horizonte/MG' },
  { nome: 'Carlos Pereira', email: 'carlos.pereira@example.com', telefone: '(41) 95555-4444', endereco: 'Av. Batel, 1750, Curitiba/PR' },
  { nome: 'Fernanda Costa', email: 'fernanda.costa@example.com', telefone: '(51) 94444-3333', endereco: 'Rua Padre Chagas, 300, Porto Alegre/RS' },
  { nome: 'Pedro Almeida', email: 'pedro.almeida@example.com', telefone: '(71) 93333-2222', endereco: 'Av. Oceânica, 2200, Salvador/BA' },
  { nome: 'Juliana Rodrigues', email: 'juliana.rodrigues@example.com', telefone: '(81) 92222-1111', endereco: 'Rua da Aurora, 480, Recife/PE' },
  { nome: 'Rafael Martins', email: 'rafael.martins@example.com', telefone: '(85) 91111-0000', endereco: 'Av. Beira Mar, 3800, Fortaleza/CE' },
  { nome: 'Patrícia Gomes', email: 'patricia.gomes@example.com', telefone: '(62) 95555-1234', endereco: 'Rua 15, 800, Goiânia/GO' },
  { nome: 'Bruno Fernandes', email: 'bruno.fernandes@example.com', telefone: '(61) 98888-4321', endereco: 'SQS 108 Bloco A, Brasília/DF' },
  { nome: 'Camila Ribeiro', email: 'camila.ribeiro@example.com', telefone: '(48) 97777-8765', endereco: 'Rua Felipe Schmidt, 90, Florianópolis/SC' },
  { nome: 'Lucas Barbosa', email: 'lucas.barbosa@example.com', telefone: '(92) 96666-7654', endereco: 'Av. Djalma Batista, 1500, Manaus/AM' },
  { nome: 'Beatriz Lima', email: 'beatriz.lima@example.com', telefone: '(71) 95555-6543', endereco: 'Rua Chile, 120, Salvador/BA' },
  { nome: 'Gustavo Cardoso', email: 'gustavo.cardoso@example.com', telefone: '(19) 94444-5432', endereco: 'Av. Barão de Itapura, 2100, Campinas/SP' },
  { nome: 'Larissa Azevedo', email: 'larissa.azevedo@example.com', telefone: '(84) 93333-3210', endereco: 'Av. Rio Branco, 640, Natal/RN' },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL ausente no ambiente');
  }

  const prisma = new PrismaClient({ adapter: new PrismaMssql(url) });

  try {
    for (const cliente of clientes) {
      await prisma.cliente.upsert({
        where: { email: cliente.email },
        update: { nome: cliente.nome, telefone: cliente.telefone, endereco: cliente.endereco },
        create: cliente,
      });
    }
    console.log(`Seed concluído: ${clientes.length} clientes (upsert por email).`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
