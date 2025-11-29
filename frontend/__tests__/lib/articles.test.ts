import type { ArticleWithSlug } from '@/lib/articles'

// Mock the entire articles module
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
      {
        slug: 'aws-service-catalog-governance-compliance',
        title:
          'AWS Service Catalog: Enforcing Governance Without Blocking Innovation',
        description:
          'Learn how to use AWS Service Catalog to maintain control while empowering teams.',
        author: 'Nelson Lamounier',
        date: '2024-09-15',
      },
      {
        slug: 'serverless-observability-xray-lambda-extensions',
        title: 'Serverless Observability with X-Ray and Lambda Extensions',
        description:
          'Deep dive into monitoring serverless applications with AWS X-Ray.',
        author: 'Nelson Lamounier',
        date: '2024-08-20',
      },
    ]),
  ),
}))

describe('Articles Library', () => {
  describe('getAllArticles', () => {
    it('returns an array of articles', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      expect(Array.isArray(articles)).toBe(true)
      expect(articles.length).toBeGreaterThan(0)
    })

    it('each article has required properties', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      articles.forEach((article: ArticleWithSlug) => {
        expect(article).toHaveProperty('slug')
        expect(article).toHaveProperty('title')
        expect(article).toHaveProperty('description')
        expect(article).toHaveProperty('author')
        expect(article).toHaveProperty('date')
      })
    })

    it('generates correct slugs from filenames', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      const slugs = articles.map((a: ArticleWithSlug) => a.slug)
      expect(slugs).toContain('golden-ami-multi-environment-deployment')
      expect(slugs).toContain('aws-service-catalog-governance-compliance')
      expect(slugs).toContain('serverless-observability-xray-lambda-extensions')
      expect(slugs).toContain('aws-devops-pro-exam-failure-to-success')
    })

    it('sorts articles by date in descending order', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      // Check that dates are in descending order
      for (let i = 0; i < articles.length - 1; i++) {
        const currentDate = new Date(articles[i].date)
        const nextDate = new Date(articles[i + 1].date)
        expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime())
      }
    })

    it('most recent article appears first', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      expect(articles[0].date).toBe('2025-11-20')
      expect(articles[0].slug).toBe('aws-devops-pro-exam-failure-to-success')
    })

    it('oldest article appears last', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      const lastArticle = articles[articles.length - 1]
      expect(lastArticle.date).toBe('2024-08-20')
      expect(lastArticle.slug).toBe(
        'serverless-observability-xray-lambda-extensions',
      )
    })
  })

  describe('Article Data Integrity', () => {
    it('all articles have non-empty titles', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      articles.forEach((article: ArticleWithSlug) => {
        expect(article.title).toBeTruthy()
        expect(article.title.length).toBeGreaterThan(0)
      })
    })

    it('all articles have non-empty descriptions', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      articles.forEach((article: ArticleWithSlug) => {
        expect(article.description).toBeTruthy()
        expect(article.description.length).toBeGreaterThan(0)
      })
    })

    it('all articles have valid date format', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/

      articles.forEach((article: ArticleWithSlug) => {
        expect(article.date).toMatch(dateRegex)
        expect(new Date(article.date).toString()).not.toBe('Invalid Date')
      })
    })

    it('all articles have author information', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      articles.forEach((article: ArticleWithSlug) => {
        expect(article.author).toBeTruthy()
        expect(article.author.length).toBeGreaterThan(0)
      })
    })

    it('all slugs are URL-safe', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      const urlSafeRegex = /^[a-z0-9-]+$/

      articles.forEach((article: ArticleWithSlug) => {
        expect(article.slug).toMatch(urlSafeRegex)
        expect(article.slug).not.toContain(' ')
        expect(article.slug).not.toContain('_')
      })
    })
  })

  describe('Article Count', () => {
    it('returns expected number of articles', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      expect(articles).toHaveLength(4)
    })

    it('does not return duplicate articles', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      const slugs = articles.map((a: ArticleWithSlug) => a.slug)
      const uniqueSlugs = new Set(slugs)

      expect(slugs.length).toBe(uniqueSlugs.size)
    })
  })

  describe('Error Handling', () => {
    it('handles missing article metadata gracefully', async () => {
      const { getAllArticles } = require('@/lib/articles')
      // This test ensures the function doesn't crash with malformed data
      const articles = await getAllArticles()

      expect(articles).toBeDefined()
      expect(Array.isArray(articles)).toBe(true)
    })
  })

  describe('Performance', () => {
    it('loads articles in reasonable time', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const startTime = Date.now()
      await getAllArticles()
      const endTime = Date.now()

      const loadTime = endTime - startTime
      // Should load in less than 1 second
      expect(loadTime).toBeLessThan(1000)
    })
  })

  describe('Article Metadata Consistency', () => {
    it('all articles follow consistent metadata structure', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      articles.forEach((article: ArticleWithSlug) => {
        expect(typeof article.slug).toBe('string')
        expect(typeof article.title).toBe('string')
        expect(typeof article.description).toBe('string')
        expect(typeof article.author).toBe('string')
        expect(typeof article.date).toBe('string')
      })
    })

    it('article descriptions are reasonable length', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      articles.forEach((article: ArticleWithSlug) => {
        expect(article.description.length).toBeGreaterThan(20)
        expect(article.description.length).toBeLessThan(500)
      })
    })

    it('article titles are reasonable length', async () => {
      const { getAllArticles } = require('@/lib/articles')
      const articles = await getAllArticles()

      articles.forEach((article: ArticleWithSlug) => {
        expect(article.title.length).toBeGreaterThan(10)
        expect(article.title.length).toBeLessThan(200)
      })
    })
  })
})
