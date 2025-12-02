/** @format */

import { metrics, trackPageView, trackApiCall, trackError, trackEvent } from "@/lib/metrics";

// Mock fetch
global.fetch = jest.fn();

describe("Metrics Client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
  });

  describe("MetricsCollector Singleton", () => {
    it("should return the same instance", () => {
      const instance1 = metrics;
      const instance2 = metrics;

      expect(instance1).toBe(instance2);
    });
  });

  describe("trackPageView", () => {
    it("should send page view metric", async () => {
      // Act
      trackPageView("/home");

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/metrics",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: expect.stringContaining("page_view"),
          keepalive: true,
        })
      );
    });

    it("should include page in request body", async () => {
      // Act
      trackPageView("/dashboard");

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.metric).toBe("page_view");
      expect(body.page).toBe("/dashboard");
      expect(body.timestamp).toBeDefined();
    });
  });

  describe("trackApiCall", () => {
    it("should send API call metric", async () => {
      // Act
      trackApiCall("/api/users", "GET");

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/metrics",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("should include endpoint and method in request body", async () => {
      // Act
      trackApiCall("/api/posts", "POST");

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.metric).toBe("api_call");
      expect(body.endpoint).toBe("/api/posts");
      expect(body.method).toBe("POST");
    });

    it("should default to GET method", async () => {
      // Act
      trackApiCall("/api/users");

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.method).toBe("GET");
    });
  });

  describe("trackError", () => {
    it("should send error metric with Error object", async () => {
      // Arrange
      const error = new Error("Test error");

      // Act
      trackError(error, "test-context");

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.metric).toBe("error");
      expect(body.error).toBe("Test error");
      expect(body.context).toBe("test-context");
    });

    it("should send error metric with string", async () => {
      // Act
      trackError("String error message");

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.metric).toBe("error");
      expect(body.error).toBe("String error message");
    });

    it("should work without context", async () => {
      // Act
      trackError("Error without context");

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe("trackEvent", () => {
    it("should send custom event", async () => {
      // Act
      trackEvent("button_click", { button: "signup" });

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.metric).toBe("button_click");
      expect(body.button).toBe("signup");
    });

    it("should work without additional data", async () => {
      // Act
      trackEvent("custom_event");

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.metric).toBe("custom_event");
    });
  });

  describe("Error Handling", () => {
    it("should not throw error when fetch fails", async () => {
      // Arrange
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      // Act & Assert - Should not throw
      expect(() => {
        trackPageView("/test");
      }).not.toThrow();
    });

    it("should continue execution after failed metric send", async () => {
      // Arrange
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      // Act
      trackPageView("/test1");
      trackPageView("/test2");

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert - Both calls should have been attempted
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("Enable/Disable", () => {
    it("should not send metrics when disabled", async () => {
      // Arrange
      metrics.setEnabled(false);

      // Act
      trackPageView("/test");

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      expect(global.fetch).not.toHaveBeenCalled();

      // Cleanup
      metrics.setEnabled(true);
    });

    it("should send metrics when re-enabled", async () => {
      // Arrange
      metrics.setEnabled(false);
      metrics.setEnabled(true);

      // Act
      trackPageView("/test");

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe("Request Format", () => {
    it("should use keepalive flag", async () => {
      // Act
      trackPageView("/test");

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      expect(callArgs[1].keepalive).toBe(true);
    });

    it("should include timestamp", async () => {
      // Arrange
      const beforeTimestamp = Date.now();

      // Act
      trackPageView("/test");

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      const afterTimestamp = Date.now();

      expect(body.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(body.timestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    it("should use correct content type", async () => {
      // Act
      trackPageView("/test");

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      expect(callArgs[1].headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("Multiple Metrics", () => {
    it("should handle multiple metrics in sequence", async () => {
      // Act
      trackPageView("/page1");
      trackPageView("/page2");
      trackApiCall("/api/test");
      trackError("Test error");

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it("should send correct data for each metric", async () => {
      // Act
      trackPageView("/home");
      trackApiCall("/api/users");

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      const calls = (global.fetch as jest.Mock).mock.calls;

      const firstBody = JSON.parse(calls[0][1].body);
      expect(firstBody.metric).toBe("page_view");
      expect(firstBody.page).toBe("/home");

      const secondBody = JSON.parse(calls[1][1].body);
      expect(secondBody.metric).toBe("api_call");
      expect(secondBody.endpoint).toBe("/api/users");
    });
  });
});
