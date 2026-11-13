/**
 * Create (or promote) the initial admin account.
 *
 *   npm run create-admin -- --email you@example.com --name "Your Name"
 *
 * The password is read from the ADMIN_PASSWORD environment variable, or prompted
 * for interactively (input hidden). Nothing is hardcoded.
 */
import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { User } from '../models/index.js';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const email = (arg('email') || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const name = (arg('name') || process.env.ADMIN_NAME || 'Administrator').trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: npm run create-admin -- --email you@example.com [--name "Your Name"]');
  process.exit(1);
}
if (!config.mongoUri) {
  console.error('MONGODB_URI is not set. Copy .env.example to .env first.');
  process.exit(1);
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  password = await promptHidden('Password (min 10 characters): ');
  const again = await promptHidden('Repeat password: ');
  if (password !== again) {
    console.error('Passwords do not match.');
    process.exit(1);
  }
}
if (!password || password.length < 10) {
  console.error('Password must be at least 10 characters.');
  process.exit(1);
}

await connectDb(config.mongoUri);
const passwordHash = await bcrypt.hash(password, 12);
const existing = await User.findOne({ email });
if (existing) {
  existing.set({ role: 'admin', active: true, passwordHash, name });
  await existing.save();
  console.log(`Updated ${email}: role=admin, password reset.`);
} else {
  await User.create({ email, name, role: 'admin', passwordHash });
  console.log(`Created admin ${email}.`);
}
await disconnectDb();
