// Genera el .zip de entrega para un cliente. Nunca incluye tools/ (tu clave privada), docs/VENDEDOR.md, .env, data/ ni backups/.
//
//   npm run package
//   npm run package -- --cliente clientes/streaming-juan     (carpeta con branding.json, logo y licencia.txt)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createZip } from './lib/zip.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const { values: a } = parseArgs({ options: { cliente: { type: 'string' }, out: { type: 'string' } } });

const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'data', 'backups', 'dist', 'tools', 'clientes', '.claude']);
const EXCLUDE_FILES = [/^\.env$/, /\.log$/, /^branding\.json$/, /^licencia\.txt$/, /^\.DS_Store$/];
const EXECUTABLE = /\.sh$/;
const PREFIX = 'streamcrm-local/';

function walk(dir, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) out.push(...walk(path.join(dir, entry.name), r));
    } else if (!(rel === '' && EXCLUDE_FILES.some((re) => re.test(entry.name))) && !/\.log$/.test(entry.name) && r !== 'docs/VENDEDOR.md') {
      out.push(r);
    }
  }
  return out;
}

const files = walk(ROOT);
const entries = files.map((f) => ({ name: PREFIX + f, data: fs.readFileSync(path.join(ROOT, f)), mode: EXECUTABLE.test(f) ? 0o755 : 0o644 }));

let suffix = '';
if (a.cliente) {
  const dir = path.resolve(ROOT, a.cliente);
  const brandingFile = path.join(dir, 'branding.json');
  if (!fs.existsSync(brandingFile)) {
    console.error(`No encuentro ${brandingFile}`);
    process.exit(1);
  }
  const branding = JSON.parse(fs.readFileSync(brandingFile, 'utf8'));
  if (branding.logo) {
    const logo = path.join(dir, branding.logo);
    if (!fs.existsSync(logo)) {
      console.error(`branding.json apunta a un logo que no existe: ${logo}`);
      process.exit(1);
    }
    const target = `branding/${path.basename(branding.logo)}`;
    entries.push({ name: PREFIX + target, data: fs.readFileSync(logo) });
    branding.logo = target;
  }
  entries.push({ name: PREFIX + 'branding.json', data: Buffer.from(JSON.stringify(branding, null, 2)) });
  const lic = path.join(dir, 'licencia.txt');
  if (fs.existsSync(lic)) entries.push({ name: PREFIX + 'licencia.txt', data: fs.readFileSync(lic) });
  suffix = '-' + path.basename(dir).replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  console.log(`Personalizado para: ${branding.businessName ?? path.basename(dir)}${fs.existsSync(lic) ? ' (con licencia)' : ''}`);
}

// Comprobaciones de seguridad antes de escribir el zip.
const forbidden = entries.filter((e) => /(^|\/)(tools|data|backups|node_modules)\/|\/\.env$|private\.pem$/.test(e.name.slice(PREFIX.length)));
if (forbidden.length) {
  console.error('Se colaron archivos prohibidos:', forbidden.map((e) => e.name));
  process.exit(1);
}
if (!fs.readFileSync(path.join(ROOT, 'src', 'license-public-key.js'), 'utf8').includes('BEGIN PUBLIC KEY')) {
  console.error('Falta la clave pública. Ejecuta: node tools/license-generator.js --init');
  process.exit(1);
}

const out = path.resolve(ROOT, a.out ?? path.join('dist', `streamcrm-local-v${pkg.version}${suffix}.zip`));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, createZip(entries));
console.log(`✔ ${entries.length} archivos → ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
console.log('  Sin tools/, .env, data/ ni backups/. El cliente ejecuta instalar.bat (Windows) o ./instalar.sh.');
