# Home Page Test Suite

## Overview

Comprehensive unit tests for the Home page component using Jest and React Testing Library with jest-dom matchers.

## Test Coverage

### ✅ Content Rendering (13 tests passing)

- Main heading and introduction text
- Social media links with proper security attributes (`target="_blank"`, `rel="noopener noreferrer"`)
- Newsletter subscription form
- Work experience/resume section
- Company names and job titles
- Article listings from mock data
- Photo gallery
- CSS class applications

### Key Testing Patterns Used

#### 1. **jest-dom Matchers**

Using declarative, readable assertions:

```typescript
expect(element).toBeInTheDocument()
expect(element).toHaveAttribute('href', 'https://...')
expect(element).toHaveClass('text-4xl', 'font-bold')
expect(element).toBeRequired()
```

#### 2. **Async Component Testing**

Handling Next.js async server components:

```typescript
render(await Home())
```

#### 3. **Mocking**

- **Next.js Image**: Mocked to render as `<img>` for testing
- **Articles Module**: Mocked `getAllArticles()` to return test data

#### 4. **Accessibility-First Queries**

Using semantic queries that match how users interact:

```typescript
screen.getByRole('heading', { name: /cloud infrastructure/i })
screen.getByLabelText('Follow on GitHub')
screen.getByPlaceholderText('Email address')
```

## Running Tests

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run with coverage
yarn test --coverage
```

## Test File Structure

```
src/app/__tests__/
├── page.test.tsx    # Home page tests
└── README.md        # This file
```

## Benefits of jest-dom

The `@testing-library/jest-dom` library provides custom matchers that make tests:

- **More declarative**: `toBeInTheDocument()` vs checking for null
- **Better error messages**: Clear failures showing what was expected
- **Easier to maintain**: Semantic assertions that read like plain English
- **Accessibility-focused**: Encourages testing from user perspective

## Example Test

```typescript
it('renders social media links with correct attributes', async () => {
  render(await Home())

  const githubLink = screen.getByLabelText('Follow on GitHub')

  expect(githubLink).toBeInTheDocument()
  expect(githubLink).toHaveAttribute('href', 'https://github.com/Nelson-Lamounier')
  expect(githubLink).toHaveAttribute('target', '_blank')
  expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer')
})
```

This test is clear, maintainable, and tests both functionality and security best practices.
