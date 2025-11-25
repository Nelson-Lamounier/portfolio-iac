import { Card } from '@/components/Card'
import { Section } from '@/components/Section'
import { SimpleLayout } from '@/components/SimpleLayout'

function ToolsSection({
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof Section>) {
  return (
    <Section {...props}>
      <ul role="list" className="space-y-16">
        {children}
      </ul>
    </Section>
  )
}

function Tool({
  title,
  href,
  children,
}: {
  title: string
  href?: string
  children: React.ReactNode
}) {
  return (
    <Card as="li">
      <Card.Title as="h3" href={href}>
        {title}
      </Card.Title>
      <Card.Description>{children}</Card.Description>
    </Card>
  )
}

export const metadata = {
  title: 'Nelson’s Setup | AWS Tools, Hardware & VS Code',
  description:
    'A curated list of my daily driver stack. Discover the workstation, VS Code extensions, and CI/CD tools I use to build cost-optimised AWS infrastructure.',
}

export default function Uses() {
  return (
    <SimpleLayout
      title="Tools I Deploy With, Infrastructure I Trust, and Other Recommendations"
      intro="I am often asked about the tools I use to build cloud infrastructure, maintain CI/CD pipelines, or simply experiment with to convince myself I'm optimising costs (when I'm likely just over-engineering). Below is a comprehensive list of the hardware, software, and utilities that make up my daily driver stack."
    >
      <div className="space-y-20">
        <ToolsSection title="Workstation">
          <Tool title="MacBook Pro 14”, M3 Pro, 36GB RAM (2024)">
            The transition from an Intel-based machine to Apple Silicon was
            transformative. Whether I'm building Docker images for
            multi-architecture deployments, running CDK synth operations, or
            spinning up local Kubernetes clusters, this machine handles it all
            without breaking a sweat. As a bonus, the ARM architecture offers
            significantly better parity with AWS Graviton instances.
          </Tool>
          <Tool title="LG 34” UltraWide 5K2K Monitor">
            When you are simultaneously debugging CloudFormation stacks with
            over 200 resources, reviewing GitHub Actions workflows, and
            monitoring CloudWatch dashboards, screen real estate isn't a
            luxury—it’s a necessity. The 21:9 aspect ratio is ideal for running
            side-by-side terminal sessions without constant window switching.
          </Tool>
        </ToolsSection>
        <ToolsSection title="Development tools">
          <Tool title="Visual Studio Code">
            Armed with the AWS Toolkit, CDK snippets, and Docker extensions, VS
            Code has become my infrastructure command center. The integrated
            terminal ensures I never have to leave the editor to run cdk deploy
            or check container logs.
          </Tool>
          <Tool title="AWS CLI v2 + Session Manager Plugin">
            This is the foundation of everything I do. Combined with named
            profiles for different environments, it allows me to seamlessly
            navigate between development, staging, and production without
            friction.
          </Tool>
          <Tool title="Kiro (AWS AI-powered IDE)">
            I am currently experimenting with Kiro for CDK generation. While
            powerful, it requires careful review; as I discovered with some
            unnecessary VPC endpoints, AI-generated infrastructure can be
            syntactically correct but financially expensive.
          </Tool>
        </ToolsSection>
        <ToolsSection title="Infrastructure & Deployment">
          <Tool title="AWS CDK (TypeScript)">
            After working directly with CloudFormation templates, adopting CDK
            felt like switching from assembly code to a high-level language.
            Type safety for infrastructure is a beautiful thing.
          </Tool>
          <Tool title="Docker Desktop">
            This is essential for local development and testing before pushing
            to ECR. The recent improvements in M3 compatibility have made
            cross-platform builds much smoother.
          </Tool>
          <Tool title="GitHub Actions">
            The backbone of our CI/CD. The OIDC integration with AWS removes the
            need for long-lived credentials, while the matrix builds handle our
            multi-region deployments with elegance.
          </Tool>
          <Tool title="AWS CloudFormation">
            While I am "CDK-first," I still manage legacy projects running on
            CloudFormation. Maintaining proficiency in both is the
            infrastructure equivalent of being bilingual.
          </Tool>
        </ToolsSection>
        <ToolsSection title="Monitoring & Debugging">
          <Tool title="K9s">
            When you need to dive into EKS clusters, this terminal UI makes
            Kubernetes actually enjoyable. Think of it as htop, but for your
            containers.
          </Tool>
          <Tool title="CloudWatch Logs Insights">
            This is a criminally underrated tool. Once you master the query
            syntax, finding a needle in the haystack of distributed logs becomes
            a manageable task.
          </Tool>
          <Tool title="AWS X-Ray">
            I use X-Ray for tracking down performance bottlenecks in serverless
            architectures. The service map alone has saved me hours of time that
            would have otherwise been spent on architectural documentation.
          </Tool>
        </ToolsSection>
      </div>
    </SimpleLayout>
  )
}
