import { type Metadata } from 'next'

import { Providers } from '@/app/providers'
import { Layout } from '@/components/Layout'

import '@/styles/tailwind.css'

export const metadata: Metadata = {
  title: {
    template: '%s - Nelson Lamounier',
    default:
      'Expert Cloud infrastructure builder & AWS problem solver. Explore deep-dive DevOps tutorials and engineering projects. Build better cloud systems today.',
  },
  description:
    'I’m Nelson, an AWS Certified DevOps Engineer Professional based in Dublin. I architect secure, cost-optimised multi-environment infrastructures using AWS CDK and containerisation. Beyond the build, I’m a passionate educator—breaking down complex AWS concepts into digestible tutorials (and yes, memorable study songs).',
  alternates: {
    types: {
      'application/rss+xml': `${process.env.NEXT_PUBLIC_SITE_URL}/feed.xml`,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex h-full bg-zinc-50 dark:bg-black">
        <Providers>
          <div className="flex w-full">
            <Layout>{children}</Layout>
          </div>
        </Providers>
      </body>
    </html>
  )
}
