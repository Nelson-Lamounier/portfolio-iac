import { type Metadata } from 'next'
import Image from 'next/image'
import clsx from 'clsx'

import { Container } from '@/components/Container'
import {
  GitHubIcon,
  InstagramIcon,
  LinkedInIcon,
  XIcon,
} from '@/components/SocialIcons'
import portraitImage from '@/images/portrait.jpg'

function SocialLink({
  className,
  href,
  children,
  icon: Icon,
}: {
  className?: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <li className={clsx(className, 'flex')}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex text-sm font-medium text-zinc-800 transition hover:text-teal-500 dark:text-zinc-200 dark:hover:text-teal-500"
      >
        <Icon className="h-6 w-6 flex-none fill-zinc-500 transition group-hover:fill-teal-500" />
        <span className="ml-4">{children}</span>
      </a>
    </li>
  )
}

function MailIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M6 5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6Zm.245 2.187a.75.75 0 0 0-.99 1.126l6.25 5.5a.75.75 0 0 0 .99 0l6.25-5.5a.75.75 0 0 0-.99-1.126L12 12.251 6.245 7.187Z"
      />
    </svg>
  )
}

export const metadata: Metadata = {
  title: 'About Nelson | Cloud Architect & DevOps Engineer',
  description:
    'I’m Nelson, a Dublin-based Cloud Architect. Master AWS, DevOps, and cost-optimization with my practical guides on the entire application lifecycle.',
}

export default function About() {
  return (
    <Container className="mt-16 sm:mt-32">
      <div className="grid grid-cols-1 gap-y-16 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-y-12">
        <div className="lg:pl-20">
          <div className="max-w-xs px-2.5 lg:max-w-none">
            <Image
              src={portraitImage}
              alt=""
              sizes="(min-width: 1024px) 32rem, 20rem"
              className="aspect-square rotate-3 rounded-2xl bg-zinc-100 object-cover dark:bg-zinc-800"
            />
          </div>
        </div>
        <div className="lg:order-first lg:row-span-2">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-800 sm:text-5xl dark:text-zinc-100">
            I&apos;m Nelson. Based in Dublin, I build cloud infrastructures that
            span the entire application lifecycle.
          </h1>
          <div className="mt-6 space-y-7 text-base text-zinc-600 dark:text-zinc-400">
            <p>
              My path to DevOps was unconventional. After graduating with a
              Computer Science degree focused on web development and cloud
              computing, I joined AWS as a Technical Customer Service Associate.
              This role placed me on the front lines of customer infrastructure
              problems. Every support case was a masterclass in architectural
              decisions, scaling challenges, and the critical differences
              between reliable systems and fragile ones.
            </p>
            <p>
              However, I quickly learned that understanding AWS services and
              implementing DevOps practices are two very different skills. Early
              in my career, I focused primarily on frontend development,
              building interfaces without fully grasping the operational side of
              applications. As a solo developer, I found myself overwhelmed by
              the sheer volume of tools and methodologies available. Which CI/CD
              tool was best? How should I structure my environments? What was
              the right balance between feature velocity and cost?
            </p>
            <p>
              The turning point came when I decided to build my own portfolio
              website. I didn&apos;t just want to build the frontend; I wanted
              to master the complete application lifecycle, from development to
              deployment. I implemented automated CI/CD pipelines with GitHub
              Actions, utilised Infrastructure-as-Code (IaC) with AWS CDK
              TypeScript, and handled containerisation using Docker and ECS. I
              also integrated CloudWatch for monitoring and focused heavily on
              resource management to optimise costs. Suddenly, DevOps was no
              longer a collection of abstract concepts—it was the practical
              solution to my own development problems.
            </p>
            <p>
              Today, I architect secure, cost-optimised cloud infrastructures
              and help other developers navigate the same challenges I faced. My
              articles aren&apos;t theoretical; they are born from my actual
              struggles as a solo developer making hard infrastructure
              decisions. I write about the tools, patterns, and AWS services
              that actually work, cutting through the noise so others can build
              with confidence. I&apos;ve learned that great DevOps isn&apos;t
              just about automation—it&apos;s about making informed decisions
              across the entire application lifecycle.
            </p>
          </div>
        </div>
        <div className="lg:pl-20">
          <ul role="list">
            <SocialLink href="#" icon={XIcon}>
              Follow on X
            </SocialLink>
            <SocialLink href="#" icon={InstagramIcon} className="mt-4">
              Follow on Instagram
            </SocialLink>
            <SocialLink
              href="https://github.com/Nelson-Lamounier"
              icon={GitHubIcon}
              className="mt-4"
            >
              Follow on GitHub
            </SocialLink>
            <SocialLink
              href="https://www.linkedin.com/in/nelson-lamounier-leao/"
              icon={LinkedInIcon}
              className="mt-4"
            >
              Follow on LinkedIn
            </SocialLink>
            <SocialLink
              href="mailto:spencer@planetaria.tech"
              icon={MailIcon}
              className="mt-8 border-t border-zinc-100 pt-8 dark:border-zinc-700/40"
            >
              lamounierleao@outlook.com
            </SocialLink>
          </ul>
        </div>
      </div>
    </Container>
  )
}
