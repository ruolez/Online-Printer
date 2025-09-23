#!/bin/bash

# Helper script to obtain SSL certificate manually if installation script fails

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_message $RED "This script must be run as root (use sudo)"
   exit 1
fi

# Get parameters
if [[ -z "$1" ]] || [[ -z "$2" ]]; then
    echo "Usage: $0 <domain> <email>"
    echo "Example: $0 printr.online admin@printr.online"
    exit 1
fi

DOMAIN_NAME="$1"
EMAIL_ADDRESS="$2"
INSTALL_DIR="/opt/printer.online"

cd "$INSTALL_DIR"

print_message $BLUE "Setting up SSL for $DOMAIN_NAME..."

# Use initial config first
print_message $YELLOW "Setting up nginx for certificate validation..."
cp nginx/nginx.initial.conf nginx/nginx.current.conf

# Restart nginx
docker compose -f docker-compose.prod.yml restart nginx
sleep 5

# Test HTTP
print_message $YELLOW "Testing HTTP accessibility..."
if curl -f -s -o /dev/null "http://$DOMAIN_NAME/" ; then
    print_message $GREEN "HTTP is accessible!"
else
    print_message $RED "HTTP is not accessible. Check your firewall and DNS settings."
    exit 1
fi

# Obtain certificate
print_message $YELLOW "Obtaining SSL certificate..."
docker compose -f docker-compose.prod.yml run --rm --entrypoint="" certbot certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL_ADDRESS" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN_NAME"

if [[ $? -eq 0 ]]; then
    print_message $GREEN "Certificate obtained successfully!"

    # Update production config
    sed -i "s/DOMAIN_NAME/$DOMAIN_NAME/g" nginx/nginx.prod.conf
    cp nginx/nginx.prod.conf nginx/nginx.current.conf

    # Restart nginx
    docker compose -f docker-compose.prod.yml restart nginx

    print_message $GREEN "SSL setup complete! Your site should now be accessible at https://$DOMAIN_NAME"
else
    print_message $RED "Failed to obtain certificate. Check the error messages above."
    exit 1
fi