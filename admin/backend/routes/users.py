from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

from database import get_db
import models
from auth import get_current_admin, get_password_hash, log_admin_action

router = APIRouter()

class UserUpdate(BaseModel):
    username: Optional[str] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None
    max_file_size_mb: Optional[int] = None

class PasswordReset(BaseModel):
    new_password: str

class BulkOperation(BaseModel):
    user_ids: List[int]
    operation: str  # suspend, activate, delete

@router.get("")
async def get_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=100),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_admin: Optional[bool] = None,
    sort_by: str = Query("created_at", pattern="^(id|username|created_at|is_active)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get paginated list of users"""

    query = db.query(models.User)

    # Apply filters
    if search:
        query = query.filter(
            or_(
                models.User.username.contains(search),
                models.User.id == int(search) if search.isdigit() else False
            )
        )

    if is_active is not None:
        query = query.filter(models.User.is_active == is_active)

    if is_admin is not None:
        query = query.filter(models.User.is_admin == is_admin)

    # Get total count
    total = query.count()

    # Apply sorting
    sort_column = getattr(models.User, sort_by)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column)

    # Apply pagination
    users = query.offset(skip).limit(limit).all()

    # Format response
    user_list = []
    for user in users:
        # Get user statistics
        file_count = db.query(models.UploadedFile).filter(
            models.UploadedFile.user_id == user.id
        ).count()

        print_count = db.query(models.PrintQueue).filter(
            models.PrintQueue.user_id == user.id
        ).count()

        total_storage = db.query(func.sum(models.UploadedFile.file_size)).filter(
            models.UploadedFile.user_id == user.id
        ).scalar() or 0

        user_list.append({
            "id": user.id,
            "username": user.username,
            "is_active": user.is_active,
            "is_admin": user.is_admin,
            "created_at": user.created_at.isoformat(),
            "stats": {
                "files": file_count,
                "print_jobs": print_count,
                "storage_bytes": total_storage,
                "storage_mb": round(total_storage / (1024 * 1024), 2)
            }
        })

    return {
        "users": user_list,
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.get("/{user_id}")
async def get_user_details(
    user_id: int,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get detailed user information"""

    user = db.query(models.User).filter(models.User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get user settings
    settings = db.query(models.UserSettings).filter(
        models.UserSettings.user_id == user_id
    ).first()

    # Get recent files
    recent_files = db.query(models.UploadedFile).filter(
        models.UploadedFile.user_id == user_id
    ).order_by(models.UploadedFile.uploaded_at.desc()).limit(10).all()

    # Get recent print jobs
    recent_prints = db.query(models.PrintQueue).filter(
        models.PrintQueue.user_id == user_id
    ).order_by(models.PrintQueue.created_at.desc()).limit(10).all()

    # Get printer stations
    stations = db.query(models.PrinterStation).filter(
        models.PrinterStation.user_id == user_id
    ).all()

    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "is_active": user.is_active,
            "is_admin": user.is_admin,
            "created_at": user.created_at.isoformat()
        },
        "settings": {
            "max_file_size_mb": settings.max_file_size_mb if settings else 10,
            "auto_process_files": settings.auto_process_files if settings else True,
            "auto_print_enabled": settings.auto_print_enabled if settings else False,
            "print_orientation": settings.print_orientation if settings else "portrait",
            "print_copies": settings.print_copies if settings else 1
        } if settings else None,
        "recent_files": [
            {
                "id": f.id,
                "filename": f.original_filename,
                "size": f.file_size,
                "status": f.status,
                "uploaded_at": f.uploaded_at.isoformat()
            } for f in recent_files
        ],
        "recent_prints": [
            {
                "id": p.id,
                "filename": p.file.original_filename if p.file else None,
                "status": p.status,
                "created_at": p.created_at.isoformat()
            } for p in recent_prints
        ],
        "printer_stations": [
            {
                "id": s.id,
                "name": s.station_name,
                "location": s.station_location,
                "status": s.status,
                "last_heartbeat": s.last_heartbeat.isoformat() if s.last_heartbeat else None
            } for s in stations
        ]
    }

@router.put("/{user_id}")
async def update_user(
    user_id: int,
    update_data: UserUpdate,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update user information"""

    user = db.query(models.User).filter(models.User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from modifying their own admin status
    if user_id == current_admin.id and update_data.is_admin is not None:
        raise HTTPException(status_code=400, detail="Cannot modify your own admin status")

    # Update user fields
    if update_data.username is not None:
        user.username = update_data.username

    if update_data.is_active is not None:
        user.is_active = update_data.is_active

    if update_data.is_admin is not None:
        user.is_admin = update_data.is_admin

    # Update settings if provided
    if update_data.max_file_size_mb is not None:
        settings = db.query(models.UserSettings).filter(
            models.UserSettings.user_id == user_id
        ).first()

        if settings:
            settings.max_file_size_mb = update_data.max_file_size_mb
        else:
            settings = models.UserSettings(
                user_id=user_id,
                max_file_size_mb=update_data.max_file_size_mb
            )
            db.add(settings)

    db.commit()

    # Log action
    log_admin_action(
        db, current_admin.id, "USER_UPDATE",
        {"user_id": user_id, "updates": update_data.dict(exclude_none=True)},
        request
    )

    return {"message": "User updated successfully"}

@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    password_data: PasswordReset,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Reset user password"""

    user = db.query(models.User).filter(models.User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Hash and update password
    user.password_hash = get_password_hash(password_data.new_password)
    db.commit()

    # Log action
    log_admin_action(
        db, current_admin.id, "PASSWORD_RESET",
        {"user_id": user_id},
        request
    )

    return {"message": "Password reset successfully"}

@router.post("/{user_id}/suspend")
async def suspend_user(
    user_id: int,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Suspend user account"""

    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="Cannot suspend your own account")

    user = db.query(models.User).filter(models.User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = False
    db.commit()

    # Log action
    log_admin_action(
        db, current_admin.id, "USER_SUSPEND",
        {"user_id": user_id},
        request
    )

    return {"message": "User suspended successfully"}

@router.post("/{user_id}/activate")
async def activate_user(
    user_id: int,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Activate user account"""

    user = db.query(models.User).filter(models.User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = True
    db.commit()

    # Log action
    log_admin_action(
        db, current_admin.id, "USER_ACTIVATE",
        {"user_id": user_id},
        request
    )

    return {"message": "User activated successfully"}

@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete user and all associated data"""

    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    user = db.query(models.User).filter(models.User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Delete related records first to avoid foreign key issues
    # Delete printer stations
    db.query(models.PrinterStation).filter(models.PrinterStation.user_id == user_id).delete()

    # Delete print queue entries
    db.query(models.PrintQueue).filter(models.PrintQueue.user_id == user_id).delete()

    # Delete uploaded files
    db.query(models.UploadedFile).filter(models.UploadedFile.user_id == user_id).delete()

    # Delete user settings
    db.query(models.UserSettings).filter(models.UserSettings.user_id == user_id).delete()

    # Now delete the user
    db.delete(user)
    db.commit()

    # Log action
    log_admin_action(
        db, current_admin.id, "USER_DELETE",
        {"user_id": user_id, "username": user.username},
        request
    )

    return {"message": "User deleted successfully"}

@router.post("/bulk")
async def bulk_operation(
    operation_data: BulkOperation,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Perform bulk operations on users"""

    if current_admin.id in operation_data.user_ids:
        raise HTTPException(status_code=400, detail="Cannot perform bulk operations on your own account")

    users = db.query(models.User).filter(
        models.User.id.in_(operation_data.user_ids)
    ).all()

    if not users:
        raise HTTPException(status_code=404, detail="No users found")

    if operation_data.operation == "suspend":
        for user in users:
            user.is_active = False
        action = "BULK_SUSPEND"

    elif operation_data.operation == "activate":
        for user in users:
            user.is_active = True
        action = "BULK_ACTIVATE"

    elif operation_data.operation == "delete":
        for user in users:
            db.delete(user)
        action = "BULK_DELETE"

    else:
        raise HTTPException(status_code=400, detail="Invalid operation")

    db.commit()

    # Log action
    log_admin_action(
        db, current_admin.id, action,
        {"user_ids": operation_data.user_ids, "count": len(users)},
        request
    )

    return {
        "message": f"Bulk operation completed successfully",
        "affected_users": len(users)
    }

from sqlalchemy import func  # Add this import at the top