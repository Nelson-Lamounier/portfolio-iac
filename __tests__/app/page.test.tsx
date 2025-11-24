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
  it('renders the main heading', async () => {
    render(await Home())

    const heading = screen.getByRole('heading', {
      name: /Cloud infrastructure builder, AWS problem solver, and DevOps educator/i,
    })

    expect(heading).toBeInTheDocument()
  })

  it('renders the introduction paragraph', async () => {
    render(await Home())

    const intro = screen.getByText(
      /I'm Nelson, an AWS Certified DevOps Engineer Professional/i,
    )

    expect(intro).toBeInTheDocument()
    expect(intro).toHaveClass('text-base')
  })

  it('renders social media links with correct attributes', async () => {
    render(await Home())

    const githubLink = screen.getByLabelText('Follow on GitHub')
    const linkedinLink = screen.getByLabelText('Follow on LinkedIn')

    expect(githubLink).toBeInTheDocument()
    expect(githubLink).toHaveAttribute(
      'href',
      'https://github.com/Nelson-Lamounier',
    )
    expect(githubLink).toHaveAttribute('target', '_blank')
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer')

    expect(linkedinLink).toBeInTheDocument()
    expect(linkedinLink).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/nelson-lamounier-leao/',
    )
    expect(linkedinLink).toHaveAttribute('target', '_blank')
    expect(linkedinLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders the newsletter section', async () => {
    render(await Home())

    const newsletterHeading = screen.getByText('Stay up to date')
    const emailInput = screen.getByPlaceholderText('Email address')
    const submitButton = screen.getByRole('button', { name: /join/i })

    expect(newsletterHeading).toBeInTheDocument()
    expect(emailInput).toBeInTheDocument()
    expect(emailInput).toHaveAttribute('type', 'email')
    expect(emailInput).toBeRequired()
    expect(submitButton).toBeInTheDocument()
  })

  it('renders the work/resume section', async () => {
    render(await Home())

    const workHeading = screen.getByText('Work')
    const downloadLink = screen.getByRole('link', { name: /download cv/i })

    expect(workHeading).toBeInTheDocument()
    expect(downloadLink).toBeInTheDocument()
    expect(downloadLink).toHaveAttribute('href', '#')
  })

  it('renders company names in resume', async () => {
    render(await Home())

    expect(screen.getByText('Planetaria')).toBeInTheDocument()
    expect(screen.getByText('Airbnb')).toBeInTheDocument()
    expect(screen.getByText('Facebook')).toBeInTheDocument()
    expect(screen.getByText('Starbucks')).toBeInTheDocument()
  })

  it('renders job titles in resume', async () => {
    render(await Home())

    expect(screen.getByText('CEO')).toBeInTheDocument()
    expect(screen.getByText('Product Designer')).toBeInTheDocument()
    expect(screen.getByText('iOS Software Engineer')).toBeInTheDocument()
    expect(screen.getByText('Shift Supervisor')).toBeInTheDocument()
  })

  it('renders articles from the mock data', async () => {
    render(await Home())

    const article1 = screen.getByText('Test Article 1')
    const article2 = screen.getByText('Test Article 2')

    expect(article1).toBeInTheDocument()
    expect(article2).toBeInTheDocument()
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

  it('renders photos section', async () => {
    render(await Home())

    // Photos are rendered as images with presentation role (empty alt text)
    const images = screen.getAllByRole('presentation')
    expect(images.length).toBeGreaterThan(0)
  })

  it('newsletter form has correct action attribute', async () => {
    render(await Home())

    // Forms don't have implicit role, so we query by element
    const emailInput = screen.getByPlaceholderText('Email address')
    const form = emailInput.closest('form')

    expect(form).toBeInTheDocument()
    expect(form).toHaveAttribute('action', '/thank-you')
  })

  it('renders all social media icons', async () => {
    render(await Home())

    const xLink = screen.getByLabelText('Follow on X')
    const instagramLink = screen.getByLabelText('Follow on Instagram')
    const githubLink = screen.getByLabelText('Follow on GitHub')
    const linkedinLink = screen.getByLabelText('Follow on LinkedIn')

    expect(xLink).toBeInTheDocument()
    expect(instagramLink).toBeInTheDocument()
    expect(githubLink).toBeInTheDocument()
    expect(linkedinLink).toBeInTheDocument()
  })

  it('applies correct CSS classes to main container', async () => {
    render(await Home())

    const heading = screen.getByRole('heading', {
      name: /Cloud infrastructure builder/i,
    })

    expect(heading).toHaveClass('text-4xl', 'font-bold', 'tracking-tight')
  })
})
