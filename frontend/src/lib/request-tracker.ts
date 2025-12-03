/** @format */

import { NextRequest, NextResponse } from 'next/server';
import { httpRequestSize, httpResponseSize } from './metrics';

/**
 * Track request and response sizes
 * Call this from your middleware or API routes
 */
export function trackRequestSize(request: NextRequest, response: NextResponse) {
  const method = request.method;
  const route = request.nextUrl.pathname;
  const status = response.status;

  // Track request size
  const requestSize = parseInt(request.headers.get('content-length') || '0', 10);
  if (requestSize > 0) {
    httpRequestSize.observe({ method, route }, requestSize);
  }

  // Track response size
  const responseSize = parseInt(response.headers.get('content-length') || '0', 10);
  if (responseSize > 0) {
    httpResponseSize.observe({ method, route, status: status.toString() }, responseSize);
  }
}

/**
 * Estimate body size for requests without content-length header
 */
export function estimateBodySize(body: any): number {
  if (!body) return 0;
  
  try {
    if (typeof body === 'string') {
      return Buffer.byteLength(body, 'utf8');
    }
    if (Buffer.isBuffer(body)) {
      return body.length;
    }
    // For objects, estimate via JSON stringification
    return Buffer.byteLength(JSON.stringify(body), 'utf8');
  } catch {
    return 0;
  }
}
