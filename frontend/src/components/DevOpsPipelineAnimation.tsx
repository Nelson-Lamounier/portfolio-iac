'use client'

import * as React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

type Stage = {
  key: string
  label: string
  subLabel: string
  description: string
  bullets: string[]
}

const STAGES: Stage[] = [
  {
    key: 'ci',
    label: 'CI',
    subLabel: 'GitHub Actions',
    description:
      'Every push triggers the pipeline. We validate formatting, run checks, and keep the repo healthy.',
    bullets: ['Checkout', 'Install', 'Lint', 'Typecheck'],
  },
  {
    key: 'build',
    label: 'Build',
    subLabel: 'Docker / Next.js',
    description:
      'We build the app and produce artifacts (images/bundles) that are ready to ship.',
    bullets: ['Build Next.js', 'Docker build', 'Tag + push'],
  },
  {
    key: 'test',
    label: 'Test',
    subLabel: 'Jest / Lint',
    description:
      'Automated tests protect main. Fail fast with clear feedback before deployment.',
    bullets: ['Unit tests', 'Integration checks', 'Report results'],
  },
  {
    key: 'deploy',
    label: 'Deploy',
    subLabel: 'AWS (CDK)',
    description:
      'Infrastructure and services roll out safely with repeatable IaC and progressive delivery.',
    bullets: ['cdk synth', 'cdk deploy', 'Health checks'],
  },
]

function StageCard({
  stage,
  index,
  isActive,
  onSelect,
}: {
  stage: Stage
  index: number
  isActive: boolean
  onSelect: () => void
}) {
  const reduce = useReducedMotion()

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={reduce ? undefined : { duration: 0.35, delay: 0.08 * index }}
      className="relative"
    >
      <button
        type="button"
        onClick={onSelect}
        className={[
          'group w-full rounded-2xl border p-4 text-left shadow-sm shadow-zinc-800/5 backdrop-blur transition',
          'border-zinc-200/70 bg-white/70 hover:bg-white dark:border-zinc-700/60 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/55',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 dark:focus-visible:ring-teal-400/40',
        ].join(' ')}
        aria-pressed={isActive}
      >
        {isActive ? (
          <motion.div
            aria-hidden="true"
            layoutId="activeStageGlow"
            className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-teal-500/35 dark:ring-teal-400/35"
            transition={reduce ? undefined : { type: 'spring', stiffness: 400, damping: 40 }}
          />
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {stage.label}
            </div>
            <div className="mt-1 truncate text-xs text-zinc-600 dark:text-zinc-400">
              {stage.subLabel}
            </div>
          </div>

          <motion.span
            aria-hidden="true"
            className={[
              'mt-0.5 inline-flex h-2.5 w-2.5 flex-none rounded-full ring-4 transition',
              isActive
                ? 'bg-teal-500 ring-teal-500/15 dark:bg-teal-400 dark:ring-teal-400/15'
                : 'bg-zinc-400/70 ring-zinc-400/10 dark:bg-zinc-500/70 dark:ring-zinc-500/10',
            ].join(' ')}
            animate={
              reduce || !isActive
                ? undefined
                : {
                    opacity: [0.5, 1, 0.5],
                    scale: [0.95, 1.15, 0.95],
                  }
            }
            transition={
              reduce || !isActive
                ? undefined
                : {
                    duration: 1.6,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }
            }
          />
        </div>
      </button>
    </motion.div>
  )
}

export function DevOpsPipelineAnimation() {
  const reduce = useReducedMotion()
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [isPlaying, setIsPlaying] = React.useState(true)

  React.useEffect(() => {
    if (reduce) return
    if (!isPlaying) return
    const id = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % STAGES.length)
    }, 2400)
    return () => window.clearInterval(id)
  }, [isPlaying, reduce])

  const active = STAGES[activeIndex]

  return (
    <section className="mt-12 sm:mt-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl border border-zinc-100 bg-gradient-to-b from-white to-zinc-50 p-5 shadow-sm shadow-zinc-800/5 dark:border-zinc-700/40 dark:from-zinc-900/40 dark:to-zinc-900/10 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                DevOps pipeline
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                Click a stage to see what happens, or press play to watch it flow.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setActiveIndex((i) => (i - 1 + STAGES.length) % STAGES.length)
                }
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm shadow-zinc-800/5 transition hover:bg-zinc-50 dark:border-zinc-700/60 dark:bg-zinc-900/40 dark:text-zinc-100 dark:hover:bg-zinc-900/60"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setIsPlaying((v) => !v)}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm shadow-zinc-800/5 transition hover:bg-zinc-50 dark:border-zinc-700/60 dark:bg-zinc-900/40 dark:text-zinc-100 dark:hover:bg-zinc-900/60"
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                onClick={() => setActiveIndex((i) => (i + 1) % STAGES.length)}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm shadow-zinc-800/5 transition hover:bg-zinc-50 dark:border-zinc-700/60 dark:bg-zinc-900/40 dark:text-zinc-100 dark:hover:bg-zinc-900/60"
              >
                Next
              </button>
            </div>
          </div>

          <div className="mt-6">
            {/* Desktop: horizontal pipeline */}
            <div className="relative hidden items-start gap-4 lg:flex">
              {/* Track */}
              <div
                aria-hidden="true"
                className="absolute left-6 right-6 top-10 h-px bg-zinc-200 dark:bg-zinc-700/60"
              />

              {/* Moving dot (snaps per-stage) */}
              <motion.div
                aria-hidden="true"
                className="absolute top-10 h-3 w-3 -translate-y-1/2 rounded-full bg-teal-500 shadow-[0_0_0_6px_rgba(20,184,166,0.10)] dark:shadow-[0_0_0_6px_rgba(45,212,191,0.12)]"
                initial={false}
                animate={
                  reduce
                    ? { left: `${6 + activeIndex * 24}%` }
                    : {
                        left: `${6 + activeIndex * 24}%`,
                      }
                }
                transition={
                  reduce
                    ? undefined
                    : {
                        type: 'spring',
                        stiffness: 420,
                        damping: 38,
                      }
                }
              />

              <div className="flex items-start gap-4">
                {STAGES.map((stage, i) => (
                  <div key={stage.key} className="relative z-10 w-52">
                    <StageCard
                      stage={stage}
                      index={i}
                      isActive={i === activeIndex}
                      onSelect={() => {
                        setIsPlaying(false)
                        setActiveIndex(i)
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="ml-6 w-full max-w-sm">
                <div className="rounded-2xl border border-zinc-200/70 bg-white/70 p-5 shadow-sm shadow-zinc-800/5 backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/40">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {active.label} details
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      Step {activeIndex + 1} / {STAGES.length}
                    </div>
                  </div>

                  {/* Lock height so the rest of the page doesn't jump during transitions */}
                  <div className="relative mt-3 min-h-[220px]">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={active.key}
                        initial={reduce ? false : { opacity: 0, y: 6 }}
                        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
                        transition={reduce ? undefined : { duration: 0.22 }}
                        className="absolute inset-0"
                      >
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">
                          {active.description}
                        </p>
                        <ul className="mt-3 space-y-2">
                          {active.bullets.map((b) => (
                            <li
                              key={b}
                              className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400"
                            >
                              <span
                                aria-hidden="true"
                                className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-teal-500/80"
                              />
                              <span className="min-w-0">{b}</span>
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile/Tablet: vertical pipeline */}
            <div className="lg:hidden">
              <div className="relative space-y-3">
                <div
                  aria-hidden="true"
                  className="absolute bottom-3 left-5 top-3 w-px bg-zinc-200 dark:bg-zinc-700/60"
                />

                <motion.div
                  aria-hidden="true"
                  className="absolute left-[17px] h-3 w-3 rounded-full bg-teal-500 shadow-[0_0_0_6px_rgba(20,184,166,0.10)] dark:shadow-[0_0_0_6px_rgba(45,212,191,0.12)]"
                  initial={false}
                  animate={
                    reduce
                      ? { top: `${6 + activeIndex * 24}%` }
                      : {
                          top: `${6 + activeIndex * 24}%`,
                        }
                  }
                  transition={
                    reduce
                      ? undefined
                      : {
                          type: 'spring',
                          stiffness: 420,
                          damping: 38,
                        }
                  }
                />

                {STAGES.map((stage, i) => (
                  <div key={stage.key} className="pl-8">
                    <StageCard
                      stage={stage}
                      index={i}
                      isActive={i === activeIndex}
                      onSelect={() => {
                        setIsPlaying(false)
                        setActiveIndex(i)
                      }}
                    />
                  </div>
                ))}

                <div className="pl-8 pt-2">
                  <div className="rounded-2xl border border-zinc-200/70 bg-white/70 p-4 shadow-sm shadow-zinc-800/5 backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/40">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {active.label} details
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        Step {activeIndex + 1} / {STAGES.length}
                      </div>
                    </div>

                    {/* Lock height so the rest of the page doesn't jump during transitions */}
                    <div className="relative mt-3 min-h-[210px]">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={active.key}
                          initial={reduce ? false : { opacity: 0, y: 6 }}
                          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                          exit={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
                          transition={reduce ? undefined : { duration: 0.22 }}
                          className="absolute inset-0"
                        >
                          <p className="text-sm text-zinc-700 dark:text-zinc-300">
                            {active.description}
                          </p>
                          <ul className="mt-3 space-y-2">
                            {active.bullets.map((b) => (
                              <li
                                key={b}
                                className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400"
                              >
                                <span
                                  aria-hidden="true"
                                  className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-teal-500/80"
                                />
                                <span className="min-w-0">{b}</span>
                              </li>
                            ))}
                          </ul>
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}


