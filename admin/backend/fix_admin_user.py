#!/usr/bin/env python3
"""Fix admin user password hash to be compatible with passlib"""
import os
import sys
from sqlalchemy import create_engine, text
from auth import get_password_hash

# Get database URL from environment
DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    print("DATABASE_URL environment variable not set")
    sys.exit(1)

# Create database connection
engine = create_engine(DATABASE_URL)

# Generate proper password hash for 'admin' password
password_hash = get_password_hash("admin")

# Update admin user with correct password hash
with engine.connect() as conn:
    result = conn.execute(
        text("UPDATE users SET password_hash = :hash WHERE username = 'admin'"),
        {"hash": password_hash}
    )
    conn.commit()

    if result.rowcount > 0:
        print(f"✅ Admin user password updated successfully")
        print(f"   Username: admin")
        print(f"   Password: admin")
    else:
        print("❌ Admin user not found in database")
        print("   Creating admin user...")

        # Try to create admin user if it doesn't exist
        try:
            conn.execute(
                text("""
                    INSERT INTO users (username, password_hash, is_admin, is_active, created_at)
                    VALUES ('admin', :hash, true, true, NOW())
                """),
                {"hash": password_hash}
            )
            conn.commit()
            print("✅ Admin user created successfully")
            print(f"   Username: admin")
            print(f"   Password: admin")
        except Exception as e:
            print(f"❌ Failed to create admin user: {e}")