# Production Deployment Guide

## Requirements

- Ubuntu Server 22.04 LTS or 24.04 LTS
- Minimum 2GB RAM, 2 CPU cores
- 20GB disk space
- Domain name pointed to server IP
- Root or sudo access

## Quick Installation

1. **Upload files to your server** (or clone from repository)
```bash
scp -r printer.online/ root@your-server:/tmp/
ssh root@your-server
mv /tmp/printer.online /opt/
```

2. **Run installation script**
```bash
cd /opt/printer.online
chmod +x install.sh
sudo ./install.sh
```

The script will:
- Prompt for your domain name and email
- Install Docker and all dependencies
- Configure SSL certificate with Let's Encrypt
- Set up automatic backups and SSL renewal
- Configure firewall and security

## Manual Installation

If you prefer manual installation, follow these steps:

### 1. Install Dependencies

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
apt install docker-compose-plugin -y

# Install other tools
apt install nginx certbot python3-certbot-nginx git -y
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit with your values
nano .env
```

Required values:
- `DOMAIN_NAME`: Your domain (e.g., printer.example.com)
- `DB_PASSWORD`: Strong database password
- `JWT_SECRET_KEY`: Random secret key for JWT tokens
- `EMAIL`: Email for SSL certificate notifications

### 3. Build and Start Services

```bash
# Use production compose file
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
```

### 4. Obtain SSL Certificate

```bash
# Get certificate from Let's Encrypt
certbot certonly --webroot -w /var/www/certbot \
    --email your-email@example.com \
    --agree-tos \
    --no-eff-email \
    -d your-domain.com
```

### 5. Configure Auto-Renewal

```bash
# Add to crontab
crontab -e
# Add line:
0 2 * * * certbot renew --quiet && docker-compose -f /opt/printer.online/docker-compose.prod.yml restart nginx
```

## Post-Installation

### Access Your Application

After installation, access your application at:
```
https://your-domain.com
```

### Default Credentials

No default users are created. Register your first user through the web interface.

### Monitoring

Check application health:
```bash
/opt/printer.online/scripts/health-check.sh
```

View logs:
```bash
cd /opt/printer.online
docker-compose -f docker-compose.prod.yml logs -f
```

### Backups

Backups run automatically daily at 2 AM. Manual backup:
```bash
/opt/printer.online/scripts/backup.sh
```

Restore from backup:
```bash
# Stop services
docker-compose -f docker-compose.prod.yml down

# Restore database
docker-compose -f docker-compose.prod.yml up -d postgres
docker exec -i printer_postgres psql -U printer_user printer_db < /var/backups/printer.online/backup_TIMESTAMP.sql

# Restore uploads
docker run --rm -v printer_uploads:/data -v /var/backups/printer.online:/backup alpine \
    tar -xzf /backup/backup_TIMESTAMP_uploads.tar.gz -C /data

# Start services
docker-compose -f docker-compose.prod.yml up -d
```

### Updates

Update application:
```bash
/opt/printer.online/scripts/update.sh
```

Or manually:
```bash
cd /opt/printer.online
git pull origin main  # if using git
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
```

## Security Considerations

### Firewall Rules

The installation script configures UFW with:
- Port 22 (SSH)
- Port 80 (HTTP)
- Port 443 (HTTPS)

Additional ports can be opened:
```bash
ufw allow 5433/tcp  # PostgreSQL (if external access needed)
```

### Fail2ban

Configured to protect against:
- SSH brute force
- Nginx authentication failures
- Rate limiting violations

Check banned IPs:
```bash
fail2ban-client status
fail2ban-client status nginx-limit-req
```

### SSL Security

The nginx configuration includes:
- TLS 1.2 and 1.3 only
- Strong cipher suites
- HSTS header
- Security headers (XSS, Content-Type, etc.)

Test SSL configuration:
```bash
# Using SSL Labs
https://www.ssllabs.com/ssltest/analyze.html?d=your-domain.com
```

## Troubleshooting

### Container Issues

```bash
# Check container status
docker-compose -f docker-compose.prod.yml ps

# Restart specific service
docker-compose -f docker-compose.prod.yml restart backend

# View service logs
docker-compose -f docker-compose.prod.yml logs -f backend
```

### Database Connection Issues

```bash
# Test database connection
docker exec printer_postgres psql -U printer_user -d printer_db -c "SELECT 1;"

# Reset database
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml up -d
```

### SSL Certificate Issues

```bash
# Renew certificate manually
docker-compose -f docker-compose.prod.yml run --rm certbot renew

# Check certificate expiry
docker-compose -f docker-compose.prod.yml run --rm certbot certificates
```

### Permission Issues

```bash
# Fix upload directory permissions
docker exec printer_backend chown -R appuser:appuser /app/uploads

# Fix Docker permissions
usermod -aG docker $USER
```

## Performance Tuning

### PostgreSQL

Edit postgresql.conf in container:
```bash
docker exec -it printer_postgres vi /var/lib/postgresql/data/postgresql.conf
```

Recommended settings for 2GB RAM:
```
shared_buffers = 512MB
effective_cache_size = 1GB
maintenance_work_mem = 128MB
work_mem = 4MB
```

### Nginx

Increase client body size for larger uploads:
```nginx
client_max_body_size 200M;  # in nginx.prod.conf
```

### Redis

Configure persistence:
```bash
docker exec printer_redis redis-cli CONFIG SET save "900 1 300 10 60 10000"
```

## Monitoring Setup

### Prometheus + Grafana (Optional)

```bash
# Add to docker-compose.prod.yml
prometheus:
  image: prom/prometheus
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
  ports:
    - "9090:9090"

grafana:
  image: grafana/grafana
  ports:
    - "3000:3000"
```

### Health Checks

Built-in health endpoint:
```bash
curl https://your-domain.com/health
```

### Log Aggregation

Consider using:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Loki + Grafana
- Datadog/New Relic (SaaS)

## Scaling

### Horizontal Scaling

For high availability:

1. **Database**: Set up PostgreSQL replication
2. **Redis**: Configure Redis Sentinel
3. **Application**: Run multiple backend instances
4. **Load Balancer**: Use HAProxy or cloud load balancer

### Vertical Scaling

Adjust Docker resources:
```yaml
# In docker-compose.prod.yml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

## Support

For issues:
1. Check logs: `docker-compose -f docker-compose.prod.yml logs`
2. Run health check: `/opt/printer.online/scripts/health-check.sh`
3. Review this documentation
4. Check application documentation in CLAUDE.md

## License

Refer to LICENSE file in the repository.