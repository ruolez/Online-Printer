# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Quick Start
```bash
# Start all services with Docker
docker-compose up -d --build

# Restart after code changes
docker-compose restart backend   # For backend changes
docker-compose restart frontend  # For frontend changes

# View logs
docker-compose logs -f [service_name]  # backend, frontend, postgres, nginx, redis
```

### Frontend Development
```bash
# Install packages in container
docker exec webapp_frontend npm install [package_name]

# Run locally for debugging
cd frontend && npm run dev    # Port 5173
cd frontend && npm run build  # Production build
cd frontend && npm run lint   # Lint check
```

### Backend Development
```bash
# Install Python packages in container
docker exec webapp_backend pip install [package_name]
# Update backend/requirements.txt after installing

# Run migrations
docker exec webapp_backend python /app/migrations/add_printer_stations.py
docker exec webapp_backend python /app/migrations/remove_device_mode.py

# Test API endpoints
curl -X POST http://localhost:5000/api/login -H "Content-Type: application/json" -d '{"username":"test","password":"test123"}'
```

### Database Management
```bash
# Access PostgreSQL
docker exec webapp_postgres psql -U webapp_user -d webapp

# Reset database completely
docker-compose down -v && docker-compose up -d

# Credentials: webapp_user / webapp_password / webapp / port 5433
```

## Architecture Overview

### Services & Ports
- **Frontend**: React 19 + Vite + Tailwind CSS (port 5173)
- **Backend**: Flask + SQLAlchemy + JWT (port 5000)
- **Database**: PostgreSQL 15 (port 5433 external, 5432 internal)
- **Proxy**: Nginx (port 8080)
- **Cache**: Redis 7 (port 6380)

### Key Application Systems

#### Print Queue System
- Jobs flow through statuses: `pending` → `printing` → `completed`/`failed`
- Backend endpoints:
  - `/api/print-queue` - Get user's print jobs
  - `/api/print-queue/station/<id>` - Get station jobs with status filtering
  - `/api/print-queue/station/<id>/history` - Get completed/failed jobs with stats
  - `/api/print-queue/next?station_id=X` - Poll for next job
- Jobs are never deleted, only status changes (maintains audit trail)

#### Printer Station System
- Stations register via `/api/stations/register` with unique tokens
- Heartbeat every 30 seconds to maintain online status
- Station data stored in localStorage: `printerStation` key
- Auto-print always enabled for stations (bypasses user settings)
- Frontend component: `PrinterStation.jsx` with tabbed UI for queue/history

#### Device Mode System (localStorage only)
- Three modes: Sender, Printer Station, Hybrid
- Stored in `deviceMode` localStorage key
- NO database storage (migration removed `device_mode` column)
- Each device/browser maintains independent mode

#### PWA & Auto-Print
- Auto-print ONLY works in PWA mode (prevents duplicates)
- Detection via `isPWA()` utility function
- `AutoPrintManager` singleton service:
  - Polls every 10 seconds for new jobs
  - Tracks processed files in localStorage
  - Shows notifications on print completion

#### Authentication
- JWT tokens with 24-hour expiry
- Stored in localStorage as `authToken`
- Flask uses werkzeug password hashing
- Token required for all `/api/*` endpoints except login/register

## Database Schema

### Core Tables
- `users` - User accounts
- `uploaded_files` - PDF file metadata
- `print_queue` - Print jobs (FK: users, uploaded_files, printer_stations)
- `printer_stations` - Registered stations
- `user_settings` - Per-user config (NO device_mode column)

### Important FK Constraints
When deleting users/files, must delete related `print_queue` entries first to avoid FK errors.

## Frontend Components

### UI Components (shadcn/ui pattern)
- Located in `frontend/src/components/ui/`
- Import utils as: `import { cn } from "../../lib/utils"`
- Uses Radix UI primitives (@radix-ui/react-*)

### Key Components
- `PrinterStation.jsx` - Station management with queue/history tabs
- `AutoPrintManager.js` - Singleton service for auto-printing
- `DeviceModeSelector.jsx` - Local device mode switching
- `PrintQueue.jsx` - User's print queue display

## Recent Changes

### Print History Feature (Latest)
- Added tabbed interface for Active Queue vs Print History
- Visual status indicators (pending, printing, completed, failed)
- Print statistics (total printed, failed, last 24h)
- Jobs remain in database after completion for audit trail

### Device Mode Migration
- Removed database storage of device mode
- All device mode logic uses localStorage only
- Migration: `backend/migrations/remove_device_mode.py`

## localStorage Keys
- `authToken` - JWT authentication token
- `deviceMode` - Current mode (sender/printer/hybrid)
- `printerStation` - Station registration data
- `autoPrintCheckedFiles` - Processed file IDs
- `app-ui-theme` - Theme preference