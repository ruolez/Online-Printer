#!/bin/bash

# Test that device mode syncs properly between settings and overview

API_URL="http://localhost:5000/api"
TOKEN="YOUR_TOKEN_HERE"

echo "===== Testing Device Mode Sync ====="
echo ""

# Function to get current mode from localStorage via browser console
test_mode_sync() {
    echo "1. Login to the app at http://localhost:5173"
    echo "2. Go to Settings tab"
    echo "3. Change device mode to 'Printer Station'"
    echo "4. Click 'Save Settings'"
    echo "5. Navigate to Overview tab"
    echo ""
    echo "Expected: Overview should show 'Printer Mode'"
    echo ""
    echo "To verify localStorage, open browser console and run:"
    echo "  localStorage.getItem('deviceMode')"
    echo ""
    echo "It should return: 'printer'"
    echo ""
    echo "Test multiple scenarios:"
    echo "  - Change to 'Sender' mode -> Overview should update"
    echo "  - Change to 'Hybrid' mode -> Overview should update"
    echo "  - Refresh browser -> Mode should persist"
    echo "  - Open new tab -> Mode should be same"
}

test_mode_sync

echo "===== Manual Test Instructions Complete ====="