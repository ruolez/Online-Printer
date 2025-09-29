# Fix for 500 Internal Server Error - Admin Login

## The Problem
After fixing the nginx configuration, you're getting:
```
POST https://goallsy.com/admin/api/auth/login 500 (Internal Server Error)
```

This means the request IS reaching the admin backend, but the backend is throwing an error.

## Most Likely Cause: Password Hash Incompatibility

The admin user was created by the Flask backend (using werkzeug for password hashing), but the admin backend uses FastAPI (with passlib for password hashing). These two libraries use incompatible password hash formats!

- **Flask (main app)**: Uses werkzeug.security → Creates hashes like `pbkdf2:sha256:...`
- **FastAPI (admin)**: Uses passlib with bcrypt → Expects hashes like `$2b$12$...`

## Quick Diagnosis

Check your production logs to confirm:
```bash
# Check admin backend logs
sudo docker logs printer_admin_backend --tail 50

# You'll likely see an error about password verification failing
```

## Solution 1: Run the Fix Script (Recommended)

1. SSH into your production server
2. Copy the fix script:
```bash
cd /opt/printer.online
sudo docker cp admin/backend/fix_admin_production.py printer_admin_backend:/app/
```

3. Run the fix script inside the admin container:
```bash
sudo docker exec -it printer_admin_backend python /app/fix_admin_production.py
```

4. Follow the prompts to set a new password for the admin user

## Solution 2: Manual Database Fix

If the script doesn't work, fix it manually:

1. Access the database:
```bash
sudo docker exec -it printer_postgres psql -U printer_user -d printer_db
```

2. Check the admin user:
```sql
SELECT id, username, password_hash, is_admin, is_active
FROM users
WHERE username = 'admin';
```

3. Update with a bcrypt hash for password "admin123":
```sql
UPDATE users
SET password_hash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY.A3DIgpXB1dH2',
    is_admin = true,
    is_active = true
WHERE username = 'admin';
```

4. Exit psql:
```sql
\q
```

## Solution 3: Docker Exec Command (Quickest)

Run this single command on your production server:
```bash
sudo docker exec printer_admin_backend python -c "
from sqlalchemy import create_engine, text
from passlib.context import CryptContext
import os

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
DATABASE_URL = os.environ.get('DATABASE_URL')
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    hash = pwd_context.hash('admin123')
    result = conn.execute(
        text('UPDATE users SET password_hash = :hash, is_admin = true, is_active = true WHERE username = :user'),
        {'hash': hash, 'user': 'admin'}
    )
    conn.commit()
    if result.rowcount > 0:
        print('✅ Admin password reset to: admin123')
    else:
        conn.execute(
            text('INSERT INTO users (username, password_hash, is_admin, is_active, created_at) VALUES (:user, :hash, true, true, NOW())'),
            {'user': 'admin', 'hash': hash}
        )
        conn.commit()
        print('✅ Admin user created with password: admin123')
"
```

## After Fixing

1. Try logging in at https://goallsy.com/admin with:
   - Username: `admin`
   - Password: `admin123` (or whatever you set)

2. **IMPORTANT**: Change the password immediately after first login!

## Prevention for Future Deployments

The install.sh script has been updated to handle this, but if you encounter this again:

1. Always use the same password hashing library across all services
2. Or maintain separate admin users for different services
3. Consider using a centralized authentication service

## Still Not Working?

If you still get 500 errors after fixing the password:

1. Check if the admin backend can connect to the database:
```bash
sudo docker exec printer_admin_backend python -c "
import os
from sqlalchemy import create_engine
engine = create_engine(os.environ.get('DATABASE_URL'))
with engine.connect() as conn:
    result = conn.execute('SELECT 1')
    print('✅ Database connection successful')
"
```

2. Check environment variables:
```bash
sudo docker exec printer_admin_backend env | grep -E 'DATABASE_URL|SECRET_KEY'
```

3. Restart the admin backend:
```bash
sudo docker compose -f docker-compose.prod.yml restart admin_backend
```

4. Check detailed logs:
```bash
sudo docker logs printer_admin_backend --tail 100 -f
```

Look for specific error messages about database connections, missing tables, or import errors.