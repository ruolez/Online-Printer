from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from typing import Optional

from database import get_db
import models
from auth import get_current_admin

router = APIRouter()

@router.get("/users")
async def get_user_analytics(
    days: int = Query(30, le=365),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get user analytics"""

    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)

    # User growth
    growth_data = []
    for i in range(0, days, max(1, days // 30)):  # Sample up to 30 points
        current_date = start_date + timedelta(days=i)
        user_count = db.query(func.count(models.User.id)).filter(
            models.User.created_at <= current_date
        ).scalar()

        growth_data.append({
            "date": current_date.strftime("%Y-%m-%d"),
            "total_users": user_count
        })

    # Active users (users who uploaded files in period)
    active_users = db.query(func.count(func.distinct(models.UploadedFile.user_id))).filter(
        models.UploadedFile.uploaded_at >= start_date
    ).scalar()

    # User retention (users who uploaded in both first and last week)
    first_week_end = start_date + timedelta(days=7)
    last_week_start = end_date - timedelta(days=7)

    first_week_users = db.query(models.UploadedFile.user_id).filter(
        and_(
            models.UploadedFile.uploaded_at >= start_date,
            models.UploadedFile.uploaded_at <= first_week_end
        )
    ).distinct().subquery()

    retained_users = db.query(func.count(func.distinct(models.UploadedFile.user_id))).filter(
        and_(
            models.UploadedFile.user_id.in_(first_week_users),
            models.UploadedFile.uploaded_at >= last_week_start
        )
    ).scalar()

    total_users = db.query(func.count(models.User.id)).scalar()

    return {
        "growth": growth_data,
        "summary": {
            "total_users": total_users,
            "new_users": db.query(func.count(models.User.id)).filter(
                models.User.created_at >= start_date
            ).scalar(),
            "active_users": active_users,
            "retention_rate": (retained_users / max(1, active_users)) * 100 if active_users else 0
        }
    }

@router.get("/system")
async def get_system_analytics(
    days: int = Query(30, le=365),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get system analytics"""

    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)

    # File upload trends
    upload_data = []
    for i in range(0, days, max(1, days // 30)):
        current_date = start_date + timedelta(days=i)
        next_date = current_date + timedelta(days=1)

        uploads = db.query(func.count(models.UploadedFile.id)).filter(
            and_(
                models.UploadedFile.uploaded_at >= current_date,
                models.UploadedFile.uploaded_at < next_date
            )
        ).scalar()

        upload_data.append({
            "date": current_date.strftime("%Y-%m-%d"),
            "uploads": uploads
        })

    # Print job statistics
    total_jobs = db.query(func.count(models.PrintQueue.id)).filter(
        models.PrintQueue.created_at >= start_date
    ).scalar()

    completed_jobs = db.query(func.count(models.PrintQueue.id)).filter(
        and_(
            models.PrintQueue.created_at >= start_date,
            models.PrintQueue.status == "completed"
        )
    ).scalar()

    failed_jobs = db.query(func.count(models.PrintQueue.id)).filter(
        and_(
            models.PrintQueue.created_at >= start_date,
            models.PrintQueue.status == "failed"
        )
    ).scalar()

    # Storage growth
    storage_growth = []
    for i in range(0, days, max(1, days // 10)):
        current_date = start_date + timedelta(days=i)

        total_storage = db.query(func.sum(models.UploadedFile.file_size)).filter(
            models.UploadedFile.uploaded_at <= current_date
        ).scalar() or 0

        storage_growth.append({
            "date": current_date.strftime("%Y-%m-%d"),
            "storage_mb": round(total_storage / (1024 * 1024), 2)
        })

    return {
        "uploads": upload_data,
        "print_jobs": {
            "total": total_jobs,
            "completed": completed_jobs,
            "failed": failed_jobs,
            "success_rate": (completed_jobs / max(1, total_jobs)) * 100
        },
        "storage_growth": storage_growth
    }

@router.post("/export")
async def export_analytics(
    report_type: str = Query(..., pattern="^(users|system|full)$"),
    format: str = Query("csv", pattern="^(csv|json)$"),
    days: int = Query(30, le=365),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Export analytics data"""

    import csv
    import io
    from fastapi.responses import StreamingResponse

    # Gather data based on report type
    data = {}

    if report_type in ["users", "full"]:
        user_data = await get_user_analytics(days, current_admin, db)
        data["users"] = user_data

    if report_type in ["system", "full"]:
        system_data = await get_system_analytics(days, current_admin, db)
        data["system"] = system_data

    if format == "json":
        return data

    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # Write headers and data based on report type
    if "users" in data:
        writer.writerow(["User Analytics"])
        writer.writerow(["Date", "Total Users"])
        for row in data["users"]["growth"]:
            writer.writerow([row["date"], row["total_users"]])
        writer.writerow([])

    if "system" in data:
        writer.writerow(["System Analytics"])
        writer.writerow(["Date", "Uploads"])
        for row in data["system"]["uploads"]:
            writer.writerow([row["date"], row["uploads"]])

    output.seek(0)

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=analytics_{report_type}_{datetime.now().strftime('%Y%m%d')}.csv"}
    )