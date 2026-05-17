import {createFileRoute} from '@tanstack/react-router'

export const Route = createFileRoute('/sanity-check')({
  component: SanityCheckPage,
})

function SanityCheckPage() {
  return <div>Sanity Check</div>
}
