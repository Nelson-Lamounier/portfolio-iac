import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Projects from '@/app/projects/page'

// Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

describe('Projects Page', () => {
  describe('Page Structure', () => {
    it('renders a main heading', () => {
      render(<Projects />)

      const headings = screen.getAllByRole('heading', { level: 1 })
      expect(headings).toHaveLength(1)
      expect(headings[0]).toBeInTheDocument()
    })

    it('renders an introduction section', () => {
      render(<Projects />)

      const heading = screen.getByRole('heading', { level: 1 })
      const container = heading.parentElement

      // Should have intro text
      expect(container?.querySelector('p')).toBeInTheDocument()
    })

    it('renders a list of projects', () => {
      render(<Projects />)

      const list = screen.getByRole('list')
      expect(list).toBeInTheDocument()

      const listItems = screen.getAllByRole('listitem')
      expect(listItems.length).toBeGreaterThan(0)
    })
  })

  describe('Filter Functionality', () => {
    it('renders filter tabs', () => {
      render(<Projects />)

      const allButton = screen.getByRole('button', { name: 'All' })
      expect(allButton).toBeInTheDocument()
    })

    it('renders all category filter buttons', () => {
      render(<Projects />)

      const categories = [
        'All',
        'CI/CD',
        'Infrastructure',
        'Monitoring',
        'Security',
      ]

      categories.forEach((category) => {
        const button = screen.getByRole('button', { name: category })
        expect(button).toBeInTheDocument()
      })
    })

    it('All filter is active by default', () => {
      render(<Projects />)

      const allButton = screen.getByRole('button', { name: 'All' })
      expect(allButton).toHaveClass('bg-teal-500')
    })

    it('filters projects when category is clicked', async () => {
      const user = userEvent.setup()
      render(<Projects />)

      const initialProjects = screen.getAllByRole('listitem')
      const initialCount = initialProjects.length

      // Click on a specific category
      const cicdButton = screen.getByRole('button', { name: 'CI/CD' })
      await user.click(cicdButton)

      const filteredProjects = screen.getAllByRole('listitem')

      // Should show fewer projects (or same if all are CI/CD)
      expect(filteredProjects.length).toBeLessThanOrEqual(initialCount)
    })

    it('updates active state when filter is clicked', async () => {
      const user = userEvent.setup()
      render(<Projects />)

      const cicdButton = screen.getByRole('button', { name: 'CI/CD' })
      await user.click(cicdButton)

      expect(cicdButton).toHaveClass('bg-teal-500')
    })

    it('shows all projects when All filter is clicked', async () => {
      const user = userEvent.setup()
      render(<Projects />)

      // Click a specific category first
      const securityButton = screen.getByRole('button', { name: 'Security' })
      await user.click(securityButton)

      // Then click All
      const allButton = screen.getByRole('button', { name: 'All' })
      await user.click(allButton)

      const projects = screen.getAllByRole('listitem')
      expect(projects.length).toBeGreaterThan(1)
    })
  })

  describe('Project Cards', () => {
    it('each project has a title', () => {
      render(<Projects />)

      const listItems = screen.getAllByRole('listitem')

      listItems.forEach((item) => {
        const heading = within(item).getByRole('heading', { level: 2 })
        expect(heading).toBeInTheDocument()
        expect(heading.textContent).toBeTruthy()
      })
    })

    it('each project has a description', () => {
      render(<Projects />)

      const listItems = screen.getAllByRole('listitem')

      listItems.forEach((item) => {
        const paragraphs = within(item).getAllByText(/./i)
        expect(paragraphs.length).toBeGreaterThan(0)
      })
    })

    it('each project has a link', () => {
      render(<Projects />)

      const listItems = screen.getAllByRole('listitem')

      listItems.forEach((item) => {
        const links = within(item).getAllByRole('link')
        expect(links.length).toBeGreaterThan(0)
      })
    })

    it('project links have href attributes', () => {
      render(<Projects />)

      const links = screen.getAllByRole('link')

      links.forEach((link) => {
        expect(link).toHaveAttribute('href')
      })
    })

    it('each project displays a logo image', () => {
      render(<Projects />)

      const listItems = screen.getAllByRole('listitem')

      listItems.forEach((item) => {
        const images = within(item).getAllByRole('presentation')
        expect(images.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Responsive Grid Layout', () => {
    it('applies responsive grid classes', () => {
      render(<Projects />)

      const list = screen.getByRole('list')
      expect(list).toHaveClass(
        'grid',
        'grid-cols-1',
        'sm:grid-cols-2',
        'lg:grid-cols-3',
      )
    })

    it('applies proper spacing between items', () => {
      render(<Projects />)

      const list = screen.getByRole('list')
      expect(list).toHaveClass('gap-x-12', 'gap-y-16')
    })
  })

  describe('Accessibility', () => {
    it('has proper heading hierarchy', () => {
      render(<Projects />)

      const h1Elements = screen.getAllByRole('heading', { level: 1 })
      expect(h1Elements).toHaveLength(1)

      const h2Elements = screen.getAllByRole('heading', { level: 2 })
      expect(h2Elements.length).toBeGreaterThan(0)
    })

    it('filter buttons are keyboard accessible', () => {
      render(<Projects />)

      const buttons = screen.getAllByRole('button')

      buttons.forEach((button) => {
        expect(button.tagName).toBe('BUTTON')
      })
    })

    it('project links are accessible', () => {
      render(<Projects />)

      const links = screen.getAllByRole('link')

      links.forEach((link) => {
        expect(link).toBeInTheDocument()
        expect(link.textContent).toBeTruthy()
      })
    })

    it('images have empty alt text for decorative images', () => {
      render(<Projects />)

      const images = screen.getAllByRole('presentation')

      images.forEach((img) => {
        expect(img).toHaveAttribute('alt', '')
      })
    })
  })

  describe('SEO and Metadata', () => {
    it('exports metadata for SEO', () => {
      const ProjectsModule = require('@/app/projects/page')

      expect(ProjectsModule.metadata).toBeDefined()
      expect(ProjectsModule.metadata.title).toBeTruthy()
      expect(ProjectsModule.metadata.description).toBeTruthy()
    })

    it('metadata contains relevant keywords', () => {
      const ProjectsModule = require('@/app/projects/page')

      const title = ProjectsModule.metadata.title.toLowerCase()
      const description = ProjectsModule.metadata.description.toLowerCase()

      // Should contain relevant DevOps/Cloud keywords
      const hasRelevantKeywords =
        title.includes('cloud') ||
        title.includes('devops') ||
        title.includes('infrastructure') ||
        description.includes('kubernetes') ||
        description.includes('aws')

      expect(hasRelevantKeywords).toBe(true)
    })
  })

  describe('Interactive Behavior', () => {
    it('filter buttons have hover states', () => {
      render(<Projects />)

      const buttons = screen.getAllByRole('button')

      buttons.forEach((button) => {
        expect(button.className).toContain('hover:')
      })
    })

    it('maintains filter state across interactions', async () => {
      const user = userEvent.setup()
      render(<Projects />)

      const infrastructureButton = screen.getByRole('button', {
        name: 'Infrastructure',
      })
      await user.click(infrastructureButton)

      expect(infrastructureButton).toHaveClass('bg-teal-500')

      // Click another button
      const monitoringButton = screen.getByRole('button', {
        name: 'Monitoring',
      })
      await user.click(monitoringButton)

      // Previous button should no longer be active
      expect(infrastructureButton).not.toHaveClass('bg-teal-500')
      expect(monitoringButton).toHaveClass('bg-teal-500')
    })
  })

  describe('Content Quality', () => {
    it('displays multiple projects', () => {
      render(<Projects />)

      const projects = screen.getAllByRole('listitem')
      expect(projects.length).toBeGreaterThan(3)
    })

    it('project titles are descriptive', () => {
      render(<Projects />)

      const headings = screen.getAllByRole('heading', { level: 2 })

      headings.forEach((heading) => {
        expect(heading.textContent?.length).toBeGreaterThan(10)
      })
    })

    it('no duplicate project titles', () => {
      render(<Projects />)

      const headings = screen.getAllByRole('heading', { level: 2 })
      const titles = headings.map((h) => h.textContent)
      const uniqueTitles = new Set(titles)

      expect(titles.length).toBe(uniqueTitles.size)
    })
  })

  describe('Dark Mode Support', () => {
    it('applies dark mode classes to filter buttons', () => {
      render(<Projects />)

      const buttons = screen.getAllByRole('button')

      buttons.forEach((button) => {
        expect(button.className).toContain('dark:')
      })
    })

    it('applies dark mode classes to project cards', () => {
      render(<Projects />)

      const headings = screen.getAllByRole('heading', { level: 2 })

      headings.forEach((heading) => {
        expect(heading.className).toContain('dark:')
      })
    })
  })

  describe('Performance', () => {
    it('renders efficiently', () => {
      const startTime = Date.now()
      render(<Projects />)
      const endTime = Date.now()

      const renderTime = endTime - startTime
      expect(renderTime).toBeLessThan(100)
    })

    it('handles filter changes efficiently', async () => {
      const user = userEvent.setup()
      render(<Projects />)

      const startTime = Date.now()

      const cicdButton = screen.getByRole('button', { name: 'CI/CD' })
      await user.click(cicdButton)

      const endTime = Date.now()
      const filterTime = endTime - startTime

      expect(filterTime).toBeLessThan(100)
    })
  })
})
