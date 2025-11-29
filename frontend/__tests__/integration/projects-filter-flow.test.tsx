import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Projects from '@/app/projects/page'

// Mock Next.js Image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

describe('Projects Filter Flow Integration', () => {
  describe('Complete Filtering Journey', () => {
    it('user can filter projects by category and see results', async () => {
      const user = userEvent.setup()
      render(<Projects />)

      // Start with all projects visible
      const initialProjects = screen.getAllByRole('listitem')
      const initialCount = initialProjects.length

      // Filter by CI/CD
      const cicdButton = screen.getByRole('button', { name: 'CI/CD' })
      await user.click(cicdButton)

      const cicdProjects = screen.getAllByRole('listitem')
      expect(cicdProjects.length).toBeLessThanOrEqual(initialCount)
      expect(cicdButton).toHaveClass('bg-teal-500')

      // Filter by Infrastructure
      const infraButton = screen.getByRole('button', { name: 'Infrastructure' })
      await user.click(infraButton)

      const infraProjects = screen.getAllByRole('listitem')
      expect(infraProjects.length).toBeLessThanOrEqual(initialCount)
      expect(infraButton).toHaveClass('bg-teal-500')
      expect(cicdButton).not.toHaveClass('bg-teal-500')

      // Return to All
      const allButton = screen.getByRole('button', { name: 'All' })
      await user.click(allButton)

      const allProjects = screen.getAllByRole('listitem')
      expect(allProjects.length).toBe(initialCount)
    })

    it('filtered projects maintain proper structure', async () => {
      const user = userEvent.setup()
      render(<Projects />)

      const securityButton = screen.getByRole('button', { name: 'Security' })
      await user.click(securityButton)

      const projects = screen.getAllByRole('listitem')

      projects.forEach((project) => {
        // Each project should have a title
        const heading = within(project).getByRole('heading', { level: 2 })
        expect(heading).toBeInTheDocument()

        // Each project should have a link
        const links = within(project).getAllByRole('link')
        expect(links.length).toBeGreaterThan(0)
      })
    })

    it('filter state persists through multiple interactions', async () => {
      const user = userEvent.setup()
      render(<Projects />)

      // Click through multiple filters
      const monitoringButton = screen.getByRole('button', {
        name: 'Monitoring',
      })
      await user.click(monitoringButton)
      expect(monitoringButton).toHaveClass('bg-teal-500')

      const cicdButton = screen.getByRole('button', { name: 'CI/CD' })
      await user.click(cicdButton)
      expect(cicdButton).toHaveClass('bg-teal-500')
      expect(monitoringButton).not.toHaveClass('bg-teal-500')

      const allButton = screen.getByRole('button', { name: 'All' })
      await user.click(allButton)
      expect(allButton).toHaveClass('bg-teal-500')
      expect(cicdButton).not.toHaveClass('bg-teal-500')
    })
  })

  describe('Filter Accessibility', () => {
    it('filters are keyboard navigable', async () => {
      render(<Projects />)

      const buttons = screen.getAllByRole('button')

      buttons.forEach((button) => {
        expect(button.tagName).toBe('BUTTON')
        expect(button).toBeVisible()
      })
    })

    it('filtered content remains accessible', async () => {
      const user = userEvent.setup()
      render(<Projects />)

      const infraButton = screen.getByRole('button', { name: 'Infrastructure' })
      await user.click(infraButton)

      const projects = screen.getAllByRole('listitem')

      projects.forEach((project) => {
        const heading = within(project).getByRole('heading')
        expect(heading).toBeVisible()
      })
    })
  })

  describe('Filter Performance', () => {
    it('filtering happens instantly', async () => {
      const user = userEvent.setup()
      render(<Projects />)

      const startTime = Date.now()

      const securityButton = screen.getByRole('button', { name: 'Security' })
      await user.click(securityButton)

      const endTime = Date.now()

      expect(endTime - startTime).toBeLessThan(100)
    })

    it('multiple filter changes perform well', async () => {
      const user = userEvent.setup()
      render(<Projects />)

      const startTime = Date.now()

      const categories = [
        'CI/CD',
        'Infrastructure',
        'Monitoring',
        'Security',
        'All',
      ]

      for (const category of categories) {
        const button = screen.getByRole('button', { name: category })
        await user.click(button)
      }

      const endTime = Date.now()

      expect(endTime - startTime).toBeLessThan(500)
    })
  })

  describe('Edge Cases', () => {
    it('handles empty filter results gracefully', async () => {
      const user = userEvent.setup()
      render(<Projects />)

      // Even if a category has no projects, page should not crash
      const buttons = screen.getAllByRole('button')

      for (const button of buttons) {
        await user.click(button)
        // Should not throw error
        expect(screen.getByRole('list')).toBeInTheDocument()
      }
    })

    it('maintains grid layout after filtering', async () => {
      const user = userEvent.setup()
      render(<Projects />)

      const list = screen.getByRole('list')
      const initialClasses = list.className

      const cicdButton = screen.getByRole('button', { name: 'CI/CD' })
      await user.click(cicdButton)

      expect(list.className).toBe(initialClasses)
    })
  })
})
