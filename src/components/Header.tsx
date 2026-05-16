import {Link} from '@tanstack/react-router'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
        <Link
          to="/"
          className="inline-flex flex-shrink-0 items-center gap-2 text-base font-semibold tracking-tight text-[var(--sea-ink)] no-underline"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-[linear-gradient(135deg,var(--lagoon),var(--palm))]" />
          immich-plus
        </Link>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            to="/"
            className="nav-link"
            activeProps={{className: 'nav-link is-active'}}
            activeOptions={{exact: true}}
          >
            Home
          </Link>
          <Link
            to="/review/nikon-low-res"
            className="nav-link"
            activeProps={{className: 'nav-link is-active'}}
          >
            Nikon Low Res
          </Link>
        </div>
      </nav>
    </header>
  )
}
