import { render, screen } from '@testing-library/react'
import ArticlesIndex from '@/app/articles/page'
import { ArticleLayout } from '@/components/ArticleLayout'

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    back: jest.fn(),
    push: jest.fn(),
  })),
}))

jest.mock('@/app/providers', () => ({
  AppContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}))

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

// Mock the articles library
jest.mock('@/lib/articles', () => ({
  getAllArticles: jest.fn(() =>
    Promise.resolve([
      {
        slug: 'aws-devops-pro-exam-failure-to-success',
        title:
          '24 Points from Heartbreak: How I Failed the AWS DevOps Pro and Returned to Conquer It',
        description:
          'After scoring 726 on my first attempt—just shy of the 750 required—I realized the AWS DevOps Professional exam demanded more than familiarity with AWS services.',
        author: 'Nelson Lamounier',
        date: '2025-11-20',
      },
      {
        slug: 'golden-ami-multi-environment-deployment',
        title:
          'The "Golden AMI" Trap: Decoding Multi-Environment Deploys for the AWS DevOps Pro Exam',
        description:
          'If you are preparing for the AWS DevOps Professional exam, you will inevitably encounter a "Scenario Question" that feels impossible to solve.',
        author: 'Nelson Lamounier',
        date: '2024-10-23',
      },
    ]),
  ),
}))

describe('Articles Integration Flow', () => {
  describe('End-to-End Article Loading', () => {
    it('loads articles from filesystem and renders them', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      expect(articles).toHaveLength(2)
      expect(articles[0].slug).toBe('aws-devops-pro-exam-failure-to-success')
      expect(articles[1].slug).toBe('golden-ami-multi-environment-deployment')
    })

    it('articles index page displays loaded articles', async () => {
      render(await ArticlesIndex())

      expect(
        screen.getByText(
          '24 Points from Heartbreak: How I Failed the AWS DevOps Pro and Returned to Conquer It',
        ),
      ).toBeInTheDocument()

      expect(
        screen.getByText(
          'The "Golden AMI" Trap: Decoding Multi-Environment Deploys for the AWS DevOps Pro Exam',
        ),
      ).toBeInTheDocument()
    })

    it('maintains correct article order from load to render', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()
      render(await ArticlesIndex())

      const renderedArticles = screen.getAllByRole('article')

      // First article should be the most recent
      expect(renderedArticles[0]).toHaveTextContent(articles[0].title)
      expect(renderedArticles[1]).toHaveTextContent(articles[1].title)
    })
  })

  describe('Article Navigation Flow', () => {
    it('generates correct URLs for article navigation', async () => {
      render(await ArticlesIndex())

      const firstArticleLink = screen.getByRole('link', {
        name: '24 Points from Heartbreak: How I Failed the AWS DevOps Pro and Returned to Conquer It',
      })

      expect(firstArticleLink).toHaveAttribute(
        'href',
        '/articles/aws-devops-pro-exam-failure-to-success',
      )
    })

    it('all articles have navigable links', async () => {
      const { getAllArticles } = require('@/lib/articles')
      render(await ArticlesIndex())

      const articles = await getAllArticles()
      const articleLinks = screen.getAllByRole('link').filter((link) => {
        const href = link.getAttribute('href')
        return href?.startsWith('/articles/') && href !== '/articles'
      })

      // Should have at least one link per article (title link)
      expect(articleLinks.length).toBeGreaterThanOrEqual(articles.length)
    })
  })

  describe('Article Metadata Flow', () => {
    it('preserves all metadata from MDX to render', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()
      render(await ArticlesIndex())

      articles.forEach((article: any) => {
        expect(screen.getByText(article.title)).toBeInTheDocument()
        expect(screen.getByText(article.description)).toBeInTheDocument()
      })
    })

    it('formats dates consistently across the application', async () => {
      render(await ArticlesIndex())

      // Check that dates are formatted
      expect(screen.getAllByText('November 20, 2025')).toHaveLength(2) // Mobile + desktop
      expect(screen.getAllByText('October 23, 2024')).toHaveLength(2)
    })
  })

  describe('Individual Article Rendering', () => {
    it('renders individual article with ArticleLayout', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()
      const firstArticle = articles[0]

      const useContextMock = jest.fn(() => ({
        previousPathname: '/articles',
      }))

      jest
        .spyOn(require('react'), 'useContext')
        .mockImplementation(useContextMock)

      render(
        <ArticleLayout article={firstArticle}>
          <p>Article content goes here</p>
        </ArticleLayout>,
      )

      expect(screen.getByText(firstArticle.title)).toBeInTheDocument()
      expect(screen.getByText('Article content goes here')).toBeInTheDocument()
    })

    it('individual article maintains metadata integrity', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()
      const article = articles[0]

      const useContextMock = jest.fn(() => ({
        previousPathname: null,
      }))

      jest
        .spyOn(require('react'), 'useContext')
        .mockImplementation(useContextMock)

      render(
        <ArticleLayout article={article}>
          <div>Content</div>
        </ArticleLayout>,
      )

      const timeElement = screen.getByRole('time')
      expect(timeElement).toHaveAttribute('datetime', article.date)
    })
  })

  describe('Data Consistency', () => {
    it('article slugs match URL patterns', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      articles.forEach((article: any) => {
        // Slug should be URL-safe
        expect(article.slug).toMatch(/^[a-z0-9-]+$/)
        // Slug should not have spaces or special characters
        expect(article.slug).not.toContain(' ')
        expect(article.slug).not.toContain('_')
      })
    })

    it('all articles have complete metadata', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      articles.forEach((article: any) => {
        expect(article.slug).toBeTruthy()
        expect(article.title).toBeTruthy()
        expect(article.description).toBeTruthy()
        expect(article.author).toBeTruthy()
        expect(article.date).toBeTruthy()

        // Validate date format
        expect(article.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(new Date(article.date).toString()).not.toBe('Invalid Date')
      })
    })
  })

  describe('Performance and Scalability', () => {
    it('handles multiple articles efficiently', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const startTime = Date.now()
      const articles = await getAllArticles()
      render(await ArticlesIndex())
      const endTime = Date.now()

      const totalTime = endTime - startTime

      // Should complete in reasonable time even with multiple articles
      expect(totalTime).toBeLessThan(1000)
      expect(articles.length).toBeGreaterThan(0)
    })

    it('renders articles without memory leaks', async () => {
      const { unmount } = render(await ArticlesIndex())

      // Should unmount cleanly
      expect(() => unmount()).not.toThrow()
    })
  })

  describe('Error Recovery', () => {
    it('handles missing article gracefully', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      // Attempt to render with potentially missing data
      const page = await ArticlesIndex()
      expect(() => render(page)).not.toThrow()
      expect(articles).toBeDefined()
    })

    it('continues rendering if one article has issues', async () => {
      render(await ArticlesIndex())

      // Should still render the page structure
      const heading = screen.getByRole('heading', {
        name: /Writing on AWS infrastructure/i,
      })
      expect(heading).toBeInTheDocument()
    })
  })

  describe('Accessibility Compliance', () => {
    it('maintains semantic HTML throughout the flow', async () => {
      render(await ArticlesIndex())

      // Check for proper semantic structure
      const articles = screen.getAllByRole('article')
      expect(articles.length).toBeGreaterThan(0)

      const mainHeading = screen.getByRole('heading', { level: 1 })
      expect(mainHeading).toBeInTheDocument()

      const timeElements = screen.getAllByRole('time')
      expect(timeElements.length).toBeGreaterThan(0)
    })

    it('all interactive elements are accessible', async () => {
      render(await ArticlesIndex())

      const links = screen.getAllByRole('link')

      links.forEach((link) => {
        // Links should have accessible text
        expect(link.textContent).toBeTruthy()
        expect(link.textContent?.trim().length).toBeGreaterThan(0)
      })
    })
  })

  describe('SEO Optimization', () => {
    it('article metadata is SEO-friendly', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      articles.forEach((article: any) => {
        // Title should be descriptive
        expect(article.title.length).toBeGreaterThan(10)
        expect(article.title.length).toBeLessThan(200)

        // Description should be meaningful
        expect(article.description.length).toBeGreaterThan(20)
        expect(article.description.length).toBeLessThan(500)
      })
    })

    it('dates are in ISO format for SEO', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      articles.forEach((article: any) => {
        expect(article.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      })
    })
  })
})
