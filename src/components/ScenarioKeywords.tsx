import { ArrowRight } from 'lucide-react'

interface Keyword {
  keyword: string
  solution: string
}

interface ScenarioKeywordsProps {
  keywords: Keyword[]
}

export function ScenarioKeywords({ keywords }: ScenarioKeywordsProps) {
  return (
    <div className="my-8 space-y-3">
      {keywords.map((item, index) => (
        <div
          key={index}
          className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
        >
          <div className="flex-1">
            <span className="rounded bg-zinc-100 px-2 py-1 text-sm font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
              &quot;{item.keyword}&quot;
            </span>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-teal-500 dark:text-teal-400" />
          <div className="flex-1">
            <span className="text-sm font-medium text-teal-700 dark:text-teal-300">
              {item.solution}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
