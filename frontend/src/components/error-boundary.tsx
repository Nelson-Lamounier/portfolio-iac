/** @format */

'use client';

import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary to catch and track client-side errors
 * Wrap your app or specific components with this
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Track error in metrics
    this.trackError(error, errorInfo);
  }

  async trackError(error: Error, errorInfo: React.ErrorInfo) {
    try {
      await fetch('/api/track-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          isClient: true,
        }),
      });
    } catch {
      // Silently fail - don't break the app further
      console.error('Failed to track error:', error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex min-h-screen items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold">Something went wrong</h2>
              <p className="mt-2 text-gray-600">
                We&apos;ve been notified and are working on it.
              </p>
              <button
                onClick={() => this.setState({ hasError: false })}
                className="mt-4 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
              >
                Try again
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

/**
 * Hook to track errors manually
 */
export function useErrorTracking() {
  const trackError = async (error: Error, context?: string) => {
    try {
      await fetch('/api/track-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: error.message,
          stack: error.stack,
          context,
          isClient: true,
        }),
      });
    } catch {
      console.error('Failed to track error:', error);
    }
  };

  return { trackError };
}
