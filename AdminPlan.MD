# Admin Dashboard Implementation Plan

## Overview
Comprehensive admin dashboard for printer.online application running as a separate Docker container with route `/admin`.

## Architecture

### Tech Stack
- **Frontend**: React + Vite with shadcn/ui components
- **Backend**: Python FastAPI (async, modern API framework)
- **Database**: Shared PostgreSQL (read/write access to existing DB)
- **Authentication**: JWT with admin role verification
- **Container Ports**:
  - Admin Backend: 3001 (FastAPI)
  - Admin Frontend: 3000 (Vite dev server)
- **Routing**: Nginx proxy at `/admin` route

## Features Checklist

### ✅ Phase 1: Core Infrastructure
- [ ] Create admin directory structure
- [ ] Set up FastAPI backend
- [ ] Configure Docker containers
- [ ] Update Nginx routing
- [ ] Create admin authentication system
- [ ] Add admin role to database

### ✅ Phase 2: Dashboard Features

#### 1. Dashboard Overview
- [ ] Real-time statistics widget
  - Total users count
  - Total files uploaded
  - Active print jobs
  - Storage usage metrics
- [ ] System health monitoring
  - Container status
  - Database connections
  - Redis status
- [ ] Activity timeline
  - Recent uploads
  - Recent prints
  - New registrations
- [ ] Usage charts (Chart.js)
  - Daily/weekly/monthly trends
  - User growth
  - Print volume

#### 2. User Management
- [ ] User list table
  - Search functionality
  - Filter by status
  - Pagination
  - Sort by columns
- [ ] User details modal
  - Profile information
  - Settings overview
  - Activity history
  - Files uploaded
- [ ] User actions
  - Edit user details
  - Reset password
  - Suspend/activate account
  - Delete user (with confirmation)
- [ ] Bulk operations
  - Export to CSV
  - Bulk delete
  - Bulk suspend

#### 3. Database Management
- [ ] Table viewer
  - List all tables
  - View table schema
  - Browse records
  - CRUD operations
- [ ] SQL Query executor
  - Query input with syntax highlighting
  - Results table
  - Export results
  - Query history
  - Safety checks (prevent DROP, DELETE without WHERE)
- [ ] Database metrics
  - Size per table
  - Connection count
  - Performance stats
- [ ] Backup/Restore
  - Manual backup trigger
  - Download backups
  - Restore from file

#### 4. File Storage Management
- [ ] File browser
  - Browse by user
  - Search files
  - Filter by date/size
  - Preview PDFs
- [ ] Storage analytics
  - Usage per user
  - File type distribution
  - Average file size
  - Growth trends
- [ ] File operations
  - Download file
  - Delete file
  - Bulk delete old files
  - Clean orphaned files
- [ ] Storage quotas
  - Set per-user limits
  - Global limits
  - Alert thresholds

#### 5. Print Queue Management
- [ ] Global queue view
  - All users' print jobs
  - Filter by status
  - Filter by station
  - Sort by date/priority
- [ ] Queue operations
  - Pause/resume job
  - Cancel job
  - Reorder queue
  - Clear failed jobs
- [ ] Station management
  - View all stations
  - Station details
  - Force offline
  - Edit capabilities
  - Delete station
- [ ] Print analytics
  - Jobs per day
  - Success/failure rate
  - Average processing time
  - Station utilization

#### 6. System Settings
- [ ] Global configuration
  - Max file size
  - Allowed file types
  - Default user quotas
  - Session timeout
- [ ] Feature flags
  - Enable/disable features
  - A/B testing flags
  - Maintenance mode
- [ ] Email settings
  - SMTP configuration
  - Email templates
  - Test email sending
- [ ] Security settings
  - JWT expiry times
  - Password requirements
  - Login attempt limits
  - IP restrictions

#### 7. Analytics & Reporting
- [ ] User reports
  - Registration trends
  - Active users
  - User retention
- [ ] System reports
  - Resource usage
  - Error rates
  - Performance metrics
- [ ] Custom reports
  - Report builder UI
  - Save report templates
  - Schedule reports
- [ ] Export functionality
  - CSV export
  - JSON export
  - PDF reports

#### 8. Audit & Security
- [ ] Admin action logs
  - All admin actions logged
  - Searchable logs
  - Filter by admin/action
- [ ] User activity logs
  - Login history
  - File operations
  - Print activities
- [ ] Security monitoring
  - Failed login attempts
  - Suspicious activities
  - Rate limit violations
- [ ] IP management
  - Block IP addresses
  - Allowlist IPs
  - Geographic restrictions

## Implementation Steps

### Step 1: Directory Structure ✅
```
admin/
├── backend/
│   ├── app.py
│   ├── auth.py
│   ├── database.py
│   ├── models.py
│   ├── routes/
│   ├── utils.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
└── nginx/
    └── admin.conf
```

### Step 2: Database Schema Updates ✅
- Add `is_admin` column to users table
- Create `admin_logs` table for audit trail
- Create `system_settings` table

### Step 3: Backend Implementation ✅
- FastAPI application setup
- JWT authentication with admin check
- All API endpoints
- WebSocket for real-time updates
- Database operations
- File management utilities

### Step 4: Frontend Implementation ✅
- React app with Vite
- shadcn/ui components
- Dashboard layout
- All feature components
- API integration
- Real-time updates

### Step 5: Docker Configuration ✅
- Admin backend container
- Admin frontend container
- Update docker-compose.yml
- Configure networking
- Volume mounts

### Step 6: Nginx Configuration ✅
- Route `/admin` to admin frontend
- Route `/admin/api` to admin backend
- Handle WebSocket connections
- Security headers

### Step 7: Security Implementation ✅
- Admin authentication middleware
- Rate limiting
- SQL injection prevention
- XSS protection
- CSRF tokens
- Audit logging

### Step 8: Testing & Deployment ✅
- Unit tests for backend
- Integration tests
- Frontend component tests
- Load testing
- Security testing
- Documentation

## Security Measures

1. **Authentication**
   - Separate admin JWT tokens
   - Shorter expiry (2 hours)
   - Refresh token mechanism
   - Two-factor authentication ready

2. **Authorization**
   - Role-based access control
   - Granular permissions
   - API endpoint protection
   - Frontend route guards

3. **Data Protection**
   - Encrypted passwords
   - Secure database queries
   - Input validation
   - Output encoding

4. **Monitoring**
   - All actions logged
   - Real-time alerts
   - Suspicious activity detection
   - Regular security audits

## Default Credentials
- Username: `admin`
- Password: `admin`
- **IMPORTANT**: Change on first login

## API Endpoints

### Authentication
- `POST /admin/api/login` - Admin login
- `POST /admin/api/logout` - Admin logout
- `POST /admin/api/refresh` - Refresh token
- `GET /admin/api/verify` - Verify admin token

### Dashboard
- `GET /admin/api/dashboard/stats` - Dashboard statistics
- `GET /admin/api/dashboard/activity` - Recent activity
- `GET /admin/api/dashboard/health` - System health
- `WS /admin/api/dashboard/live` - WebSocket for live updates

### Users
- `GET /admin/api/users` - List users
- `GET /admin/api/users/{id}` - Get user details
- `PUT /admin/api/users/{id}` - Update user
- `DELETE /admin/api/users/{id}` - Delete user
- `POST /admin/api/users/{id}/reset-password` - Reset password
- `POST /admin/api/users/{id}/suspend` - Suspend user
- `POST /admin/api/users/bulk` - Bulk operations

### Database
- `GET /admin/api/database/tables` - List tables
- `GET /admin/api/database/tables/{name}` - Get table data
- `POST /admin/api/database/query` - Execute query
- `POST /admin/api/database/backup` - Create backup
- `POST /admin/api/database/restore` - Restore backup

### Files
- `GET /admin/api/files` - List all files
- `GET /admin/api/files/{id}` - Get file details
- `DELETE /admin/api/files/{id}` - Delete file
- `GET /admin/api/files/{id}/download` - Download file
- `GET /admin/api/files/stats` - Storage statistics
- `POST /admin/api/files/cleanup` - Cleanup old files

### Print Queue
- `GET /admin/api/print-queue` - List all print jobs
- `PUT /admin/api/print-queue/{id}` - Update job
- `DELETE /admin/api/print-queue/{id}` - Delete job
- `GET /admin/api/stations` - List stations
- `PUT /admin/api/stations/{id}` - Update station

### Settings
- `GET /admin/api/settings` - Get all settings
- `PUT /admin/api/settings` - Update settings
- `GET /admin/api/settings/features` - Feature flags
- `PUT /admin/api/settings/features` - Update features

### Analytics
- `GET /admin/api/analytics/users` - User analytics
- `GET /admin/api/analytics/system` - System analytics
- `GET /admin/api/analytics/custom` - Custom reports
- `POST /admin/api/analytics/export` - Export data

### Audit
- `GET /admin/api/audit/logs` - Get audit logs
- `GET /admin/api/audit/activity` - User activity
- `GET /admin/api/audit/security` - Security events
- `POST /admin/api/audit/search` - Search logs

## Deployment Checklist

- [ ] Create admin user with secure password
- [ ] Configure environment variables
- [ ] Set up SSL certificates
- [ ] Configure backup schedule
- [ ] Set up monitoring alerts
- [ ] Review security settings
- [ ] Test all features
- [ ] Create user documentation
- [ ] Set up log rotation
- [ ] Configure rate limiting

## Monitoring

- Container health checks
- Database connection pool
- API response times
- Error rates
- Storage usage
- Memory/CPU usage
- Active sessions
- Failed login attempts

## Maintenance

- Daily database backups
- Weekly security audits
- Monthly performance reviews
- Regular dependency updates
- Log cleanup
- Storage optimization
- User session cleanup
- Temporary file cleanup