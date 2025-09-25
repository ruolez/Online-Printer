from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True)
    username = Column(String(80), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)

    files = relationship('UploadedFile', back_populates='owner', cascade='all, delete-orphan')
    settings = relationship('UserSettings', back_populates='user', uselist=False)
    print_jobs = relationship('PrintQueue', back_populates='user')
    printer_stations = relationship('PrinterStation', back_populates='user')

class UploadedFile(Base):
    __tablename__ = 'uploaded_files'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    file_hash = Column(String(64), nullable=False)
    mime_type = Column(String(100), nullable=False)
    status = Column(String(20), default='pending')
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime)
    error_message = Column(Text)

    owner = relationship('User', back_populates='files')
    print_jobs = relationship('PrintQueue', back_populates='file')

class UserSettings(Base):
    __tablename__ = 'user_settings'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), unique=True, nullable=False)
    max_file_size_mb = Column(Integer, default=10)
    auto_process_files = Column(Boolean, default=True)
    auto_print_enabled = Column(Boolean, default=False)
    print_orientation = Column(String(20), default='portrait')
    print_copies = Column(Integer, default=1)
    last_print_check = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    default_station_id = Column(Integer, ForeignKey('printer_stations.id'))

    user = relationship('User', back_populates='settings')

class PrinterStation(Base):
    __tablename__ = 'printer_stations'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    station_name = Column(String(100), nullable=False)
    station_location = Column(String(255))
    station_token = Column(String(255), unique=True, nullable=False)
    status = Column(String(20), default='offline')
    capabilities = Column(JSON, default=dict)
    is_active = Column(Boolean, default=True)
    last_heartbeat = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship('User', back_populates='printer_stations')
    print_jobs = relationship('PrintQueue', back_populates='station')
    sessions = relationship('StationSession', back_populates='station', cascade='all, delete-orphan')

class StationSession(Base):
    __tablename__ = 'station_sessions'

    id = Column(Integer, primary_key=True)
    station_id = Column(Integer, ForeignKey('printer_stations.id'), nullable=False)
    session_token = Column(String(255), unique=True, nullable=False)
    ip_address = Column(String(45))
    user_agent = Column(Text)
    started_at = Column(DateTime, default=datetime.utcnow)
    last_activity = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)

    station = relationship('PrinterStation', back_populates='sessions')

class PrintQueue(Base):
    __tablename__ = 'print_queue'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    file_id = Column(Integer, ForeignKey('uploaded_files.id'), nullable=False)
    station_id = Column(Integer, ForeignKey('printer_stations.id'), nullable=True)
    status = Column(String(20), default='pending')
    created_at = Column(DateTime, default=datetime.utcnow)
    printed_at = Column(DateTime)
    error_message = Column(Text)

    user = relationship('User', back_populates='print_jobs')
    file = relationship('UploadedFile', back_populates='print_jobs')
    station = relationship('PrinterStation', back_populates='print_jobs')

class AdminLog(Base):
    __tablename__ = 'admin_logs'

    id = Column(Integer, primary_key=True)
    admin_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    action = Column(String(100), nullable=False)
    details = Column(JSON)
    ip_address = Column(String(45))
    user_agent = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    admin = relationship('User', foreign_keys=[admin_id])

class SystemSettings(Base):
    __tablename__ = 'system_settings'

    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(JSON)
    description = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(Integer, ForeignKey('users.id'))