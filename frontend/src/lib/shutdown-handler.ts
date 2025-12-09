/** @format */

import { appUp } from './metrics';

/**
 * Graceful shutdown handler
 * Sets metrics to indicate app is shutting down
 */
export function setupShutdownHandlers() {
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, starting graceful shutdown...`);

    // Set app status to down
    appUp.set(0);

    // Give Prometheus time to scrape the final metrics
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log('Graceful shutdown complete');
    process.exit(0);
  };

  // Handle different shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    appUp.set(0);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    appUp.set(0);
    process.exit(1);
  });
}
