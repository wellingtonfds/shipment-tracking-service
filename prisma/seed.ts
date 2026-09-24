// Seed idempotente — customers, users, shipments, shipment_events.
// Execução: npm run db:seed
// Notas:
// - Identificadores em inglês (English-only code); dados são brasileiros de propósito.
// - Upsets: customer por email, user por email, shipment por cargoCode; eventos re-inseridos só se a carga for nova.
// - passwordHash é placeholder ("seed-only-hash"); hashing real (bcrypt/argon2) entra na fase de auth.
import 'dotenv/config';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Default development password for all seeded users (dev only, documented in docs/DEVELOPMENT.md).
const SEED_DEFAULT_PASSWORD = 'Senha123!';

const scryptAsync = promisify(scryptCallback);

async function hashPassword(plaintext: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(plaintext, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })) as Buffer;
  return ['scrypt', 16384, 8, 1, salt, derived.toString('hex')].join('$');
}

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

const users = [
  // Administrators
  { name: 'Admin Central', email: 'admin@logistica.com', role: 'ADMINISTRATOR', active: true, customerEmail: null },
  { name: 'Admin Suporte', email: 'admin.suporte@logistica.com', role: 'ADMINISTRATOR', active: true, customerEmail: null },
  // Operators (customer staff: every OPERATOR is linked to a customer)
  { name: 'Sérgio Nogueira', email: 'sergio.nogueira@logistica.com', role: 'OPERATOR', active: true, customerEmail: 'maria.silva@example.com' },
  { name: 'Tânia Mendes', email: 'tania.mendes@logistica.com', role: 'OPERATOR', active: true, customerEmail: 'joao.souza@example.com' },
  { name: 'Vitor Hugo Ramos', email: 'vitor.ramos@logistica.com', role: 'OPERATOR', active: true, customerEmail: 'ana.oliveira@example.com' },
  { name: 'Elaine Prado', email: 'elaine.prado@logistica.com', role: 'OPERATOR', active: true, customerEmail: 'carlos.pereira@example.com' },
  { name: 'Rita Dias', email: 'rita.dias@logistica.com', role: 'OPERATOR', active: true, customerEmail: 'fernanda.costa@example.com' },
  { name: 'Otávio Lopes', email: 'otavio.lopes@logistica.com', role: 'OPERATOR', active: true, customerEmail: 'pedro.almeida@example.com' },
  // Customer-linked users (scoping: sees only their own customer's shipments)
  { name: 'Portal Maria Silva', email: 'portal.maria@example.com', role: 'CUSTOMER', active: true, customerEmail: 'maria.silva@example.com' },
  { name: 'Portal João Souza', email: 'portal.joao@example.com', role: 'CUSTOMER', active: true, customerEmail: 'joao.souza@example.com' },
  { name: 'Portal Ana Oliveira', email: 'portal.ana@example.com', role: 'CUSTOMER', active: true, customerEmail: 'ana.oliveira@example.com' },
  { name: 'Portal Carlos Pereira', email: 'portal.carlos@example.com', role: 'CUSTOMER', active: true, customerEmail: 'carlos.pereira@example.com' },
  { name: 'Portal Fernanda Costa', email: 'portal.fernanda@example.com', role: 'CUSTOMER', active: true, customerEmail: 'fernanda.costa@example.com' },
  { name: 'Portal Pedro Almeida', email: 'portal.pedro@example.com', role: 'CUSTOMER', active: true, customerEmail: 'pedro.almeida@example.com' },
];

// Geolocation resolved by Nominatim (OSM) — coordinates fixed here for reproducible seed data.
interface ShipmentSeed {
  cargoCode: string;
  status: string;
  origin: [string, string, number, number]; // city, country, lat, long
  destination: [string, string, number, number];
  current: [string, number, number]; // text, lat, long
  departureDays: number;
  estimatedDays: number;
  deliveredDays: number | null;
  customerEmail: string;
  handlerEmail: string;
}

const shipments: ShipmentSeed[] = [
  { cargoCode: 'BR2026-0001', status: 'DELIVERED', origin: ['São Paulo', 'Brasil', -23.5505, -46.6333], destination: ['Rio de Janeiro', 'Brasil', -22.9068, -43.1729], current: ['Rio de Janeiro, RJ', -22.9068, -43.1729], departureDays: -20, estimatedDays: 6, deliveredDays: 5, customerEmail: 'maria.silva@example.com', handlerEmail: 'sergio.nogueira@logistica.com' },
  { cargoCode: 'BR2026-0002', status: 'IN_TRANSIT', origin: ['Curitiba', 'Brasil', -25.4284, -49.2733], destination: ['São Paulo', 'Brasil', -23.5505, -46.6333], current: ['Campinas, SP', -22.9056, -47.0608], departureDays: -3, estimatedDays: 4, deliveredDays: null, customerEmail: 'joao.souza@example.com', handlerEmail: 'tania.mendes@logistica.com' },
  { cargoCode: 'BR2026-0003', status: 'CREATED', origin: ['Porto Alegre', 'Brasil', -30.0346, -51.2177], destination: ['Florianópolis', 'Brasil', -27.5954, -48.548], current: ['Porto Alegre, RS', -30.0346, -51.2177], departureDays: 2, estimatedDays: 10, deliveredDays: null, customerEmail: 'ana.oliveira@example.com', handlerEmail: 'vitor.ramos@logistica.com' },
  { cargoCode: 'BR2026-0004', status: 'TRANSFERRED', origin: ['Salvador', 'Brasil', -12.9777, -38.5016], destination: ['Recife', 'Brasil', -8.0476, -34.877], current: ['Maceió, AL', -9.6658, -35.7353], departureDays: -6, estimatedDays: 8, deliveredDays: null, customerEmail: 'carlos.pereira@example.com', handlerEmail: 'elaine.prado@logistica.com' },
  { cargoCode: 'BR2026-0005', status: 'DELIVERED', origin: ['Belo Horizonte', 'Brasil', -19.9167, -43.9345], destination: ['Brasília', 'Brasil', -15.7939, -47.8828], current: ['Brasília, DF', -15.7939, -47.8828], departureDays: -15, estimatedDays: 5, deliveredDays: 4, customerEmail: 'fernanda.costa@example.com', handlerEmail: 'rita.dias@logistica.com' },
  { cargoCode: 'BR2026-0006', status: 'IN_TRANSIT', origin: ['Manaus', 'Brasil', -3.119, -60.0217], destination: ['Belém', 'Brasil', -1.4558, -48.4902], current: ['Santarém, PA', -2.4431, -54.7083], departureDays: -4, estimatedDays: 9, deliveredDays: null, customerEmail: 'pedro.almeida@example.com', handlerEmail: 'otavio.lopes@logistica.com' },
  { cargoCode: 'BR2026-0007', status: 'CREATED', origin: ['Goiânia', 'Brasil', -16.6869, -49.2648], destination: ['Campinas', 'Brasil', -22.9056, -47.0608], current: ['Goiânia, GO', -16.6869, -49.2648], departureDays: 1, estimatedDays: 7, deliveredDays: null, customerEmail: 'maria.silva@example.com', handlerEmail: 'sergio.nogueira@logistica.com' },
  { cargoCode: 'BR2026-0008', status: 'TRANSFERRED', origin: ['Fortaleza', 'Brasil', -3.7319, -38.5267], destination: ['Natal', 'Brasil', -5.7945, -35.212], current: ['Teresina, PI', -5.0892, -42.8019], departureDays: -8, estimatedDays: 12, deliveredDays: null, customerEmail: 'joao.souza@example.com', handlerEmail: 'tania.mendes@logistica.com' },
  { cargoCode: 'INT2026-0009', status: 'IN_TRANSIT', origin: ['Santos', 'Brasil', -23.9608, -46.3336], destination: ['Rotterdam', 'Países Baixos', 51.9244, 4.4777], current: ['Atlantic Ocean (vessel MSC Aurora)', 15.0, -30.0], departureDays: -10, estimatedDays: 25, deliveredDays: null, customerEmail: 'ana.oliveira@example.com', handlerEmail: 'vitor.ramos@logistica.com' },
  { cargoCode: 'INT2026-0010', status: 'DELIVERED', origin: ['Shanghai', 'China', 31.2304, 121.4737], destination: ['Santos', 'Brasil', -23.9608, -46.3336], current: ['Santos, SP', -23.9608, -46.3336], departureDays: -45, estimatedDays: 40, deliveredDays: 42, customerEmail: 'carlos.pereira@example.com', handlerEmail: 'elaine.prado@logistica.com' },
  { cargoCode: 'BR2026-0011', status: 'IN_TRANSIT', origin: ['Vitória', 'Brasil', -20.3155, -40.3128], destination: ['Salvador', 'Brasil', -12.9777, -38.5016], current: ['Porto Seguro, BA', -16.4497, -39.0647], departureDays: -2, estimatedDays: 6, deliveredDays: null, customerEmail: 'fernanda.costa@example.com', handlerEmail: 'rita.dias@logistica.com' },
  { cargoCode: 'BR2026-0012', status: 'CREATED', origin: ['Cuiabá', 'Brasil', -15.6014, -56.0979], destination: ['Campo Grande', 'Brasil', -20.4697, -54.6201], current: ['Cuiabá, MT', -15.6014, -56.0979], departureDays: 3, estimatedDays: 9, deliveredDays: null, customerEmail: 'pedro.almeida@example.com', handlerEmail: 'otavio.lopes@logistica.com' },
];

// Optional intermediate stops (city, lat, long) used as event locations between origin and destination.
const INTERMEDIATE_STOPS: Record<string, Array<[string, number, number]>> = {
  'BR2026-0002': [['Campinas, SP', -22.9056, -47.0608]],
  'BR2026-0004': [['Maceió, AL', -9.6658, -35.7353]],
  'BR2026-0006': [['Santarém, PA', -2.4431, -54.7083]],
  'BR2026-0008': [['Teresina, PI', -5.0892, -42.8019]],
  'INT2026-0009': [['Atlantic Ocean (vessel MSC Aurora)', 15.0, -30.0]],
  'BR2026-0011': [['Porto Seguro, BA', -16.4497, -39.0647]],
};

// Event timeline per shipment — exercises the flow CREATED -> IN_TRANSIT -> TRANSFERRED -> DELIVERED.
// Each event day-offset is proportional to the shipment's total travel time.
// The latest event carries the shipment's `current` position (the current location
// is derived from the latest event, never stored on the shipment row).
function buildEvents(shipment: ShipmentSeed, departure: Date, estimated: Date): Array<{ status: string; occurredAt: Date; locationText: string; latitude: number; longitude: number; notes: string }> {
  const stops: Array<[string, number, number]> = [
    [shipment.origin[0] as string, shipment.origin[2] as number, shipment.origin[3] as number],
    ...(INTERMEDIATE_STOPS[shipment.cargoCode] ?? []),
    [shipment.destination[0] as string, shipment.destination[2] as number, shipment.destination[3] as number],
  ];
  const totalDays = Math.round((estimated.getTime() - departure.getTime()) / 86_400_000);
  const statuses = ['CREATED', 'IN_TRANSIT', 'TRANSFERRED', 'DELIVERED'] as const;
  const upTo = statuses.indexOf(shipment.status as (typeof statuses)[number]);
  const notes: Record<string, string> = {
    CREATED: 'Shipment registered in the system',
    IN_TRANSIT: 'Left origin facility',
    TRANSFERRED: 'Transferred at distribution hub',
    DELIVERED: 'Delivered to consignee',
  };
  return statuses.slice(0, upTo + 1).map((status, i) => {
    // The latest event (the cargo's current status) reports the `current` position.
    const stop = i === upTo ? shipment.current : stops[Math.min(i, stops.length - 1)];
    return {
      status,
      occurredAt: days(departure, Math.round((i * totalDays) / Math.max(1, upTo))),
      locationText: stop[0],
      latitude: stop[1],
      longitude: stop[2],
      notes: notes[status],
    };
  });
}

function days(base: Date, offset: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return d;
}

function daysFromNow(offset: number): Date {
  return days(new Date(), offset);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL missing from environment');
  }

  const prisma = new PrismaClient({ adapter: new PrismaMssql(url) });

  try {
    // 1) Customers (upsert by email)
    for (const customer of customers) {
      await prisma.customer.upsert({
        where: { email: customer.email },
        update: { name: customer.name, phone: customer.phone, address: customer.address },
        create: customer,
      });
    }
    console.log(`Seed: ${customers.length} customers (upsert by email).`);

    // 2) Users (upsert by email; customer link resolved by email)
    const customerByEmail = new Map<string, { id: number }>();
    for (const c of await prisma.customer.findMany({ select: { id: true, email: true } })) {
      customerByEmail.set(c.email, c);
    }
    const passwordHash = await hashPassword(SEED_DEFAULT_PASSWORD);
    for (const user of users) {
      const customerId = user.customerEmail ? (customerByEmail.get(user.customerEmail)?.id ?? null) : null;
      if ((user.role === 'OPERATOR' || user.role === 'CUSTOMER') && customerId === null) {
        throw new Error(`Seed error: ${user.role} user ${user.email} references unknown customer ${user.customerEmail}`);
      }
      if (user.role === 'ADMINISTRATOR' && customerId !== null) {
        throw new Error(`Seed error: ADMINISTRATOR user ${user.email} must not be linked to a customer`);
      }
      const data = { name: user.name, role: user.role, active: user.active, customerId };
      // passwordHash is set only on create: re-seeding never resets an existing password
      await prisma.user.upsert({
        where: { email: user.email },
        update: { name: data.name, role: data.role, active: data.active, customerId: data.customerId },
        create: { email: user.email, passwordHash, ...data },
      });
    }
    // One-time migration: users seeded with the old 'seed-only-hash' placeholder
    // get the real default-password hash (no-op once migrated).
    const migrated = await prisma.user.updateMany({
      where: { passwordHash: 'seed-only-hash' },
      data: { passwordHash },
    });
    if (migrated.count > 0) {
      console.log(`Seed: migrated ${migrated.count} placeholder passwordHash(es) to the default dev password.`);
    }
    console.log(`Seed: ${users.length} users (upsert by email).`);

    // 3) Shipments (upsert by cargoCode) + 4) ShipmentEvents (inserted only when shipment is new)
    let eventsCreated = 0;
    for (const s of shipments) {
      const customer = customerByEmail.get(s.customerEmail);
      if (!customer) throw new Error(`Seed error: unknown customer ${s.customerEmail}`);
      const handler = await prisma.user.findUnique({ where: { email: s.handlerEmail } });
      if (!handler) throw new Error(`Seed error: unknown handler user ${s.handlerEmail}`);

      const departureDate = daysFromNow(s.departureDays);
      const estimatedDeliveryDate = daysFromNow(s.departureDays + s.estimatedDays);
      const shipmentData = {
        status: s.status,
        originCity: s.origin[0], originCountry: s.origin[1],
        originAddress: `${s.origin[0]}, ${s.origin[1]}`,
        originLatitude: s.origin[2], originLongitude: s.origin[3],
        destinationCity: s.destination[0], destinationCountry: s.destination[1],
        destinationAddress: `${s.destination[0]}, ${s.destination[1]}`,
        destinationLatitude: s.destination[2], destinationLongitude: s.destination[3],
        geocodedAt: new Date(), geocodeProvider: 'NOMINATIM',
        departureDate,
        estimatedDeliveryDate,
        deliveredAt: s.deliveredDays === null ? null : daysFromNow(s.departureDays + s.deliveredDays),
        customerId: customer.id,
        handledById: handler.id,
      };
      const shipment = await prisma.shipment.upsert({
        where: { cargoCode: s.cargoCode },
        // Sync handler on re-seed: every shipment is handled by an operator of its own customer
        update: { handledById: handler.id },
        create: { cargoCode: s.cargoCode, ...shipmentData },
      });

      const existingEvents = await prisma.shipmentEvent.count({ where: { shipmentId: shipment.id } });
      if (existingEvents === 0) {
        const events = buildEvents(s, departureDate, estimatedDeliveryDate);
        await prisma.shipmentEvent.createMany({
          data: events.map((e) => ({ ...e, shipmentId: shipment.id, createdById: handler.id })),
        });
        eventsCreated += events.length;
      }
    }
    console.log(`Seed: ${shipments.length} shipments (upsert by cargoCode), ${eventsCreated} shipment events (inserted only for new shipments).`);

    // Cleanup of the removed technical user: every shipment is now handled by an operator
    // of its own customer, so integration@system.local must hold no shipments (FK NoAction).
    // Event authorship (createdById) is preserved as NULL via SetNull.
    const integration = await prisma.user.findUnique({ where: { email: 'integration@system.local' }, select: { id: true } });
    if (integration) {
      const handled = await prisma.shipment.count({ where: { handledById: integration.id } });
      if (handled > 0) {
        throw new Error(`Seed error: integration@system.local still handles ${handled} shipment(s); reassign handlers before removal`);
      }
      await prisma.user.delete({ where: { id: integration.id } });
      console.log('Seed: removed legacy integration@system.local user.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();
