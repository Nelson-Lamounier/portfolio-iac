import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Home from '@/app/page'
import About from '@/app/about/page'
import Projects from '@/app/projects/page'
import Uses from '@/app/uses/page'

// Mock Next.js Image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

// Mock articles
jest.mock('@/lib/articles', () => ({
  getAllArticles: jest.fn(() =>
    Promise.resolve([
      {
        slug: 'test-article',
        title: 'Test Article',
        date: '2024-01-01',
        description: 'Test description',
      },
    ]),
  ),
}))

describe('Navigation Flow Integration', () => {
  describe('Critical User Journeys', () => {
    it('user can navigate from home to other pages via links', async () => {
      render(await Home())

      // Verify key navigation links exist
      const githubLink = screen.getByLabelText('Follow on GitHub')
      const linkedinLink = screen.getByLabelText('Follow on LinkedIn')

      expect(githubLink).toHaveAttribute(
        'href',
        'https://github.com/Nelson-Lamounier',
      )
      expect(linkedinLink).toHaveAttribute(
        'href',
        'https://www.linkedin.com/in/nelson-lamounier-leao/',
      )
    })

    it('all pages render without errors', async () => {
      // Test that all main pages can render
      const homePage = await Home()
      expect(() => render(homePage)).not.toThrow()
      expect(() => render(<About />)).not.toThrow()
      expect(() => render(<Projects />)).not.toThrow()
      expect(() => render(<Uses />)).not.toThrow()
    })

    it('social links are consistent across pages', async () => {
      const homeRender = render(await Home())
      const homeGithub = screen.getByLabelText('Follow on GitHub')
      const homeGithubHref = homeGithub.getAttribute('href')
      homeRender.unmount()

      const aboutRender = render(<About />)
      const aboutGithub = screen.getByText('Follow on GitHub').closest('a')
      const aboutGithubHref = aboutGithub?.getAttribute('href')

      expect(homeGithubHref).toBe(aboutGithubHref)
    })
  })

  describe('External Links', () => {
    it('all external links open in new tab', async () => {
      render(await Home())

      const externalLinks = screen
        .getAllByRole('link')
        .filter((link) => link.getAttribute('target') === '_blank')

      expect(externalLinks.length).toBeGreaterThan(0)

      externalLinks.forEach((link) => {
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      })
    })

    it('GitHub and LinkedIn links work across all pages', async () => {
      const pages = [await Home(), <About />]

      for (const page of pages) {
        const { unmount } = render(page)

        const links = screen.getAllByRole('link')
        const githubLinks = links.filter((link) =>
          link.getAttribute('href')?.includes('github.com/Nelson-Lamounier'),
        )
        const linkedinLinks = links.filter((link) =>
          link
            .getAttribute('href')
            ?.includes('linkedin.com/in/nelson-lamounier-leao'),
        )

        expect(githubLinks.length).toBeGreaterThan(0)
        expect(linkedinLinks.length).toBeGreaterThan(0)

        unmount()
      }
    })
  })

  describe('Newsletter Subscription Flow', () => {
    it('newsletter form exists on home page', async () => {
      render(await Home())

      const emailInput = screen.getByPlaceholderText('Email address')
      const submitButton = screen.getByRole('button', { name: /join/i })

      expect(emailInput).toBeInTheDocument()
      expect(emailInput).toHaveAttribute('type', 'email')
      expect(emailInput).toBeRequired()
      expect(submitButton).toHaveAttribute('type', 'submit')
    })

    it('newsletter form has correct action endpoint', async () => {
      render(await Home())

      const emailInput = screen.getByPlaceholderText('Email address')
      const form = emailInput.closest('form')

      expect(form).toHaveAttribute('action', '/thank-you')
    })
  })

  describe('Article Discovery Flow', () => {
    it('home page displays recent articles', async () => {
      render(await Home())

      const articles = screen.getAllByRole('article')
      expect(articles.length).toBeGreaterThan(0)
    })

    it('article links navigate to correct URLs', async () => {
      render(await Home())

      const articleLink = screen.getByRole('link', { name: 'Test Article' })
      expect(articleLink).toHaveAttribute('href', '/articles/test-article')
    })
  })

  describe('Accessibility Across Pages', () => {
    it('all pages have proper heading hierarchy', async () => {
      const pages = [
        { component: await Home(), name: 'Home' },
        { component: <About />, name: 'About' },
        { component: <Projects />, name: 'Projects' },
        { component: <Uses />, name: 'Uses' },
      ]

      for (const page of pages) {
        const { unmount } = render(page.component)

        const h1Elements = screen.getAllByRole('heading', { level: 1 })
        expect(h1Elements).toHaveLength(1)

        unmount()
      }
    })

    it('all pages have accessible navigation', async () => {
      const pages = [await Home(), <About />, <Projects />]

      for (const page of pages) {
        const { unmount } = render(page)

        const links = screen.getAllByRole('link')
        expect(links.length).toBeGreaterThan(0)

        links.forEach((link) => {
          expect(
            link.textContent || link.getAttribute('aria-label'),
          ).toBeTruthy()
        })

        unmount()
      }
    })
  })

  describe('Performance Across Pages', () => {
    it('all pages render in reasonable time', async () => {
      const pages = [
        { component: await Home(), name: 'Home' },
        { component: <About />, name: 'About' },
        { component: <Projects />, name: 'Projects' },
        { component: <Uses />, name: 'Uses' },
      ]

      for (const page of pages) {
        const startTime = Date.now()
        const { unmount } = render(page.component)
        const endTime = Date.now()

        expect(endTime - startTime).toBeLessThan(200)
        unmount()
      }
    })
  })
})
