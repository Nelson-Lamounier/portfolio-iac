import { render, screen } from '@testing-library/react'
import Home from '@/app/page'

// Mock the getAllArticles function
jest.mock('@/lib/articles', () => ({
  getAllArticles: jest.fn(() =>
    Promise.resolve([
      {
        slug: 'test-article-1',
        title: 'Test Article 1',
        date: '2024-01-01',
        description: 'This is a test article description',
      },
      {
        slug: 'test-article-2',
        title: 'Test Article 2',
        date: '2024-01-02',
        description: 'Another test article description',
      },
    ]),
  ),
}))

// Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

describe('Home Page', () => {
  describe('Page Structure', () => {
    it('renders a main heading', async () => {
      render(await Home())

      const headings = screen.getAllByRole('heading', { level: 1 })
      expect(headings).toHaveLength(1)
      expect(headings[0]).toBeInTheDocument()
    })

    it('renders an introduction section', async () => {
      render(await Home())

      const heading = screen.getByRole('heading', { level: 1 })
      const container = heading.parentElement

      // Should have intro text after heading
      expect(container?.querySelector('p')).toBeInTheDocument()
    })

    it('renders photos section with multiple images', async () => {
      render(await Home())

      const images = screen.getAllByRole('presentation')
      expect(images.length).toBeGreaterThan(3)
    })
  })

  describe('Social Media Links', () => {
    it('renders GitHub link with correct href', async () => {
      render(await Home())

      const githubLink = screen.getByLabelText('Follow on GitHub')
      expect(githubLink).toHaveAttribute(
        'href',
        'https://github.com/Nelson-Lamounier',
      )
      expect(githubLink).toHaveAttribute('target', '_blank')
      expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('renders LinkedIn link with correct href', async () => {
      render(await Home())

      const linkedinLink = screen.getByLabelText('Follow on LinkedIn')
      expect(linkedinLink).toHaveAttribute(
        'href',
        'https://www.linkedin.com/in/nelson-lamounier-leao/',
      )
      expect(linkedinLink).toHaveAttribute('target', '_blank')
      expect(linkedinLink).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('renders all social media links with proper accessibility', async () => {
      render(await Home())

      const socialLinks = [
        'Follow on X',
        'Follow on Instagram',
        'Follow on GitHub',
        'Follow on LinkedIn',
      ]

      socialLinks.forEach((label) => {
        const link = screen.getByLabelText(label)
        expect(link).toBeInTheDocument()
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      })
    })
  })

  describe('Newsletter Section', () => {
    it('renders newsletter form with email input', async () => {
      render(await Home())

      const emailInput = screen.getByPlaceholderText('Email address')
      expect(emailInput).toBeInTheDocument()
      expect(emailInput).toHaveAttribute('type', 'email')
      expect(emailInput).toBeRequired()
    })

    it('renders newsletter submit button', async () => {
      render(await Home())

      const submitButton = screen.getByRole('button', { name: /join/i })
      expect(submitButton).toBeInTheDocument()
      expect(submitButton).toHaveAttribute('type', 'submit')
    })

    it('newsletter form has correct action', async () => {
      render(await Home())

      const emailInput = screen.getByPlaceholderText('Email address')
      const form = emailInput.closest('form')

      expect(form).toHaveAttribute('action', '/thank-you')
    })
  })

  describe('Resume/Work Section', () => {
    it('renders work experience section', async () => {
      render(await Home())

      // Should have a list of work experiences
      const lists = screen.getAllByRole('list')
      expect(lists.length).toBeGreaterThan(0)
    })

    it('renders download CV link', async () => {
      render(await Home())

      const downloadLink = screen.getByRole('link', { name: /download cv/i })
      expect(downloadLink).toBeInTheDocument()
    })

    it('displays multiple work roles', async () => {
      render(await Home())

      // Should have multiple list items for work history
      const listItems = screen.getAllByRole('listitem')
      expect(listItems.length).toBeGreaterThan(2)
    })
  })

  describe('Articles Section', () => {
    it('renders articles from data', async () => {
      render(await Home())

      const articles = screen.getAllByRole('article')
      expect(articles.length).toBeGreaterThan(0)
    })

    it('article titles are links', async () => {
      render(await Home())

      const article1Link = screen.getByRole('link', { name: 'Test Article 1' })
      const article2Link = screen.getByRole('link', { name: 'Test Article 2' })

      expect(article1Link).toHaveAttribute('href', '/articles/test-article-1')
      expect(article2Link).toHaveAttribute('href', '/articles/test-article-2')
    })

    it('renders article descriptions', async () => {
      render(await Home())

      expect(
        screen.getByText('This is a test article description'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('Another test article description'),
      ).toBeInTheDocument()
    })

    it('renders "Read article" CTAs', async () => {
      render(await Home())

      const ctaElements = screen.getAllByText('Read article')
      expect(ctaElements.length).toBeGreaterThan(0)
    })
  })

  describe('Accessibility', () => {
    it('has proper heading hierarchy', async () => {
      render(await Home())

      const h1Elements = screen.getAllByRole('heading', { level: 1 })
      expect(h1Elements).toHaveLength(1)
    })

    it('email input has proper aria-label', async () => {
      render(await Home())

      const emailInput = screen.getByLabelText('Email address')
      expect(emailInput).toBeInTheDocument()
    })

    it('decorative images have empty alt text', async () => {
      render(await Home())

      const images = screen.getAllByRole('presentation')
      images.forEach((img) => {
        expect(img).toHaveAttribute('alt', '')
      })
    })
  })

  describe('Responsive Design', () => {
    it('applies responsive typography classes', async () => {
      render(await Home())

      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading).toHaveClass('text-4xl', 'sm:text-5xl')
    })
  })
})
