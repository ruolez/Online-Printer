#!/usr/bin/env python3
"""
Migration to update admin password to admin123
Run: docker exec webapp_backend python /app/migrations/update_admin_password.py
"""

import sys
import os
sys.path.append('/app')

from app import app, db
from sqlalchemy import text
from werkzeug.security import generate_password_hash

def update_admin_password():
    with app.app_context():
        try:
            # Update admin password to admin123
            new_password_hash = generate_password_hash('admin123')

            result = db.session.execute(text("""
                UPDATE users
                SET password_hash = :password_hash
                WHERE username = 'admin' AND is_admin = true
                RETURNING id, username
            """), {
                'password_hash': new_password_hash
            })

            user = result.fetchone()

            if user:
                db.session.commit()
                print(f"✅ Admin password updated successfully!")
                print(f"   User ID: {user.id}")
                print(f"   Username: {user.username}")
                print(f"   New Password: admin123")
                print("\n⚠️  IMPORTANT: Change this password after first login!")
            else:
                print("❌ Admin user not found")
                return False

        except Exception as e:
            print(f"❌ Failed to update password: {str(e)}")
            db.session.rollback()
            return False

    return True

if __name__ == "__main__":
    if update_admin_password():
        sys.exit(0)
    else:
        sys.exit(1)