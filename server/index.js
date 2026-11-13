import { config, assertConfig } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { createApp } from './app.js';

assertConfig();
await connectDb(config.mongoUri);

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`StockFlow API listening on http://localhost:${config.port} (${config.env})`);
});

const shutdown = async () => {
  server.close();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
