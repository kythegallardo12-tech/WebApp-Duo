/**
 * Load development sample data:  npm run seed
 * Refuses to run when NODE_ENV=production. Repeatable: it never duplicates records.
 */
import { config } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { seedSampleData } from '../services/seed.js';

if (config.isProd) {
  console.error('Refusing to seed sample data with NODE_ENV=production.');
  process.exit(1);
}
if (!config.mongoUri) {
  console.error('MONGODB_URI is not set. Copy .env.example to .env first.');
  process.exit(1);
}

await connectDb(config.mongoUri);
const counts = await seedSampleData();
console.log('Sample data loaded:', counts);
await disconnectDb();
