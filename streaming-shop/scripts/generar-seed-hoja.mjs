// Genera apps-script/Seed.js a partir de src/data/*.json, para que la hoja nueva arranque
// con el mismo catálogo que hoy tiene la web. Uso: npm run hoja:seed
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => JSON.parse(readFileSync(join(root, 'src/data', f), 'utf8'))

const site = read('site.json')
const platforms = read('platforms.json')
const packs = read('plans.json')
const faq = read('faq.json')

const categoryLabel = { video: 'Películas y series', musica: 'Música', anime: 'Anime' }

const SEED = {
  AJUSTES: [
    ['MARCA', site.brand, 'Nombre que se ve en la web y en los mensajes'],
    ['WHATSAPP', site.whatsapp, 'Número con código de país, solo dígitos'],
    ['CIUDAD', site.city, ''],
    ['HORARIO', site.hours, 'Se muestra en la web'],
    ['CORREO', site.email, ''],
    ['INSTAGRAM', site.instagram ?? '', ''],
    ['TIKTOK', site.tiktok ?? '', ''],
    ['ANUNCIO', site.announcement ?? '', ''],
    ['LEMA', site.tagline ?? '', ''],
    ['DIAS POR MES', '30', 'Días que dura cada mes vendido (para calcular el vencimiento)'],
    ['CODIGO PAIS', '51', 'Se agrega a los celulares de 9 dígitos'],
    ['PEDIDOS POR HORA POR TELEFONO', '5', 'Freno contra pedidos falsos desde la web'],
  ],
  PLATAFORMAS: platforms.map((p, i) => [
    p.id, p.name, p.slug, categoryLabel[p.category] ?? p.category, p.tagline ?? '', p.description ?? '',
    (p.features ?? []).join(' | '), p.field ?? p.color ?? '', p.ink ?? '', p.badge ?? '', i + 1, true,
  ]),
  PLANES: platforms.flatMap((p) => p.plans.map((pl) => [p.id, pl.id, pl.label, pl.months, pl.price, true])),
  PACKS: packs.map((k) => [
    k.id, k.name, k.price, k.period, k.description, k.platforms.join(', '), k.perks.join(' | '), !!k.highlight, true,
  ]),
  FAQ: faq.map((f, i) => [f.q, f.a, i + 1, true]),
}

const out = `/**
 * LokiStream · datos iniciales de la hoja (generado por scripts/generar-seed-hoja.mjs, no editar a mano).
 * Solo se usan cuando instalarLokiStream() crea una pestaña vacía.
 */
var SEED = ${JSON.stringify(SEED, null, 2)};
`
writeFileSync(join(root, 'apps-script/Seed.js'), out)
console.log(`apps-script/Seed.js: ${SEED.PLATAFORMAS.length} plataformas, ${SEED.PLANES.length} planes, ${SEED.PACKS.length} packs, ${SEED.FAQ.length} preguntas`)
