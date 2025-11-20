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
  title: 'About',
  description:
    'I’m Nelson. I live in Dublin, where I build cloud infrastructures that span the entire application lifecycle.',
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
            I'm Nelson. I live in Dublin, where I build cloud infrastructures
            that span the entire application lifecycle.
          </h1>
          <div className="mt-6 space-y-7 text-base text-zinc-600 dark:text-zinc-400">
            <p>
              My path to DevOps wasn't traditional. I graduated with a Computer
              Science degree focused on web development and cloud computing,
              then joined AWS as a Technical Customer Service Associate the
              front line of customer infrastructure problems. Every support case
              was a lesson in architecture decisions, scaling challenges, and
              what separates reliable systems from fragile ones.
            </p>
            <p>
              But understanding AWS services and implementing DevOps practices
              are different skills. Early in my career, I focused purely on
              frontend development building interfaces without fully
              understanding the deployment, monitoring, and operational side of
              applications. As a solo developer working on projects, I was
              overwhelmed by the sheer number of tools, services, and
              approaches. Which CI/CD tool should I use? How do I structure
              environments? What's the right balance between features and cost?
            </p>
            <p>
              The turning point came when I decided to build my own portfolio
              website not just the frontend, but the complete application
              lifecycle. Development to deployment. Automated CI/CD pipelines
              with GitHub Actions. Infrastructure-as-code using AWS CDK
              TypeScript. Containerisation with Docker and ECS. Monitoring and
              cost optimisation through CloudWatch and proper resource
              management. Suddenly, DevOps wasn't abstract concepts it was
              solving real problems for my own applications.
            </p>
            <p>
              Today, I architect secure, cost optimised cloud infrastructures
              and help other developers navigate the same challenges I faced. My
              articles aren't theoretical they're born from actual struggles as
              a solo developer making infrastructure decisions. I write about
              the tools, patterns, and AWS services that work, cutting through
              the noise so others can build confidently. Because I've learned
              that great DevOps isn't just about automation it's about making
              informed decisions across the entire application lifecycle.
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
