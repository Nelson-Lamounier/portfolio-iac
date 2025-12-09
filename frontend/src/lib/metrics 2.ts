/** @format */

/**
 * Metrics Collection Client
 * Sends application metrics to the /api/metrics endpoint
 */

class MetricsCollector {
  private static instance: MetricsCollector;
  private enabled: boolean = true;

  private constructor() {
    // Disable in development if needed
    this.enabled = process.env.NODE_ENV === "production";
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Send metric to backend
   */
  private async sendMetric(metric: string, data?: Record<string, any>) {
    if (!this.enabled) return;

    try {
      await fetch("/api/metrics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metric,
          timestamp: Date.now(),
          ...data,
        }),
        // Don't wait for response
        keepalive: true,
      });
    } catch (error) {
      // Silently fail - don't break the app for metrics
      console.debug("Failed to send metric:", error);
    }
  }

  /**
   * Track page view
   */
  trackPageView(page: string) {
    this.sendMetric("page_view", { page });
  }

  /**
   * Track API call
   */
  trackApiCall(endpoint: string, method: string = "GET") {
    this.sendMetric("api_call", { endpoint, method });
  }

  /**
   * Track error
   */
  trackError(error: Error | string, context?: string) {
    const errorMessage = error instanceof Error ? error.message : error;
    this.sendMetric("error", {
      error: errorMessage,
      context,
    });
  }

  /**
   * Track HTTP request with duration
   */
  trackHttpRequest(url: string, duration: number, status: number) {
    this.sendMetric("http_request", {
      url,
      duration: duration / 1000, // Convert to seconds
      status,
    });
  }

  /**
   * Track custom event
   */
  trackEvent(eventName: string, data?: Record<string, any>) {
    this.sendMetric(eventName, data);
  }

  /**
   * Enable/disable metrics collection
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }
}

// Export singleton instance
export const metrics = MetricsCollector.getInstance();

// Convenience functions
export const trackPageView = (page: string) => metrics.trackPageView(page);
export const trackApiCall = (endpoint: string, method?: string) =>
  metrics.trackApiCall(endpoint, method);
export const trackError = (error: Error | string, context?: string) =>
  metrics.trackError(error, context);
export const trackHttpRequest = (url: string, duration: number, status: number) =>
  metrics.trackHttpRequest(url, duration, status);
export const trackEvent = (eventName: string, data?: Record<string, any>) =>
  metrics.trackEvent(eventName, data);
