#!/bin/bash
# Stop Prometheus and Grafana monitoring stack

set -e

echo "🛑 Stopping Prometheus & Grafana monitoring stack..."
echo ""

# Navigate to monitoring directory
cd "$(dirname "$0")"

# Stop services
docker-compose down

echo ""
echo "✅ Monitoring stack stopped!"
echo ""
echo "💡 To remove all data (volumes), run:"
echo "   docker-compose down -v"
