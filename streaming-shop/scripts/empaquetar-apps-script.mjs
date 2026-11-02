// Une todos los archivos de apps-script/ en uno solo para pegarlo en el editor de Apps Script.
// Uso: npm run hoja:bundle  →  apps-script/dist/LokiStream.gs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps-script')
// Orden importa solo para leer el archivo; en Apps Script todo es global.
const files = ['Config.js', 'Util.js', 'Catalog.js', 'Orders.js', 'Fulfillment.js', 'Sheet.js', 'WhatsApp.js', 'Web.js', 'Automation.js', 'Setup.js', 'Seed.js']

const parts = files.map((f) => `// ===== ${f} =====\n${readFileSync(join(root, f), 'utf8').trim()}\n`)
mkdirSync(join(root, 'dist'), { recursive: true })
const out = `// LokiStream para Google Sheets · generado ${new Date().toISOString().slice(0, 10)}\n// Pega este archivo completo en Extensiones → Apps Script (reemplaza Código.gs).\n\n${parts.join('\n')}`
writeFileSync(join(root, 'dist', 'LokiStream.gs'), out)
console.log(`apps-script/dist/LokiStream.gs (${files.length} archivos, ${(out.length / 1024).toFixed(1)} KB)`)
