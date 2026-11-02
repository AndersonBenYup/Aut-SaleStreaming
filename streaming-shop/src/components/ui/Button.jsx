import { Link } from 'react-router-dom'

const variants = {
  primary: 'bg-accent text-ink-950 hover:bg-accent-soft',
  whatsapp: 'bg-wa text-ink-950 hover:brightness-110',
  ghost: 'border border-ink-700 text-ink-100 hover:border-ink-500 hover:bg-ink-850',
  subtle: 'text-ink-300 hover:text-ink-100 hover:bg-ink-850',
}
const sizes = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
}

export default function Button({ variant = 'primary', size = 'md', to, href, className = '', children, ...props }) {
  const cls = `inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[background-color,border-color,filter,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`
  if (to) return <Link to={to} className={cls} {...props}>{children}</Link>
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...props}>
        {children}
      </a>
    )
  }
  return <button type="button" className={cls} {...props}>{children}</button>
}
