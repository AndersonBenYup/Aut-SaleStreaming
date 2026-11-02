export const MAX_PROFILES = 6

export const itemKey = (platformId, planId) => `${platformId}:${planId}`

export const clampProfiles = (n) => Math.min(MAX_PROFILES, Math.max(1, Math.round(n) || 1))

export function cartReducer(state, action) {
  switch (action.type) {
    case 'add': {
      const { item } = action
      const key = itemKey(item.platformId, item.planId)
      const existing = state.find((i) => i.key === key)
      if (existing) {
        return state.map((i) =>
          i.key === key ? { ...i, profiles: clampProfiles(i.profiles + item.profiles) } : i,
        )
      }
      return [...state, { ...item, key, profiles: clampProfiles(item.profiles) }]
    }
    case 'setProfiles':
      return state.map((i) => (i.key === action.key ? { ...i, profiles: clampProfiles(action.profiles) } : i))
    case 'remove':
      return state.filter((i) => i.key !== action.key)
    case 'clear':
      return []
    default:
      return state
  }
}
