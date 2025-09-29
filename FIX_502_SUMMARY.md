# Fix for 502/404 Errors - Admin Login

## The Problem
When accessing `https://goallsy.com/admin/api/auth/login`, nginx was returning either:
- 502 Bad Gateway error (with the rewrite rule)
- 404 Not Found error (after removing just the rewrite rule)

## Root Cause
The nginx configuration had TWO issues:
1. A conflict between `proxy_pass` with trailing slash and a `rewrite` rule (caused 502)
2. Missing trailing slash in the location directive (caused 404 after removing rewrite)

### The Problematic Configurations:

**Configuration 1 (causes 502):**
```nginx
location /admin/api {  # Missing trailing slash
    proxy_pass http://admin_backend/;
    rewrite ^/admin/api/(.*)$ /$1 break;  # Conflicts with proxy_pass
}
```

**Configuration 2 (causes 404):**
```nginx
location /admin/api {  # Still missing trailing slash!
    proxy_pass http://admin_backend/;
    # Removed rewrite but location still wrong
}
```

## The Solution
The correct configuration requires BOTH:
1. Trailing slash on the location directive: `/admin/api/`
2. No rewrite rule (let proxy_pass handle path stripping)

```nginx
location /admin/api/ {  # ← Trailing slash is CRITICAL
    proxy_pass http://admin_backend/;
    # No rewrite rule needed - proxy_pass with trailing slash handles it
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

When nginx processes `/admin/api/auth/login` with the correct config:
1. Location `/admin/api/` matches (with trailing slash)
2. Proxy_pass strips `/admin/api/` and appends `auth/login`
3. Backend receives correct request: `/auth/login`

## How to Apply the Fix on Your Production Server

### Option 1: Quick Fix (Manual)
1. SSH into your production server
2. Edit the nginx configuration:
   ```bash
   sudo nano /opt/printer.online/nginx/nginx.current.conf
   ```
3. Find the admin API location block (around line 691)
4. Make sure it looks EXACTLY like this:
   ```nginx
   location /admin/api/ {  # ← Must have trailing slash
       proxy_pass http://admin_backend/;
       # NO rewrite rule should be here
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_buffering off;
   }
   ```
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