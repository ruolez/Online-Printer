from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
from typing import Optional, List
from pydantic import BaseModel
import json

from database import get_db, engine
import models
from auth import get_current_admin, log_admin_action

router = APIRouter()

class SQLQuery(BaseModel):
    query: str
    limit: Optional[int] = 100

class BackupRequest(BaseModel):
    include_data: bool = True

@router.get("/tables")
async def get_tables(
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get list of database tables with information"""

    inspector = inspect(engine)
    tables = []

    for table_name in inspector.get_table_names():
        columns = inspector.get_columns(table_name)
        row_count = db.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar()

        tables.append({
            "name": table_name,
            "column_count": len(columns),
            "row_count": row_count,
            "columns": [
                {
                    "name": col["name"],
                    "type": str(col["type"]),
                    "nullable": col["nullable"]
                } for col in columns
            ]
        })

    return tables

@router.get("/tables/{table_name}")
async def get_table_data(
    table_name: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get data from specific table"""

    # Validate table exists
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        raise HTTPException(status_code=404, detail="Table not found")

    # Get columns
    columns = inspector.get_columns(table_name)

    # Get total count
    total = db.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar()

    # Get data with pagination
    query = f"SELECT * FROM {table_name} LIMIT :limit OFFSET :skip"
    result = db.execute(text(query), {"limit": limit, "skip": skip})

    rows = []
    for row in result:
        rows.append(dict(row._mapping))

    return {
        "table": table_name,
        "columns": [col["name"] for col in columns],
        "rows": rows,
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.post("/query")
async def execute_query(
    query_data: SQLQuery,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Execute SQL query with safety checks"""

    query = query_data.query.strip().upper()

    # Safety checks - prevent destructive operations
    dangerous_keywords = ["DROP", "TRUNCATE", "ALTER", "CREATE", "GRANT", "REVOKE"]
    for keyword in dangerous_keywords:
        if keyword in query:
            raise HTTPException(
                status_code=400,
                detail=f"Query contains dangerous operation: {keyword}"
            )

    # Warn about DELETE/UPDATE without WHERE
    if ("DELETE" in query or "UPDATE" in query) and "WHERE" not in query:
        raise HTTPException(
            status_code=400,
            detail="DELETE/UPDATE queries must include WHERE clause"
        )

    try:
        # Execute query
        result = db.execute(text(query_data.query))

        # Log the query
        log_admin_action(
            db, current_admin.id, "SQL_QUERY",
            {"query": query_data.query[:500]},  # Truncate long queries
            request
        )

        # Format results
        if result.returns_rows:
            rows = []
            for row in result:
                rows.append(dict(row._mapping))

            return {
                "success": True,
                "row_count": len(rows),
                "rows": rows[:query_data.limit] if query_data.limit else rows
            }
        else:
            db.commit()
            return {
                "success": True,
                "affected_rows": result.rowcount
            }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/metrics")
async def get_database_metrics(
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get database performance metrics"""

    metrics = {}

    # Table sizes
    table_sizes = db.execute(text("""
        SELECT
            schemaname,
            tablename,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
            pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    """)).fetchall()

    metrics["table_sizes"] = [
        {
            "table": row.tablename,
            "size": row.size,
            "size_bytes": row.size_bytes
        } for row in table_sizes
    ]

    # Database size
    db_size = db.execute(text("""
        SELECT pg_database_size(current_database()) as size,
               pg_size_pretty(pg_database_size(current_database())) as size_pretty
    """)).fetchone()

    metrics["database_size"] = {
        "size_bytes": db_size.size,
        "size_pretty": db_size.size_pretty
    }

    # Connection stats
    conn_stats = db.execute(text("""
        SELECT count(*) as total,
               count(*) FILTER (WHERE state = 'active') as active,
               count(*) FILTER (WHERE state = 'idle') as idle
        FROM pg_stat_activity
        WHERE datname = current_database()
    """)).fetchone()

    metrics["connections"] = {
        "total": conn_stats.total,
        "active": conn_stats.active,
        "idle": conn_stats.idle
    }

    return metrics

@router.post("/backup")
async def create_backup(
    backup_request: BackupRequest,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create database backup"""

    import subprocess
    from datetime import datetime
    import os

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{timestamp}.sql"
    filepath = f"/app/backups/{filename}"

    # Create backups directory if it doesn't exist
    os.makedirs("/app/backups", exist_ok=True)

    try:
        # Use pg_dump to create backup
        env = os.environ.copy()
        env["PGPASSWORD"] = "webapp_password"

        cmd = [
            "pg_dump",
            "-h", "postgres",
            "-U", "webapp_user",
            "-d", "webapp",
            "-f", filepath
        ]

        if not backup_request.include_data:
            cmd.append("--schema-only")

        result = subprocess.run(cmd, env=env, capture_output=True, text=True)

        if result.returncode != 0:
            raise Exception(f"Backup failed: {result.stderr}")

        # Log action
        log_admin_action(
            db, current_admin.id, "DATABASE_BACKUP",
            {"filename": filename, "include_data": backup_request.include_data},
            request
        )

        # Get file size
        file_size = os.path.getsize(filepath)

        return {
            "success": True,
            "filename": filename,
            "size_bytes": file_size,
            "size_pretty": f"{file_size / (1024*1024):.2f} MB"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))