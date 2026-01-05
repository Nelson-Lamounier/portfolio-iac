'use client'

import * as React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

type Stage = {
  key: string
  label: string
  subLabel: string
  message: string
  tags: string[]
}

const STAGES: Stage[] = [
  {
    key: 'ci',
    label: 'CI',
    subLabel: 'GitHub Actions',
    message: 'Trigger checks on every push/PR.',
    tags: ['checkout', 'install', 'lint', 'typecheck'],
  },
  {
    key: 'build',
    label: 'Build',
    subLabel: 'Docker / Next.js',
    message: 'Create artifacts ready to ship.',
    tags: ['next build', 'docker build', 'push image'],
  },
  {
    key: 'test',
    label: 'Test',
    subLabel: 'Jest / Lint',
    message: 'Fail fast with automated checks.',
    tags: ['unit tests', 'integration', 'reports'],
  },
  {
    key: 'deploy',
    label: 'Deploy',
    subLabel: 'AWS (CDK)',
    message: 'Roll out safely via IaC.',
    tags: ['cdk synth', 'cdk deploy', 'health checks'],
  },
]

function StageBubble({ stage }: { stage: Stage }) {
  return (
    <div className="relative min-h-[170px] rounded-2xl border border-zinc-200/70 bg-white/95 px-5 py-4 shadow-sm shadow-zinc-800/5 backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/70">
      {/* little pointer (top) */}
      <div
        aria-hidden="true"
        className="absolute left-8 top-0 h-3 w-3 -translate-y-1/2 rotate-45 border border-zinc-200/70 bg-white/95 dark:border-zinc-700/60 dark:bg-zinc-900/70"
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {stage.label}
          </div>
          <div className="mt-0.5 truncate text-xs text-zinc-600 dark:text-zinc-400">
            {stage.subLabel}
          </div>
        </div>
        <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-400/10 dark:text-teal-300">
          active
        </span>
      </div>

      <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
        {stage.message}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {stage.tags.slice(0, 6).map((t) => (
          <span
            key={t}
            className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-700 dark:border-zinc-700/60 dark:bg-zinc-900/40 dark:text-zinc-300"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

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
  const desktopTrackRef = React.useRef<HTMLDivElement | null>(null)
  const desktopCardRefs = React.useRef<Array<HTMLDivElement | null>>([])
  const [bubbleX, setBubbleX] = React.useState(0)

  const updateBubbleX = React.useCallback(() => {
    const track = desktopTrackRef.current
    const card = desktopCardRefs.current[activeIndex]
    if (!track || !card) return

    const trackRect = track.getBoundingClientRect()
    const cardRect = card.getBoundingClientRect()
    const cardCenter = cardRect.left + cardRect.width / 2

    // Bubble is absolutely positioned within the track container.
    // We translate it so its center aligns with the active card's center.
    setBubbleX(cardCenter - trackRect.left)
  }, [activeIndex])

  React.useEffect(() => {
    if (reduce) return
    if (!isPlaying) return
    const id = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % STAGES.length)
    }, 2400)
    return () => window.clearInterval(id)
  }, [isPlaying, reduce])

  React.useLayoutEffect(() => {
    updateBubbleX()
  }, [updateBubbleX])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const track = desktopTrackRef.current
    if (!track) return

    const onResize = () => updateBubbleX()
    window.addEventListener('resize', onResize)

    // Keep positions correct as fonts/layout settle.
    const ro = new ResizeObserver(() => updateBubbleX())
    ro.observe(track)

    return () => {
      window.removeEventListener('resize', onResize)
      ro.disconnect()
    }
  }, [updateBubbleX])

  const active = STAGES[activeIndex]

  return (
    <section className="mt-12 sm:mt-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl border border-zinc-100 bg-linear-to-b from-white to-zinc-50 p-5 shadow-sm shadow-zinc-800/5 dark:border-zinc-700/40 dark:from-zinc-900/40 dark:to-zinc-900/10 sm:p-6">
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
            <div className="hidden lg:block">
              <div ref={desktopTrackRef} className="relative">
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
                    <div
                      key={stage.key}
                      ref={(el) => {
                        desktopCardRefs.current[i] = el
                      }}
                      className="relative z-10 w-52"
                    >
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
              </div>

              {/* Bubble row BELOW the pipeline (moves with the active stage) */}
              <div className="mt-4">
                <div className="relative min-h-[130px] overflow-visible">
                  {/* Keep the moving bubble mounted so it doesn't "restart from left" */}
                  <motion.div
                    className="absolute top-0"
                    style={{
                      left: bubbleX,
                      transform: 'translateX(-50%)',
                      width: 'min(28rem, calc(100vw - 6rem))',
                      maxWidth: '28rem',
                    }}
                    animate={
                      reduce
                        ? { opacity: 1 }
                        : {
                            left: bubbleX,
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
                  >
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={active.key}
                        initial={reduce ? false : { opacity: 0, y: 8 }}
                        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={reduce ? { opacity: 1 } : { opacity: 0, y: -8 }}
                        transition={reduce ? undefined : { duration: 0.18 }}
                      >
                        <StageBubble stage={active} />
                      </motion.div>
                    </AnimatePresence>
                  </motion.div>
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

                {/* Mobile: concise comment bubble below the list */}
                <div className="pl-8 pt-2">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={active.key}
                      initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }}
                      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                      exit={reduce ? { opacity: 1 } : { opacity: 0, y: -8, scale: 0.98 }}
                      transition={reduce ? undefined : { duration: 0.2 }}
                    >
                      <StageBubble stage={active} />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}


