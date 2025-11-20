import { render, screen } from '@testing-library/react'
import ArticlesIndex from '@/app/articles/page'

// Mock the getAllArticles function
jest.mock('@/lib/articles', () => ({
  getAllArticles: jest.fn(() =>
    Promise.resolve([
      {
        slug: 'aws-cdk-best-practices',
        title: 'AWS CDK Best Practices for Production',
        date: '2024-03-15',
        description:
          'Learn how to structure your AWS CDK projects for maintainability and scalability.',
      },
      {
        slug: 'cicd-github-actions',
        title: 'Building CI/CD Pipelines with GitHub Actions',
        date: '2024-02-20',
        description:
          'A complete guide to setting up automated deployment pipelines.',
      },
      {
        slug: 'docker-ecs-deployment',
        title: 'Deploying Docker Containers to AWS ECS',
        date: '2024-01-10',
        description:
          'Step-by-step guide to containerizing and deploying applications on ECS.',
      },
    ]),
  ),
}))

// Mock formatDate function
jest.mock('@/lib/formatDate', () => ({
  formatDate: jest.fn((date: string) => {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }),
}))

describe('Articles Page', () => {
  describe('Page Structure', () => {
    it('renders the main heading', async () => {
      render(await ArticlesIndex())

      const heading = screen.getByRole('heading', {
        name: /Writing on AWS infrastructure, DevOps practices, and cloud architecture decisions/i,
      })

      expect(heading).toBeInTheDocument()
    })

    it('renders the intro paragraph', async () => {
      render(await ArticlesIndex())

      const intro = screen.getByText(
        /Practical guides on CI\/CD pipelines, infrastructure-as-code/i,
      )

      expect(intro).toBeInTheDocument()
    })
  })

  describe('Article List', () => {
    it('renders all articles from the mock data', async () => {
      render(await ArticlesIndex())

      expect(
        screen.getByText('AWS CDK Best Practices for Production'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('Building CI/CD Pipelines with GitHub Actions'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('Deploying Docker Containers to AWS ECS'),
      ).toBeInTheDocument()
    })

    it('renders article descriptions', async () => {
      render(await ArticlesIndex())

      expect(
        screen.getByText(
          /Learn how to structure your AWS CDK projects for maintainability/i,
        ),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          /A complete guide to setting up automated deployment pipelines/i,
        ),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          /Step-by-step guide to containerizing and deploying applications/i,
        ),
      ).toBeInTheDocument()
    })

    it('renders correct number of articles', async () => {
      render(await ArticlesIndex())

      const articles = screen.getAllByRole('article')
      expect(articles).toHaveLength(3)
    })
  })

  describe('Article Links', () => {
    it('article titles are links with correct href', async () => {
      render(await ArticlesIndex())

      const link1 = screen.getByRole('link', {
        name: 'AWS CDK Best Practices for Production',
      })
      const link2 = screen.getByRole('link', {
        name: 'Building CI/CD Pipelines with GitHub Actions',
      })
      const link3 = screen.getByRole('link', {
        name: 'Deploying Docker Containers to AWS ECS',
      })

      expect(link1).toHaveAttribute('href', '/articles/aws-cdk-best-practices')
      expect(link2).toHaveAttribute('href', '/articles/cicd-github-actions')
      expect(link3).toHaveAttribute('href', '/articles/docker-ecs-deployment')
    })

    it('renders "Read article" call-to-action links', async () => {
      render(await ArticlesIndex())

      const ctaLinks = screen.getAllByText('Read article')
      expect(ctaLinks).toHaveLength(3)
    })
  })

  describe('Article Dates', () => {
    it('renders formatted dates for all articles', async () => {
      render(await ArticlesIndex())

      // Each date appears twice (mobile and desktop views)
      expect(screen.getAllByText('March 15, 2024')).toHaveLength(2)
      expect(screen.getAllByText('February 20, 2024')).toHaveLength(2)
      expect(screen.getAllByText('January 10, 2024')).toHaveLength(2)
    })

    it('date elements have correct datetime attribute', async () => {
      render(await ArticlesIndex())

      const timeElements = screen.getAllByRole('time')

      // Each article has 2 time elements (one for mobile, one for desktop)
      expect(timeElements.length).toBeGreaterThanOrEqual(3)

      const dates = timeElements.map((el) => el.getAttribute('datetime'))
      expect(dates).toContain('2024-03-15')
      expect(dates).toContain('2024-02-20')
      expect(dates).toContain('2024-01-10')
    })
  })

  describe('Responsive Layout', () => {
    it('applies grid layout classes to articles', async () => {
      render(await ArticlesIndex())

      const articles = screen.getAllByRole('article')

      articles.forEach((article) => {
        expect(article).toHaveClass('md:grid', 'md:grid-cols-4')
      })
    })

    it('renders container with border styling', async () => {
      render(await ArticlesIndex())

      const container = screen
        .getAllByRole('article')[0]
        .closest('div')?.parentElement

      expect(container).toHaveClass(
        'md:border-l',
        'md:border-zinc-100',
        'md:pl-6',
      )
    })
  })

  describe('Accessibility', () => {
    it('uses semantic article elements', async () => {
      render(await ArticlesIndex())

      const articles = screen.getAllByRole('article')
      expect(articles.length).toBeGreaterThan(0)

      articles.forEach((article) => {
        expect(article.tagName).toBe('ARTICLE')
      })
    })

    it('has proper heading hierarchy', async () => {
      render(await ArticlesIndex())

      const mainHeading = screen.getByRole('heading', {
        name: /Writing on AWS infrastructure/i,
      })
      expect(mainHeading.tagName).toBe('H1')

      const articleHeadings = screen.getAllByRole('heading', { level: 2 })
      expect(articleHeadings.length).toBeGreaterThan(0)
    })

    it('time elements are properly marked up', async () => {
      render(await ArticlesIndex())

      const timeElements = screen.getAllByRole('time')

      timeElements.forEach((timeEl) => {
        expect(timeEl).toHaveAttribute('datetime')
        expect(timeEl.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      })
    })
  })

  describe('Content Organization', () => {
    it('renders articles in a flex column layout', async () => {
      render(await ArticlesIndex())

      const articlesContainer = screen
        .getAllByRole('article')[0]
        .closest('.space-y-16')

      expect(articlesContainer).toHaveClass('flex', 'flex-col', 'space-y-16')
    })

    it('limits content width appropriately', async () => {
      render(await ArticlesIndex())

      const articlesContainer = screen
        .getAllByRole('article')[0]
        .closest('.max-w-3xl')

      expect(articlesContainer).toHaveClass('max-w-3xl')
    })
  })

  describe('Empty State', () => {
    it('handles empty articles array gracefully', async () => {
      // Override the mock for this test
      const { getAllArticles } = require('@/lib/articles')
      getAllArticles.mockResolvedValueOnce([])

      render(await ArticlesIndex())

      const heading = screen.getByRole('heading', {
        name: /Writing on AWS infrastructure/i,
      })
      expect(heading).toBeInTheDocument()

      const articles = screen.queryAllByRole('article')
      expect(articles).toHaveLength(0)
    })
  })
})
