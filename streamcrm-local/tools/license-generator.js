#!/usr/bin/env node
// HERRAMIENTA DEL VENDEDOR — NO SE ENTREGA AL CLIENTE (npm run package la excluye).
//
//   node tools/license-generator.js --init                       crea el par de claves Ed25519
//   node tools/license-generator.js --business "Streaming Juan" --type anual --months 12 --features ai_calls,whatsapp
//   node tools/license-generator.js --business "X" --type perpetua --support-months 12 --features ai_calls,whatsapp,multiuser,branding
//   node tools/license-generator.js --verify <licencia>
//
// Opciones extra: --max-subs 500  --max-users 3  --id LIC-0001
// La clave privada queda en tools/keys/private.pem: respáldala y nunca la compartas.
import fs from 'node:fs';
import path from 'node:path';
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEYS = path.join(ROOT, 'tools', 'keys');
const PRIVATE = path.join(KEYS, 'private.pem');
const PUBLIC_JS = path.join(ROOT, 'src', 'license-public-key.js');
const ISSUED = path.join(ROOT, 'tools', 'licencias');
const FEATURES = ['ai_calls', 'whatsapp', 'multiuser', 'branding'];

const { values: a } = parseArgs({
  options: {
    init: { type: 'boolean' },
    force: { type: 'boolean' },
    business: { type: 'string' },
    type: { type: 'string', default: 'anual' },
    months: { type: 'string', default: '12' },
    'support-months': { type: 'string', default: '12' },
    features: { type: 'string', default: 'ai_calls,whatsapp' },
    'max-subs': { type: 'string' },
    'max-users': { type: 'string' },
    id: { type: 'string' },
    verify: { type: 'string' },
  },
});

function writePublicKeyModule(publicPem) {
  fs.writeFileSync(
    PUBLIC_JS,
    `// Clave pública Ed25519 del vendedor (generada por tools/license-generator.js --init).\n` +
      `// La app solo verifica licencias; no puede crearlas.\n` +
      `export const LICENSE_PUBLIC_KEY = \`${publicPem.trim()}\`;\n`,
  );
}

function initKeys() {
  if (fs.existsSync(PRIVATE) && !a.force) {
    console.error(`Ya existe ${PRIVATE}. Si generas otro par, las licencias emitidas dejarán de servir.\nUsa --force solo si sabes lo que haces.`);
    process.exit(1);
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  fs.mkdirSync(KEYS, { recursive: true });
  fs.writeFileSync(PRIVATE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(path.join(KEYS, 'public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
  writePublicKeyModule(publicKey.export({ type: 'spki', format: 'pem' }));
  console.log(`✔ Clave privada: ${PRIVATE}  (RESPÁLDALA fuera de esta PC)\n✔ Clave pública escrita en ${PUBLIC_JS}`);
}

function addMonths(months) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + Number(months));
  d.setUTCHours(23, 59, 59, 0);
  return d.toISOString();
}

function issue() {
  if (!a.business) {
    console.error('Falta --business "Nombre del negocio"');
    process.exit(1);
  }
  if (!['anual', 'perpetua'].includes(a.type)) {
    console.error('--type debe ser anual o perpetua');
    process.exit(1);
  }
  const features = a.features.split(',').map((f) => f.trim()).filter(Boolean);
  const unknown = features.filter((f) => !FEATURES.includes(f));
  if (unknown.length) {
    console.error(`Funciones desconocidas: ${unknown.join(', ')}. Válidas: ${FEATURES.join(', ')}`);
    process.exit(1);
  }
  if (!fs.existsSync(PRIVATE)) {
    console.log('No hay claves todavía: las creo.');
    initKeys();
  }
  const license = {
    licenseId: a.id ?? `LIC-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(3).toString('hex').toUpperCase()}`,
    businessName: a.business,
    type: a.type,
    ...(a.type === 'anual' ? { expiresAt: addMonths(a.months) } : {}),
    ...(a['max-subs'] ? { maxSubscriptions: Number(a['max-subs']) } : {}),
    ...(a['max-users'] ? { maxUsers: Number(a['max-users']) } : {}),
    features,
    supportUntil: a.type === 'anual' ? addMonths(a.months) : addMonths(a['support-months']),
    issuedAt: new Date().toISOString(),
  };
  const body = Buffer.from(JSON.stringify(license)).toString('base64url');
  const sig = sign(null, Buffer.from(body), createPrivateKey(fs.readFileSync(PRIVATE))).toString('base64url');
  const key = `STREAMCRM-${body}.${sig}`;
  fs.mkdirSync(ISSUED, { recursive: true });
  const file = path.join(ISSUED, `${license.licenseId}.txt`);
  fs.writeFileSync(file, `${key}\n\n${JSON.stringify(license, null, 2)}\n`);
  console.log(JSON.stringify(license, null, 2));
  console.log(`\nLicencia (cópiala completa en el asistente o en Ajustes → Licencia):\n\n${key}\n\nGuardada en ${file}`);
}

function verifyOnly(text) {
  const [body, sig] = text.replace(/\s+/g, '').replace(/^STREAMCRM-/, '').split('.');
  const pub = fs.existsSync(path.join(KEYS, 'public.pem'))
    ? createPublicKey(fs.readFileSync(path.join(KEYS, 'public.pem')))
    : createPublicKey(createPrivateKey(fs.readFileSync(PRIVATE)));
  const ok = !!body && !!sig && verify(null, Buffer.from(body), pub, Buffer.from(sig, 'base64url'));
  console.log(ok ? '✔ Firma válida' : '✘ Firma inválida');
  if (ok) console.log(JSON.stringify(JSON.parse(Buffer.from(body, 'base64url').toString()), null, 2));
  process.exit(ok ? 0 : 1);
}

if (a.init) initKeys();
else if (a.verify) verifyOnly(a.verify);
else issue();
