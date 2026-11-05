/**
 * Regateo del vendedor de WhatsApp. Lo decide el servidor, no la IA: la IA solo puede repetir el precio
 * que sale de aquí, y la tienda (Apps Script) vuelve a comprobar que no baje del PRECIO MINIMO.
 *
 *   lista 15, mínimo 14, 2 rebajas → "¿a 13?" → contraoferta 14 (precio final)
 */

export interface NegotiationInput {
  listPrice: number;
  minPrice: number;
  /** Último precio ofrecido en esta conversación para este producto (si no hay, el de lista). */
  currentPrice?: number | null;
  /** Rebajas ya dadas en esta conversación para este producto. */
  roundsUsed?: number;
  maxRounds: number;
  /** Lo que pide el cliente. null/undefined = solo pregunta el precio. */
  askedPrice?: number | null;
}

export type NegotiationDecision =
  | 'precio' // solo cotiza: precio vigente
  | 'acepta' // lo que pidió el cliente está dentro de lo permitido
  | 'contraoferta' // se baja un escalón, sin llegar a lo que pidió
  | 'precio_final'; // ya no se puede bajar más

export interface NegotiationResult {
  decision: NegotiationDecision;
  price: number;
  /** Rebajas usadas después de esta respuesta. */
  round: number;
  /** true si ya no hay más rebaja posible: el vendedor debe decirlo con claridad. */
  isFinal: boolean;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Precio en soles para el mensaje: "S/ 14" o "S/ 14.50". */
export const formatPrice = (n: number) => `S/ ${Number.isInteger(n) ? n : n.toFixed(2)}`;

export function negotiate(input: NegotiationInput): NegotiationResult {
  const list = round2(input.listPrice);
  const min = round2(Math.min(Math.max(0, input.minPrice), list));
  const current = round2(Math.min(list, Math.max(min, input.currentPrice ?? list)));
  const used = Math.max(0, input.roundsUsed ?? 0);
  const maxRounds = Math.max(0, input.maxRounds);
  const noMore = (price: number, round: number) => price <= min || round >= maxRounds;

  const asked = input.askedPrice;
  if (asked === null || asked === undefined || !Number.isFinite(asked)) {
    return { decision: 'precio', price: current, round: used, isFinal: noMore(current, used) };
  }
  const want = round2(asked);
  // Pide igual o más que lo vigente: se respeta lo vigente (nunca se cobra de más).
  if (want >= current) return { decision: 'acepta', price: current, round: used, isFinal: noMore(current, used) };
  if (noMore(current, used)) return { decision: 'precio_final', price: current, round: used, isFinal: true };

  // Un escalón: reparte la rebaja posible entre las rondas permitidas, mínimo S/ 1.
  const step = Math.max(1, Math.round((list - min) / Math.max(1, maxRounds)));
  const next = round2(Math.max(min, current - step));
  const round = used + 1;
  if (want >= next) return { decision: 'acepta', price: want, round, isFinal: noMore(want, round) };
  return { decision: 'contraoferta', price: next, round, isFinal: noMore(next, round) };
}
