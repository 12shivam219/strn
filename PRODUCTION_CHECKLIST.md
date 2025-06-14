# CrossStream Production Checklist

## 1. Process Management

- Use PM2: `pm2 start ecosystem.config.js`
- Or use Docker Compose/Kubernetes for orchestration

## 2. Redis

- Use Redis in cluster or sentinel mode for high availability
- Monitor Redis health and latency

## 3. TURN/STUN

- Deploy coturn or similar TURN server
- Use your own credentials, update .env and mediasoup config
- Monitor TURN server logs and usage

## 4. Load Balancer

- Use NGINX, HAProxy, or cloud load balancer in front of mediasoup-server nodes
- Enable sticky sessions if needed (for signaling)

## 5. Monitoring

- Scrape `/metrics` endpoints with Prometheus
- Set up Grafana dashboards and alerts (see prometheus-alerts.yml)

## 6. Security

- Enforce HTTPS/WSS everywhere
- Use strong secrets and rotate regularly
- Validate all tokens and user input

## 7. Testing

- Test with 6+ users in multiple rooms
- Simulate network failures and node restarts

---

For more, see README and .env.example.
