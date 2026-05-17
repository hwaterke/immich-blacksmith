import {Link} from '@tanstack/react-router'

const linkBase =
  'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold no-underline transition'

export default function Header() {
  return (
    <header
      className="sticky top-0 z-50 border-b px-4"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
      }}
    >
      <nav className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 py-3">
        <Link
          to="/"
          className="inline-flex flex-shrink-0 items-center gap-2 text-base font-semibold tracking-tight no-underline"
          style={{color: 'var(--text)'}}
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{background: 'var(--accent)'}}
          />
          Immich Blacksmith
        </Link>

        <div className="ml-auto flex items-center gap-1">
          <Link
            to="/"
            className={linkBase}
            style={{color: 'var(--text-muted)'}}
            activeProps={{
              style: {
                color: 'var(--accent)',
                background: 'var(--surface-2)',
              },
            }}
            activeOptions={{exact: true}}
          >
            Home
          </Link>
          <Link
            to="/review/nikon-low-res"
            className={linkBase}
            style={{color: 'var(--text-muted)'}}
            activeProps={{
              style: {
                color: 'var(--accent)',
                background: 'var(--surface-2)',
              },
            }}
          >
            Nikon Low Res
          </Link>
        </div>
      </nav>
    </header>
  )
}
