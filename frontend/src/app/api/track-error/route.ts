/** @format */

import { NextRequest, NextResponse } from 'next/server';
import { trackError } from '@/lib/metrics';

/**
 * POST /api/track-error
 * Track client-side and server-side errors
 */
export async function POST(request: NextRequest) {
  try {
    const { error, stack, context, isClient } = await request.json();

    // Extract error type from error message or stack
    const errorType = extractErrorType(error, stack);
    const location = context || extractLocation(stack);

    // Track the error
    trackError(errorType, location, isClient);

    // Log to console for debugging (in production, send to logging service)
    if (process.env.NODE_ENV === 'production') {
      console.error('Error tracked:', {
        type: errorType,
        location,
        isClient,
        error,
        stack: stack?.substring(0, 500), // Truncate for logging
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to track error:', err);
    return NextResponse.json(
      { error: 'Failed to track error' },
      { status: 500 }
    );
  }
}

/**
 * Extract error type from error message or stack trace
 */
function extractErrorType(error: string, stack?: string): string {
  // Try to extract error class name
  if (stack) {
    const match = stack.match(/^(\w+Error):/);
    if (match) return match[1];
  }

  // Common error patterns
  if (error.includes('fetch')) return 'FetchError';
  if (error.includes('network')) return 'NetworkError';
  if (error.includes('timeout')) return 'TimeoutError';
  if (error.includes('not found')) return 'NotFoundError';
  if (error.includes('permission')) return 'PermissionError';

  return 'UnknownError';
}

/**
 * Extract location (file/component) from stack trace
 */
function extractLocation(stack?: string): string {
  if (!stack) return 'unknown';

  // Try to extract first meaningful line from stack
  const lines = stack.split('\n');
  for (const line of lines) {
    // Look for file paths
    const match = line.match(/at\s+(?:.*\s+)?\(?([^)]+)\)?/);
    if (match && match[1] && !match[1].includes('node_modules')) {
      return match[1].split(':')[0]; // Remove line numbers
    }
  }

  return 'unknown';
}

export const dynamic = 'force-dynamic';
