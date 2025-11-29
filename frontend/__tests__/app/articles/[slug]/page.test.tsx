import { render, screen } from '@testing-library/react'
import { ArticleLayout } from '@/components/ArticleLayout'
import { type ArticleWithSlug } from '@/lib/articles'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    back: jest.fn(),
    push: jest.fn(),
  })),
}))

// Mock the AppContext
jest.mock('@/app/providers', () => {
  const React = require('react')
  const mockContext = {
    previousPathname: null,
  }
  return {
    AppContext: React.createContext(mockContext),
  }
})

// Mock formatDate
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

describe('Individual Article Page', () => {
  const mockArticle: ArticleWithSlug = {
    slug: 'test-article',
    title: 'Test Article Title',
    description: 'Test article description',
    author: 'Test Author',
    date: '2024-03-15',
  }

  const mockArticleContent = (
    <div>
      <p>This is the article content.</p>
      <h2>Section Heading</h2>
      <p>More content here.</p>
    </div>
  )

  describe('Article Metadata', () => {
    it('renders the article title', () => {
      render(
        <ArticleLayout article={mockArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const title = screen.getByRole('heading', {
        name: 'Test Article Title',
        level: 1,
      })
      expect(title).toBeInTheDocument()
    })

    it('renders the article date with correct datetime attribute', () => {
      render(
        <ArticleLayout article={mockArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const timeElement = screen.getByRole('time')
      expect(timeElement).toHaveAttribute('datetime', '2024-03-15')
      expect(timeElement).toHaveTextContent('March 15, 2024')
    })

    it('renders article content within prose container', () => {
      render(
        <ArticleLayout article={mockArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const content = screen.getByText('This is the article content.')
      const proseContainer = content.closest('[data-mdx-content]')
      expect(proseContainer).toBeInTheDocument()
    })
  })

  describe('Navigation', () => {
    it('renders back button when previousPathname exists', () => {
      const useContextMock = jest.fn(() => ({
        previousPathname: '/articles',
      }))

      jest
        .spyOn(require('react'), 'useContext')
        .mockImplementation(useContextMock)

      render(
        <ArticleLayout article={mockArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const backButton = screen.getByRole('button', {
        name: 'Go back to articles',
      })
      expect(backButton).toBeInTheDocument()
    })

    it('does not render back button when previousPathname is null', () => {
      const useContextMock = jest.fn(() => ({
        previousPathname: null,
      }))

      jest
        .spyOn(require('react'), 'useContext')
        .mockImplementation(useContextMock)

      render(
        <ArticleLayout article={mockArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const backButton = screen.queryByRole('button', {
        name: 'Go back to articles',
      })
      expect(backButton).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('uses semantic article element', () => {
      render(
        <ArticleLayout article={mockArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const article = screen.getByRole('article')
      expect(article).toBeInTheDocument()
    })

    it('has proper heading hierarchy', () => {
      render(
        <ArticleLayout article={mockArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1).toHaveTextContent('Test Article Title')

      const h2 = screen.getByRole('heading', { level: 2 })
      expect(h2).toHaveTextContent('Section Heading')
    })

    it('time element has proper semantic markup', () => {
      render(
        <ArticleLayout article={mockArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const timeElement = screen.getByRole('time')
      expect(timeElement.tagName).toBe('TIME')
      expect(timeElement).toHaveAttribute('datetime')
    })

    it('back button has proper aria-label', () => {
      const useContextMock = jest.fn(() => ({
        previousPathname: '/articles',
      }))

      jest
        .spyOn(require('react'), 'useContext')
        .mockImplementation(useContextMock)

      render(
        <ArticleLayout article={mockArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const backButton = screen.getByRole('button')
      expect(backButton).toHaveAttribute('aria-label', 'Go back to articles')
    })
  })

  describe('Styling and Layout', () => {
    it('applies correct container classes', () => {
      const { container } = render(
        <ArticleLayout article={mockArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const mainContainer = container.querySelector('.mt-16')
      expect(mainContainer).toHaveClass('lg:mt-32')
    })

    it('applies responsive title styling', () => {
      render(
        <ArticleLayout article={mockArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const title = screen.getByRole('heading', { level: 1 })
      expect(title).toHaveClass('text-4xl', 'sm:text-5xl')
    })

    it('applies max-width constraint to content', () => {
      const { container } = render(
        <ArticleLayout article={mockArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const contentContainer = container.querySelector('.max-w-2xl')
      expect(contentContainer).toBeInTheDocument()
    })
  })

  describe('Content Rendering', () => {
    it('renders all child content', () => {
      render(
        <ArticleLayout article={mockArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      expect(
        screen.getByText('This is the article content.'),
      ).toBeInTheDocument()
      expect(screen.getByText('Section Heading')).toBeInTheDocument()
      expect(screen.getByText('More content here.')).toBeInTheDocument()
    })

    it('wraps content in prose styling', () => {
      const { container } = render(
        <ArticleLayout article={mockArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const proseContainer = container.querySelector('[data-mdx-content]')
      expect(proseContainer).toHaveClass('mt-8')
    })
  })

  describe('Edge Cases', () => {
    it('handles articles with very long titles', () => {
      const longTitleArticle = {
        ...mockArticle,
        title:
          'This is an extremely long article title that should still render correctly without breaking the layout or causing overflow issues',
      }

      render(
        <ArticleLayout article={longTitleArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const title = screen.getByRole('heading', { level: 1 })
      expect(title).toBeInTheDocument()
      expect(title).toHaveTextContent(longTitleArticle.title)
    })

    it('handles articles with special characters in title', () => {
      const specialCharArticle = {
        ...mockArticle,
        title: 'AWS DevOps: CI/CD & Infrastructure-as-Code (IaC) Guide',
      }

      render(
        <ArticleLayout article={specialCharArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const title = screen.getByRole('heading', { level: 1 })
      expect(title).toHaveTextContent(specialCharArticle.title)
    })

    it('handles empty content gracefully', () => {
      render(<ArticleLayout article={mockArticle}>{null}</ArticleLayout>)

      const title = screen.getByRole('heading', { level: 1 })
      expect(title).toBeInTheDocument()
    })

    it('handles future dates correctly', () => {
      const futureArticle = {
        ...mockArticle,
        date: '2026-12-31',
      }

      render(
        <ArticleLayout article={futureArticle}>
          {mockArticleContent}
        </ArticleLayout>,
      )

      const timeElement = screen.getByRole('time')
      expect(timeElement).toHaveAttribute('datetime', '2026-12-31')
    })
  })
})
