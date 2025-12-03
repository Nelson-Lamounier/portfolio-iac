/** @format */

/**
 * Metrics Configuration
 * Centralized configuration for all metrics collection
 */

export const metricsConfig = {
  // Enable/disable metrics collection
  enabled: process.env.METRICS_ENABLED !== 'false',

  // Metrics endpoint path
  endpoint: '/api/metrics',

  // Default labels applied to all metrics
  defaultLabels: {
    app: 'portfolio',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || 'unknown',
  },

  // Histogram buckets for different metric types
  buckets: {
    // HTTP request duration (in seconds)
    httpDuration: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    
    // External API duration (in seconds)
    externalApiDuration: [0.1, 0.5, 1, 2, 5, 10, 30],
    
    // Database query duration (in seconds)
    dbQueryDuration: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    
    // Request/response size (in bytes)
    size: [100, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
    
    // Garbage collection duration buckets (in seconds)
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  },

  // Scrape interval (should match Prometheus config)
  scrapeInterval: 30000, // 30 seconds

  // Metric name prefix
  prefix: 'nextjs_',

  // Feature flags
  features: {
    // Collect default Node.js metrics (memory, CPU, etc.)
    collectDefaultMetrics: true,
    
    // Track individual page views
    trackPageViews: true,
    
    // Track API calls
    trackApiCalls: true,
    
    // Track errors
    trackErrors: true,
    
    // Track cache operations
    trackCache: true,
    
    // Track external API calls
    trackExternalApis: true,
  },

  // Sampling rates (0-1, where 1 = 100%)
  sampling: {
    // Sample rate for request tracking
    requests: 1.0,
    
    // Sample rate for error tracking
    errors: 1.0,
    
    // Sample rate for page view tracking
    pageViews: 1.0,
  },

  // Rate limiting
  rateLimit: {
    // Maximum metrics updates per second
    maxUpdatesPerSecond: 1000,
    
    // Enable rate limiting
    enabled: false,
  },
};

/**
 * Check if metrics collection is enabled
 */
export function isMetricsEnabled(): boolean {
  return metricsConfig.enabled;
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof metricsConfig.features): boolean {
  return metricsConfig.enabled && metricsConfig.features[feature];
}

/**
 * Check if a metric should be sampled
 */
export function shouldSample(type: keyof typeof metricsConfig.sampling): boolean {
  if (!metricsConfig.enabled) return false;
  return Math.random() < metricsConfig.sampling[type];
}
