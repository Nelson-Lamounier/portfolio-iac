import { type Metadata } from 'next'

import { SimpleLayout } from '@/components/SimpleLayout'
import { ProjectsList } from '@/components/ProjectsList'
import logoAnimaginary from '@/images/logos/animaginary.svg'
import logoCosmos from '@/images/logos/cosmos.svg'
import logoHelioStream from '@/images/logos/helio-stream.svg'
import logoOpenShuttle from '@/images/logos/open-shuttle.svg'
import logoPlanetaria from '@/images/logos/planetaria.svg'

import {
  Terminal,
  Server,
  Cloud,
  Database,
  Shield,
  GitBranch,
} from 'lucide-react'

const projects = [
  {
    id: 1,
    title: 'Kubernetes GitOps Pipeline',
    description:
      'Automated deployment pipeline using ArgoCD and Jenkins. Implements a complete GitOps workflow for microservices, reducing deployment time by 40%.',
    tags: ['Kubernetes', 'ArgoCD', 'Jenkins', 'Helm', 'AWS'],
    category: 'CI/CD',
    link: { href: '#', label: 'github.com' },
    icon: <Cloud className="h-8 w-8 text-blue-400" />,
    logo: logoPlanetaria,
  },
  {
    id: 2,
    title: 'AWS CloudFormation Infrastructure as Code',
    description:
      'Modular Terraform architecture to provision a high-availability VPC on AWS, including public/private subnets, NAT gateways, and an ALB.',
    tags: ['CloudFormation', 'AWS', 'HCL', 'Networking'],
    category: 'Infrastructure',
    link: { href: '#', label: 'github.com' },
    icon: <Server className="h-8 w-8 text-purple-400" />,
    logo: logoAnimaginary,
  },
  {
    id: 3,
    title: 'Serverless Log Monitoring',
    description:
      'Centralized logging solution using ELK Stack (Elasticsearch, Logstash, Kibana) and Filebeat, deploying automatically via Ansible roles.',
    tags: ['ELK Stack', 'Ansible', 'Linux', 'Python'],
    category: 'Monitoring',
    link: { href: '#', label: 'github.com' },
    icon: <Terminal className="h-8 w-8 text-green-400" />,
    logo: logoHelioStream,
  },
  {
    id: 4,
    title: 'Container Security Scanner',
    description:
      'Integrated Trivy and Clair into a GitHub Actions pipeline to scan Docker images for vulnerabilities before pushing to ECR.',
    tags: ['Docker', 'Security', 'GitHub Actions', 'Bash'],
    category: 'Security',
    link: { href: '#', label: 'github.com' },
    icon: <Shield className="h-8 w-8 text-red-400" />,
    logo: logoCosmos,
  },
  {
    id: 5,
    title: 'Multi-Cloud Disaster Recovery',
    description:
      'Automated failover scripts using Python Boto3 and AWS CLI to sync S3 buckets to Azure Blob Storage for disaster recovery.',
    tags: ['Python', 'Azure', 'AWS', 'Scripting'],
    category: 'Infrastructure',
    link: { href: '#', label: 'github.com' },
    icon: <Database className="h-8 w-8 text-yellow-400" />,
    logo: logoOpenShuttle,
  },
  {
    id: 6,
    title: 'Microservices Service Mesh',
    description:
      'Implementation of Istio service mesh for traffic splitting, canary deployments, and observability across 15+ microservices.',
    tags: ['Istio', 'Golang', 'Prometheus', 'Grafana'],
    category: 'Monitoring',
    link: { href: '#', label: 'github.com' },
    icon: <GitBranch className="h-8 w-8 text-orange-400" />,
    logo: logoPlanetaria,
  },
]

const categories = ['All', 'CI/CD', 'Infrastructure', 'Monitoring', 'Security']

export const metadata: Metadata = {
  title: 'Projects',
  description: "Things I've made trying to put my dent in the universe.",
}

export default function Projects() {
  return (
    <SimpleLayout
      title="Things I've made trying to put my dent in the universe."
      intro="I've worked on tons of little projects over the years but these are the ones that I'm most proud of. Many of them are open-source, so if you see something that piques your interest, check out the code and contribute if you have ideas for how it can be improved."
    >
      <ProjectsList projects={projects} categories={categories} />
    </SimpleLayout>
  )
}
