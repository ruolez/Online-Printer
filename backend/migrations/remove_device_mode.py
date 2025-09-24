#!/usr/bin/env python3
"""
Migration to remove device_mode column from user_settings table.
Device mode should be stored locally on each device, not in the database.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from sqlalchemy import text

def remove_device_mode_column():
    """Remove device_mode column from user_settings table"""
    with app.app_context():
        try:
            # Check if column exists
            result = db.session.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name='user_settings'
                AND column_name='device_mode'
            """))

            if result.rowcount > 0:
                print("Removing device_mode column from user_settings table...")
                db.session.execute(text("""
                    ALTER TABLE user_settings
                    DROP COLUMN device_mode
                """))
                db.session.commit()
                print("✓ Successfully removed device_mode column")
            else:
                print("✓ device_mode column does not exist (already removed)")

        except Exception as e:
            print(f"✗ Error removing device_mode column: {e}")
            db.session.rollback()
            raise

if __name__ == "__main__":
    print("Starting migration: Remove device_mode from user_settings")
    print("-" * 50)

    remove_device_mode_column()

    print("-" * 50)
    print("Migration completed successfully!")