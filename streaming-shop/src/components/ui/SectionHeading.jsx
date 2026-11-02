export default function SectionHeading({ eyebrow, title, children, align = 'left' }) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <h2 className=" text-3xl font-semibold sm:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-ink-300">{children}</p>}
    </div>
  )
}
