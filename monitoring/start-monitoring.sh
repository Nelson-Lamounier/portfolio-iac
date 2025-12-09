#!/bin/bash
# Start Prometheus and Grafana monitoring stack

set -e

echo "🚀 Starting Prometheus & Grafana monitoring stack..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "Please start Docker and try again"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Error: docker-compose is not installed"
    echo "Please install docker-compose and try again"
    exit 1
fi

# Navigate to monitoring directory
cd "$(dirname "$0")"

# Start services
echo "📦 Starting services..."
docker-compose up -d

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to start..."
sleep 5

# Check service status
echo ""
echo "📊 Service Status:"
docker-compose ps

# Display access information
echo ""
echo "✅ Monitoring stack is running!"
echo ""
echo "📍 Access URLs:"
echo "   Grafana:       http://localhost:3001 (admin/admin)"
echo "   Prometheus:    http://localhost:9090"
echo "   Node Exporter: http://localhost:9100/metrics"
echo "   cAdvisor:      http://localhost:8080"
echo ""
echo "📚 Quick Commands:"
echo "   View logs:     docker-compose logs -f"
echo "   Stop services: docker-compose down"
echo "   Restart:       docker-compose restart"
echo ""
echo "💡 Tip: Change Grafana password on first login!"
