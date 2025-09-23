# Web Application with Docker

A full-stack web application with user authentication using Docker containers.

## Architecture

- **Frontend**: HTML, CSS, JavaScript (served by Nginx without caching)
- **Backend**: Python Flask with JWT authentication
- **Database**: PostgreSQL
- **Web Server**: Nginx (reverse proxy and static file serving)

## Features

- User registration and login
- JWT-based authentication
- Password hashing with bcrypt
- PostgreSQL database
- No frontend caching (changes appear immediately)
- Docker containerization for easy management

## Prerequisites

- Docker and Docker Compose installed
- Port 80, 5000, and 5432 available

## Getting Started

1. Start all services:
```bash
docker-compose up -d
```

2. View logs:
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f postgres
docker-compose logs -f nginx
```

3. Stop all services:
```bash
docker-compose down
```

4. Restart a specific service:
```bash
docker-compose restart backend
```

## Access Points

- **Web Application**: http://localhost
- **Backend API**: http://localhost:5000
- **PostgreSQL**: localhost:5432
  - Database: webapp
  - Username: webapp_user
  - Password: webapp_password

## API Endpoints

- `POST /api/register` - Register new user
- `POST /api/login` - Login user
- `GET /api/profile` - Get user profile (requires auth)
- `GET /api/verify` - Verify JWT token (requires auth)
- `GET /health` - Health check

## Development

### Frontend Changes
Frontend files are mounted as volumes, so changes to HTML, CSS, or JavaScript files will be reflected immediately without rebuilding. Nginx is configured to disable all caching.

### Backend Changes
Backend code is also mounted as a volume. Flask runs in development mode with auto-reload enabled. Simply save your Python files and the server will restart automatically.

### Database Changes
To reset the database:
```bash
docker-compose down -v
docker-compose up -d
```

## Security Notes

- Change the `SECRET_KEY` in production
- Use strong passwords for database in production
- Enable HTTPS in production
- Consider rate limiting for authentication endpoints

## Troubleshooting

### Container won't start
Check logs: `docker-compose logs [service_name]`

### Database connection issues
Ensure PostgreSQL is healthy: `docker-compose ps`

### Frontend changes not appearing
1. Hard refresh browser (Ctrl+Shift+R)
2. Clear browser cache
3. Check Nginx logs: `docker-compose logs nginx`

### Port already in use
Change ports in docker-compose.yml if needed