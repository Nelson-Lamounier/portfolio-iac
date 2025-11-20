# Test Suite

This directory contains all unit and integration tests for the application, following Next.js best practices.

## Directory Structure

```
__tests__/
├── app/
│   ├── page.test.tsx           # Home page tests (13 tests)
│   ├── about/
│   │   └── page.test.tsx       # About page tests (17 tests)
│   └── articles/
│       └── page.test.tsx       # Articles page tests (17 tests)
└── README.md                   # This file
```

## Test Organization

Tests are organized to mirror the `src/app` directory structure:

- `__tests__/app/page.test.tsx` → tests `src/app/page.tsx`
- `__tests__/app/about/page.test.tsx` → tests `src/app/about/page.tsx`
- `__tests__/app/articles/page.test.tsx` → tests `src/app/articles/page.tsx`

This structure follows the [Next.js testing documentation](https://nextjs.org/docs/app/building-your-application/testing/jest) recommendation to place tests in a `__tests__` folder at the project root.

## Running Tests

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage
yarn test --coverage

# Run specific test file
yarn test __tests__/app/page.test.tsx
```

## Test Coverage

### Home Page (`__tests__/app/page.test.tsx`)

- ✅ Main heading and introduction
- ✅ Social media links with security attributes
- ✅ Newsletter form functionality
- ✅ Work/resume section
- ✅ Company names and job titles
- ✅ Article listings
- ✅ Photo gallery
- ✅ CSS styling

### About Page (`__tests__/app/about/page.test.tsx`)

- ✅ Main heading and biography
- ✅ Portrait image
- ✅ Social links with security attributes
- ✅ Email link
- ✅ Content structure
- ✅ Accessibility features
- ✅ Layout and styling

### Articles Page (`__tests__/app/articles/page.test.tsx`)

- ✅ Page structure and headings
- ✅ Article list rendering
- ✅ Article links and navigation
- ✅ Date formatting and display
- ✅ Responsive layout classes
- ✅ Accessibility (semantic HTML, ARIA)
- ✅ Content organization
- ✅ Empty state handling

## Testing Tools

- **Jest**: Test runner and assertion library
- **React Testing Library**: Component testing utilities
- **@testing-library/jest-dom**: Custom matchers for DOM assertions

## Best Practices

1. **Test user behavior, not implementation**: Use semantic queries like `getByRole`, `getByLabelText`
2. **Accessibility-first**: Tests ensure components are accessible
3. **Security validation**: Verify external links have proper security attributes
4. **Mock external dependencies**: Mock Next.js Image, API calls, etc.
5. **Descriptive test names**: Clear, readable test descriptions

## Adding New Tests

When adding a new page or component:

1. Create a test file in `__tests__` mirroring the source structure
2. Import the component using the `@/` alias
3. Mock any external dependencies (images, APIs, etc.)
4. Write tests covering:
   - Content rendering
   - User interactions
   - Accessibility
   - Security attributes (for external links)
   - Styling and layout

Example:

```typescript
// For src/app/projects/page.tsx
// Create __tests__/app/projects/page.test.tsx

import { render, screen } from '@testing-library/react'
import Projects from '@/app/projects/page'

describe('Projects Page', () => {
  it('renders the page', () => {
    render(<Projects />)
    // Add assertions
  })
})
```

## Continuous Integration

Tests run automatically on:

- Pull requests
- Commits to main branch
- Pre-deployment checks

Ensure all tests pass before merging code.
