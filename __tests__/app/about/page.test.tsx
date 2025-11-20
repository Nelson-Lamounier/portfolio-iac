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
  it('renders the main heading', () => {
    render(<About />)

    const heading = screen.getByRole('heading', {
      name: /I'm Nelson. I live in Dublin/i,
    })

    expect(heading).toBeInTheDocument()
  })

  it('renders the biography paragraphs', () => {
    render(<About />)

    expect(
      screen.getByText(/My path to DevOps wasn't traditional/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /But understanding AWS services and implementing DevOps/i,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/The turning point came when I decided to build/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Today, I architect secure, cost optimised/i),
    ).toBeInTheDocument()
  })

  it('renders the portrait image', () => {
    render(<About />)

    const images = screen.getAllByRole('presentation')
    expect(images.length).toBeGreaterThan(0)
  })

  describe('Social Links', () => {
    it('renders all social media links', () => {
      render(<About />)

      expect(screen.getByText('Follow on X')).toBeInTheDocument()
      expect(screen.getByText('Follow on Instagram')).toBeInTheDocument()
      expect(screen.getByText('Follow on GitHub')).toBeInTheDocument()
      expect(screen.getByText('Follow on LinkedIn')).toBeInTheDocument()
    })

    it('renders email link', () => {
      render(<About />)

      const emailLink = screen.getByText(/lamounierleao@outlook\.com/i)
      expect(emailLink).toBeInTheDocument()
    })

    it('GitHub link has correct attributes', () => {
      render(<About />)

      const githubLink = screen.getByText('Follow on GitHub').closest('a')

      expect(githubLink).toHaveAttribute(
        'href',
        'https://github.com/Nelson-Lamounier',
      )
      expect(githubLink).toHaveAttribute('target', '_blank')
      expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('LinkedIn link has correct attributes', () => {
      render(<About />)

      const linkedinLink = screen.getByText('Follow on LinkedIn').closest('a')

      expect(linkedinLink).toHaveAttribute(
        'href',
        'https://www.linkedin.com/in/nelson-lamounier-leao/',
      )
      expect(linkedinLink).toHaveAttribute('target', '_blank')
      expect(linkedinLink).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('email link has correct mailto href', () => {
      render(<About />)

      const emailText = screen.getByText(/lamounierleao@outlook\.com/i)
      const emailLink = emailText.closest('a')

      expect(emailLink).toHaveAttribute(
        'href',
        'mailto:spencer@planetaria.tech',
      )
      expect(emailLink).toHaveAttribute('target', '_blank')
      expect(emailLink).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('all external links open in new tab with security attributes', () => {
      render(<About />)

      const links = screen.getAllByRole('link')

      links.forEach((link) => {
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      })
    })
  })

  describe('Content Structure', () => {
    it('renders social links in a list', () => {
      render(<About />)

      const list = screen.getByRole('list')
      expect(list).toBeInTheDocument()
    })

    it('applies correct CSS classes to heading', () => {
      render(<About />)

      const heading = screen.getByRole('heading', {
        name: /I'm Nelson. I live in Dublin/i,
      })

      expect(heading).toHaveClass(
        'text-4xl',
        'font-bold',
        'tracking-tight',
        'text-zinc-800',
      )
    })

    it('renders biography text with correct styling', () => {
      render(<About />)

      const firstParagraph = screen.getByText(
        /My path to DevOps wasn't traditional/i,
      )

      expect(firstParagraph.parentElement).toHaveClass(
        'mt-6',
        'space-y-7',
        'text-base',
      )
    })
  })

  describe('Accessibility', () => {
    it('has proper heading hierarchy', () => {
      render(<About />)

      const headings = screen.getAllByRole('heading')
      expect(headings).toHaveLength(1)
      expect(headings[0].tagName).toBe('H1')
    })

    it('social links have descriptive text', () => {
      render(<About />)

      const githubLink = screen.getByText('Follow on GitHub')
      expect(githubLink).toBeVisible()

      const linkedinLink = screen.getByText('Follow on LinkedIn')
      expect(linkedinLink).toBeVisible()
    })

    it('image has empty alt text for decorative image', () => {
      render(<About />)

      const images = screen.getAllByRole('presentation')
      images.forEach((img) => {
        expect(img).toHaveAttribute('alt', '')
      })
    })
  })

  describe('Layout', () => {
    it('renders in a grid layout', () => {
      render(<About />)

      const container = screen
        .getByRole('heading')
        .closest('div')?.parentElement
      expect(container).toHaveClass('grid', 'grid-cols-1')
    })

    it('renders social links section', () => {
      render(<About />)

      const list = screen.getByRole('list')
      expect(list.parentElement).toHaveClass('lg:pl-20')
    })
  })
})
