# Fix for 502 Bad Gateway Error - Admin Login

## The Problem
When accessing `https://goallsy.com/admin/api/auth/login`, nginx was returning a 502 Bad Gateway error.

## Root Cause
The nginx configuration had a conflict between the `proxy_pass` directive with a trailing slash and a `rewrite` rule. This caused malformed requests to be sent to the admin backend.

### The Problematic Configuration:
```nginx
location /admin/api/ {
    proxy_pass http://admin_backend/;
    rewrite ^/admin/api/(.*)$ /$1 break;  # THIS WAS THE PROBLEM
}
```

When nginx processes `/admin/api/auth/login`:
1. The location matches `/admin/api/`
2. The rewrite rule changes it to `/auth/login`
3. But proxy_pass with trailing slash ALSO strips `/admin/api/`
4. Result: The backend receives a malformed/empty request → 502 error

## The Solution
Remove the conflicting `rewrite` rule and let `proxy_pass` with trailing slash handle the path rewriting:

```nginx
location /admin/api/ {
    proxy_pass http://admin_backend/;
    # No rewrite rule needed - proxy_pass with trailing slash handles it
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## How to Apply the Fix on Your Production Server

### Option 1: Quick Fix (Manual)
1. SSH into your production server
2. Edit the nginx configuration:
   ```bash
   sudo nano /opt/printer.online/nginx/nginx.current.conf
   ```
3. Find the `/admin/api/` location block (around line 691)
4. Remove the line: `rewrite ^/admin/api/(.*)$ /$1 break;`
5. Save the file
6. Restart nginx:
   ```bash
   cd /opt/printer.online
   sudo docker compose -f docker-compose.prod.yml restart nginx
   ```

### Option 2: Full Update (Recommended)
1. SSH into your production server
2. Pull the latest changes:
   ```bash
   cd /opt/printer.online
   git pull origin main
   ```
3. Restart nginx to apply the new configuration:
   ```bash
   sudo docker compose -f docker-compose.prod.yml restart nginx
   ```

### Option 3: Fresh Installation
If you want to completely reinstall with all fixes:
1. SSH into your production server
2. Run the updated install script:
   ```bash
   cd /opt/printer.online
   sudo ./install.sh
   ```
   Choose option 2 (Update existing installation) when prompted

## Verification
After applying the fix, test the admin login:
1. Go to https://goallsy.com/admin
2. Login with credentials:
   - Username: admin
   - Password: admin123 (or whatever you changed it to)
3. Check browser console - should see successful 200 response for `/admin/api/auth/login`

## Additional Fixes Included
- Added `uploads` volume to admin_backend in docker-compose.prod.yml
- Ensured CORS_ORIGINS is properly set in production
- Fixed password hashing compatibility between Flask and FastAPI

## Files Changed
- `install.sh` - Fixed nginx configurations (both HTTP and HTTPS)
- `docker-compose.prod.yml` - Added uploads volume to admin_backend
- `admin/backend/fix_admin_user.py` - Script to fix password hash compatibility