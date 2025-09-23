#!/bin/bash

#############################################################
# Printer.Online Production Installation Script
# For Ubuntu Server 24.04 LTS
# Features:
# - Docker and Docker Compose installation
# - Let's Encrypt SSL certificate with auto-renewal
# - Nginx reverse proxy with SSL
# - PostgreSQL database
# - Redis cache
# - Automatic backups
# - Health monitoring
#############################################################

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration variables
INSTALL_DIR="/opt/printer.online"
BACKUP_DIR="/var/backups/printer.online"
LOG_DIR="/var/log/printer.online"
SYSTEMD_DIR="/etc/systemd/system"

# Function to print colored output
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_message $RED "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Function to detect Ubuntu version
check_ubuntu_version() {
    if ! grep -q "Ubuntu 24" /etc/os-release && ! grep -q "Ubuntu 22" /etc/os-release; then
        print_message $YELLOW "Warning: This script is designed for Ubuntu 22.04/24.04 LTS"
        read -p "Do you want to continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Function to check for existing installation
check_existing_installation() {
    if [[ -d "$INSTALL_DIR" ]]; then
        print_message $YELLOW "\nExisting installation detected at $INSTALL_DIR"
        echo "Please choose an option:"
        echo "1) Backup and reinstall (recommended)"
        echo "2) Update existing installation"
        echo "3) Remove and fresh install"
        echo "4) Cancel installation"
        read -p "Enter your choice (1-4): " choice

        case $choice in
            1)
                backup_existing_installation
                remove_existing_installation
                ;;
            2)
                update_existing_installation
                exit 0
                ;;
            3)
                remove_existing_installation
                ;;
            4)
                print_message $YELLOW "Installation cancelled"
                exit 0
                ;;
            *)
                print_message $RED "Invalid choice"
                exit 1
                ;;
        esac
    fi
}

# Function to backup existing installation
backup_existing_installation() {
    local backup_name="backup_$(date +%Y%m%d_%H%M%S)"
    print_message $BLUE "Creating backup at $BACKUP_DIR/$backup_name..."

    mkdir -p "$BACKUP_DIR"

    # Backup database
    if docker ps | grep -q printer_postgres; then
        docker exec printer_postgres pg_dump -U webapp_user webapp > "$BACKUP_DIR/$backup_name.sql"
    fi

    # Backup environment files
    if [[ -f "$INSTALL_DIR/.env" ]]; then
        cp "$INSTALL_DIR/.env" "$BACKUP_DIR/$backup_name.env"
    fi

    # Backup uploads
    if [[ -d "$INSTALL_DIR/backend/uploads" ]]; then
        tar -czf "$BACKUP_DIR/$backup_name_uploads.tar.gz" -C "$INSTALL_DIR/backend" uploads/
    fi

    print_message $GREEN "Backup completed: $BACKUP_DIR/$backup_name"
}

# Function to remove existing installation
remove_existing_installation() {
    print_message $YELLOW "Removing existing installation..."

    # Stop and remove Docker containers
    if [[ -f "$INSTALL_DIR/docker-compose.prod.yml" ]]; then
        cd "$INSTALL_DIR"
        docker compose -f docker-compose.prod.yml down -v || true
    fi

    # Remove installation directory
    rm -rf "$INSTALL_DIR"

    # Remove systemd services
    systemctl disable printer-backup.timer 2>/dev/null || true
    rm -f "$SYSTEMD_DIR/printer-backup.service" "$SYSTEMD_DIR/printer-backup.timer"

    print_message $GREEN "Existing installation removed"
}

# Function to update existing installation
update_existing_installation() {
    print_message $BLUE "Updating existing installation..."

    cd "$INSTALL_DIR"

    # Pull latest changes
    if [[ -d .git ]]; then
        git pull origin main || true
    fi

    # Rebuild and restart containers
    docker compose -f docker-compose.prod.yml build
    docker compose -f docker-compose.prod.yml up -d

    print_message $GREEN "Update completed"
}

# Function to install system dependencies
install_dependencies() {
    print_message $BLUE "\nInstalling system dependencies..."

    # Update system
    apt-get update
    apt-get upgrade -y

    # Install required packages
    apt-get install -y \
        curl \
        wget \
        git \
        vim \
        htop \
        net-tools \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        ufw \
        fail2ban \
        unzip \
        jq

    print_message $GREEN "System dependencies installed"
}

# Function to install Docker
install_docker() {
    if command -v docker &> /dev/null; then
        print_message $YELLOW "Docker is already installed"
        return
    fi

    print_message $BLUE "\nInstalling Docker..."

    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

    # Set up repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker Engine
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Start and enable Docker
    systemctl start docker
    systemctl enable docker

    print_message $GREEN "Docker installed successfully"
}

# Function to configure firewall
configure_firewall() {
    print_message $BLUE "\nConfiguring firewall..."

    # Enable UFW
    ufw --force enable

    # Allow SSH (change port if needed)
    ufw allow 22/tcp

    # Allow HTTP and HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp

    # Reload firewall
    ufw reload

    print_message $GREEN "Firewall configured"
}

# Function to configure fail2ban
configure_fail2ban() {
    print_message $BLUE "\nConfiguring fail2ban..."

    # Create jail.local configuration
    cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
port = http,https
logpath = /var/log/nginx/error.log

[nginx-botsearch]
enabled = true
port = http,https
filter = nginx-botsearch
logpath = /var/log/nginx/access.log
maxretry = 2
EOF

    systemctl restart fail2ban
    systemctl enable fail2ban

    print_message $GREEN "Fail2ban configured"
}

# Function to get domain name and email
get_domain_info() {
    print_message $BLUE "\nDomain Configuration"

    # Get domain name
    while true; do
        read -p "Enter your domain name (e.g., printer.example.com): " DOMAIN_NAME
        if [[ -z "$DOMAIN_NAME" ]]; then
            print_message $RED "Domain name cannot be empty"
        else
            break
        fi
    done

    # Get email for Let's Encrypt
    while true; do
        read -p "Enter your email address for Let's Encrypt notifications: " EMAIL_ADDRESS
        if [[ -z "$EMAIL_ADDRESS" ]]; then
            print_message $RED "Email address cannot be empty"
        elif [[ ! "$EMAIL_ADDRESS" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
            print_message $RED "Invalid email address format"
        else
            break
        fi
    done

    # Verify DNS
    print_message $YELLOW "\nPlease ensure your domain DNS is pointing to this server's IP address."
    print_message $YELLOW "Server IP addresses:"
    ip addr show | grep "inet " | grep -v "127.0.0.1" | awk '{print "  - " $2}'

    read -p "Has the DNS been configured? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_message $RED "Please configure DNS before continuing"
        exit 1
    fi
}

# Function to generate secure passwords
generate_passwords() {
    print_message $BLUE "\nGenerating secure passwords..."

    DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-50)
    DB_NAME="printer_db"
    DB_USER="printer_user"

    print_message $GREEN "Secure passwords generated"
}

# Function to clone repository
clone_repository() {
    print_message $BLUE "\nSetting up application files..."

    # Ensure parent directory exists and we're in a valid directory
    mkdir -p "$(dirname "$INSTALL_DIR")"
    cd /tmp

    # Clone from current directory to production location
    if [[ -d "/Users/ruolez/Desktop/Dev/printer.online" ]]; then
        # We're running from the development directory
        cp -r /Users/ruolez/Desktop/Dev/printer.online "$INSTALL_DIR"
    else
        # Prompt for repository URL or upload
        print_message $YELLOW "Please choose how to get the application files:"
        echo "1) Clone from Git repository"
        echo "2) Upload files manually"
        read -p "Enter your choice (1-2): " choice

        case $choice in
            1)
                read -p "Enter Git repository URL: " REPO_URL
                # Remove existing directory if it exists (empty from previous attempt)
                rm -rf "$INSTALL_DIR"
                git clone "$REPO_URL" "$INSTALL_DIR"
                ;;
            2)
                mkdir -p "$INSTALL_DIR"
                print_message $YELLOW "Please upload your application files to $INSTALL_DIR"
                read -p "Press Enter when files are uploaded..."
                ;;
            *)
                print_message $RED "Invalid choice"
                exit 1
                ;;
        esac
    fi

    # Set permissions
    chown -R root:docker "$INSTALL_DIR" 2>/dev/null || chown -R root:root "$INSTALL_DIR"
    chmod -R 755 "$INSTALL_DIR"

    print_message $GREEN "Application files ready"
}

# Function to create environment file
create_env_file() {
    print_message $BLUE "\nCreating environment configuration..."

    cat > "$INSTALL_DIR/.env" << EOF
# Database Configuration
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# Security
JWT_SECRET_KEY=$JWT_SECRET

# Domain
DOMAIN_NAME=$DOMAIN_NAME

# Email (for Let's Encrypt)
EMAIL=$EMAIL_ADDRESS

# Application Settings
MAX_UPLOAD_SIZE=104857600
UPLOAD_FOLDER=/app/uploads
ALLOWED_EXTENSIONS=pdf

# Redis Configuration
REDIS_MAX_CONNECTIONS=50
REDIS_DECODE_RESPONSES=true

# Production Mode
FLASK_ENV=production
NODE_ENV=production
EOF

    chmod 600 "$INSTALL_DIR/.env"

    print_message $GREEN "Environment configuration created"
}

# Function to create production Dockerfiles
create_production_dockerfiles() {
    print_message $BLUE "\nCreating production Dockerfiles..."

    # Backend Dockerfile
    cat > "$INSTALL_DIR/backend/Dockerfile.prod" << 'EOF'
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p /app/uploads

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "--threads", "2", "--timeout", "60", "app:app"]
EOF

    # Frontend Dockerfile
    cat > "$INSTALL_DIR/frontend/Dockerfile.prod" << 'EOF'
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build arguments
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built files
COPY --from=builder /app/dist ./dist

# Create volume mount point
VOLUME ["/app/dist"]

# Simple script to keep container running
CMD ["sh", "-c", "while true; do sleep 3600; done"]
EOF

    print_message $GREEN "Production Dockerfiles created"
}

# Function to obtain SSL certificate
obtain_ssl_certificate() {
    print_message $BLUE "\nObtaining SSL certificate from Let's Encrypt..."

    cd "$INSTALL_DIR"

    # Update nginx config with actual domain
    sed -i "s/DOMAIN_NAME/$DOMAIN_NAME/g" nginx/nginx.prod.conf

    # Start nginx temporarily for certificate generation
    docker compose -f docker-compose.prod.yml up -d nginx

    # Wait for nginx to start
    sleep 5

    # Obtain certificate
    docker compose -f docker-compose.prod.yml run --rm certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email "$EMAIL_ADDRESS" \
        --agree-tos \
        --no-eff-email \
        --force-renewal \
        -d "$DOMAIN_NAME"

    if [[ $? -eq 0 ]]; then
        print_message $GREEN "SSL certificate obtained successfully"
    else
        print_message $RED "Failed to obtain SSL certificate"
        print_message $YELLOW "You can retry later with: cd $INSTALL_DIR && ./scripts/renew-ssl.sh"
    fi
}

# Function to create maintenance scripts
create_maintenance_scripts() {
    print_message $BLUE "\nCreating maintenance scripts..."

    mkdir -p "$INSTALL_DIR/scripts"

    # SSL renewal script
    cat > "$INSTALL_DIR/scripts/renew-ssl.sh" << 'EOF'
#!/bin/bash
cd /opt/printer.online
docker compose -f docker-compose.prod.yml run --rm certbot renew
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
EOF

    # Backup script
    cat > "$INSTALL_DIR/scripts/backup.sh" << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/printer.online"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="backup_$TIMESTAMP"

mkdir -p "$BACKUP_DIR"

# Backup database
docker exec printer_postgres pg_dump -U $DB_USER $DB_NAME > "$BACKUP_DIR/$BACKUP_NAME.sql"

# Backup uploads
docker run --rm -v printer_uploads:/data -v "$BACKUP_DIR":/backup alpine \
    tar -czf "/backup/$BACKUP_NAME_uploads.tar.gz" -C /data .

# Backup environment file
cp /opt/printer.online/.env "$BACKUP_DIR/$BACKUP_NAME.env"

# Keep only last 30 days of backups
find "$BACKUP_DIR" -name "backup_*.sql" -mtime +30 -delete
find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +30 -delete
find "$BACKUP_DIR" -name "backup_*.env" -mtime +30 -delete

echo "Backup completed: $BACKUP_NAME"
EOF

    # Health check script
    cat > "$INSTALL_DIR/scripts/health-check.sh" << 'EOF'
#!/bin/bash
DOMAIN=$(grep DOMAIN_NAME /opt/printer.online/.env | cut -d'=' -f2)

# Check if all containers are running
if ! docker compose -f /opt/printer.online/docker-compose.prod.yml ps | grep -q "Up"; then
    echo "Some containers are down!"
    docker compose -f /opt/printer.online/docker-compose.prod.yml ps
    exit 1
fi

# Check API health
if ! curl -sf "https://$DOMAIN/health" > /dev/null; then
    echo "API health check failed!"
    exit 1
fi

echo "All systems operational"
EOF

    # Update script
    cat > "$INSTALL_DIR/scripts/update.sh" << 'EOF'
#!/bin/bash
cd /opt/printer.online

# Backup before update
./scripts/backup.sh

# Pull latest changes (if using git)
if [[ -d .git ]]; then
    git pull origin main
fi

# Rebuild and restart containers
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

echo "Update completed"
EOF

    # Make scripts executable
    chmod +x "$INSTALL_DIR/scripts"/*.sh

    print_message $GREEN "Maintenance scripts created"
}

# Function to setup systemd services
setup_systemd_services() {
    print_message $BLUE "\nSetting up systemd services..."

    # Backup service
    cat > "$SYSTEMD_DIR/printer-backup.service" << EOF
[Unit]
Description=Printer.Online Backup Service
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
ExecStart=$INSTALL_DIR/scripts/backup.sh
User=root
StandardOutput=journal
StandardError=journal
EOF

    # Backup timer (daily at 2 AM)
    cat > "$SYSTEMD_DIR/printer-backup.timer" << EOF
[Unit]
Description=Daily Printer.Online Backup
Requires=printer-backup.service

[Timer]
OnCalendar=daily
OnCalendar=02:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

    # SSL renewal is handled by certbot container

    # Health check service
    cat > "$SYSTEMD_DIR/printer-health.service" << EOF
[Unit]
Description=Printer.Online Health Check
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
ExecStart=$INSTALL_DIR/scripts/health-check.sh
User=root
StandardOutput=journal
StandardError=journal
EOF

    # Health check timer (every 5 minutes)
    cat > "$SYSTEMD_DIR/printer-health.timer" << EOF
[Unit]
Description=Printer.Online Health Check Timer
Requires=printer-health.service

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
EOF

    # Reload systemd and enable services
    systemctl daemon-reload
    systemctl enable printer-backup.timer
    systemctl enable printer-health.timer
    systemctl start printer-backup.timer
    systemctl start printer-health.timer

    print_message $GREEN "Systemd services configured"
}

# Function to start application
start_application() {
    print_message $BLUE "\nStarting application..."

    cd "$INSTALL_DIR"

    # Build and start all services
    docker compose -f docker-compose.prod.yml build
    docker compose -f docker-compose.prod.yml up -d

    # Wait for services to start
    print_message $YELLOW "Waiting for services to start..."
    sleep 10

    # Check if services are running
    if docker compose -f docker-compose.prod.yml ps | grep -q "Up"; then
        print_message $GREEN "Application started successfully"
    else
        print_message $RED "Some services failed to start. Check logs with:"
        print_message $YELLOW "cd $INSTALL_DIR && docker compose -f docker-compose.prod.yml logs"
        exit 1
    fi
}

# Function to run database migrations
run_migrations() {
    print_message $BLUE "\nRunning database migrations..."

    cd "$INSTALL_DIR"

    # Wait for database to be ready
    sleep 5

    # Run migrations if they exist
    if [[ -f "backend/migrations/add_printer_stations.py" ]]; then
        docker compose -f docker-compose.prod.yml exec backend python /app/migrations/add_printer_stations.py || true
    fi

    print_message $GREEN "Database migrations completed"
}

# Function to display installation summary
display_summary() {
    print_message $GREEN "\n========================================="
    print_message $GREEN "Installation completed successfully!"
    print_message $GREEN "========================================="

    echo -e "\n${BLUE}Application Details:${NC}"
    echo "  URL: https://$DOMAIN_NAME"
    echo "  Installation Directory: $INSTALL_DIR"
    echo "  Backup Directory: $BACKUP_DIR"
    echo "  Log Directory: $LOG_DIR"

    echo -e "\n${BLUE}Database Credentials:${NC}"
    echo "  Database: $DB_NAME"
    echo "  Username: $DB_USER"
    echo "  Password: Saved in $INSTALL_DIR/.env"

    echo -e "\n${BLUE}Useful Commands:${NC}"
    echo "  View logs: cd $INSTALL_DIR && docker compose -f docker-compose.prod.yml logs -f"
    echo "  Restart services: cd $INSTALL_DIR && docker compose -f docker-compose.prod.yml restart"
    echo "  Backup now: $INSTALL_DIR/scripts/backup.sh"
    echo "  Update application: $INSTALL_DIR/scripts/update.sh"
    echo "  Check health: $INSTALL_DIR/scripts/health-check.sh"

    echo -e "\n${BLUE}Maintenance:${NC}"
    echo "  - Automatic daily backups at 2:00 AM"
    echo "  - SSL certificate auto-renewal enabled"
    echo "  - Health checks every 5 minutes"

    echo -e "\n${YELLOW}Important:${NC}"
    echo "  1. Save the database password from $INSTALL_DIR/.env"
    echo "  2. Configure your firewall rules if needed"
    echo "  3. Set up monitoring and alerting"
    echo "  4. Regular backups are stored in $BACKUP_DIR"

    echo -e "\n${GREEN}Your application is now running at: https://$DOMAIN_NAME${NC}\n"
}

# Main installation flow
main() {
    print_message $BLUE "========================================="
    print_message $BLUE "Printer.Online Production Installation"
    print_message $BLUE "========================================="

    check_root
    check_ubuntu_version
    check_existing_installation
    get_domain_info
    generate_passwords

    print_message $YELLOW "\nStarting installation..."

    install_dependencies
    install_docker
    configure_firewall
    configure_fail2ban

    # Create directories
    mkdir -p "$INSTALL_DIR" "$BACKUP_DIR" "$LOG_DIR"

    clone_repository
    create_env_file
    create_production_dockerfiles
    create_maintenance_scripts

    # Build and start basic services first
    start_application
    run_migrations

    # Obtain SSL certificate
    obtain_ssl_certificate

    # Restart with SSL
    cd "$INSTALL_DIR"
    docker compose -f docker-compose.prod.yml restart nginx

    setup_systemd_services

    display_summary
}

# Run main function
main "$@"