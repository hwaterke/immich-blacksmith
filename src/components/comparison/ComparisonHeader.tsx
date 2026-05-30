interface Props {
  title: string
  /** Right-hand monospace detail, e.g. the duplicate id. */
  subtitle?: string
  photoCount: number
  totalSize: string
  matchPercent?: number | null
}

/** Group header strip: title + "N photos · X total" + match% pill. */
export function ComparisonHeader({
  title,
  subtitle,
  photoCount,
  totalSize,
  matchPercent,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 px-[26px] pt-[22px] pb-[14px]">
      <h1
        className="text-[22px] font-semibold tracking-[-0.02em]"
        style={{color: 'var(--ink)'}}
      >
        {title}
      </h1>
      <span className="font-mono text-[12.5px]" style={{color: 'var(--ink-3)'}}>
        {photoCount} {photoCount === 1 ? 'photo' : 'photos'} · {totalSize}
      </span>

      <div className="flex-1" />

      {subtitle ? (
        <span
          className="max-w-[280px] truncate font-mono text-[11px]"
          style={{color: 'var(--ink-4)'}}
          title={subtitle}
        >
          {subtitle}
        </span>
      ) : null}
      {matchPercent != null ? (
        <span className="pill sim whitespace-nowrap">
          {matchPercent}% match
        </span>
      ) : null}
    </div>
  )
}
