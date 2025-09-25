from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from typing import Optional

from database import get_db
import models
from auth import get_current_admin

router = APIRouter()

@router.get("/stats")
async def get_dashboard_stats(
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get dashboard statistics"""

    # Basic counts
    total_users = db.query(models.User).count()
    total_files = db.query(models.UploadedFile).count()
    total_print_jobs = db.query(models.PrintQueue).count()

    # Calculate storage usage
    total_storage = db.query(func.sum(models.UploadedFile.file_size)).scalar() or 0

    # Active statistics
    active_users = db.query(models.User).filter(models.User.is_active == True).count()
    pending_jobs = db.query(models.PrintQueue).filter(
        models.PrintQueue.status == "pending"
    ).count()

    # Station statistics
    total_stations = db.query(models.PrinterStation).count()
    online_stations = db.query(models.PrinterStation).filter(
        models.PrinterStation.status == "online"
    ).count()

    # Today's statistics
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    today_uploads = db.query(models.UploadedFile).filter(
        models.UploadedFile.uploaded_at >= today_start
    ).count()

    today_prints = db.query(models.PrintQueue).filter(
        models.PrintQueue.created_at >= today_start
    ).count()

    today_registrations = db.query(models.User).filter(
        models.User.created_at >= today_start
    ).count()

    # Failed jobs
    failed_jobs = db.query(models.PrintQueue).filter(
        models.PrintQueue.status == "failed"
    ).count()

    return {
        "overview": {
            "total_users": total_users,
            "active_users": active_users,
            "total_files": total_files,
            "total_print_jobs": total_print_jobs,
            "total_storage_bytes": total_storage,
            "total_storage_mb": round(total_storage / (1024 * 1024), 2)
        },
        "stations": {
            "total": total_stations,
            "online": online_stations,
            "offline": total_stations - online_stations
        },
        "print_queue": {
            "pending": pending_jobs,
            "failed": failed_jobs
        },
        "today": {
            "uploads": today_uploads,
            "prints": today_prints,
            "registrations": today_registrations
        }
    }

@router.get("/activity")
async def get_recent_activity(
    limit: int = Query(20, le=100),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get recent system activity"""

    activities = []

    # Recent uploads
    recent_uploads = db.query(models.UploadedFile).order_by(
        models.UploadedFile.uploaded_at.desc()
    ).limit(5).all()

    for upload in recent_uploads:
        activities.append({
            "type": "upload",
            "timestamp": upload.uploaded_at.isoformat(),
            "user_id": upload.user_id,
            "username": upload.owner.username,
            "details": {
                "filename": upload.original_filename,
                "size": upload.file_size
            }
        })

    # Recent print jobs
    recent_prints = db.query(models.PrintQueue).order_by(
        models.PrintQueue.created_at.desc()
    ).limit(5).all()

    for job in recent_prints:
        activities.append({
            "type": "print",
            "timestamp": job.created_at.isoformat(),
            "user_id": job.user_id,
            "username": job.user.username,
            "details": {
                "filename": job.file.original_filename if job.file else None,
                "status": job.status,
                "station": job.station.station_name if job.station else "Local"
            }
        })

    # Recent registrations
    recent_users = db.query(models.User).order_by(
        models.User.created_at.desc()
    ).limit(5).all()

    for user in recent_users:
        activities.append({
            "type": "registration",
            "timestamp": user.created_at.isoformat(),
            "user_id": user.id,
            "username": user.username,
            "details": {}
        })

    # Sort by timestamp
    activities.sort(key=lambda x: x["timestamp"], reverse=True)

    return activities[:limit]

@router.get("/charts/usage")
async def get_usage_charts(
    days: int = Query(7, le=30),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get usage data for charts"""

    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)

    chart_data = []

    for i in range(days):
        current_date = start_date + timedelta(days=i)
        next_date = current_date + timedelta(days=1)

        # Count uploads for this day
        uploads = db.query(func.count(models.UploadedFile.id)).filter(
            and_(
                models.UploadedFile.uploaded_at >= current_date,
                models.UploadedFile.uploaded_at < next_date
            )
        ).scalar()

        # Count print jobs for this day
        prints = db.query(func.count(models.PrintQueue.id)).filter(
            and_(
                models.PrintQueue.created_at >= current_date,
                models.PrintQueue.created_at < next_date
            )
        ).scalar()

        # Count registrations for this day
        registrations = db.query(func.count(models.User.id)).filter(
            and_(
                models.User.created_at >= current_date,
                models.User.created_at < next_date
            )
        ).scalar()

        chart_data.append({
            "date": current_date.strftime("%Y-%m-%d"),
            "uploads": uploads or 0,
            "prints": prints or 0,
            "registrations": registrations or 0
        })

    return chart_data

@router.get("/health")
async def get_system_health(
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get system health status"""

    health_status = {
        "database": "healthy",
        "storage": "healthy",
        "services": {}
    }

    # Check database connectivity
    try:
        db.execute("SELECT 1")
        health_status["database"] = "healthy"
    except:
        health_status["database"] = "unhealthy"

    # Check storage usage (warning if > 80%)
    total_storage = db.query(func.sum(models.UploadedFile.file_size)).scalar() or 0
    storage_limit = 10 * 1024 * 1024 * 1024  # 10GB limit
    storage_usage_percent = (total_storage / storage_limit) * 100

    if storage_usage_percent > 80:
        health_status["storage"] = "warning"
    elif storage_usage_percent > 95:
        health_status["storage"] = "critical"

    # Check printer station health
    stale_threshold = datetime.utcnow() - timedelta(minutes=5)
    stale_stations = db.query(models.PrinterStation).filter(
        and_(
            models.PrinterStation.status == "online",
            models.PrinterStation.last_heartbeat < stale_threshold
        )
    ).count()

    health_status["services"]["printer_stations"] = {
        "status": "warning" if stale_stations > 0 else "healthy",
        "stale_count": stale_stations
    }

    # Check print queue health
    failed_jobs = db.query(models.PrintQueue).filter(
        models.PrintQueue.status == "failed"
    ).count()

    health_status["services"]["print_queue"] = {
        "status": "warning" if failed_jobs > 10 else "healthy",
        "failed_count": failed_jobs
    }

    return health_status