#!/usr/bin/env python3
"""
Migration to add admin features to the database
Run: docker exec webapp_backend python /app/migrations/add_admin_features.py
"""

import sys
import os
sys.path.append('/app')

from app import app, db
from sqlalchemy import text
import traceback

def run_migration():
    with app.app_context():
        try:
            # Add is_admin column to users table if it doesn't exist
            result = db.session.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name='users' AND column_name='is_admin'
            """)).fetchone()

            if not result:
                print("Adding is_admin column to users table...")
                db.session.execute(text("""
                    ALTER TABLE users
                    ADD COLUMN is_admin BOOLEAN DEFAULT FALSE
                """))
                db.session.commit()
                print("✅ Added is_admin column")
            else:
                print("✅ is_admin column already exists")

            # Add is_active column to users table if it doesn't exist
            result = db.session.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name='users' AND column_name='is_active'
            """)).fetchone()

            if not result:
                print("Adding is_active column to users table...")
                db.session.execute(text("""
                    ALTER TABLE users
                    ADD COLUMN is_active BOOLEAN DEFAULT TRUE
                """))
                db.session.commit()
                print("✅ Added is_active column")
            else:
                print("✅ is_active column already exists")

            # Create admin_logs table if it doesn't exist
            result = db.session.execute(text("""
                SELECT tablename FROM pg_tables
                WHERE tablename = 'admin_logs'
            """)).fetchone()

            if not result:
                print("Creating admin_logs table...")
                db.session.execute(text("""
                    CREATE TABLE admin_logs (
                        id SERIAL PRIMARY KEY,
                        admin_id INTEGER REFERENCES users(id),
                        action VARCHAR(100) NOT NULL,
                        details JSON,
                        ip_address VARCHAR(45),
                        user_agent TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                db.session.commit()
                print("✅ Created admin_logs table")
            else:
                print("✅ admin_logs table already exists")

            # Create system_settings table if it doesn't exist
            result = db.session.execute(text("""
                SELECT tablename FROM pg_tables
                WHERE tablename = 'system_settings'
            """)).fetchone()

            if not result:
                print("Creating system_settings table...")
                db.session.execute(text("""
                    CREATE TABLE system_settings (
                        id SERIAL PRIMARY KEY,
                        key VARCHAR(100) UNIQUE NOT NULL,
                        value JSON,
                        description TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_by INTEGER REFERENCES users(id)
                    )
                """))
                db.session.commit()
                print("✅ Created system_settings table")
            else:
                print("✅ system_settings table already exists")

            # Create default admin user if it doesn't exist
            from werkzeug.security import generate_password_hash

            result = db.session.execute(text("""
                SELECT id FROM users
                WHERE username = 'admin' AND is_admin = true
            """)).fetchone()

            if not result:
                print("Creating default admin user...")
                password_hash = generate_password_hash('admin123')
                db.session.execute(text("""
                    INSERT INTO users (username, password_hash, is_admin, is_active, created_at)
                    VALUES (:username, :password_hash, true, true, CURRENT_TIMESTAMP)
                """), {
                    'username': 'admin',
                    'password_hash': password_hash
                })
                db.session.commit()
                print("✅ Created admin user (username: admin, password: admin123)")
                print("⚠️  IMPORTANT: Change the admin password after first login!")
            else:
                print("✅ Admin user already exists")

            # Add some default system settings
            settings = [
                ('max_file_size_mb', 10, 'Maximum file size for uploads (MB)'),
                ('session_timeout_minutes', 1440, 'User session timeout (minutes)'),
                ('allow_registration', True, 'Allow new user registrations'),
                ('maintenance_mode', False, 'Enable maintenance mode'),
                ('default_print_copies', 1, 'Default number of print copies'),
                ('feature_auto_print', True, 'Enable auto-print functionality'),
                ('feature_remote_printing', True, 'Enable remote printer stations'),
            ]

            for key, value, description in settings:
                result = db.session.execute(text("""
                    SELECT id FROM system_settings WHERE key = :key
                """), {'key': key}).fetchone()

                if not result:
                    import json
                    db.session.execute(text("""
                        INSERT INTO system_settings (key, value, description)
                        VALUES (:key, CAST(:value AS json), :description)
                    """), {
                        'key': key,
                        'value': json.dumps(value),
                        'description': description
                    })

            db.session.commit()
            print("✅ Added default system settings")

            print("\n✅ Migration completed successfully!")
            print("\n📌 Admin Dashboard Access:")
            print("   URL: http://localhost:8080/admin")
            print("   Username: admin")
            print("   Password: admin123")
            print("\n⚠️  Remember to change the admin password after first login!")

        except Exception as e:
            print(f"❌ Migration failed: {str(e)}")
            traceback.print_exc()
            db.session.rollback()
            return False

    return True

if __name__ == "__main__":
    if run_migration():
        sys.exit(0)
    else:
        sys.exit(1)