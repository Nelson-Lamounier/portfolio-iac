/** @format */

import { NextResponse } from 'next/server';
import { register } from '@/lib/metrics';

/**
 * GET /api/metrics
 * Returns metrics in Prometheus format
 * 
 * This endpoint is scraped by Prometheus every 15-30 seconds
 * to collect application metrics.
 */
export async function GET() {
  try {
    const metrics = await register.metrics();
    
    return new NextResponse(metrics, {
      headers: {
        'Content-Type': register.contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error generating metrics:', error);
    
    // Return minimal metrics even on error
    return new NextResponse(
      '# Error generating metrics\nnextjs_up 0\n',
      {
        status: 500,
        headers: {
          'Content-Type': 'text/plain; version=0.0.4',
        },
      }
    );
  }
}

// Disable caching for metrics endpoint
export const dynamic = 'force-dynamic';
export const revalidate = 0;
