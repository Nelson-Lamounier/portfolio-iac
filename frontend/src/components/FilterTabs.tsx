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
    <div className="mb-16 flex flex-wrap justify-start gap-3">
      {categories.map((category) => (
        <button
          key={category}
          onClick={() => setActiveCategory(category)}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeCategory === category
              ? 'bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-zinc-900 dark:hover:bg-teal-300'
              : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50'
          }`}
        >
          {category}
        </button>
      ))}
    </div>
  )
}
