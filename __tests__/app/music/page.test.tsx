import { render, screen } from '@testing-library/react'
import Music from '@/app/music/page'

describe('Music Page', () => {
  describe('Page Structure', () => {
    it('renders a main heading', () => {
      render(<Music />)

      const headings = screen.getAllByRole('heading', { level: 1 })
      expect(headings).toHaveLength(1)
      expect(headings[0]).toBeInTheDocument()
    })

    it('renders an introduction section', () => {
      render(<Music />)

      const heading = screen.getByRole('heading', { level: 1 })
      const container = heading.parentElement

      expect(container?.querySelector('p')).toBeInTheDocument()
    })

    it('renders multiple content sections', () => {
      render(<Music />)

      const sections = screen.getAllByRole('heading', { level: 2 })
      expect(sections.length).toBeGreaterThan(3)
    })
  })

  describe('Hero Section', () => {
    it('explains the educational music concept', () => {
      render(<Music />)

      const heading = screen.getByRole('heading', {
        name: /A New Way to Master AWS Certifications/i,
      })
      expect(heading).toBeInTheDocument()
    })

    it('includes visual icon', () => {
      render(<Music />)

      const pageContent = screen
        .getByRole('heading', { level: 1 })
        .closest('div')
      expect(pageContent?.textContent).toContain('🎵')
    })

    it('uses gradient styling', () => {
      render(<Music />)

      const gradientElements = document.querySelectorAll('.bg-gradient-to-br')
      expect(gradientElements.length).toBeGreaterThan(0)
    })
  })

  describe('Notify Me Form', () => {
    it('renders email notification form', () => {
      render(<Music />)

      const emailInput = screen.getByPlaceholderText(
        /your\.email@example\.com/i,
      )
      expect(emailInput).toBeInTheDocument()
      expect(emailInput).toHaveAttribute('type', 'email')
      expect(emailInput).toBeRequired()
    })

    it('renders submit button', () => {
      render(<Music />)

      const submitButton = screen.getByRole('button', { name: /notify me/i })
      expect(submitButton).toBeInTheDocument()
      expect(submitButton).toHaveAttribute('type', 'submit')
    })

    it('form has correct action endpoint', () => {
      render(<Music />)

      const emailInput = screen.getByPlaceholderText(
        /your\.email@example\.com/i,
      )
      const form = emailInput.closest('form')

      expect(form).toHaveAttribute('action', '/thank-you')
    })

    it('displays form heading', () => {
      render(<Music />)

      const heading = screen.getByRole('heading', { name: 'Get Notified' })
      expect(heading).toBeInTheDocument()
    })
  })

  describe('What Makes This Different Section', () => {
    it('renders the section heading', () => {
      render(<Music />)

      const heading = screen.getByRole('heading', {
        name: 'What Makes This Different',
      })
      expect(heading).toBeInTheDocument()
    })

    it('displays feature cards', () => {
      render(<Music />)

      expect(screen.getByText('Real Scenarios')).toBeInTheDocument()
      expect(screen.getByText('Genre-Bending')).toBeInTheDocument()
      expect(screen.getByText('Auditory Learning')).toBeInTheDocument()
      expect(screen.getByText('Exam-Focused')).toBeInTheDocument()
    })

    it('includes feature descriptions', () => {
      render(<Music />)

      expect(
        screen.getByText(/Exam questions reimagined as lyrical stories/i),
      ).toBeInTheDocument()
    })

    it('displays emoji icons', () => {
      render(<Music />)

      const pageContent = screen
        .getByRole('heading', { level: 1 })
        .closest('div')
      expect(pageContent?.textContent).toContain('📖')
      expect(pageContent?.textContent).toContain('🎧')
      expect(pageContent?.textContent).toContain('🎓')
    })
  })

  describe('Topics Covered Section', () => {
    it('renders the section heading', () => {
      render(<Music />)

      const heading = screen.getByRole('heading', {
        name: 'Currently Recording Songs About',
      })
      expect(heading).toBeInTheDocument()
    })

    it('lists AWS topics being covered', () => {
      render(<Music />)

      expect(screen.getByText(/AWS CodeDeploy/i)).toBeInTheDocument()
      expect(screen.getByText(/Amazon ECS/i)).toBeInTheDocument()
      expect(screen.getByText(/AWS Lambda & Auto Scaling/i)).toBeInTheDocument()
      expect(screen.getByText(/CloudFormation Stacks/i)).toBeInTheDocument()
      expect(screen.getByText(/VPC Networking/i)).toBeInTheDocument()
    })

    it('includes musical note symbols', () => {
      render(<Music />)

      const section = screen.getByText(/AWS CodeDeploy/i).closest('ul')
      expect(section?.textContent).toContain('♪')
    })
  })

  describe('Why Music Works Section', () => {
    it('renders the section heading', () => {
      render(<Music />)

      const heading = screen.getByRole('heading', {
        name: 'Why Music Works for Learning',
      })
      expect(heading).toBeInTheDocument()
    })

    it('explains the science behind music learning', () => {
      render(<Music />)

      expect(
        screen.getByText(/information paired with melody is retained/i),
      ).toBeInTheDocument()
    })

    it('provides relatable examples', () => {
      render(<Music />)

      expect(
        screen.getByText(/ABCs or remember advertising jingles/i),
      ).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has proper heading hierarchy', () => {
      render(<Music />)

      const h1Elements = screen.getAllByRole('heading', { level: 1 })
      expect(h1Elements).toHaveLength(1)

      const h2Elements = screen.getAllByRole('heading', { level: 2 })
      expect(h2Elements.length).toBeGreaterThan(0)

      const h3Elements = screen.getAllByRole('heading', { level: 3 })
      expect(h3Elements.length).toBeGreaterThan(0)
    })

    it('email input has proper aria-label', () => {
      render(<Music />)

      const emailInput = screen.getByLabelText('Email address')
      expect(emailInput).toBeInTheDocument()
    })

    it('form button is keyboard accessible', () => {
      render(<Music />)

      const button = screen.getByRole('button', { name: /notify me/i })
      expect(button.tagName).toBe('BUTTON')
    })

    it('all headings are visible and accessible', () => {
      render(<Music />)

      const allHeadings = screen.getAllByRole('heading')

      allHeadings.forEach((heading) => {
        expect(heading).toBeVisible()
        expect(heading.textContent).toBeTruthy()
      })
    })
  })

  describe('Responsive Design', () => {
    it('applies responsive grid classes', () => {
      render(<Music />)

      const featureSection = screen.getByText(
        'What Makes This Different',
      ).nextElementSibling
      expect(featureSection).toHaveClass('grid', 'sm:grid-cols-2')
    })

    it('form has responsive layout', () => {
      render(<Music />)

      const form = screen
        .getByRole('button', { name: /notify me/i })
        .closest('form')
      expect(form).toHaveClass('flex-col', 'sm:flex-row')
    })
  })

  describe('Dark Mode Support', () => {
    it('applies dark mode classes to sections', () => {
      render(<Music />)

      const sections = screen.getAllByRole('heading', { level: 2 })

      sections.forEach((section) => {
        expect(section.className).toContain('dark:')
      })
    })

    it('form input has dark mode styling', () => {
      render(<Music />)

      const emailInput = screen.getByPlaceholderText(
        /your\.email@example\.com/i,
      )
      expect(emailInput.className).toContain('dark:')
    })
  })

  describe('SEO and Metadata', () => {
    it('exports metadata for SEO', () => {
      const MusicModule = require('@/app/music/page')

      expect(MusicModule.metadata).toBeDefined()
      expect(MusicModule.metadata.title).toBeTruthy()
      expect(MusicModule.metadata.description).toBeTruthy()
    })

    it('metadata contains relevant keywords', () => {
      const MusicModule = require('@/app/music/page')

      const description = MusicModule.metadata.description.toLowerCase()

      const hasRelevantKeywords =
        description.includes('aws') ||
        description.includes('music') ||
        description.includes('educational') ||
        description.includes('certification')

      expect(hasRelevantKeywords).toBe(true)
    })
  })

  describe('Content Quality', () => {
    it('displays multiple AWS topics', () => {
      render(<Music />)

      const topics = [
        /CodeDeploy/i,
        /ECS/i,
        /Lambda/i,
        /CloudFormation/i,
        /VPC/i,
      ]

      topics.forEach((topic) => {
        expect(screen.getByText(topic)).toBeInTheDocument()
      })
    })

    it('explains the unique value proposition', () => {
      render(<Music />)

      const intro = screen.getByRole('heading', { level: 1 }).parentElement
      expect(intro?.textContent).toContain('educational')
    })

    it('includes call-to-action', () => {
      render(<Music />)

      const cta = screen.getByRole('button', { name: /notify me/i })
      expect(cta).toBeVisible()
    })
  })

  describe('Layout Structure', () => {
    it('sections are properly spaced', () => {
      render(<Music />)

      const mainContainer = screen
        .getByRole('heading', { level: 1 })
        .closest('div')
        ?.querySelector('.space-y-8')

      expect(mainContainer).toBeInTheDocument()
    })

    it('renders in proper container', () => {
      render(<Music />)

      const mainHeading = screen.getByRole('heading', { level: 1 })
      const container = mainHeading.closest('div')

      expect(container).toBeInTheDocument()
    })
  })

  describe('Performance', () => {
    it('renders efficiently', () => {
      const startTime = Date.now()
      render(<Music />)
      const endTime = Date.now()

      const renderTime = endTime - startTime
      expect(renderTime).toBeLessThan(100)
    })
  })
})
