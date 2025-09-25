from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from datetime import datetime, timedelta
from typing import Optional

from database import get_db
import models
from auth import get_current_admin

router = APIRouter()

@router.get("/logs")
async def get_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=100),
    admin_id: Optional[int] = None,
    action: Optional[str] = None,
    days: int = Query(7, le=90),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get admin action logs"""

    query = db.query(models.AdminLog)

    # Time filter
    start_date = datetime.utcnow() - timedelta(days=days)
    query = query.filter(models.AdminLog.created_at >= start_date)

    # Apply filters
    if admin_id:
        query = query.filter(models.AdminLog.admin_id == admin_id)

    if action:
        query = query.filter(models.AdminLog.action.contains(action))

    # Get total count
    total = query.count()

    # Order by most recent
    query = query.order_by(models.AdminLog.created_at.desc())

    # Apply pagination
    logs = query.offset(skip).limit(limit).all()

    # Format response
    log_list = []
    for log in logs:
        log_list.append({
            "id": log.id,
            "admin_id": log.admin_id,
            "admin_username": log.admin.username if log.admin else "Unknown",
            "action": log.action,
            "details": log.details,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "created_at": log.created_at.isoformat()
        })

    return {
        "logs": log_list,
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.get("/activity")
async def get_user_activity(
    user_id: Optional[int] = None,
    days: int = Query(7, le=90),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get user activity summary"""

    start_date = datetime.utcnow() - timedelta(days=days)

    # Build activity timeline
    activities = []

    # File uploads
    upload_query = db.query(models.UploadedFile).filter(
        models.UploadedFile.uploaded_at >= start_date
    )
    if user_id:
        upload_query = upload_query.filter(models.UploadedFile.user_id == user_id)

    uploads = upload_query.order_by(models.UploadedFile.uploaded_at.desc()).limit(100).all()

    for upload in uploads:
        activities.append({
            "type": "file_upload",
            "user_id": upload.user_id,
            "username": upload.owner.username,
            "timestamp": upload.uploaded_at.isoformat(),
            "details": {
                "filename": upload.original_filename,
                "size": upload.file_size
            }
        })

    # Print jobs
    print_query = db.query(models.PrintQueue).filter(
        models.PrintQueue.created_at >= start_date
    )
    if user_id:
        print_query = print_query.filter(models.PrintQueue.user_id == user_id)

    print_jobs = print_query.order_by(models.PrintQueue.created_at.desc()).limit(100).all()

    for job in print_jobs:
        activities.append({
            "type": "print_job",
            "user_id": job.user_id,
            "username": job.user.username,
            "timestamp": job.created_at.isoformat(),
            "details": {
                "filename": job.file.original_filename if job.file else None,
                "status": job.status
            }
        })

    # Sort by timestamp
    activities.sort(key=lambda x: x["timestamp"], reverse=True)

    return activities[:100]  # Limit to 100 most recent

@router.get("/security")
async def get_security_events(
    days: int = Query(7, le=90),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get security-related events"""

    start_date = datetime.utcnow() - timedelta(days=days)

    # Failed login attempts
    failed_logins = db.query(models.AdminLog).filter(
        and_(
            models.AdminLog.action == "LOGIN_FAILED",
            models.AdminLog.created_at >= start_date
        )
    ).all()

    # Suspicious activities (multiple failed logins from same IP)
    ip_failures = {}
    for login in failed_logins:
        ip = login.ip_address or "unknown"
        if ip not in ip_failures:
            ip_failures[ip] = []
        ip_failures[ip].append({
            "timestamp": login.created_at.isoformat(),
            "username": login.details.get("username") if login.details else None
        })

    suspicious_ips = {ip: attempts for ip, attempts in ip_failures.items() if len(attempts) >= 3}

    # User suspensions
    suspensions = db.query(models.AdminLog).filter(
        and_(
            models.AdminLog.action.in_(["USER_SUSPEND", "BULK_SUSPEND"]),
            models.AdminLog.created_at >= start_date
        )
    ).all()

    # Password resets
    password_resets = db.query(models.AdminLog).filter(
        and_(
            models.AdminLog.action == "PASSWORD_RESET",
            models.AdminLog.created_at >= start_date
        )
    ).all()

    return {
        "failed_login_count": len(failed_logins),
        "suspicious_ips": suspicious_ips,
        "suspensions": [
            {
                "admin": log.admin.username if log.admin else "Unknown",
                "timestamp": log.created_at.isoformat(),
                "details": log.details
            } for log in suspensions
        ],
        "password_resets": [
            {
                "admin": log.admin.username if log.admin else "Unknown",
                "timestamp": log.created_at.isoformat(),
                "user_id": log.details.get("user_id") if log.details else None
            } for log in password_resets
        ]
    }

@router.post("/search")
async def search_logs(
    search_term: str,
    days: int = Query(30, le=365),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Search audit logs"""

    start_date = datetime.utcnow() - timedelta(days=days)

    # Search in action and details
    logs = db.query(models.AdminLog).filter(
        and_(
            models.AdminLog.created_at >= start_date,
            or_(
                models.AdminLog.action.contains(search_term),
                models.AdminLog.details.cast(String).contains(search_term)
            )
        )
    ).order_by(models.AdminLog.created_at.desc()).limit(100).all()

    results = []
    for log in logs:
        results.append({
            "id": log.id,
            "admin_username": log.admin.username if log.admin else "Unknown",
            "action": log.action,
            "details": log.details,
            "created_at": log.created_at.isoformat()
        })

    return {
        "search_term": search_term,
        "results": results,
        "count": len(results)
    }

from sqlalchemy import String  # Add this import at the top