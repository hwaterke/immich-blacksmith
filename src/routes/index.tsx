import {Link, createFileRoute} from '@tanstack/react-router'

export const Route = createFileRoute('/')({component: App})

interface ToolCard {
  title: string
  description: string
  href: '/duplicates' | '/review/nikon-low-res'
  search?: Record<string, unknown>
}

const tools: ToolCard[] = [
  {
    title: 'Duplicate review',
    description:
      'Compare candidate duplicates side-by-side and mark the ones to delete. Writes go through the Immich API.',
    href: '/duplicates',
    search: {id: []},
  },
  {
    title: 'Nikon low-res review',
    description:
      'Find low-resolution Nikon assets (based on EXIF) so you can re-import the originals or clean them out.',
    href: '/review/nikon-low-res',
  },
]

function App() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-14">
      <section className="mb-12">
        <p className="kicker mb-3">Immich Blacksmith</p>
        <h1
          className="text-4xl font-bold tracking-tight"
          style={{color: 'var(--text)'}}
        >
          A sidecar toolkit for extending Immich.
        </h1>
        <p
          className="mt-4 max-w-3xl text-lg"
          style={{color: 'var(--text-muted)'}}
        >
          Blacksmith is an unofficial companion app for self-hosted{' '}
          <a
            href="https://immich.app"
            className="underline"
            style={{color: 'var(--accent)'}}
          >
            Immich
          </a>
          . It runs next to your Immich stack and hosts curation workflows that
          aren&apos;t in the main app yet — reading from Immich&apos;s database
          for fast browsing and pushing changes back through the official API.
        </p>
      </section>

      <section className="mb-12">
        <h2
          className="mb-4 text-sm font-semibold tracking-wide uppercase"
          style={{color: 'var(--text-faint)'}}
        >
          Available tools
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              to={tool.href}
              search={tool.search as never}
              className="block rounded-lg border p-5 no-underline transition hover:border-[var(--border-strong)]"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
              }}
            >
              <h3
                className="text-lg font-semibold"
                style={{color: 'var(--text)'}}
              >
                {tool.title}
              </h3>
              <p className="mt-2 text-sm" style={{color: 'var(--text-muted)'}}>
                {tool.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section
        className="rounded-lg border p-5"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
        }}
      >
        <p className="kicker mb-2">Early days</p>
        <p style={{color: 'var(--text-muted)'}}>
          Blacksmith is intentionally small right now. Each tool was built to
          scratch a real curation itch, and more will land as the need comes up.
          Issues and ideas welcome on{' '}
          <a
            href="https://github.com/hwaterke/immich-blacksmith"
            className="underline"
            style={{color: 'var(--accent)'}}
          >
            GitHub
          </a>
          .
        </p>
      </section>
    </main>
  )
}
