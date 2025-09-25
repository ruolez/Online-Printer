from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

from database import get_db
import models
from auth import get_current_admin, log_admin_action

router = APIRouter()

class QueueUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[int] = None

class BulkQueueOperation(BaseModel):
    job_ids: List[int]
    operation: str  # cancel, requeue, delete

@router.get("")
async def get_print_queue(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=100),
    user_id: Optional[int] = None,
    station_id: Optional[int] = None,
    status: Optional[str] = None,
    sort_by: str = Query("created_at", pattern="^(id|created_at|status)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all print jobs with filters"""

    query = db.query(models.PrintQueue)

    # Apply filters
    if user_id:
        query = query.filter(models.PrintQueue.user_id == user_id)

    if station_id:
        query = query.filter(models.PrintQueue.station_id == station_id)

    if status:
        query = query.filter(models.PrintQueue.status == status)

    # Get total count
    total = query.count()

    # Apply sorting
    sort_column = getattr(models.PrintQueue, sort_by)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column)

    # Apply pagination
    jobs = query.offset(skip).limit(limit).all()

    # Format response
    job_list = []
    for job in jobs:
        job_list.append({
            "id": job.id,
            "user_id": job.user_id,
            "username": job.user.username,
            "file_id": job.file_id,
            "filename": job.file.original_filename if job.file else None,
            "station_id": job.station_id,
            "station_name": job.station.station_name if job.station else "Local",
            "status": job.status,
            "created_at": job.created_at.isoformat(),
            "printed_at": job.printed_at.isoformat() if job.printed_at else None,
            "error_message": job.error_message
        })

    return {
        "jobs": job_list,
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.get("/stations")
async def get_all_stations(
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all printer stations"""

    stations = db.query(models.PrinterStation).all()

    station_list = []
    for station in stations:
        # Get pending jobs count
        pending_jobs = db.query(models.PrintQueue).filter(
            models.PrintQueue.station_id == station.id,
            models.PrintQueue.status == "pending"
        ).count()

        station_list.append({
            "id": station.id,
            "user_id": station.user_id,
            "username": station.user.username,
            "name": station.station_name,
            "location": station.station_location,
            "status": station.status,
            "is_active": station.is_active,
            "pending_jobs": pending_jobs,
            "capabilities": station.capabilities,
            "last_heartbeat": station.last_heartbeat.isoformat() if station.last_heartbeat else None,
            "created_at": station.created_at.isoformat()
        })

    return station_list

@router.put("/stations/{station_id}")
async def update_station(
    station_id: int,
    update_data: dict,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update printer station"""

    station = db.query(models.PrinterStation).filter(
        models.PrinterStation.id == station_id
    ).first()

    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    # Update fields
    if "status" in update_data:
        station.status = update_data["status"]

    if "is_active" in update_data:
        station.is_active = update_data["is_active"]

    if "capabilities" in update_data:
        station.capabilities = update_data["capabilities"]

    db.commit()

    # Log action
    log_admin_action(
        db, current_admin.id, "STATION_UPDATE",
        {"station_id": station_id, "updates": update_data},
        request
    )

    return {"message": "Station updated successfully"}

@router.put("/{job_id}")
async def update_print_job(
    job_id: int,
    update_data: QueueUpdate,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update print job status"""

    job = db.query(models.PrintQueue).filter(
        models.PrintQueue.id == job_id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Print job not found")

    # Update status
    if update_data.status:
        job.status = update_data.status

        if update_data.status == "completed":
            job.printed_at = datetime.utcnow()
        elif update_data.status == "failed":
            job.error_message = "Manually marked as failed by admin"

    db.commit()

    # Log action
    log_admin_action(
        db, current_admin.id, "PRINT_JOB_UPDATE",
        {"job_id": job_id, "new_status": update_data.status},
        request
    )

    return {"message": "Print job updated successfully"}

@router.delete("/{job_id}")
async def delete_print_job(
    job_id: int,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a print job"""

    job = db.query(models.PrintQueue).filter(
        models.PrintQueue.id == job_id
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Print job not found")

    # Store info for logging
    job_info = {
        "job_id": job.id,
        "user_id": job.user_id,
        "filename": job.file.original_filename if job.file else None
    }

    db.delete(job)
    db.commit()

    # Log action
    log_admin_action(db, current_admin.id, "PRINT_JOB_DELETE", job_info, request)

    return {"message": "Print job deleted successfully"}

@router.post("/bulk")
async def bulk_queue_operation(
    operation_data: BulkQueueOperation,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Perform bulk operations on print jobs"""

    jobs = db.query(models.PrintQueue).filter(
        models.PrintQueue.id.in_(operation_data.job_ids)
    ).all()

    if not jobs:
        raise HTTPException(status_code=404, detail="No print jobs found")

    if operation_data.operation == "cancel":
        for job in jobs:
            job.status = "cancelled"
        action = "BULK_CANCEL_JOBS"

    elif operation_data.operation == "requeue":
        for job in jobs:
            job.status = "pending"
            job.error_message = None
        action = "BULK_REQUEUE_JOBS"

    elif operation_data.operation == "delete":
        for job in jobs:
            db.delete(job)
        action = "BULK_DELETE_JOBS"

    else:
        raise HTTPException(status_code=400, detail="Invalid operation")

    db.commit()

    # Log action
    log_admin_action(
        db, current_admin.id, action,
        {"job_ids": operation_data.job_ids, "count": len(jobs)},
        request
    )

    return {
        "message": f"Bulk operation completed successfully",
        "affected_jobs": len(jobs)
    }