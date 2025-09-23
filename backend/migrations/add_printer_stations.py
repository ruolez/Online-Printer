"""
Add printer stations functionality
Migration to add tables and columns for remote printer station support
"""

import os
import sys
from datetime import datetime
from sqlalchemy import create_engine, text

# Get database URL from environment
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://webapp_user:webapp_password@localhost:5433/webapp')

def upgrade():
    """Add printer stations tables and columns"""
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        # Start transaction
        trans = conn.begin()

        try:
            # Create printer_stations table
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS printer_stations (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    station_name VARCHAR(100) NOT NULL,
                    station_location VARCHAR(255),
                    station_token VARCHAR(255) UNIQUE NOT NULL,
                    status VARCHAR(20) DEFAULT 'offline',
                    capabilities JSONB DEFAULT '{}',
                    is_active BOOLEAN DEFAULT TRUE,
                    last_heartbeat TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, station_name)
                );
            """))

            # Create index for faster lookups
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_printer_stations_user_id
                ON printer_stations(user_id);
            """))

            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_printer_stations_status
                ON printer_stations(status);
            """))

            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_printer_stations_token
                ON printer_stations(station_token);
            """))

            # Add station_id to print_queue table
            conn.execute(text("""
                ALTER TABLE print_queue
                ADD COLUMN IF NOT EXISTS station_id INTEGER
                REFERENCES printer_stations(id) ON DELETE SET NULL;
            """))

            # Create index for station_id in print_queue
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_print_queue_station_id
                ON print_queue(station_id);
            """))

            # Add device_mode to user_settings
            conn.execute(text("""
                ALTER TABLE user_settings
                ADD COLUMN IF NOT EXISTS device_mode VARCHAR(20) DEFAULT 'hybrid';
            """))

            # Add default_station_id to user_settings
            conn.execute(text("""
                ALTER TABLE user_settings
                ADD COLUMN IF NOT EXISTS default_station_id INTEGER
                REFERENCES printer_stations(id) ON DELETE SET NULL;
            """))

            # Create station_sessions table for tracking active connections
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS station_sessions (
                    id SERIAL PRIMARY KEY,
                    station_id INTEGER NOT NULL REFERENCES printer_stations(id) ON DELETE CASCADE,
                    session_token VARCHAR(255) UNIQUE NOT NULL,
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT TRUE
                );
            """))

            # Create index for station_sessions
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_station_sessions_station_id
                ON station_sessions(station_id);
            """))

            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_station_sessions_session_token
                ON station_sessions(session_token);
            """))

            print("✅ Migration completed successfully!")
            trans.commit()

        except Exception as e:
            print(f"❌ Migration failed: {str(e)}")
            trans.rollback()
            raise

def downgrade():
    """Remove printer stations tables and columns"""
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        trans = conn.begin()

        try:
            # Drop station_sessions table
            conn.execute(text("DROP TABLE IF EXISTS station_sessions CASCADE;"))

            # Remove columns from user_settings
            conn.execute(text("ALTER TABLE user_settings DROP COLUMN IF EXISTS device_mode;"))
            conn.execute(text("ALTER TABLE user_settings DROP COLUMN IF EXISTS default_station_id;"))

            # Remove station_id from print_queue
            conn.execute(text("ALTER TABLE print_queue DROP COLUMN IF EXISTS station_id;"))

            # Drop printer_stations table
            conn.execute(text("DROP TABLE IF EXISTS printer_stations CASCADE;"))

            print("✅ Rollback completed successfully!")
            trans.commit()

        except Exception as e:
            print(f"❌ Rollback failed: {str(e)}")
            trans.rollback()
            raise

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "down":
        print("Rolling back migration...")
        downgrade()
    else:
        print("Running migration...")
        upgrade()