# Auto-Printing Setup Guide

## Overview
The application now includes automatic PDF printing functionality through a Progressive Web App (PWA) implementation. This enables near-silent printing of uploaded PDFs without user intervention for each print job.

## Features
- ✅ PWA installation for better permissions
- ✅ Automatic print queue management
- ✅ Real-time print status tracking
- ✅ Configurable print settings (orientation, copies)
- ✅ Auto-print monitoring for new uploads
- ✅ Manual print override option
- ✅ Print history and error handling

## Setup Instructions

### 1. Access the Application
Navigate to `http://localhost:5173`

### 2. Install as PWA (Recommended)
- Look for the install prompt in the bottom-right corner
- Click "Install App" button
- Or use browser's install option in address bar

### 3. Configure Print Settings
1. Log in to your account
2. Go to the "Print" tab
3. In Print Settings:
   - Toggle "Automatic Printing" ON
   - Select print orientation (Portrait/Landscape)
   - Set number of copies (1-10)
   - Click "Save Settings"

### 4. Test Printing
- Click "Test Print" button to verify printer connection
- Browser will show print dialog (first time only)
- Select your printer and accept

## Silent Printing Setup (Optional)

For completely silent printing without any dialogs:

### Chrome/Chromium:
```bash
# Windows
chrome.exe --kiosk-printing --kiosk "http://localhost:5173"

# Mac
open -a "Google Chrome" --args --kiosk-printing --kiosk "http://localhost:5173"

# Linux
google-chrome --kiosk-printing --kiosk "http://localhost:5173"
```

### Microsoft Edge:
```bash
# Windows
msedge.exe --kiosk-printing --edge-kiosk-type=fullscreen --kiosk "http://localhost:5173"

# Mac
open -a "Microsoft Edge" --args --kiosk-printing --edge-kiosk-type=fullscreen --kiosk "http://localhost:5173"
```

## How Auto-Printing Works

### Automatic Flow:
1. **Upload PDF** → File is uploaded and processed
2. **Auto-Queue** → If auto-print is enabled, file is added to print queue
3. **Auto-Print** → System automatically sends to default printer
4. **Status Update** → Real-time status shown in Print Queue

### Manual Control:
- View all print jobs in the "Print Queue" section
- Click printer icon to manually print any pending job
- Remove completed/failed jobs with X button
- Retry failed prints with "Retry" button

## Print Queue Management

### Status Indicators:
- 🕐 **Pending**: Waiting to be printed
- 🔄 **Printing**: Currently being sent to printer
- ✅ **Completed**: Successfully printed
- ❌ **Failed**: Print error occurred

### Queue Features:
- Automatic refresh every 5 seconds
- Manual refresh button
- Shows last 20 print jobs
- Displays timestamp for each job

## Troubleshooting

### Print Dialog Still Appears:
- First print always requires user confirmation
- Install as PWA for better experience
- Use kiosk mode flags for true silent printing

### Auto-Print Not Working:
1. Verify "Automatic Printing" is enabled in settings
2. Check browser console for errors
3. Ensure printer is online and default printer is set
4. Restart the application

### Files Not Adding to Queue:
- Check file upload status is "completed"
- Verify file is PDF format
- Check network connection

### PWA Not Installing:
- Must use HTTPS or localhost
- Clear browser cache
- Try different browser (Chrome/Edge recommended)

## API Endpoints

### Print Settings:
- `GET /api/settings` - Get current settings
- `PUT /api/settings` - Update print settings

### Print Queue:
- `GET /api/print-queue` - List print jobs
- `POST /api/print-queue/add/<file_id>` - Add to queue
- `PUT /api/print-queue/<job_id>/status` - Update status
- `DELETE /api/print-queue/<job_id>` - Remove from queue
- `GET /api/print-queue/next` - Get next pending job

## Security Notes
- Print queue is user-specific
- Files require authentication to download
- Print settings are stored per user
- No cross-user print job access

## Browser Compatibility
- **Chrome/Chromium**: ✅ Full support
- **Microsoft Edge**: ✅ Full support
- **Firefox**: ⚠️ Limited (no kiosk mode)
- **Safari**: ⚠️ Basic support only

## Development Notes

### Technologies Used:
- **PWA**: vite-plugin-pwa for PWA generation
- **Printing**: print-js library for print control
- **Icons**: Generated using Sharp
- **Service Worker**: Auto-generated with Workbox

### File Structure:
```
frontend/
├── src/
│   ├── components/
│   │   ├── PrintSettings.jsx    # Print configuration UI
│   │   ├── PrintQueue.jsx       # Queue management UI
│   │   └── InstallPrompt.jsx    # PWA install prompt
│   └── services/
│       └── AutoPrintManager.js  # Auto-print service
└── public/
    ├── pwa-192x192.png         # PWA icon
    └── pwa-512x512.png         # PWA icon
```

### Database Schema:
- **user_settings**: Added print configuration fields
- **print_queue**: New table for print job tracking

## Future Enhancements
- [ ] Printer selection (not just default)
- [ ] Print preview before sending
- [ ] Scheduled printing
- [ ] Print job priorities
- [ ] Batch printing operations
- [ ] Print cost tracking
- [ ] Email notifications for print status