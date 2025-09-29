#!/usr/bin/env python3
"""
Production fix script for admin user authentication issues.
This script diagnoses and fixes the admin user password hash compatibility.
"""
import os
import sys
from sqlalchemy import create_engine, text
from passlib.context import CryptContext

# Password hashing configuration (matches FastAPI admin backend)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    """Hash a password using passlib (FastAPI compatible)"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except:
        return False

# Get database URL from environment
DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    print("❌ DATABASE_URL environment variable not set")
    print("   Run this script with: DATABASE_URL='postgresql://...' python3 fix_admin_production.py")
    sys.exit(1)

print(f"🔍 Connecting to database...")
print(f"   URL: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else DATABASE_URL}")

try:
    # Create database connection
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        # Check if admin user exists
        print("\n📋 Checking for admin user...")
        result = conn.execute(
            text("SELECT id, username, password_hash, is_admin, is_active FROM users WHERE username = 'admin'")
        ).fetchone()

        if result:
            user_id, username, current_hash, is_admin, is_active = result
            print(f"✅ Admin user found:")
            print(f"   ID: {user_id}")
            print(f"   Username: {username}")
            print(f"   Is Admin: {is_admin}")
            print(f"   Is Active: {is_active}")
            print(f"   Password hash starts with: {current_hash[:20] if current_hash else 'None'}...")

            # Test if current hash works with passlib
            print("\n🔐 Testing password compatibility...")
            test_passwords = ["admin123", "admin"]
            password_works = False

            for test_pass in test_passwords:
                if current_hash and verify_password(test_pass, current_hash):
                    print(f"✅ Password '{test_pass}' is already working with passlib")
                    password_works = True
                    break

            if not password_works:
                print("❌ Current password hash is NOT compatible with passlib (FastAPI)")
                print("   This is likely because it was created with werkzeug (Flask)")

                # Ask user for the password to set
                print("\n🔧 Fixing password hash...")
                print("   Which password should we set?")
                print("   1) admin123 (default)")
                print("   2) admin")
                print("   3) Custom password")

                choice = input("Enter choice (1-3) [default: 1]: ").strip() or "1"

                if choice == "1":
                    new_password = "admin123"
                elif choice == "2":
                    new_password = "admin"
                elif choice == "3":
                    new_password = input("Enter custom password: ").strip()
                    if not new_password:
                        print("❌ Password cannot be empty")
                        sys.exit(1)
                else:
                    print("❌ Invalid choice")
                    sys.exit(1)

                # Generate new password hash
                print(f"\n🔨 Generating new password hash for '{new_password}'...")
                new_hash = get_password_hash(new_password)

                # Update the user
                result = conn.execute(
                    text("""
                        UPDATE users
                        SET password_hash = :hash,
                            is_admin = true,
                            is_active = true
                        WHERE username = 'admin'
                    """),
                    {"hash": new_hash}
                )
                conn.commit()

                print(f"✅ Admin user password updated successfully!")
                print(f"   Username: admin")
                print(f"   Password: {new_password}")

                # Verify the fix
                print("\n🧪 Verifying the fix...")
                result = conn.execute(
                    text("SELECT password_hash FROM users WHERE username = 'admin'")
                ).fetchone()

                if result and verify_password(new_password, result[0]):
                    print("✅ Password verification successful! Admin login should work now.")
                else:
                    print("❌ Password verification failed. Please contact support.")

            # Check if user needs to be made admin
            if not is_admin or not is_active:
                print("\n⚠️  User is not fully activated as admin")
                print("   Fixing admin privileges...")
                conn.execute(
                    text("UPDATE users SET is_admin = true, is_active = true WHERE username = 'admin'")
                )
                conn.commit()
                print("✅ Admin privileges granted")

        else:
            print("❌ Admin user not found in database")
            print("\n📝 Creating admin user...")

            # Ask for password
            print("   What password should the admin user have?")
            print("   1) admin123 (default)")
            print("   2) admin")
            print("   3) Custom password")

            choice = input("Enter choice (1-3) [default: 1]: ").strip() or "1"

            if choice == "1":
                admin_password = "admin123"
            elif choice == "2":
                admin_password = "admin"
            elif choice == "3":
                admin_password = input("Enter custom password: ").strip()
                if not admin_password:
                    print("❌ Password cannot be empty")
                    sys.exit(1)
            else:
                print("❌ Invalid choice")
                sys.exit(1)

            # Create admin user
            password_hash = get_password_hash(admin_password)

            conn.execute(
                text("""
                    INSERT INTO users (username, password_hash, is_admin, is_active, created_at)
                    VALUES ('admin', :hash, true, true, NOW())
                """),
                {"hash": password_hash}
            )
            conn.commit()

            print(f"✅ Admin user created successfully!")
            print(f"   Username: admin")
            print(f"   Password: {admin_password}")

        print("\n🎉 All done! You should now be able to login to the admin panel.")
        print("   URL: https://YOUR_DOMAIN/admin")
        print("   Remember to change the password after first login!")

except Exception as e:
    print(f"\n❌ Error occurred: {e}")
    print("\n💡 Troubleshooting tips:")
    print("   1. Ensure DATABASE_URL is correct")
    print("   2. Check if the database container is running")
    print("   3. Verify network connectivity to the database")
    print("   4. Check if the 'users' table exists in the database")
    sys.exit(1)