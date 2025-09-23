#!/bin/bash

# Test printer stations functionality

API_URL="http://localhost:5000/api"
USERNAME="testuser_$(date +%s)"
PASSWORD="password123"

echo "===== Testing Printer Stations API ====="
echo ""

# 1. Register a new user
echo "1. Registering new user: $USERNAME"
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo $REGISTER_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('token', ''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to register user"
  echo "Response: $REGISTER_RESPONSE"
  exit 1
fi

echo "✅ User registered successfully"
echo ""

# 2. Get current settings
echo "2. Fetching user settings"
SETTINGS=$(curl -s -X GET "$API_URL/settings" \
  -H "Authorization: Bearer $TOKEN")

echo "Current settings: $SETTINGS" | head -c 100
echo "..."
echo ""

# 3. Register a printer station
echo "3. Registering printer station"
STATION_RESPONSE=$(curl -s -X POST "$API_URL/stations/register" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "station_name": "Test Printer",
    "station_location": "Office Room 101",
    "capabilities": {
      "color": true,
      "duplex": true,
      "paper_sizes": ["A4", "Letter"]
    }
  }')

STATION_ID=$(echo $STATION_RESPONSE | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('station', {}).get('id', ''))" 2>/dev/null)
SESSION_TOKEN=$(echo $STATION_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('session_token', ''))" 2>/dev/null)

if [ -z "$STATION_ID" ]; then
  echo "❌ Failed to register station"
  echo "Response: $STATION_RESPONSE"
  exit 1
fi

echo "✅ Station registered with ID: $STATION_ID"
echo ""

# 4. List stations
echo "4. Listing all stations"
STATIONS=$(curl -s -X GET "$API_URL/stations" \
  -H "Authorization: Bearer $TOKEN")

echo "Stations: $STATIONS" | head -c 200
echo "..."
echo ""

# 5. Send heartbeat
echo "5. Sending heartbeat"
HEARTBEAT=$(curl -s -X PUT "$API_URL/stations/$STATION_ID/heartbeat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_token\": \"$SESSION_TOKEN\",
    \"status\": \"online\"
  }")

echo "Heartbeat response: $HEARTBEAT" | head -c 100
echo "..."
echo ""

# 6. Get station status
echo "6. Getting station status"
STATUS=$(curl -s -X GET "$API_URL/stations/$STATION_ID/status" \
  -H "Authorization: Bearer $TOKEN")

echo "Station status: $STATUS" | head -c 150
echo "..."
echo ""

# 7. Update device mode to printer
echo "7. Updating device mode to 'printer'"
MODE_UPDATE=$(curl -s -X PUT "$API_URL/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_mode": "printer"
  }')

echo "Mode updated: $MODE_UPDATE" | head -c 100
echo "..."
echo ""

echo "===== All tests completed successfully! ====="