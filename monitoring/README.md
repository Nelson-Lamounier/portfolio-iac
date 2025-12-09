<!-- @format -->

# Prometheus & Grafana Local Monitoring Setup

## Overview

This directory contains a complete local monitoring stack using:

- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards
- **Node Exporter**: System metrics (CPU, memory, disk)
- **cAdvisor**: Container metrics

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Ports available: 3001 (Grafana), 9090 (Prometheus), 9100 (Node Exporter), 8080 (cAdvisor)

### Start the Monitoring Stack

```bash
# From the monitoring directory
cd monitoring

# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Access the Services

| Service       | URL                           | Credentials   |
| ------------- | ----------------------------- | ------------- |
| Grafana       | http://localhost:3001         | admin / admin |
| Prometheus    | http://localhost:9090         | None          |
| Node Exporter | http://localhost:9100/metrics | None          |
| cAdvisor      | http://localhost:8080         | None          |

## Using Grafana

### First Login

1. Open http://localhost:3001
2. Login with:
   - Username: `admin`
   - Password: `admin`
3. (Optional) Change password when prompted

### View Dashboards

1. Click "Dashboards" in the left menu
2. Select "System Overview"
3. You'll see:
   - CPU Usage
   - Memory Usage
   - (More panels can be added)

### Create Custom Dashboards

1. Click "+" → "Dashboard"
2. Click "Add visualization"
3. Select "Prometheus" as datasource
4. Enter a PromQL query (examples below)
5. Click "Apply"

## Using Prometheus

### Access Prometheus UI

1. Open http://localhost:9090
2. Click "Graph" tab
3. Enter a query in the expression box
4. Click "Execute"

### Useful PromQL Queries

#### System Metrics

```promql
# CPU usage percentage
100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory usage percentage
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

# Disk usage percentage
(1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100

# Network received bytes
rate(node_network_receive_bytes_total[5m])

# Network transmitted bytes
rate(node_network_transmit_bytes_total[5m])
```

#### Container Metrics

```promql
# Container CPU usage
rate(container_cpu_usage_seconds_total{name!=""}[5m])

# Container memory usage
container_memory_usage_bytes{name!=""}

# Container memory limit
container_spec_memory_limit_bytes{name!=""}

# Container network received
rate(container_network_receive_bytes_total{name!=""}[5m])
```

### View Alerts

1. Go to http://localhost:9090/alerts
2. See configured alert rules and their status
3. Alerts are defined in `prometheus/alerts.yml`

## Configuration

### Prometheus Configuration

Edit `prometheus/prometheus.yml` to:

- Add new scrape targets
- Change scrape intervals
- Configure alerting

### Grafana Configuration

- **Datasources**: `grafana/provisioning/datasources/`
- **Dashboards**: `grafana/dashboards/`

### Alert Rules

Edit `prometheus/alerts.yml` to:

- Add new alert rules
- Modify thresholds
- Change alert severity

## Common Tasks

### Add Your Application Metrics

1. Expose metrics endpoint in your app (e.g., `/metrics`)
2. Edit `prometheus/prometheus.yml`:

```yaml
scrape_configs:
  - job_name: "my-app"
    static_configs:
      - targets: ["host.docker.internal:3000"]
        labels:
          service: "my-app"
```

3. Restart Prometheus:

```bash
docker-compose restart prometheus
```

### Import Grafana Dashboard

1. Go to Grafana → Dashboards → Import
2. Enter dashboard ID from https://grafana.com/grafana/dashboards/
3. Popular dashboards:
   - Node Exporter Full: 1860
   - Docker and System Monitoring: 893
   - Prometheus Stats: 2

### Stop the Monitoring Stack

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (deletes data)
docker-compose down -v
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f prometheus
docker-compose logs -f grafana
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart prometheus
```

## Troubleshooting

### Port Already in Use

If port 3001 is in use, edit `docker-compose.yml`:

```yaml
grafana:
  ports:
    - "3002:3000" # Change to different port
```

### Prometheus Can't Scrape Targets

1. Check target status: http://localhost:9090/targets
2. Verify target is accessible from container
3. Check firewall rules

### Grafana Can't Connect to Prometheus

1. Verify Prometheus is running: `docker-compose ps`
2. Check datasource configuration in Grafana
3. Test connection: Configuration → Data Sources → Prometheus → Test

### No Data in Dashboards

1. Check Prometheus is scraping: http://localhost:9090/targets
2. Verify time range in Grafana (top right)
3. Check query syntax in panel edit mode

## Next Steps

### For Development

1. Add metrics to your Next.js application
2. Create custom dashboards for your app
3. Set up alerts for critical metrics

### For Production

1. Deploy Prometheus and Grafana to ECS
2. Use AWS CloudWatch for additional metrics
3. Set up AlertManager for notifications
4. Configure persistent storage
5. Set up authentication and SSL

## Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)

## File Structure

```
monitoring/
├── docker-compose.yml              # Main configuration
├── prometheus/
│   ├── prometheus.yml              # Prometheus config
│   └── alerts.yml                  # Alert rules
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/
│   │   │   └── prometheus.yml      # Datasource config
│   │   └── dashboards/
│   │       └── dashboard.yml       # Dashboard provisioning
│   └── dashboards/
│       └── system-overview.json    # Sample dashboard
└── README.md                       # This file
```

## Summary

You now have a complete local monitoring stack! Start it with `docker-compose up -d` and access Grafana at http://localhost:3001 (admin/admin).
