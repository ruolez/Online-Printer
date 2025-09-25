from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional
from pydantic import BaseModel
import os
import shutil

from database import get_db
import models
from auth import get_current_admin, log_admin_action

router = APIRouter()

class FileCleanup(BaseModel):
    days_old: int = 30
    status_filter: Optional[str] = None  # pending, failed, completed

@router.get("")
async def get_files(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=100),
    user_id: Optional[int] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = Query("uploaded_at", pattern="^(id|filename|file_size|uploaded_at|status)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all files with filters"""

    query = db.query(models.UploadedFile)

    # Apply filters
    if user_id:
        query = query.filter(models.UploadedFile.user_id == user_id)

    if status:
        query = query.filter(models.UploadedFile.status == status)

    if search:
        query = query.filter(
            or_(
                models.UploadedFile.original_filename.contains(search),
                models.UploadedFile.id == int(search) if search.isdigit() else False
            )
        )

    # Get total count
    total = query.count()

    # Apply sorting
    sort_column = getattr(models.UploadedFile, sort_by)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column)

    # Apply pagination
    files = query.offset(skip).limit(limit).all()

    # Format response
    file_list = []
    for file in files:
        file_list.append({
            "id": file.id,
            "user_id": file.user_id,
            "username": file.owner.username,
            "filename": file.original_filename,
            "size": file.file_size,
            "size_mb": round(file.file_size / (1024 * 1024), 2),
            "status": file.status,
            "mime_type": file.mime_type,
            "uploaded_at": file.uploaded_at.isoformat(),
            "processed_at": file.processed_at.isoformat() if file.processed_at else None
        })

    return {
        "files": file_list,
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.get("/stats")
async def get_storage_stats(
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get storage statistics"""

    # Total storage used
    total_storage = db.query(func.sum(models.UploadedFile.file_size)).scalar() or 0

    # Storage by user
    user_storage = db.query(
        models.User.username,
        models.User.id,
        func.sum(models.UploadedFile.file_size).label("total_size"),
        func.count(models.UploadedFile.id).label("file_count")
    ).join(
        models.UploadedFile, models.User.id == models.UploadedFile.user_id
    ).group_by(models.User.id).order_by(func.sum(models.UploadedFile.file_size).desc()).limit(10).all()

    # File type distribution
    type_stats = db.query(
        models.UploadedFile.mime_type,
        func.count(models.UploadedFile.id).label("count"),
        func.sum(models.UploadedFile.file_size).label("total_size")
    ).group_by(models.UploadedFile.mime_type).all()

    # Status distribution
    status_stats = db.query(
        models.UploadedFile.status,
        func.count(models.UploadedFile.id).label("count")
    ).group_by(models.UploadedFile.status).all()

    # Average file size
    avg_size = db.query(func.avg(models.UploadedFile.file_size)).scalar() or 0

    return {
        "total": {
            "storage_bytes": total_storage,
            "storage_mb": round(total_storage / (1024 * 1024), 2),
            "storage_gb": round(total_storage / (1024 * 1024 * 1024), 2),
            "file_count": db.query(models.UploadedFile).count()
        },
        "by_user": [
            {
                "user_id": user.id,
                "username": user.username,
                "file_count": user.file_count,
                "storage_bytes": user.total_size or 0,
                "storage_mb": round((user.total_size or 0) / (1024 * 1024), 2)
            } for user in user_storage
        ],
        "by_type": [
            {
                "mime_type": type_stat.mime_type,
                "count": type_stat.count,
                "total_size": type_stat.total_size or 0,
                "size_mb": round((type_stat.total_size or 0) / (1024 * 1024), 2)
            } for type_stat in type_stats
        ],
        "by_status": [
            {
                "status": status_stat.status,
                "count": status_stat.count
            } for status_stat in status_stats
        ],
        "average_size": {
            "bytes": avg_size,
            "mb": round(avg_size / (1024 * 1024), 2)
        }
    }

@router.get("/{file_id}")
async def get_file_details(
    file_id: int,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get detailed file information"""

    file = db.query(models.UploadedFile).filter(
        models.UploadedFile.id == file_id
    ).first()

    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    # Get print jobs for this file
    print_jobs = db.query(models.PrintQueue).filter(
        models.PrintQueue.file_id == file_id
    ).all()

    return {
        "file": {
            "id": file.id,
            "user_id": file.user_id,
            "username": file.owner.username,
            "filename": file.original_filename,
            "stored_filename": file.filename,
            "size": file.file_size,
            "size_mb": round(file.file_size / (1024 * 1024), 2),
            "hash": file.file_hash,
            "mime_type": file.mime_type,
            "status": file.status,
            "uploaded_at": file.uploaded_at.isoformat(),
            "processed_at": file.processed_at.isoformat() if file.processed_at else None,
            "error_message": file.error_message
        },
        "print_jobs": [
            {
                "id": job.id,
                "status": job.status,
                "station": job.station.station_name if job.station else "Local",
                "created_at": job.created_at.isoformat(),
                "printed_at": job.printed_at.isoformat() if job.printed_at else None
            } for job in print_jobs
        ]
    }

@router.get("/{file_id}/download")
async def download_file(
    file_id: int,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Download a file"""

    file = db.query(models.UploadedFile).filter(
        models.UploadedFile.id == file_id
    ).first()

    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = f"/app/uploads/{file.user_id}/{file.filename}"

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        file_path,
        filename=file.original_filename,
        media_type=file.mime_type
    )

@router.delete("/{file_id}")
async def delete_file(
    file_id: int,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a file and related print jobs"""

    file = db.query(models.UploadedFile).filter(
        models.UploadedFile.id == file_id
    ).first()

    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    # Store file info for logging
    file_info = {
        "file_id": file.id,
        "filename": file.original_filename,
        "user_id": file.user_id
    }

    # Delete from disk
    file_path = f"/app/uploads/{file.user_id}/{file.filename}"
    if os.path.exists(file_path):
        os.remove(file_path)

    # Delete from database (cascades to print_queue)
    db.delete(file)
    db.commit()

    # Log action
    log_admin_action(db, current_admin.id, "FILE_DELETE", file_info, request)

    return {"message": "File deleted successfully"}

@router.post("/cleanup")
async def cleanup_old_files(
    cleanup_data: FileCleanup,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Cleanup old files based on criteria"""

    from datetime import timedelta, datetime

    cutoff_date = datetime.utcnow() - timedelta(days=cleanup_data.days_old)

    query = db.query(models.UploadedFile).filter(
        models.UploadedFile.uploaded_at < cutoff_date
    )

    if cleanup_data.status_filter:
        query = query.filter(models.UploadedFile.status == cleanup_data.status_filter)

    files_to_delete = query.all()

    deleted_count = 0
    deleted_size = 0

    for file in files_to_delete:
        # Delete from disk
        file_path = f"/app/uploads/{file.user_id}/{file.filename}"
        if os.path.exists(file_path):
            deleted_size += file.file_size
            os.remove(file_path)

        # Delete from database
        db.delete(file)
        deleted_count += 1

    db.commit()

    # Log action
    log_admin_action(
        db, current_admin.id, "FILE_CLEANUP",
        {
            "days_old": cleanup_data.days_old,
            "status_filter": cleanup_data.status_filter,
            "deleted_count": deleted_count,
            "deleted_size_mb": round(deleted_size / (1024 * 1024), 2)
        },
        request
    )

    return {
        "message": "Cleanup completed successfully",
        "deleted_count": deleted_count,
        "deleted_size_bytes": deleted_size,
        "deleted_size_mb": round(deleted_size / (1024 * 1024), 2)
    }