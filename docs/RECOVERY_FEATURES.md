# Printer Station Recovery Features

## Overview
The printer station application now includes comprehensive recovery mechanisms to ensure continuous operation even during network failures, backend restarts, or token expiration.

## Key Features

### 1. Automatic Token Management (`AuthManager`)
- **Token Refresh**: Automatically refreshes JWT tokens 5 minutes before expiration
- **Re-authentication**: If token refresh fails, automatically re-authenticates using stored credentials
- **Exponential Backoff**: Smart retry logic with exponential backoff for failed authentication attempts
- **Request Interception**: All API requests automatically include fresh tokens

### 2. Connection Monitoring (`ConnectionMonitor`)
- **Network Detection**: Monitors online/offline status using Navigator.onLine API
- **Backend Health Checks**: Periodic pings to `/api/health` endpoint
- **Auto-Reconnection**: Automatic reconnection attempts with exponential backoff
- **Operation Queuing**: Queues operations during offline periods for later execution
- **Event System**: Emits events for connection state changes

### 3. Persistent Storage (`StationStorage`)
- **Station Data**: Persists station configuration across browser restarts
- **Credentials Storage**: Securely stores credentials (base64 encoded) for auto-reconnection
- **Failed Job Tracking**: Tracks failed print jobs for retry
- **Operation Queue**: Maintains queue of pending operations during offline periods
- **Print Job Cache**: Caches print jobs for offline viewing

### 4. Enhanced Printer Station Component
- **Visual Indicators**: Shows connection status (online/offline/reconnecting)
- **Auto-Recovery**: Automatically recovers from disconnections
- **Session Restoration**: Restores station session on page reload
- **Heartbeat Resilience**: Continues heartbeat attempts with queuing during offline periods

### 5. Improved Auto-Print Manager
- **Retry Logic**: Automatic retry for failed print jobs with exponential backoff
- **Connection Awareness**: Pauses operations when offline, resumes when connected
- **Failed Job Recovery**: Processes failed jobs when connection is restored
- **Status Updates**: Queues status updates during offline periods

### 6. Service Worker (PWA)
- **Offline Caching**: Caches critical resources for offline operation
- **Background Sync**: Queues heartbeats and API calls for background sync
- **Network-First Strategy**: Prioritizes fresh data while falling back to cache
- **PDF Caching**: Caches PDF files for offline printing

## Configuration

### Backend Endpoints
- `/api/refresh-token`: Token refresh endpoint (POST)
- `/api/stations/<id>/reconnect`: Station reconnection endpoint (POST)
- `/api/health`: Health check endpoint (GET)

### Environment Variables
No additional environment variables required. All recovery features work with existing configuration.

### Storage Keys
- `authToken`: JWT authentication token
- `stationCredentials`: Encrypted station credentials
- `printerStation`: Station configuration
- `stationSessionToken`: Station session token
- `connectionState`: Last known connection state
- `failedJobs`: List of failed print jobs
- `cachedPrintJobs`: Cached print job data
- `connectionQueue`: Queued operations

## Recovery Flows

### Token Expiration Recovery
1. AuthManager detects token near expiration (5 minutes before)
2. Attempts to refresh token via `/api/refresh-token`
3. If refresh fails, attempts re-authentication with stored credentials
4. Updates all services with new token
5. Schedules next refresh

### Network Disconnection Recovery
1. ConnectionMonitor detects network offline event
2. Pauses all active operations (heartbeat, polling)
3. Shows visual indicator to user
4. Queues any attempted operations
5. When network returns, processes queued operations
6. Resumes normal operation

### Backend Restart Recovery
1. Health check fails, triggering disconnection state
2. Begins exponential backoff reconnection attempts
3. When backend responds, re-establishes station session
4. Resumes heartbeat and polling
5. Processes any queued operations

### Browser Restart Recovery
1. On page load, checks localStorage for station data
2. Restores station configuration and session
3. Validates session with backend
4. If invalid, attempts reconnection
5. Resumes all operations

## Error Handling

### Retry Configuration
- **Max Retries**: 3-10 attempts depending on operation
- **Base Delay**: 1-2 seconds
- **Max Delay**: 60 seconds
- **Backoff Factor**: 2x

### Fallback Mechanisms
- Cached data display when offline
- Local operation queuing
- Graceful degradation of features
- User notifications for critical errors

## Monitoring

### Status Indicators
- Connection badge: Shows current connection state
- Status icon: Visual representation of station status
- Reconnection spinner: Indicates active reconnection attempts
- Error messages: Clear error descriptions

### Logs
All recovery operations are logged to console with prefixes:
- `[AuthManager]`: Authentication operations
- `[ConnectionMonitor]`: Connection state changes
- `[StationStorage]`: Storage operations
- `[PrinterStation]`: Station-specific operations
- `[AutoPrintManager]`: Print job operations

## Testing Recovery

### Simulate Token Expiration
```javascript
// In browser console
localStorage.setItem('authToken', 'expired-token');
// Application should automatically re-authenticate
```

### Simulate Network Failure
1. Open browser DevTools
2. Network tab → Throttling → Offline
3. Application should show offline state and queue operations

### Simulate Backend Restart
```bash
docker-compose restart backend
# Application should automatically reconnect
```

### Simulate Browser Restart
1. Close browser/tab completely
2. Reopen and navigate to application
3. Station should be restored automatically

## Security Considerations

### Credential Storage
- Credentials are stored in base64 encoding (not encryption)
- Only stored for printer stations, not regular users
- Cleared on explicit logout or station unregistration
- Consider implementing proper encryption for production

### Token Management
- Tokens expire after 24 hours
- Refresh tokens are not implemented (uses re-authentication)
- All tokens transmitted over HTTPS in production
- Token stored in localStorage (consider httpOnly cookies for enhanced security)

## Future Enhancements

### Planned Improvements
1. Implement proper encryption for stored credentials
2. Add refresh token mechanism to avoid re-authentication
3. Implement WebSocket for real-time updates
4. Add offline print job creation capability
5. Implement sync conflict resolution
6. Add telemetry for recovery success rates

### Known Limitations
1. Credentials stored in base64 (not encrypted)
2. No conflict resolution for concurrent updates
3. Queue size limited to prevent memory issues
4. No offline file upload capability
5. Recovery state not synced across tabs

## Support

For issues or questions about recovery features:
1. Check browser console for detailed logs
2. Verify network connectivity
3. Check backend health endpoint
4. Review localStorage for corruption
5. Clear browser cache if issues persist