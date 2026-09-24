import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const collections = {
  customers: 'Customers.postman_collection.json',
  tracking: 'Tracking.postman_collection.json',
};
const selection = process.argv[2];
if (!['customers', 'tracking', 'all'].includes(selection)) {
  console.error('Usage: npm run postman:customers|postman:tracking|postman:all');
  process.exit(2);
}
const prefix = (process.env.API_PREFIX ?? 'api/v1').replace(/^\/+|\/+$/g, '');
const baseUrl = `http://127.0.0.1:${process.env.PORT ?? '3000'}/${prefix}`;
const values = {
  baseUrl,
  adminEmail: process.env.POSTMAN_ADMIN_EMAIL ?? 'admin@logistica.com',
  operatorEmail: process.env.POSTMAN_OPERATOR_EMAIL ?? 'sergio.nogueira@logistica.com',
  otherOperatorEmail: process.env.POSTMAN_OTHER_OPERATOR_EMAIL ?? 'tania.mendes@logistica.com',
  seedPassword: process.env.POSTMAN_SEED_PASSWORD ?? 'Senha123!',
};
const names = selection === 'all' ? Object.keys(collections) : [selection];
const newman = fileURLToPath(new URL('../node_modules/newman/bin/newman.js', import.meta.url));
for (const name of names) {
  const args = [newman, 'run', fileURLToPath(new URL(`../postman/${collections[name]}`, import.meta.url))];
  for (const [key, value] of Object.entries(values)) args.push('--env-var', `${key}=${value}`);
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
