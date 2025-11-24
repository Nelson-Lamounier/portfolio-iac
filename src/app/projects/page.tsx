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
  title:
    'Cloud Infrastructure & DevOps Portfolio | Kubernetes, CloudFormation & CI/CD',
  description:
    'Explore DevOps projects featuring Kubernetes GitOps, CloudFormation IaC, and automated security pipelines. See how I build scalable, self-healing cloud infrastructure.',
}

export default function Projects() {
  return (
    <SimpleLayout
      title="Engineering Scalable Cloud Infrastructure"
      intro="Welcome to my technical showcase. Here, I break down complex infrastructure challenges into automated, resilient solutions. From architecting self-healing Kubernetes clusters to designing multi-cloud disaster recovery strategies, these projects demonstrate my approach to modern DevOps: Infrastructure as Code, security-first automation, and observability at scale."
    >
      <ProjectsList projects={projects} categories={categories} />
    </SimpleLayout>
  )
}
// "text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500"
