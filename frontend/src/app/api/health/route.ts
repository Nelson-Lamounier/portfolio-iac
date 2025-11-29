/** @format */

/**
 * Health Check Endpoint
 *
 * Used by:
 * - Docker HEALTHCHECK in Dockerfile
 * - ECS health checks
 * - Load balancer health checks (future)
 * - Monitoring systems
 *
 * Returns 200 OK with basic health status
 */
export async function GET() {
  return Response.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    },
    { status: 200 }
  );
}
