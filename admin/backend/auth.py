from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
import models
import os
import hashlib
import hmac

SECRET_KEY = os.environ.get('SECRET_KEY', 'admin-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120  # 2 hours for admin

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
    user_id: Optional[int] = None
    is_admin: bool = False

class AdminLogin(BaseModel):
    username: str
    password: str

def verify_werkzeug_password(password: str, password_hash: str) -> bool:
    """Verify a werkzeug-style password hash (compatible with Flask)"""
    if not password_hash:
        return False

    # Handle pbkdf2:sha256:iterations$salt$hash format
    if password_hash.startswith('pbkdf2:sha256:'):
        parts = password_hash.replace('pbkdf2:sha256:', '').split('$')
        if len(parts) != 3:
            return False

        iterations = int(parts[0])
        salt = parts[1]
        hash_value = parts[2]

        # Compute hash
        dk = hashlib.pbkdf2_hmac('sha256',
                                  password.encode('utf-8'),
                                  salt.encode('utf-8'),
                                  iterations)
        # Compare with stored hash
        return hmac.compare_digest(dk.hex(), hash_value)

    return False

def verify_password(plain_password, hashed_password):
    """Verify password - supports both bcrypt (FastAPI) and werkzeug (Flask) formats"""
    if not hashed_password:
        return False

    # Check if it's a werkzeug hash (from Flask)
    if hashed_password.startswith('pbkdf2:'):
        return verify_werkzeug_password(plain_password, hashed_password)

    # Otherwise try bcrypt (from FastAPI/passlib)
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except:
        return False

def get_password_hash(password):
    """Hash a password using bcrypt (FastAPI standard)"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        user_id: int = payload.get("user_id")
        is_admin: bool = payload.get("is_admin", False)

        if username is None or not is_admin:
            raise credentials_exception

        token_data = TokenData(username=username, user_id=user_id, is_admin=is_admin)
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(
        models.User.id == token_data.user_id,
        models.User.is_admin == True,
        models.User.is_active == True
    ).first()

    if user is None:
        raise credentials_exception

    return user

def authenticate_admin(db: Session, username: str, password: str):
    user = db.query(models.User).filter(
        models.User.username == username,
        models.User.is_admin == True,
        models.User.is_active == True
    ).first()

    if not user:
        return False
    if not verify_password(password, user.password_hash):
        return False
    return user

def log_admin_action(db: Session, admin_id: int, action: str, details: dict = None, request: Request = None):
    """Log admin actions for audit trail"""
    log = models.AdminLog(
        admin_id=admin_id,
        action=action,
        details=details or {},
        ip_address=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None
    )
    db.add(log)
    db.commit()
    return log