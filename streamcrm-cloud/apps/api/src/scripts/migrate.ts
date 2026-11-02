import '../config/dotenv.js';
import { bootDatabase } from '../bootstrap.js';

// bootDatabase() aplica las migraciones pendientes de apps/api/drizzle.
const db = await bootDatabase();
console.log('✔ Migraciones aplicadas');
await db.close();
