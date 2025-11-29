import { render, screen } from '@testing-library/react'
import About from '@/app/about/page'

// Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

describe('About Page', () => {
  describe('Page Structure', () => {
    it('renders a main heading', () => {
      render(<About />)

      const headings = screen.getAllByRole('heading', { level: 1 })
      expect(headings).toHaveLength(1)
      expect(headings[0]).toBeInTheDocument()
    })

    it('renders biography content with multiple paragraphs', () => {
      render(<About />)

      const heading = screen.getByRole('heading', { level: 1 })
      const container = heading.parentElement

      // Should have multiple paragraphs
      const paragraphs = container?.querySelectorAll('p')
      expect(paragraphs?.length).toBeGreaterThan(2)
    })

    it('renders portrait image', () => {
      render(<About />)

      const images = screen.getAllByRole('presentation')
      expect(images.length).toBeGreaterThan(0)
    })
  })

  describe('Social Links', () => {
    it('renders social links in a list', () => {
      render(<About />)

      const list = screen.getByRole('list')
      expect(list).toBeInTheDocument()

      const listItems = screen.getAllByRole('listitem')
      expect(listItems.length).toBeGreaterThan(3)
    })

    it('GitHub link has correct href and attributes', () => {
      render(<About />)

      const githubLink = screen.getByText('Follow on GitHub').closest('a')

      expect(githubLink).toHaveAttribute(
        'href',
        'https://github.com/Nelson-Lamounier',
      )
      expect(githubLink).toHaveAttribute('target', '_blank')
      expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('LinkedIn link has correct href and attributes', () => {
      render(<About />)

      const linkedinLink = screen.getByText('Follow on LinkedIn').closest('a')

      expect(linkedinLink).toHaveAttribute(
        'href',
        'https://www.linkedin.com/in/nelson-lamounier-leao/',
      )
      expect(linkedinLink).toHaveAttribute('target', '_blank')
      expect(linkedinLink).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('email link has mailto href', () => {
      render(<About />)

      const emailText = screen.getByText(/lamounierleao@outlook\.com/i)
      const emailLink = emailText.closest('a')

      expect(emailLink).toHaveAttribute('href')
      expect(emailLink?.getAttribute('href')).toContain('mailto:')
      expect(emailLink).toHaveAttribute('target', '_blank')
      expect(emailLink).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('all external links have security attributes', () => {
      render(<About />)

      const links = screen.getAllByRole('link')

      links.forEach((link) => {
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      })
    })

    it('renders all social platform links', () => {
      render(<About />)

      const socialPlatforms = [
        'Follow on X',
        'Follow on Instagram',
        'Follow on GitHub',
        'Follow on LinkedIn',
      ]

      socialPlatforms.forEach((platform) => {
        expect(screen.getByText(platform)).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('has proper heading hierarchy', () => {
      render(<About />)

      const headings = screen.getAllByRole('heading')
      expect(headings).toHaveLength(1)
      expect(headings[0].tagName).toBe('H1')
    })

    it('social links have descriptive visible text', () => {
      render(<About />)

      const githubLink = screen.getByText('Follow on GitHub')
      expect(githubLink).toBeVisible()

      const linkedinLink = screen.getByText('Follow on LinkedIn')
      expect(linkedinLink).toBeVisible()
    })

    it('decorative images have empty alt text', () => {
      render(<About />)

      const images = screen.getAllByRole('presentation')
      images.forEach((img) => {
        expect(img).toHaveAttribute('alt', '')
      })
    })

    it('links have hover states for better UX', () => {
      render(<About />)

      const links = screen.getAllByRole('link')
      links.forEach((link) => {
        expect(link.className).toContain('hover:')
      })
    })
  })

  describe('Responsive Design', () => {
    it('applies responsive grid layout', () => {
      render(<About />)

      const container = screen
        .getByRole('heading')
        .closest('div')?.parentElement
      expect(container).toHaveClass('grid', 'grid-cols-1', 'lg:grid-cols-2')
    })

    it('applies responsive typography', () => {
      render(<About />)

      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading).toHaveClass('text-4xl', 'sm:text-5xl')
    })
  })

  describe('Content Organization', () => {
    it('biography section has proper spacing', () => {
      render(<About />)

      const heading = screen.getByRole('heading', { level: 1 })
      const bioContainer = heading.nextElementSibling

      expect(bioContainer).toHaveClass('mt-6', 'space-y-7')
    })

    it('social links section is properly positioned', () => {
      render(<About />)

      const list = screen.getByRole('list')
      expect(list.parentElement).toHaveClass('lg:pl-20')
    })
  })
})
