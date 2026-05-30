import {Settings, Search} from 'lucide-react'

export default function TopBar() {
  return (
    <header
      className="sticky top-0 z-50 flex items-center gap-[18px] px-[22px] border-b"
      style={{
        height: 54,
        background: 'var(--surface)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-[10px] font-semibold"
        style={{fontSize: 14.5, letterSpacing: '-0.02em'}}
      >
        <LogoMark />
        Immich Blacksmith
      </div>

      {/* Search */}
      <div
        className="flex-1 min-w-[120px] max-w-[340px] flex items-center gap-[9px] rounded-[9px] px-[12px] py-[7px]"
        style={{
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--ink-3)',
          fontSize: 13,
        }}
      >
        <Search size={15} strokeWidth={1.75} />
        <span className="truncate" style={{opacity: 0.7}}>
          Search assets, cameras, dates…
        </span>
      </div>

      <div className="flex-1" />

      {/* Icon buttons */}
      <button className="icon-btn" aria-label="Settings">
        <Settings size={16} strokeWidth={1.75} />
      </button>

      {/* Avatar */}
      <div
        className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0"
        style={{
          background:
            'linear-gradient(135deg, oklch(0.82 0.115 80), oklch(0.62 0.13 45))',
          color: 'var(--bg)',
        }}
      >
        IB
      </div>
    </header>
  )
}

function LogoMark() {
  return (
    <div className="relative w-[26px] h-[26px] shrink-0">
      <div
        className="absolute rounded-[7px]"
        style={{
          inset: 0,
          transform: 'translate(3px, 3px)',
          background: 'var(--ink-4)',
        }}
      />
      <div
        className="absolute rounded-[7px]"
        style={{
          inset: 0,
          transform: 'translate(-1px, -1px)',
          background: 'var(--ink)',
        }}
      />
    </div>
  )
}
