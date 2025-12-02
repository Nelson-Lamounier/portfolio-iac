/** @format */

import { NextResponse } from "next/server";

// Simple in-memory metrics store
// In production, consider using a proper metrics library like prom-client
const metrics = {
  page_views_total: 0,
  api_calls_total: 0,
  errors_total: 0,
  http_requests_total: 0,
  http_request_duration_seconds: [] as number[],
};

// Track request start time
const requestStartTimes = new Map<string, number>();

/**
 * GET /api/metrics
 * Returns metrics in Prometheus format
 */
export async function GET() {
  const prometheusMetrics = `
# HELP nextjs_page_views_total Total number of page views
# TYPE nextjs_page_views_total counter
nextjs_page_views_total ${metrics.page_views_total}

# HELP nextjs_api_calls_total Total number of API calls
# TYPE nextjs_api_calls_total counter
nextjs_api_calls_total ${metrics.api_calls_total}

# HELP nextjs_errors_total Total number of errors
# TYPE nextjs_errors_total counter
nextjs_errors_total ${metrics.errors_total}

# HELP nextjs_http_requests_total Total number of HTTP requests
# TYPE nextjs_http_requests_total counter
nextjs_http_requests_total ${metrics.http_requests_total}

# HELP nextjs_http_request_duration_seconds HTTP request duration in seconds
# TYPE nextjs_http_request_duration_seconds summary
nextjs_http_request_duration_seconds_sum ${metrics.http_request_duration_seconds.reduce((a, b) => a + b, 0)}
nextjs_http_request_duration_seconds_count ${metrics.http_request_duration_seconds.length}

# HELP nextjs_up Application is up and running
# TYPE nextjs_up gauge
nextjs_up 1
`;

  return new NextResponse(prometheusMetrics.trim(), {
    headers: {
      "Content-Type": "text/plain; version=0.0.4",
    },
  });
}

/**
 * POST /api/metrics
 * Accepts custom metrics from the frontend
 */
export async function POST(request: Request) {
  try {
    const data = await request.json();

    // Increment metrics based on type
    switch (data.metric) {
      case "page_view":
        metrics.page_views_total++;
        break;
      case "api_call":
        metrics.api_calls_total++;
        break;
      case "error":
        metrics.errors_total++;
        break;
      case "http_request":
        metrics.http_requests_total++;
        if (data.duration) {
          metrics.http_request_duration_seconds.push(data.duration);
          // Keep only last 1000 durations to prevent memory issues
          if (metrics.http_request_duration_seconds.length > 1000) {
            metrics.http_request_duration_seconds.shift();
          }
        }
        break;
      default:
        return NextResponse.json(
          { error: "Unknown metric type" },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error recording metric:", error);
    return NextResponse.json(
      { error: "Failed to record metric" },
      { status: 500 }
    );
  }
}
