import {createFileRoute} from '@tanstack/react-router'

export const Route = createFileRoute('/')({component: App})

function App() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pb-8 pt-14">
      <h1 className="text-4xl font-bold">Hello World</h1>
    </main>
  )
}
