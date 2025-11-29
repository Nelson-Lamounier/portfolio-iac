import { CheckCircle2, XCircle } from 'lucide-react'

interface EliminationItem {
  text: string
  isCorrect: boolean
  reason?: string
}

interface EliminationListProps {
  items: EliminationItem[]
}

export function EliminationList({ items }: EliminationListProps) {
  return (
    <div className="my-8 space-y-3">
      {items.map((item, index) => (
        <div
          key={index}
          className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
            item.isCorrect
              ? 'border-teal-200 bg-teal-50 dark:border-teal-900/50 dark:bg-teal-950/20'
              : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50'
          }`}
        >
          <div className="shrink-0 pt-0.5">
            {item.isCorrect ? (
              <CheckCircle2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            ) : (
              <XCircle className="h-5 w-5 text-zinc-400 dark:text-zinc-600" />
            )}
          </div>
          <div className="flex-1">
            <p
              className={`text-sm font-medium ${
                item.isCorrect
                  ? 'text-teal-900 dark:text-teal-100'
                  : 'text-zinc-600 line-through dark:text-zinc-400'
              }`}
            >
              {item.text}
            </p>
            {item.reason && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                {item.reason}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
