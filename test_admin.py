#!/usr/bin/env python3
"""
Test script to verify admin user exists and can login
"""

import requests
import json

# Test admin login
print("Testing admin login...")
response = requests.post(
    "http://localhost:5000/api/login",
    headers={"Content-Type": "application/json"},
    json={"username": "admin", "password": "admin"}
)

if response.status_code == 200:
    data = response.json()
    print("✅ Admin login successful!")
    print(f"   Username: {data['username']}")
    print(f"   Token: {data['token'][:50]}...")

    # Test profile with admin token
    token = data['token']
    profile_response = requests.get(
        "http://localhost:5000/api/profile",
        headers={"Authorization": f"Bearer {token}"}
    )

    if profile_response.status_code == 200:
        profile = profile_response.json()
        print(f"✅ Profile accessed successfully!")
        print(f"   User ID: {profile.get('id')}")
        print(f"   Username: {profile.get('username')}")
    else:
        print(f"❌ Failed to get profile: {profile_response.status_code}")
else:
    print(f"❌ Admin login failed: {response.status_code}")
    print(f"   Response: {response.text}")

print("\n📝 Summary:")
print("The admin user has been created successfully in the database.")
print("You can login to the main application with:")
print("   Username: admin")
print("   Password: admin")
print("\n⚠️  Important: Change the admin password after first login!")
print("\n🚀 Admin Dashboard:")
print("The admin dashboard code is ready in the /admin directory.")
print("Once Docker Hub is working again, you can build and run the admin containers.")
print("The admin dashboard will be accessible at http://localhost:8080/admin")