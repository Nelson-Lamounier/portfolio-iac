/** @format */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware to track HTTP requests
 * Runs on all routes except static files and internal Next.js routes
 */
export function middleware(request: NextRequest) {
  const start = Date.now();
  const response = NextResponse.next();

  // Track metrics asynchronously (fire and forget)
  if (typeof window === 'undefined') {
    // Only run on server-side
    const duration = (Date.now() - start) / 1000;
    
    // Import metrics dynamically to avoid circular dependencies
    import('@/lib/metrics').then(({ trackRequestDuration, trackApiCall }) => {
      const status = response.status;
      const method = request.method;
      const path = request.nextUrl.pathname;

      // Track request duration
      trackRequestDuration(method, path, status, duration);

      // Track API calls specifically
      if (path.startsWith('/api/')) {
        trackApiCall(path, method, status);
      }
    }).catch(() => {
      // Silently fail - don't break the request
    });
  }

  return response;
}

/**
 * Configure which routes to run middleware on
 * Exclude static files, images, and Next.js internals
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
