#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Testing Admin Dashboard Setup${NC}"
echo -e "${GREEN}=========================================${NC}"

# Check if admin backend is running
echo -e "\n${YELLOW}Testing Admin Backend...${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/health | grep -q "200"; then
    echo -e "${GREEN}✓ Admin backend is running on port 8001${NC}"
else
    echo -e "${RED}✗ Admin backend is not accessible${NC}"
fi

# Check if admin frontend is running
echo -e "\n${YELLOW}Testing Admin Frontend...${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 | grep -q "200"; then
    echo -e "${GREEN}✓ Admin frontend is running on port 3001${NC}"
else
    echo -e "${RED}✗ Admin frontend is not accessible${NC}"
fi

# Test admin login
echo -e "\n${YELLOW}Testing Admin Login...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8001/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username": "admin", "password": "admin123"}')

if echo "$LOGIN_RESPONSE" | grep -q "access_token"; then
    echo -e "${GREEN}✓ Admin login successful${NC}"
    TOKEN=$(echo "$LOGIN_RESPONSE" | grep -oP '"access_token":"\K[^"]+')

    # Test authenticated endpoint
    echo -e "\n${YELLOW}Testing Authenticated API Access...${NC}"
    STATS_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $TOKEN" \
        http://localhost:8001/dashboard/stats)

    if [ "$STATS_RESPONSE" = "200" ]; then
        echo -e "${GREEN}✓ Authenticated API access working${NC}"
    else
        echo -e "${RED}✗ Authenticated API access failed (HTTP $STATS_RESPONSE)${NC}"
    fi
else
    echo -e "${RED}✗ Admin login failed${NC}"
    echo "Response: $LOGIN_RESPONSE"
fi

# Check database connectivity
echo -e "\n${YELLOW}Testing Database Connectivity...${NC}"
if docker exec webapp_postgres psql -U webapp_user -d webapp -c "SELECT count(*) FROM users WHERE username='admin';" 2>/dev/null | grep -q "1"; then
    echo -e "${GREEN}✓ Admin user exists in database${NC}"
else
    echo -e "${RED}✗ Admin user not found in database${NC}"
fi

# Check docker-compose.prod.yml
echo -e "\n${YELLOW}Checking Production Configuration...${NC}"
if grep -q "admin_backend" docker-compose.prod.yml; then
    echo -e "${GREEN}✓ Admin backend configured in docker-compose.prod.yml${NC}"
else
    echo -e "${RED}✗ Admin backend missing from docker-compose.prod.yml${NC}"
fi

if grep -q "admin_frontend" docker-compose.prod.yml; then
    echo -e "${GREEN}✓ Admin frontend configured in docker-compose.prod.yml${NC}"
else
    echo -e "${RED}✗ Admin frontend missing from docker-compose.prod.yml${NC}"
fi

# Check Dockerfiles
echo -e "\n${YELLOW}Checking Production Dockerfiles...${NC}"
if [ -f "admin/backend/Dockerfile.prod" ]; then
    echo -e "${GREEN}✓ Admin backend Dockerfile.prod exists${NC}"
else
    echo -e "${RED}✗ Admin backend Dockerfile.prod missing${NC}"
fi

if [ -f "admin/frontend/Dockerfile.prod" ]; then
    echo -e "${GREEN}✓ Admin frontend Dockerfile.prod exists${NC}"
else
    echo -e "${RED}✗ Admin frontend Dockerfile.prod missing${NC}"
fi

# Check nginx configuration
echo -e "\n${YELLOW}Checking Nginx Configuration...${NC}"
if [ -f "nginx/nginx-admin.prod.conf" ]; then
    echo -e "${GREEN}✓ Admin nginx configuration exists${NC}"
    if grep -q "location /admin" nginx/nginx-admin.prod.conf; then
        echo -e "${GREEN}✓ Admin routing configured in nginx${NC}"
    else
        echo -e "${RED}✗ Admin routing missing from nginx config${NC}"
    fi
else
    echo -e "${RED}✗ Admin nginx configuration missing${NC}"
fi

# Check install.sh updates
echo -e "\n${YELLOW}Checking Install Script...${NC}"
if grep -q "admin_backend" install.sh; then
    echo -e "${GREEN}✓ Admin backend included in install.sh${NC}"
else
    echo -e "${RED}✗ Admin backend missing from install.sh${NC}"
fi

if grep -q "Admin Dashboard:" install.sh; then
    echo -e "${GREEN}✓ Admin dashboard info in summary${NC}"
else
    echo -e "${RED}✗ Admin dashboard info missing from summary${NC}"
fi

echo -e "\n${GREEN}=========================================${NC}"
echo -e "${GREEN}Test Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo -e "\n${YELLOW}Admin Dashboard URLs:${NC}"
echo -e "  Local Development: http://localhost:3001"
echo -e "  Production: https://[DOMAIN]/admin"
echo -e "\n${YELLOW}Credentials:${NC}"
echo -e "  Username: admin"
echo -e "  Password: admin123"