/** @format */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { metricsConfig, isFeatureEnabled } from './metrics-config';

// Create a custom registry
export const register = new Registry();

// Set default labels
register.setDefaultLabels(metricsConfig.defaultLabels);

// Collect default Node.js metrics (memory, CPU, event loop, etc.)
if (isFeatureEnabled('collectDefaultMetrics')) {
  collectDefaultMetrics({
    register,
    prefix: metricsConfig.prefix,
    gcDurationBuckets: metricsConfig.buckets.gcDurationBuckets,
  });
}

// ============================================
// Application Health Metrics
// ============================================

export const appUp = new Gauge({
  name: 'nextjs_up',
  help: 'Application is up and running (1 = up, 0 = down)',
  registers: [register],
});
appUp.set(1);

export const appInfo = new Gauge({
  name: 'nextjs_app_info',
  help: 'Application information',
  labelNames: ['version', 'environment', 'node_version'],
  registers: [register],
});
appInfo.set(
  {
    version: process.env.npm_package_version || 'unknown',
    environment: process.env.NODE_ENV || 'development',
    node_version: process.version,
  },
  1
);

// ============================================
// Page View Metrics
// ============================================

export const pageViews = new Counter({
  name: 'nextjs_page_views_total',
  help: 'Total number of page views',
  labelNames: ['page', 'method', 'status'],
  registers: [register],
});

export const uniqueVisitors = new Gauge({
  name: 'nextjs_unique_visitors',
  help: 'Number of unique visitors (approximate)',
  registers: [register],
});

// ============================================
// API Metrics
// ============================================

export const apiCalls = new Counter({
  name: 'nextjs_api_calls_total',
  help: 'Total number of API calls',
  labelNames: ['endpoint', 'method', 'status'],
  registers: [register],
});

export const apiErrors = new Counter({
  name: 'nextjs_api_errors_total',
  help: 'Total number of API errors',
  labelNames: ['endpoint', 'method', 'error_type'],
  registers: [register],
});

// ============================================
// Performance Metrics
// ============================================

export const httpRequestDuration = new Histogram({
  name: 'nextjs_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: metricsConfig.buckets.httpDuration,
  registers: [register],
});

export const httpRequestSize = new Histogram({
  name: 'nextjs_http_request_size_bytes',
  help: 'Size of HTTP requests in bytes',
  labelNames: ['method', 'route'],
  buckets: metricsConfig.buckets.size,
  registers: [register],
});

export const httpResponseSize = new Histogram({
  name: 'nextjs_http_response_size_bytes',
  help: 'Size of HTTP responses in bytes',
  labelNames: ['method', 'route', 'status'],
  buckets: metricsConfig.buckets.size,
  registers: [register],
});

// ============================================
// Business Metrics
// ============================================

export const articleViews = new Counter({
  name: 'nextjs_article_views_total',
  help: 'Total number of article views',
  labelNames: ['article_slug'],
  registers: [register],
});

export const projectViews = new Counter({
  name: 'nextjs_project_views_total',
  help: 'Total number of project views',
  labelNames: ['project_name'],
  registers: [register],
});

export const contactFormSubmissions = new Counter({
  name: 'nextjs_contact_form_submissions_total',
  help: 'Total number of contact form submissions',
  labelNames: ['status'],
  registers: [register],
});

export const rssSubscribers = new Gauge({
  name: 'nextjs_rss_subscribers',
  help: 'Number of RSS feed requests (approximate)',
  registers: [register],
});

// ============================================
// Error Tracking
// ============================================

export const clientErrors = new Counter({
  name: 'nextjs_client_errors_total',
  help: 'Total number of client-side errors',
  labelNames: ['error_type', 'page'],
  registers: [register],
});

export const serverErrors = new Counter({
  name: 'nextjs_server_errors_total',
  help: 'Total number of server-side errors',
  labelNames: ['error_type', 'route'],
  registers: [register],
});

// ============================================
// Cache Metrics
// ============================================

export const cacheHits = new Counter({
  name: 'nextjs_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
  registers: [register],
});

export const cacheMisses = new Counter({
  name: 'nextjs_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

// ============================================
// External Dependencies
// ============================================

export const externalApiCalls = new Counter({
  name: 'nextjs_external_api_calls_total',
  help: 'Total number of external API calls',
  labelNames: ['service', 'status'],
  registers: [register],
});

export const externalApiDuration = new Histogram({
  name: 'nextjs_external_api_duration_seconds',
  help: 'Duration of external API calls in seconds',
  labelNames: ['service'],
  buckets: metricsConfig.buckets.externalApiDuration,
  registers: [register],
});

// ============================================
// Helper Functions
// ============================================

/**
 * Track page view
 */
export function trackPageView(page: string, status: number = 200) {
  pageViews.inc({
    page,
    method: 'GET',
    status: status.toString(),
  });
}

/**
 * Track API call
 */
export function trackApiCall(
  endpoint: string,
  method: string,
  status: number
) {
  apiCalls.inc({
    endpoint,
    method,
    status: status.toString(),
  });

  if (status >= 400) {
    apiErrors.inc({
      endpoint,
      method,
      error_type: status >= 500 ? 'server_error' : 'client_error',
    });
  }
}

/**
 * Track HTTP request duration
 */
export function trackRequestDuration(
  method: string,
  route: string,
  status: number,
  durationSeconds: number
) {
  httpRequestDuration.observe(
    {
      method,
      route,
      status: status.toString(),
    },
    durationSeconds
  );
}

/**
 * Track article view
 */
export function trackArticleView(slug: string) {
  articleViews.inc({ article_slug: slug });
  trackPageView(`/articles/${slug}`);
}

/**
 * Track project view
 */
export function trackProjectView(projectName: string) {
  projectViews.inc({ project_name: projectName });
}

/**
 * Track error
 */
export function trackError(
  errorType: string,
  location: string,
  isClient: boolean = false
) {
  if (isClient) {
    clientErrors.inc({
      error_type: errorType,
      page: location,
    });
  } else {
    serverErrors.inc({
      error_type: errorType,
      route: location,
    });
  }
}

/**
 * Track cache operation
 */
export function trackCache(cacheType: string, hit: boolean) {
  if (hit) {
    cacheHits.inc({ cache_type: cacheType });
  } else {
    cacheMisses.inc({ cache_type: cacheType });
  }
}

/**
 * Track external API call
 */
export function trackExternalApi(
  service: string,
  status: number,
  durationSeconds: number
) {
  externalApiCalls.inc({
    service,
    status: status.toString(),
  });

  externalApiDuration.observe({ service }, durationSeconds);
}
