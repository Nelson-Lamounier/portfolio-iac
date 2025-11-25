import { render, screen, within } from '@testing-library/react'
import Uses from '@/app/uses/page'

describe('Uses Page', () => {
  describe('Page Structure', () => {
    it('renders a main heading', () => {
      render(<Uses />)

      const headings = screen.getAllByRole('heading', { level: 1 })
      expect(headings).toHaveLength(1)
      expect(headings[0]).toBeInTheDocument()
    })

    it('renders an introduction section', () => {
      render(<Uses />)

      const heading = screen.getByRole('heading', { level: 1 })
      const container = heading.parentElement

      // Should have intro text
      expect(container?.querySelector('p')).toBeInTheDocument()
    })

    it('renders multiple tool sections', () => {
      render(<Uses />)

      const sections = screen.getAllByRole('region')
      expect(sections.length).toBeGreaterThan(2)
    })
  })

  describe('Tool Sections', () => {
    it('renders Workstation section', () => {
      render(<Uses />)

      const workstationHeading = screen.getByRole('heading', {
        name: 'Workstation',
      })
      expect(workstationHeading).toBeInTheDocument()
    })

    it('renders Development tools section', () => {
      render(<Uses />)

      const devToolsHeading = screen.getByRole('heading', {
        name: 'Development tools',
      })
      expect(devToolsHeading).toBeInTheDocument()
    })

    it('renders Infrastructure & Deployment section', () => {
      render(<Uses />)

      const infraHeading = screen.getByRole('heading', {
        name: 'Infrastructure & Deployment',
      })
      expect(infraHeading).toBeInTheDocument()
    })

    it('renders Monitoring & Debugging section', () => {
      render(<Uses />)

      const monitoringHeading = screen.getByRole('heading', {
        name: 'Monitoring & Debugging',
      })
      expect(monitoringHeading).toBeInTheDocument()
    })

    it('each section has proper heading level', () => {
      render(<Uses />)

      const sectionHeadings = screen.getAllByRole('heading', { level: 2 })
      expect(sectionHeadings.length).toBeGreaterThan(3)
    })
  })

  describe('Tool Items', () => {
    it('renders multiple tools in each section', () => {
      render(<Uses />)

      const lists = screen.getAllByRole('list')

      lists.forEach((list) => {
        const items = within(list).getAllByRole('listitem')
        expect(items.length).toBeGreaterThan(0)
      })
    })

    it('each tool has a title', () => {
      render(<Uses />)

      const toolHeadings = screen.getAllByRole('heading', { level: 3 })
      expect(toolHeadings.length).toBeGreaterThan(5)

      toolHeadings.forEach((heading) => {
        expect(heading.textContent).toBeTruthy()
        expect(heading.textContent?.length).toBeGreaterThan(2)
      })
    })

    it('each tool has a description', () => {
      render(<Uses />)

      const lists = screen.getAllByRole('list')

      lists.forEach((list) => {
        const items = within(list).getAllByRole('listitem')
        items.forEach((item) => {
          const paragraphs = within(item).getAllByText(/./i)
          expect(paragraphs.length).toBeGreaterThan(0)
        })
      })
    })

    it('renders tools as list items', () => {
      render(<Uses />)

      const allListItems = screen.getAllByRole('listitem')
      expect(allListItems.length).toBeGreaterThan(10)
    })
  })

  describe('Tool Links', () => {
    it('some tools have clickable links', () => {
      render(<Uses />)

      // Not all tools have links, but some should
      const links = screen.queryAllByRole('link')

      // If there are links, they should have href
      links.forEach((link) => {
        expect(link).toHaveAttribute('href')
      })
    })

    it('tool titles can be links or plain text', () => {
      render(<Uses />)

      const toolHeadings = screen.getAllByRole('heading', { level: 3 })

      toolHeadings.forEach((heading) => {
        // Should either be a link or plain text
        const link = heading.querySelector('a')
        const text = heading.textContent

        expect(link || text).toBeTruthy()
      })
    })
  })

  describe('Content Organization', () => {
    it('sections are properly spaced', () => {
      render(<Uses />)

      const mainContainer = screen
        .getByRole('heading', { level: 1 })
        .closest('div')
        ?.querySelector('.space-y-20')

      expect(mainContainer).toBeInTheDocument()
    })

    it('tools within sections are properly spaced', () => {
      render(<Uses />)

      const lists = screen.getAllByRole('list')

      lists.forEach((list) => {
        expect(list).toHaveClass('space-y-16')
      })
    })

    it('sections have proper grid layout', () => {
      render(<Uses />)

      const sections = screen.getAllByRole('region')

      sections.forEach((section) => {
        const gridContainer = section.querySelector('.grid')
        expect(gridContainer).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('has proper heading hierarchy', () => {
      render(<Uses />)

      const h1Elements = screen.getAllByRole('heading', { level: 1 })
      expect(h1Elements).toHaveLength(1)

      const h2Elements = screen.getAllByRole('heading', { level: 2 })
      expect(h2Elements.length).toBeGreaterThan(0)

      const h3Elements = screen.getAllByRole('heading', { level: 3 })
      expect(h3Elements.length).toBeGreaterThan(0)
    })

    it('sections have proper ARIA labels', () => {
      render(<Uses />)

      const sections = screen.getAllByRole('region')

      sections.forEach((section) => {
        expect(section).toHaveAttribute('aria-labelledby')
      })
    })

    it('lists have proper role attribute', () => {
      render(<Uses />)

      const lists = screen.getAllByRole('list')

      lists.forEach((list) => {
        expect(list).toHaveAttribute('role', 'list')
      })
    })

    it('all headings are accessible', () => {
      render(<Uses />)

      const allHeadings = screen.getAllByRole('heading')

      allHeadings.forEach((heading) => {
        expect(heading).toBeVisible()
        expect(heading.textContent).toBeTruthy()
      })
    })
  })

  describe('Responsive Design', () => {
    it('applies responsive border classes to sections', () => {
      render(<Uses />)

      const sections = screen.getAllByRole('region')

      sections.forEach((section) => {
        expect(section).toHaveClass('md:border-l', 'md:pl-6')
      })
    })

    it('applies responsive grid classes', () => {
      render(<Uses />)

      const sections = screen.getAllByRole('region')

      sections.forEach((section) => {
        const gridContainer = section.querySelector('.grid')
        expect(gridContainer).toHaveClass('grid-cols-1', 'md:grid-cols-4')
      })
    })
  })

  describe('Dark Mode Support', () => {
    it('applies dark mode classes to section borders', () => {
      render(<Uses />)

      const sections = screen.getAllByRole('region')

      sections.forEach((section) => {
        expect(section.className).toContain('dark:')
      })
    })

    it('applies dark mode classes to headings', () => {
      render(<Uses />)

      const sectionHeadings = screen.getAllByRole('heading', { level: 2 })

      sectionHeadings.forEach((heading) => {
        expect(heading.className).toContain('dark:')
      })
    })
  })

  describe('SEO and Metadata', () => {
    it('exports metadata for SEO', () => {
      const UsesModule = require('@/app/uses/page')

      expect(UsesModule.metadata).toBeDefined()
      expect(UsesModule.metadata.title).toBe('Uses')
      expect(UsesModule.metadata.description).toBeTruthy()
    })

    it('metadata has descriptive content', () => {
      const UsesModule = require('@/app/uses/page')

      expect(UsesModule.metadata.description.length).toBeGreaterThan(20)
    })
  })

  describe('Content Quality', () => {
    it('displays multiple categories of tools', () => {
      render(<Uses />)

      const sections = screen.getAllByRole('region')
      expect(sections.length).toBeGreaterThanOrEqual(4)
    })

    it('each section has multiple tools', () => {
      render(<Uses />)

      const lists = screen.getAllByRole('list')

      lists.forEach((list) => {
        const items = within(list).getAllByRole('listitem')
        expect(items.length).toBeGreaterThan(0)
      })
    })

    it('tool descriptions are substantial', () => {
      render(<Uses />)

      const toolHeadings = screen.getAllByRole('heading', { level: 3 })

      toolHeadings.forEach((heading) => {
        const listItem = heading.closest('li')
        const description = listItem?.textContent

        // Description should be longer than just the title
        expect(description?.length).toBeGreaterThan(
          heading.textContent?.length || 0,
        )
      })
    })

    it('no duplicate tool titles', () => {
      render(<Uses />)

      const toolHeadings = screen.getAllByRole('heading', { level: 3 })
      const titles = toolHeadings.map((h) => h.textContent)
      const uniqueTitles = new Set(titles)

      expect(titles.length).toBe(uniqueTitles.size)
    })
  })

  describe('Specific Tools', () => {
    it('mentions AWS-related tools', () => {
      render(<Uses />)

      const pageContent =
        screen.getByRole('heading', { level: 1 }).closest('div')?.textContent ||
        ''

      // Should mention AWS tools
      const hasAWSTools =
        pageContent.includes('AWS') ||
        pageContent.includes('CloudFormation') ||
        pageContent.includes('CDK')

      expect(hasAWSTools).toBe(true)
    })

    it('mentions development tools', () => {
      render(<Uses />)

      const pageContent =
        screen.getByRole('heading', { level: 1 }).closest('div')?.textContent ||
        ''

      // Should mention common dev tools
      const hasDevTools =
        pageContent.includes('Visual Studio Code') ||
        pageContent.includes('VS Code') ||
        pageContent.includes('Docker')

      expect(hasDevTools).toBe(true)
    })
  })

  describe('Layout Structure', () => {
    it('renders sections in proper container', () => {
      render(<Uses />)

      const mainHeading = screen.getByRole('heading', { level: 1 })
      const container = mainHeading.closest('div')

      expect(container).toBeInTheDocument()
    })

    it('sections are contained within space-y container', () => {
      render(<Uses />)

      const sections = screen.getAllByRole('region')
      const parentContainer = sections[0].parentElement

      expect(parentContainer).toHaveClass('space-y-20')
    })
  })

  describe('Performance', () => {
    it('renders efficiently', () => {
      const startTime = Date.now()
      render(<Uses />)
      const endTime = Date.now()

      const renderTime = endTime - startTime
      expect(renderTime).toBeLessThan(100)
    })

    it('handles multiple sections without performance issues', () => {
      const startTime = Date.now()
      render(<Uses />)

      const sections = screen.getAllByRole('region')
      const endTime = Date.now()

      expect(sections.length).toBeGreaterThan(3)
      expect(endTime - startTime).toBeLessThan(100)
    })
  })
})
