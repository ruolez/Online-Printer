#!/usr/bin/env python
"""
Database migration script to add print settings columns
Run this to update existing database without losing data
"""

import os
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# Database connection from environment
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://webapp_user:webapp_password@localhost:5433/webapp')

def migrate():
    conn = None
    cur = None
    try:
        # Connect to database
        conn = psycopg2.connect(DATABASE_URL)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()

        print("Connected to database")

        # Add columns to user_settings if they don't exist
        columns_to_add = [
            ("auto_print_enabled", "BOOLEAN DEFAULT FALSE"),
            ("print_orientation", "VARCHAR(20) DEFAULT 'portrait'"),
            ("print_copies", "INTEGER DEFAULT 1"),
            ("last_print_check", "TIMESTAMP")
        ]

        for column_name, column_type in columns_to_add:
            try:
                cur.execute(f"""
                    ALTER TABLE user_settings
                    ADD COLUMN IF NOT EXISTS {column_name} {column_type}
                """)
                print(f"Added column {column_name} to user_settings")
            except psycopg2.errors.DuplicateColumn:
                print(f"Column {column_name} already exists")
            except Exception as e:
                print(f"Error adding column {column_name}: {e}")

        # Create print_queue table if it doesn't exist
        cur.execute("""
            CREATE TABLE IF NOT EXISTS print_queue (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                file_id INTEGER NOT NULL REFERENCES uploaded_files(id),
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                printed_at TIMESTAMP,
                error_message TEXT
            )
        """)
        print("Created/verified print_queue table")

        # Create indexes for better performance
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_print_queue_user_id
            ON print_queue(user_id)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_print_queue_status
            ON print_queue(status)
        """)
        print("Created indexes")

        print("\nMigration completed successfully!")

    except Exception as e:
        print(f"Migration error: {e}")
        if conn:
            conn.rollback()
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

if __name__ == "__main__":
    migrate()