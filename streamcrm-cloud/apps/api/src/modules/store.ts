/**
 * Cliente de la tienda en Google Sheets (Apps Script /exec de LokiStream).
 *   GET  ?action=bot_catalog&key=…   catálogo con PRECIO MINIMO (solo con la clave del bot)
 *   POST {type:'order', botKey, …}    pedido con precio acordado
 *   POST {type:'payment_claim', …}    comprobante → «Por verificar»
 * Apps Script responde POST con una redirección 302: fetch la sigue (como GET), que es lo que Google espera.
 */
import { randomBytes } from 'node:crypto';
import { decrypt } from '../lib/crypto.js';
import type { Tenant } from './subscriptions.js';

export interface StoreItem {
  /** netflix:1m · pack:pack-cine */
  key: string;
  name: string;
  price: number;
  minPrice: number;
  months: number;
  /** Plataformas incluidas (para packs). */
  includes?: string[];
}

export interface StoreCatalog {
  brand: string;
  hours: string;
  payment: string;
  items: StoreItem[];
  faq: { q: string; a: string }[];
}

interface RawCatalog {
  ok?: boolean;
  error?: string;
  site?: { brand?: string; hours?: string };
  payment?: string;
  platforms?: { id: string; name: string; plans: { id: string; label: string; months: number; price: number; minPrice?: number }[] }[];
  packs?: { id: string; name: string; price: number; minPrice?: number; platforms: string[] }[];
  faq?: { q: string; a: string }[];
}

export function flattenCatalog(raw: RawCatalog): StoreCatalog {
  const names = new Map((raw.platforms ?? []).map((p) => [p.id, p.name]));
  const items: StoreItem[] = [];
  for (const p of raw.platforms ?? []) {
    for (const pl of p.plans ?? []) {
      items.push({ key: `${p.id}:${pl.id}`, name: `${p.name} · ${pl.label}`, price: pl.price, minPrice: pl.minPrice ?? pl.price, months: pl.months });
    }
  }
  for (const k of raw.packs ?? []) {
    items.push({
      key: `pack:${k.id}`,
      name: `${k.name} (1 mes)`,
      price: k.price,
      minPrice: k.minPrice ?? k.price,
      months: 1,
      includes: k.platforms.map((id) => names.get(id) ?? id),
    });
  }
  return {
    brand: raw.site?.brand ?? 'la tienda',
    hours: raw.site?.hours ?? '',
    payment: raw.payment ?? 'Yape o Plin (pide el número al vendedor)',
    items,
    faq: raw.faq ?? [],
  };
}

export type StoreFetch = (url: string, init?: RequestInit) => Promise<Response>;
let storeFetch: StoreFetch = (url, init) => fetch(url, { ...init, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
/** Para tests: reemplazar la red por la hoja simulada. */
export const setStoreFetch = (f: StoreFetch) => {
  storeFetch = f;
};

const cache = new Map<string, { at: number; catalog: StoreCatalog }>();
const CACHE_MS = 5 * 60_000;
export const clearStoreCache = () => cache.clear();

export interface StoreConfig {
  url: string;
  key: string;
}

export function storeConfig(t: Pick<Tenant, 'storeApiUrl' | 'storeBotKeyEnc'>): StoreConfig | null {
  const key = decrypt(t.storeBotKeyEnc);
  if (!t.storeApiUrl || !key) return null;
  return { url: t.storeApiUrl, key };
}

async function readJson(res: Response) {
  if (!res.ok) throw new Error(`La tienda respondió ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function getStoreCatalog(cfg: StoreConfig, now = Date.now()): Promise<StoreCatalog> {
  const hit = cache.get(cfg.url);
  if (hit && now - hit.at < CACHE_MS) return hit.catalog;
  const u = new URL(cfg.url);
  u.searchParams.set('action', 'bot_catalog');
  u.searchParams.set('key', cfg.key);
  const body = (await readJson(await storeFetch(u.toString()))) as RawCatalog;
  if (!body.ok) throw new Error(`La tienda rechazó el catálogo: ${body.error ?? 'sin detalle'}`);
  const catalog = flattenCatalog(body);
  cache.set(cfg.url, { at: now, catalog });
  return catalog;
}

/** Código de pedido con el mismo formato que la web (LK-XXXXXX). */
export const newOrderId = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'LK-' + Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
};

export interface StoreOrderLine {
  key: string;
  profiles: number;
  /** Precio unitario acordado. */
  price: number;
}

async function post(cfg: StoreConfig, payload: Record<string, unknown>) {
  const res = await storeFetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, botKey: cfg.key }),
  });
  return readJson(res);
}

export async function createStoreOrder(
  cfg: StoreConfig,
  order: { id: string; name: string; phone: string; consent: boolean; lines: StoreOrderLine[]; note?: string },
) {
  const items = order.lines.map((l) => {
    if (l.key.startsWith('pack:')) return { packId: l.key.slice(5), price: l.price };
    const [platformId, planId] = l.key.split(':');
    return { platformId, planId, profiles: l.profiles, price: l.price };
  });
  const body = await post(cfg, {
    type: 'order',
    id: order.id,
    customer: { name: order.name, phone: order.phone.replace(/^\+/, '') },
    consent: order.consent,
    note: order.note,
    items,
  });
  return body as { ok: boolean; id?: string; total?: number; error?: string; duplicate?: boolean };
}

export async function sendPaymentClaim(
  cfg: StoreConfig,
  claim: { id: string; amount: number | null; method: string; operation?: string | null; payer?: string | null },
) {
  return (await post(cfg, { type: 'payment_claim', ...claim })) as { ok: boolean; status?: string; error?: string };
}
