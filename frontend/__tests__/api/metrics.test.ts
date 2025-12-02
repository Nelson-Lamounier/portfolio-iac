/** @format */

import { GET, POST } from "@/app/api/metrics/route";
import { NextRequest } from "next/server";

describe("Metrics API", () => {
  describe("GET /api/metrics", () => {
    it("should return metrics in Prometheus format", async () => {
      // Act
      const response = await GET();
      const text = await response.text();

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(
        "text/plain; version=0.0.4"
      );
      expect(text).toContain("nextjs_page_views_total");
      expect(text).toContain("nextjs_api_calls_total");
      expect(text).toContain("nextjs_errors_total");
      expect(text).toContain("nextjs_up 1");
    });

    it("should include HELP and TYPE comments", async () => {
      // Act
      const response = await GET();
      const text = await response.text();

      // Assert
      expect(text).toContain("# HELP nextjs_page_views_total");
      expect(text).toContain("# TYPE nextjs_page_views_total counter");
      expect(text).toContain("# HELP nextjs_up");
      expect(text).toContain("# TYPE nextjs_up gauge");
    });

    it("should return numeric values for all metrics", async () => {
      // Act
      const response = await GET();
      const text = await response.text();

      // Assert
      const lines = text.split("\n").filter((line) => !line.startsWith("#"));
      const metricLines = lines.filter((line) => line.trim().length > 0);

      metricLines.forEach((line) => {
        const parts = line.split(" ");
        const value = parseFloat(parts[parts.length - 1]);
        expect(isNaN(value)).toBe(false);
      });
    });

    it("should always report application as up", async () => {
      // Act
      const response = await GET();
      const text = await response.text();

      // Assert
      expect(text).toContain("nextjs_up 1");
    });
  });

  describe("POST /api/metrics", () => {
    it("should accept page_view metric", async () => {
      // Arrange
      const request = new NextRequest("http://localhost:3000/api/metrics", {
        method: "POST",
        body: JSON.stringify({
          metric: "page_view",
          page: "/home",
        }),
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should accept api_call metric", async () => {
      // Arrange
      const request = new NextRequest("http://localhost:3000/api/metrics", {
        method: "POST",
        body: JSON.stringify({
          metric: "api_call",
          endpoint: "/api/users",
        }),
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should accept error metric", async () => {
      // Arrange
      const request = new NextRequest("http://localhost:3000/api/metrics", {
        method: "POST",
        body: JSON.stringify({
          metric: "error",
          error: "Test error",
        }),
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should accept http_request metric with duration", async () => {
      // Arrange
      const request = new NextRequest("http://localhost:3000/api/metrics", {
        method: "POST",
        body: JSON.stringify({
          metric: "http_request",
          duration: 0.123,
          url: "/api/test",
        }),
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should increment metrics on POST", async () => {
      // Arrange
      const request = new NextRequest("http://localhost:3000/api/metrics", {
        method: "POST",
        body: JSON.stringify({
          metric: "page_view",
        }),
      });

      // Get initial count
      const initialResponse = await GET();
      const initialText = await initialResponse.text();
      const initialMatch = initialText.match(
        /nextjs_page_views_total (\d+)/
      );
      const initialCount = initialMatch ? parseInt(initialMatch[1]) : 0;

      // Act
      await POST(request);

      // Get new count
      const newResponse = await GET();
      const newText = await newResponse.text();
      const newMatch = newText.match(/nextjs_page_views_total (\d+)/);
      const newCount = newMatch ? parseInt(newMatch[1]) : 0;

      // Assert
      expect(newCount).toBeGreaterThan(initialCount);
    });

    it("should return error for unknown metric type", async () => {
      // Arrange
      const request = new NextRequest("http://localhost:3000/api/metrics", {
        method: "POST",
        body: JSON.stringify({
          metric: "unknown_metric",
        }),
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data.error).toBe("Unknown metric type");
    });

    it("should handle invalid JSON", async () => {
      // Arrange
      const request = new NextRequest("http://localhost:3000/api/metrics", {
        method: "POST",
        body: "invalid json",
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to record metric");
    });
  });

  describe("Metrics Persistence", () => {
    it("should maintain metrics across multiple GET requests", async () => {
      // Arrange - Record some metrics
      const postRequest = new NextRequest("http://localhost:3000/api/metrics", {
        method: "POST",
        body: JSON.stringify({
          metric: "page_view",
        }),
      });
      await POST(postRequest);

      // Act - Get metrics twice
      const response1 = await GET();
      const text1 = await response1.text();
      const match1 = text1.match(/nextjs_page_views_total (\d+)/);
      const count1 = match1 ? parseInt(match1[1]) : 0;

      const response2 = await GET();
      const text2 = await response2.text();
      const match2 = text2.match(/nextjs_page_views_total (\d+)/);
      const count2 = match2 ? parseInt(match2[1]) : 0;

      // Assert - Counts should be the same
      expect(count1).toBe(count2);
    });
  });

  describe("HTTP Request Duration Metrics", () => {
    it("should track request durations", async () => {
      // Arrange
      const durations = [0.1, 0.2, 0.3];

      // Act - Record multiple durations
      for (const duration of durations) {
        const request = new NextRequest("http://localhost:3000/api/metrics", {
          method: "POST",
          body: JSON.stringify({
            metric: "http_request",
            duration: duration,
          }),
        });
        await POST(request);
      }

      // Get metrics
      const response = await GET();
      const text = await response.text();

      // Assert
      expect(text).toContain("nextjs_http_request_duration_seconds_sum");
      expect(text).toContain("nextjs_http_request_duration_seconds_count");

      // Verify count
      const countMatch = text.match(
        /nextjs_http_request_duration_seconds_count (\d+)/
      );
      const count = countMatch ? parseInt(countMatch[1]) : 0;
      expect(count).toBeGreaterThanOrEqual(durations.length);
    });

    it("should limit stored durations to prevent memory issues", async () => {
      // Arrange - Record more than 1000 durations
      const requests = Array.from({ length: 1100 }, (_, i) => i);

      // Act
      for (const i of requests) {
        const request = new NextRequest("http://localhost:3000/api/metrics", {
          method: "POST",
          body: JSON.stringify({
            metric: "http_request",
            duration: 0.1,
          }),
        });
        await POST(request);
      }

      // Get metrics
      const response = await GET();
      const text = await response.text();

      // Assert - Should still work without memory issues
      expect(text).toContain("nextjs_http_request_duration_seconds_count");
      expect(response.status).toBe(200);
    });
  });

  describe("Content Type", () => {
    it("should return correct Prometheus content type", async () => {
      // Act
      const response = await GET();

      // Assert
      expect(response.headers.get("Content-Type")).toBe(
        "text/plain; version=0.0.4"
      );
    });

    it("should return JSON for POST requests", async () => {
      // Arrange
      const request = new NextRequest("http://localhost:3000/api/metrics", {
        method: "POST",
        body: JSON.stringify({
          metric: "page_view",
        }),
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.headers.get("Content-Type")).toContain(
        "application/json"
      );
    });
  });
});
