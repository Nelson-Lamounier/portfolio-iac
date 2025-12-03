/** @format */

import { NextResponse } from 'next/server';

/**
 * GET /api/health
 * Health check endpoint for load balancer and monitoring
 */
export async function GET() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    environment: process.env.NODE_ENV,
  };

  return NextResponse.json(health, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
