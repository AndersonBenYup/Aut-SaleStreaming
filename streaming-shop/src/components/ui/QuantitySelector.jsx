import { MAX_PROFILES } from '../../lib/cartReducer.js'
import { IconMinus, IconPlus } from './Icons.jsx'

export default function QuantitySelector({ value, onChange, label = 'Cantidad de perfiles', size = 'md' }) {
  const btn = size === 'sm' ? 'size-8' : 'size-10'
  return (
    <div className="inline-flex items-center rounded-full border border-ink-700 bg-ink-900" role="group" aria-label={label}>
      <button
        type="button"
        className={`${btn} grid place-items-center rounded-full text-ink-300 hover:text-ink-100 disabled:opacity-30`}
        onClick={() => onChange(value - 1)}
        disabled={value <= 1}
        aria-label="Quitar un perfil"
      >
        <IconMinus width={16} height={16} />
      </button>
      <output className="w-8 text-center font-display text-base font-semibold tabular-nums" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className={`${btn} grid place-items-center rounded-full text-ink-300 hover:text-ink-100 disabled:opacity-30`}
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_PROFILES}
        aria-label="Agregar un perfil"
      >
        <IconPlus width={16} height={16} />
      </button>
    </div>
  )
}
