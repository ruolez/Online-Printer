# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Docker Management
```bash
# Start all services
docker-compose up -d --build

# View logs
docker-compose logs -f [service_name]  # service_name: backend, frontend, postgres, nginx, redis

# Restart specific service after code changes
docker-compose restart [service_name]

# Complete restart with rebuild
docker-compose down && docker-compose up -d --build

# Reset database completely
docker-compose down -v && docker-compose up -d

# Check container health
docker-compose ps
```

### Frontend Development
```bash
# Install new npm packages (execute in container)
docker exec webapp_frontend npm install [package_name]

# Run frontend directly (for debugging) - use port 5173
cd frontend && npm run dev

# Build for production
cd frontend && npm run build

# Lint frontend code
cd frontend && npm run lint

# Preview production build
cd frontend && npm run preview

# Install packages locally (when container has issues)
cd frontend && npm install framer-motion  # Example for missing packages
```

### Backend Development
```bash
# Install new Python packages (execute in container)
docker exec webapp_backend pip install [package_name]
# Remember to update backend/requirements.txt

# Access Flask shell
docker exec -it webapp_backend python

# Run database migrations
docker exec webapp_backend python /app/migrations/add_printer_stations.py

# Create database tables
docker exec webapp_backend python -c "from app import db; db.create_all()"

# Test API endpoints directly
curl -X POST http://localhost:5000/api/login -H "Content-Type: application/json" -d '{"username":"test","password":"test123"}'
```

### Database Access
```bash
# Access PostgreSQL database
docker exec webapp_postgres psql -U webapp_user -d webapp

# Query users table
docker exec webapp_postgres psql -U webapp_user -d webapp -c "SELECT username FROM users;"

# Database credentials
# User: webapp_user
# Password: webapp_password
# Database: webapp
# Port: 5433 (external), 5432 (internal)
```

## Architecture Overview

### Tech Stack
- **Frontend**:
  - React 19 with Vite
  - Tailwind CSS v3 with custom dark theme
  - shadcn/ui components, Radix UI primitives
  - Framer Motion for animations
  - Vite PWA plugin for Progressive Web App
- **Backend**:
  - Flask with SQLAlchemy ORM
  - JWT authentication (24-hour expiry)
  - bcrypt password hashing
  - python-magic for file validation
- **Database**: PostgreSQL 15
- **Cache/Queue**: Redis 7 (prepared for Celery but worker not running)
- **Proxy**: Nginx (reverse proxy)

### Port Configuration
- **5173**: Vite dev server (✅ use this for development)
- **8080**: Nginx proxy (⚠️ HMR WebSocket issues)
- **5000**: Flask backend API
- **5433**: PostgreSQL (mapped from internal 5432)
- **6380**: Redis (mapped from internal 6379)

### Container Architecture
```
webapp_nginx (8080) ──┬──> webapp_frontend (5173) [Vite + React]
                      └──> webapp_backend (5000) [Flask API]
                             ├──> webapp_postgres (5433) [PostgreSQL]
                             └──> webapp_redis (6380) [Redis]
```

## Core Application Features

### Remote Printer Station System
- **Device Modes**:
  - **Sender**: Upload files to send to remote printer stations
  - **Printer Station**: Receive and print jobs from remote senders
  - **Hybrid**: Both send and receive print jobs
- **Station Management**: Registration, heartbeat monitoring, online/offline status
- **Print Job Routing**: Station-specific or local printing based on mode
- **Session Management**: Token-based sessions for printer stations

### Progressive Web App (PWA)
- **Auto-print capability**: Only works in PWA mode to prevent multiple browser instances
- **PWA Detection**: Uses `isPWA()` utility in `/frontend/src/utils/pwaDetection.js`
- **Service Worker**: Auto-generated with Workbox for offline support
- **Installation**: Install prompt component appears bottom-right (small badge when installed)

### Dark Theme System
- **Theme Provider**: Context-based theme management in `/frontend/src/components/theme-provider.jsx`
- **Animated Toggle**: Theme toggle button with Framer Motion animations (top-right corner)
- **Animated Background**: Particle animation system for dark mode in `/frontend/src/components/AnimatedBackground.jsx`
- **Color Scheme**: Purple accent colors with glass morphism effects in dark mode
- **CSS Variables**: Defined in `/frontend/src/index.css` with HSL color system

### Printing System
- **Native Browser Printing**: Uses iframe + window.print() (print-js removed due to PWA issues)
- **Auto-Print Manager**: Singleton service (`/frontend/src/services/AutoPrintManager.js`)
  - Polls every 10 seconds for new files and pending jobs
  - Only runs in PWA mode
  - Stores processed files in localStorage
  - Prevents duplicate printing with job scheduling
  - Supports station-specific routing in hybrid mode
- **Print Queue**: Database-backed queue with status tracking
- **Print Settings**: User-configurable orientation, copies, auto-print toggle

### Authentication Flow
1. User registers/logs in → Backend validates → Returns JWT token
2. Token stored in localStorage as `authToken`
3. Token sent as `Authorization: Bearer [token]` header
4. Backend validates token using `@token_required` decorator
5. Token expiry: 24 hours

### File Upload System
1. PDF-only uploads with configurable size limit (UserSettings table)
2. Files stored in `/app/uploads/<user_id>/` directory structure
3. File hash calculated for integrity verification
4. MIME type validation using python-magic
5. Status tracking: pending → processing → completed/failed
6. Foreign key relationships with print_queue table

## API Endpoints

### Authentication
- `POST /api/register` - Register new user
- `POST /api/login` - Login user
- `GET /api/profile` - Get user profile (requires auth)
- `GET /api/verify` - Verify JWT token

### File Management
- `POST /api/upload` - Upload PDF file
- `GET /api/files` - List user's files (supports pagination)
- `GET /api/files/<id>` - Get specific file details
- `DELETE /api/files/<id>` - Delete file (auto-deletes related print jobs)
- `GET /api/files/<id>/download` - Download file

### Settings
- `GET /api/settings` - Get user settings
- `PUT /api/settings` - Update user settings (including device mode)

### Print Queue
- `GET /api/print-queue` - List print jobs
- `POST /api/print-queue/add/<file_id>` - Add file to queue
- `PUT /api/print-queue/<job_id>/status` - Update job status
- `DELETE /api/print-queue/<job_id>` - Remove from queue
- `GET /api/print-queue/next` - Get next pending job (supports station_id parameter)

### Printer Stations
- `POST /api/stations/register` - Register new printer station
- `GET /api/stations` - List all stations for user
- `GET /api/stations/<id>` - Get station details
- `PUT /api/stations/<id>/heartbeat` - Send heartbeat (keeps station online)
- `POST /api/stations/unregister` - Unregister station
- `GET /api/print-queue/station/<station_id>` - Get jobs for specific station

## Database Schema

Five main tables with foreign key relationships:
- `users` - User accounts with auth credentials
- `uploaded_files` - PDF file metadata and status
- `user_settings` - Per-user configuration (device mode, file size limits, print settings)
- `print_queue` - Print job tracking with FK to users, uploaded_files, and printer_stations
- `printer_stations` - Remote printer stations with capabilities and status
- `station_sessions` - Session management for printer stations

Key relationships:
- uploaded_files.user_id → users.id
- user_settings.user_id → users.id (unique)
- print_queue.user_id → users.id
- print_queue.file_id → uploaded_files.id
- print_queue.station_id → printer_stations.id
- printer_stations.user_id → users.id
- station_sessions.station_id → printer_stations.id

## Known Issues & Solutions

### Frontend not accessible on port 8080
Use `http://localhost:5173` for development (Nginx proxy has HMR WebSocket issues).

### Login/Import errors (e.g., "AnimatedBackground not defined")
1. Check imports in App.jsx are correct
2. Ensure framer-motion is installed: `docker exec webapp_frontend npm install framer-motion`
3. Restart frontend: `docker-compose restart frontend`

### Theme toggle overlapping with logout button
Fixed with spacer div and responsive margins. Theme toggle is fixed-position with z-[60].

### Delete file fails with foreign key constraint
File deletion endpoint automatically deletes related print_queue entries first.

### Auto-print triggering duplicate prints
Fixed by adding isPrinting flag and scheduledJobs tracking to prevent concurrent print attempts.

### Files stuck in "pending" status
Celery worker not running. Files marked as 'completed' immediately on upload.

### Container startup failures
1. Check port conflicts: `docker ps -a`
2. Verify logs: `docker-compose logs [service_name]`
3. Ensure Node.js 20+ in frontend Dockerfile
4. Check Redis health: `docker exec webapp_redis redis-cli ping`

## Environment Variables

Backend (docker-compose.yml):
- `DATABASE_URL`: postgresql://webapp_user:webapp_password@postgres:5432/webapp
- `FLASK_ENV`: development
- `SECRET_KEY`: JWT secret (change in production)
- `REDIS_URL`: Redis connection
- `CELERY_BROKER_URL`: Redis URL for Celery broker
- `CELERY_RESULT_BACKEND`: Redis URL for Celery results

Frontend:
- `CHOKIDAR_USEPOLLING`: true (for Docker file watching)

## Important Implementation Notes

### PWA-Only Auto-Print
Auto-printing restricted to PWA instances to prevent multiple browser tabs from printing same files. AutoPrintManager checks `isPWA()` before initializing.

### Native Printing Implementation
Due to print-js library issues with Chrome PWA on Windows:
- Creates hidden iframe with PDF blob URL
- Calls `window.print()` on iframe content window
- Cleans up resources after printing

### Print Queue Foreign Keys
When deleting files, backend first deletes related print_queue entries due to FK constraints. Handled automatically in delete endpoint.

### Print Queue Routing in Hybrid Mode
- The `/api/print-queue/next` endpoint filters jobs based on device mode:
  - Hybrid mode with station_id: Returns jobs for that station OR local jobs (no station_id)
  - Hybrid mode without station_id: Only returns local jobs
  - Printer mode: Only returns jobs for the specific station

### localStorage Keys
- `authToken` - JWT authentication token
- `deviceMode` - Current device mode (sender/printer/hybrid)
- `defaultPrinterStation` - Default station ID for sending files
- `printerStation` - Registered station data (for printer mode)
- `stationSessionToken` - Session token for station heartbeats
- `isPWA`, `displayMode` - PWA detection status
- `autoPrintCheckedFiles` - Processed files for auto-print
- `app-ui-theme` - Theme preference (light/dark)
- `pwa-prompt-dismissed` - PWA install prompt dismissal timestamp

### AutoPrintManager Station Support
When in hybrid mode, the AutoPrintManager is initialized with the station ID from localStorage. This allows it to poll for both local jobs and station-specific jobs using the `/api/print-queue/next?station_id=X` endpoint.