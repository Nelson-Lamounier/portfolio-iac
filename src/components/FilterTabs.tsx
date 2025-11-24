import { Container } from '@/components/Container'

export function FilterTabs({
  categories,
  activeCategory,
  setActiveCategory,
}: {
  categories: string[]
  activeCategory: string
  setActiveCategory: (category: string) => void
  children?: React.ReactNode
}) {
  return (
    <Container className="mb-12 flex flex-wrap justify-center gap-2">
      {categories.map((category) => (
        <button
          key={category}
          onClick={() => setActiveCategory(category)}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 ${
            activeCategory === category
              ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-500/25'
              : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
          }`}
        >
          {category}
        </button>
      ))}
    </Container>
  )
}
