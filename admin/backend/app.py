from fastapi import FastAPI, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from datetime import datetime, timedelta
import asyncio
import json
import os
from typing import Optional, List

from database import get_db, engine
import models
from auth import (
    authenticate_admin, create_access_token, get_current_admin,
    AdminLogin, Token, get_password_hash, log_admin_action
)

# Import routes
from routes import dashboard, users, database_routes, files, print_queue, settings, analytics, audit

app = FastAPI(title="Printer.Online Admin API", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
app.include_router(users.router, prefix="/users", tags=["Users"])
app.include_router(database_routes.router, prefix="/database", tags=["Database"])
app.include_router(files.router, prefix="/files", tags=["Files"])
app.include_router(print_queue.router, prefix="/print-queue", tags=["Print Queue"])
app.include_router(settings.router, prefix="/settings", tags=["Settings"])
app.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
app.include_router(audit.router, prefix="/audit", tags=["Audit"])

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

@app.on_event("startup")
async def startup_event():
    """Initialize database and create default admin user"""
    with engine.connect() as conn:
        # Create tables if they don't exist
        models.Base.metadata.create_all(bind=engine)

        # Check if admin user exists
        result = conn.execute(
            text("SELECT id FROM users WHERE username = 'admin' AND is_admin = true")
        ).fetchone()

        if not result:
            # Create default admin user
            password_hash = get_password_hash("admin")
            conn.execute(
                text("""
                    INSERT INTO users (username, password_hash, is_admin, is_active, created_at)
                    VALUES (:username, :password_hash, true, true, :created_at)
                """),
                {
                    "username": "admin",
                    "password_hash": password_hash,
                    "created_at": datetime.utcnow()
                }
            )
            conn.commit()
            print("✅ Default admin user created (username: admin, password: admin)")
        else:
            print("✅ Admin user already exists")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

@app.post("/auth/login", response_model=Token)
async def admin_login(
    login_data: AdminLogin,
    request: Request,
    db: Session = Depends(get_db)
):
    """Admin login endpoint"""
    user = authenticate_admin(db, login_data.username, login_data.password)

    if not user:
        # Log failed attempt
        log_admin_action(
            db, None, "LOGIN_FAILED",
            {"username": login_data.username},
            request
        )
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials or insufficient privileges"
        )

    # Create access token
    access_token = create_access_token(
        data={
            "sub": user.username,
            "user_id": user.id,
            "is_admin": True
        }
    )

    # Log successful login
    log_admin_action(db, user.id, "LOGIN_SUCCESS", {}, request)

    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/logout")
async def admin_logout(
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Admin logout endpoint"""
    log_admin_action(db, current_admin.id, "LOGOUT", {}, request)
    return {"message": "Logged out successfully"}

@app.get("/auth/verify")
async def verify_admin(current_admin: models.User = Depends(get_current_admin)):
    """Verify admin token"""
    return {
        "id": current_admin.id,
        "username": current_admin.username,
        "is_admin": current_admin.is_admin
    }

@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    db: Session = Depends(get_db)
):
    """WebSocket endpoint for real-time updates"""
    await manager.connect(websocket)

    try:
        while True:
            # Send periodic updates
            stats = {
                "type": "stats_update",
                "timestamp": datetime.utcnow().isoformat(),
                "data": {
                    "total_users": db.query(models.User).count(),
                    "total_files": db.query(models.UploadedFile).count(),
                    "active_jobs": db.query(models.PrintQueue).filter(
                        models.PrintQueue.status == "pending"
                    ).count(),
                    "online_stations": db.query(models.PrinterStation).filter(
                        models.PrinterStation.status == "online"
                    ).count()
                }
            }

            await websocket.send_json(stats)
            await asyncio.sleep(5)  # Send updates every 5 seconds

    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Printer.Online Admin API",
        "version": "1.0.0",
        "status": "running"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)