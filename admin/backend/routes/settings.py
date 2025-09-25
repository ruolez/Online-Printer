from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict, Any
import json

from database import get_db
import models
from auth import get_current_admin, log_admin_action

router = APIRouter()

class SystemSettingsUpdate(BaseModel):
    settings: Dict[str, Any]

@router.get("")
async def get_system_settings(
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all system settings"""

    settings = db.query(models.SystemSettings).all()

    settings_dict = {}
    for setting in settings:
        settings_dict[setting.key] = {
            "value": setting.value,
            "description": setting.description,
            "updated_at": setting.updated_at.isoformat() if setting.updated_at else None
        }

    # Add default settings if not in database
    defaults = {
        "max_file_size_mb": {"value": 10, "description": "Maximum file size for uploads (MB)"},
        "allowed_file_types": {"value": ["pdf"], "description": "Allowed file types for upload"},
        "session_timeout_minutes": {"value": 1440, "description": "User session timeout (minutes)"},
        "maintenance_mode": {"value": False, "description": "Enable maintenance mode"},
        "allow_registration": {"value": True, "description": "Allow new user registrations"},
        "default_print_copies": {"value": 1, "description": "Default number of print copies"},
        "station_heartbeat_timeout": {"value": 300, "description": "Station heartbeat timeout (seconds)"},
        "enable_auto_print": {"value": False, "description": "Enable auto-print for new users"}
    }

    for key, default_val in defaults.items():
        if key not in settings_dict:
            settings_dict[key] = default_val

    return settings_dict

@router.put("")
async def update_system_settings(
    update_data: SystemSettingsUpdate,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update system settings"""

    for key, value in update_data.settings.items():
        setting = db.query(models.SystemSettings).filter(
            models.SystemSettings.key == key
        ).first()

        if setting:
            setting.value = value
            setting.updated_by = current_admin.id
        else:
            setting = models.SystemSettings(
                key=key,
                value=value,
                updated_by=current_admin.id
            )
            db.add(setting)

    db.commit()

    # Log action
    log_admin_action(
        db, current_admin.id, "SETTINGS_UPDATE",
        {"settings": update_data.settings},
        request
    )

    return {"message": "Settings updated successfully"}

@router.get("/features")
async def get_feature_flags(
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get feature flags"""

    features = db.query(models.SystemSettings).filter(
        models.SystemSettings.key.like("feature_%")
    ).all()

    feature_flags = {}
    for feature in features:
        feature_flags[feature.key.replace("feature_", "")] = {
            "enabled": feature.value,
            "description": feature.description
        }

    # Default features
    default_features = {
        "auto_print": {"enabled": True, "description": "Auto-print functionality"},
        "remote_printing": {"enabled": True, "description": "Remote printer stations"},
        "file_preview": {"enabled": True, "description": "PDF file preview"},
        "bulk_operations": {"enabled": True, "description": "Bulk file operations"}
    }

    for key, default in default_features.items():
        if key not in feature_flags:
            feature_flags[key] = default

    return feature_flags

@router.put("/features")
async def update_feature_flags(
    features: Dict[str, bool],
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update feature flags"""

    for feature, enabled in features.items():
        key = f"feature_{feature}"
        setting = db.query(models.SystemSettings).filter(
            models.SystemSettings.key == key
        ).first()

        if setting:
            setting.value = enabled
            setting.updated_by = current_admin.id
        else:
            setting = models.SystemSettings(
                key=key,
                value=enabled,
                updated_by=current_admin.id
            )
            db.add(setting)

    db.commit()

    # Log action
    log_admin_action(
        db, current_admin.id, "FEATURE_FLAGS_UPDATE",
        {"features": features},
        request
    )

    return {"message": "Feature flags updated successfully"}