import '../config/dotenv.js';
import argon2 from 'argon2';
import { bootDatabase } from '../bootstrap.js';
import { getDb } from '../db/index.js';
import { users } from '../db/schema.js';

// Uso: npm run create-superadmin -- correo@dominio.com "Contraseña segura" "Nombre"
const [email, password, name = 'Super Admin'] = process.argv.slice(2);
if (!email || !password || password.length < 10) {
  console.error('Uso: npm run create-superadmin -- <email> <contraseña (mín. 10)> [nombre]');
  process.exit(1);
}
const db = await bootDatabase();
const passwordHash = await argon2.hash(password);
await getDb()
  .insert(users)
  .values({ email: email.toLowerCase(), name, role: 'superadmin', passwordHash, tenantId: null, emailVerifiedAt: new Date() })
  .onConflictDoUpdate({ target: users.email, set: { passwordHash, role: 'superadmin', tenantId: null } });
console.log(`✔ Super-admin listo: ${email}`);
await db.close();
