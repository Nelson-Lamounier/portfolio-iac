import { type Metadata } from 'next'
import { SimpleLayout } from '@/components/SimpleLayout'
import { Button } from '@/components/Button'

function MailIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M2.75 7.75a3 3 0 0 1 3-3h12.5a3 3 0 0 1 3 3v8.5a3 3 0 0 1-3 3H5.75a3 3 0 0 1-3-3v-8.5Z"
        className="fill-zinc-100 stroke-zinc-400 dark:fill-zinc-100/10 dark:stroke-zinc-500"
      />
      <path
        d="m4 6 6.024 5.479a2.915 2.915 0 0 0 3.952 0L20 6"
        className="stroke-zinc-400 dark:stroke-zinc-500"
      />
    </svg>
  )
}

export const metadata: Metadata = {
  title: 'AWS Set to Music | Creative DevOps Study Guide',
  description:
    'Struggling to retain AWS whitepapers? I’m building a library of educational songs to help you pass your exams using storytelling and melody.',
}

export default function Music() {
  return (
    <SimpleLayout
      title="Turning Documentation into Melody"
      intro="You never forget the lyrics to your favorite song, even years later. I'm harnessing that cognitive power to help you master AWS Cloud through educational songs that transform technical concepts into memorable melodies."
    >
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-8 dark:border-zinc-700/40 dark:bg-zinc-800/50">
          <div className="flex items-start gap-6">
            <div className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-blue-500 text-3xl">
              🎵
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold tracking-tight text-zinc-800 dark:text-zinc-100">
                A New Way to Master AWS Certifications-coming soon to your
                headphones.
              </h2>
              <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
                After passing my AWS DevOps Professional certification, I
                realised that dry technical documentation is hard to retain, but
                stories stick. I&apos;m producing a unique collection of
                educational songs that transform abstract cloud architecture
                into catchy, narrative-driven tunes.
              </p>
            </div>
          </div>
        </div>

        {/* Notify Me Form */}
        <div className="rounded-2xl border border-zinc-100 p-8 dark:border-zinc-700/40">
          <h2 className="flex items-center text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            <MailIcon className="h-6 w-6 flex-none" />
            <span className="ml-3">Get Notified</span>
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Be the first to know when the first track drops. I&apos;ll send you
            a single email with the playlist link—no spam, just music.
          </p>
          <form
            action="/thank-you"
            className="mt-6 flex flex-col gap-4 sm:flex-row"
          >
            <input
              type="email"
              placeholder="your.email@example.com"
              aria-label="Email address"
              required
              className="min-w-0 flex-auto appearance-none rounded-md border border-zinc-900/10 bg-white px-3 py-[calc(theme(spacing.2)-1px)] shadow-md shadow-zinc-800/5 placeholder:text-zinc-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 focus:outline-none sm:text-sm dark:border-zinc-700 dark:bg-zinc-700/[0.15] dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/10"
            />
            <Button type="submit" className="flex-none">
              Notify Me
            </Button>
          </form>
        </div>

        {/* What Makes This Different */}
        <div className="rounded-2xl border border-zinc-100 p-8 dark:border-zinc-700/40">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            What Makes This Different
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-teal-500/10 text-xl">
                📖
              </div>
              <div>
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-100">
                  Real Scenarios
                </h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Exam questions reimagined as lyrical stories you&apos;ll
                  actually remember
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-blue-500/10 text-xl">
                🎸
              </div>
              <div>
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-100">
                  Genre-Bending
                </h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Technical accuracy meets acoustic storytelling inspired by
                  worldwide hits
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-purple-500/10 text-xl">
                🎧
              </div>
              <div>
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-100">
                  Auditory Learning
                </h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Perfect alternative when your eyes are tired of reading
                  whitepapers
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-orange-500/10 text-xl">
                🎓
              </div>
              <div>
                <h3 className="font-semibold text-zinc-800 dark:text-zinc-100">
                  Exam-Focused
                </h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Content specifically designed to help you pass AWS
                  certifications
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Topics Covered */}
        <div className="rounded-2xl border border-zinc-100 p-8 dark:border-zinc-700/40">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Currently Recording Songs About
          </h2>
          <ul className="mt-4 space-y-3 text-base text-zinc-600 dark:text-zinc-400">
            <li className="flex items-start gap-3">
              <span className="text-teal-500">♪</span>
              <span>
                <strong>AWS CodeDeploy:</strong> Deployment strategies set to
                rhythm—Blue/Green, Canary, and Rolling deployments explained
                through verse
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-teal-500">♪</span>
              <span>
                <strong>Amazon ECS:</strong> Container orchestration demystified
                with memorable melodies about task definitions and services
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-teal-500">♪</span>
              <span>
                <strong>AWS Lambda & Auto Scaling:</strong> Event-driven
                architecture without the jargon—just catchy hooks about triggers
                and scaling policies
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-teal-500">♪</span>
              <span>
                <strong>CloudFormation Stacks:</strong> Infrastructure-as-Code
                concepts turned into storytelling ballads
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-teal-500">♪</span>
              <span>
                <strong>VPC Networking:</strong> Subnets, route tables, and
                security groups explained through acoustic narratives
              </span>
            </li>
          </ul>
        </div>

        {/* Why This Works */}
        <div className="rounded-2xl border border-zinc-100 bg-teal-50 p-8 dark:border-zinc-700/40 dark:bg-teal-900/10">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Why Music Works for Learning
          </h2>
          <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400">
            Research shows that information paired with melody is retained up to
            10x longer than plain text. If you can still sing your ABCs or
            remember advertising jingles from childhood, you&apos;ve experienced
            this phenomenon. I&apos;m applying the same principle to AWS
            concepts—turning complex technical knowledge into songs you&apos;ll
            hum during your certification exam.
          </p>
        </div>
      </div>
    </SimpleLayout>
  )
}
