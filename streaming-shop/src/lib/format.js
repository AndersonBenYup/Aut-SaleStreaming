export function formatPEN(amount) {
  const value = Number.isFinite(amount) ? amount : 0
  return `S/ ${value.toFixed(2)}`
}
