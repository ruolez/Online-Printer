import os
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import jwt
from datetime import datetime, timedelta
from functools import wraps
import redis
from celery import Celery
import magic
import hashlib
import secrets
import json

app = Flask(__name__)

# CORS configuration - support both development and production
cors_origins = os.environ.get('CORS_ORIGINS', '*').split(',')
CORS(app, origins=cors_origins, supports_credentials=True)

app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key')
app.config['UPLOAD_FOLDER'] = '/app/uploads'
app.config['ALLOWED_EXTENSIONS'] = {'pdf'}

# Redis configuration
redis_client = redis.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379/0'))

# Celery configuration
celery = Celery(
    app.name,
    broker=os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0'),
    backend=os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')
)

# Create upload folder if it doesn't exist
if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

db = SQLAlchemy(app)

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    files = db.relationship('UploadedFile', backref='owner', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def generate_token(self):
        payload = {
            'user_id': self.id,
            'username': self.username,
            'exp': datetime.utcnow() + timedelta(hours=24)
        }
        return jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')

class UploadedFile(db.Model):
    __tablename__ = 'uploaded_files'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    file_size = db.Column(db.Integer, nullable=False)
    file_hash = db.Column(db.String(64), nullable=False)
    mime_type = db.Column(db.String(100), nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending, processing, completed, failed
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    processed_at = db.Column(db.DateTime)
    error_message = db.Column(db.Text)

    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.original_filename,
            'size': self.file_size,
            'status': self.status,
            'uploaded_at': self.uploaded_at.isoformat(),
            'processed_at': self.processed_at.isoformat() if self.processed_at else None,
            'error': self.error_message
        }

class UserSettings(db.Model):
    __tablename__ = 'user_settings'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False)
    max_file_size_mb = db.Column(db.Integer, default=10)  # Max file size in MB
    auto_process_files = db.Column(db.Boolean, default=True)
    # Print settings
    auto_print_enabled = db.Column(db.Boolean, default=False)
    print_orientation = db.Column(db.String(20), default='portrait')  # portrait or landscape
    print_copies = db.Column(db.Integer, default=1)
    last_print_check = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Print settings
    default_station_id = db.Column(db.Integer, db.ForeignKey('printer_stations.id'))

    def to_dict(self):
        return {
            'max_file_size_mb': self.max_file_size_mb,
            'auto_process_files': self.auto_process_files,
            'auto_print_enabled': self.auto_print_enabled,
            'print_orientation': self.print_orientation,
            'print_copies': self.print_copies,
            'default_station_id': self.default_station_id,
            'last_print_check': self.last_print_check.isoformat() if self.last_print_check else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

class PrinterStation(db.Model):
    __tablename__ = 'printer_stations'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    station_name = db.Column(db.String(100), nullable=False)
    station_location = db.Column(db.String(255))
    station_token = db.Column(db.String(255), unique=True, nullable=False)
    status = db.Column(db.String(20), default='offline')  # online, offline, busy
    capabilities = db.Column(db.JSON, default=dict)
    is_active = db.Column(db.Boolean, default=True)
    last_heartbeat = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = db.relationship('User', backref='printer_stations')
    print_jobs = db.relationship('PrintQueue', backref='station', lazy=True)
    sessions = db.relationship('StationSession', backref='station', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'station_name': self.station_name,
            'station_location': self.station_location,
            'status': self.status,
            'capabilities': self.capabilities,
            'is_active': self.is_active,
            'last_heartbeat': self.last_heartbeat.isoformat() if self.last_heartbeat else None,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

class StationSession(db.Model):
    __tablename__ = 'station_sessions'

    id = db.Column(db.Integer, primary_key=True)
    station_id = db.Column(db.Integer, db.ForeignKey('printer_stations.id'), nullable=False)
    session_token = db.Column(db.String(255), unique=True, nullable=False)
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.Text)
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_activity = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            'id': self.id,
            'station_id': self.station_id,
            'session_token': self.session_token,
            'ip_address': self.ip_address,
            'started_at': self.started_at.isoformat(),
            'last_activity': self.last_activity.isoformat(),
            'is_active': self.is_active
        }

class PrintQueue(db.Model):
    __tablename__ = 'print_queue'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    file_id = db.Column(db.Integer, db.ForeignKey('uploaded_files.id'), nullable=False)
    station_id = db.Column(db.Integer, db.ForeignKey('printer_stations.id'), nullable=True)
    status = db.Column(db.String(20), default='pending')  # pending, printing, completed, failed
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    printed_at = db.Column(db.DateTime)
    error_message = db.Column(db.Text)

    # Relationships
    user = db.relationship('User', backref='print_jobs')
    file = db.relationship('UploadedFile', backref='print_jobs')
    # station relationship is defined in PrinterStation model

    def to_dict(self):
        return {
            'id': self.id,
            'file_id': self.file_id,
            'filename': self.file.original_filename if self.file else None,
            'station_id': self.station_id,
            'station_name': self.station.station_name if self.station else None,
            'status': self.status,
            'created_at': self.created_at.isoformat(),
            'printed_at': self.printed_at.isoformat() if self.printed_at else None,
            'error': self.error_message
        }

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')

        if not token:
            return jsonify({'message': 'Token is missing'}), 401

        try:
            if token.startswith('Bearer '):
                token = token.split(' ')[1]

            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            current_user = User.query.get(data['user_id'])

            if not current_user:
                return jsonify({'message': 'Invalid token'}), 401

        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Invalid token'}), 401

        return f(current_user, *args, **kwargs)

    return decorated

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'}), 200

# Admin authentication decorator
def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].replace('Bearer ', '')

        if not token:
            return jsonify({'message': 'Token is missing!'}), 401

        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            # Check if user is admin
            user = User.query.get(data['user_id'])

            if not user:
                return jsonify({'message': 'Invalid token'}), 401

            # Use raw SQL to check admin status directly
            from sqlalchemy import text
            result = db.session.execute(
                text("SELECT is_admin FROM users WHERE id = :id"),
                {'id': user.id}
            ).first()

            if not result or not result[0]:
                return jsonify({'message': 'Admin access required!'}), 403

            request.current_user = user
        except Exception as e:
            print(f"Admin auth error: {e}")
            return jsonify({'message': 'Token is invalid!'}), 401

        return f(*args, **kwargs)
    return decorated

@app.route('/api/admin/check', methods=['GET'])
@admin_required
def admin_check():
    """Check if user is admin"""
    return jsonify({
        'is_admin': True,
        'username': request.current_user.username
    })

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()

    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Username and password are required'}), 400

    username = data['username']
    password = data['password']

    if len(username) < 3:
        return jsonify({'message': 'Username must be at least 3 characters long'}), 400

    if len(password) < 6:
        return jsonify({'message': 'Password must be at least 6 characters long'}), 400

    existing_user = User.query.filter_by(username=username).first()
    if existing_user:
        return jsonify({'message': 'Username already exists'}), 409

    user = User(username=username)
    user.set_password(password)

    try:
        db.session.add(user)
        db.session.commit()

        token = user.generate_token()

        return jsonify({
            'message': 'User created successfully',
            'token': token,
            'username': username
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Error creating user'}), 500

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()

    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Username and password are required'}), 400

    username = data['username']
    password = data['password']

    user = User.query.filter_by(username=username).first()

    if not user or not user.check_password(password):
        return jsonify({'message': 'Invalid username or password'}), 401

    token = user.generate_token()

    return jsonify({
        'message': 'Login successful',
        'token': token,
        'username': username
    }), 200

@app.route('/api/profile', methods=['GET'])
@token_required
def profile(current_user):
    return jsonify({
        'id': current_user.id,
        'username': current_user.username,
        'created_at': current_user.created_at.isoformat()
    }), 200

@app.route('/api/verify', methods=['GET'])
@token_required
def verify_token(current_user):
    return jsonify({
        'valid': True,
        'username': current_user.username
    }), 200

@app.route('/api/refresh-token', methods=['POST'])
@token_required
def refresh_token(current_user):
    # Generate a new token with updated expiration
    new_token = current_user.generate_token()

    return jsonify({
        'token': new_token,
        'username': current_user.username,
        'message': 'Token refreshed successfully'
    }), 200

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def get_file_hash(file_path):
    hash_sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_sha256.update(chunk)
    return hash_sha256.hexdigest()

@celery.task
def process_uploaded_file(file_id):
    with app.app_context():
        uploaded_file = UploadedFile.query.get(file_id)
        if not uploaded_file:
            return

        try:
            uploaded_file.status = 'processing'
            db.session.commit()

            # Simulate processing time (in production, this would be actual PDF processing)
            import time
            time.sleep(2)

            # Update status to completed
            uploaded_file.status = 'completed'
            uploaded_file.processed_at = datetime.utcnow()
            db.session.commit()

            return {'status': 'success', 'file_id': file_id}
        except Exception as e:
            uploaded_file.status = 'failed'
            uploaded_file.error_message = str(e)
            db.session.commit()
            return {'status': 'error', 'message': str(e)}

@app.route('/api/upload', methods=['POST'])
@token_required
def upload_file(current_user):
    if 'file' not in request.files:
        return jsonify({'message': 'No file provided'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'message': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'message': 'Only PDF files are allowed'}), 400

    # Get user settings
    settings = UserSettings.query.filter_by(user_id=current_user.id).first()
    if not settings:
        # Create default settings if they don't exist
        settings = UserSettings(user_id=current_user.id)
        db.session.add(settings)
        db.session.commit()

    # Check file size
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)
    max_size = settings.max_file_size_mb * 1024 * 1024

    if file_size > max_size:
        return jsonify({
            'message': f'File size exceeds maximum allowed size of {settings.max_file_size_mb}MB'
        }), 400

    # Create user directory if it doesn't exist
    user_dir = os.path.join(app.config['UPLOAD_FOLDER'], str(current_user.id))
    if not os.path.exists(user_dir):
        os.makedirs(user_dir)

    # Generate unique filename
    original_filename = secure_filename(file.filename)
    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    unique_filename = f"{timestamp}_{original_filename}"
    file_path = os.path.join(user_dir, unique_filename)

    # Save file
    file.save(file_path)

    # Get file info
    file_size = os.path.getsize(file_path)
    file_hash = get_file_hash(file_path)

    # Check mime type
    mime = magic.Magic(mime=True)
    mime_type = mime.from_file(file_path)

    if mime_type != 'application/pdf':
        os.remove(file_path)
        return jsonify({'message': 'Invalid file type. Only PDF files are allowed'}), 400

    # Create database entry
    uploaded_file = UploadedFile(
        user_id=current_user.id,
        filename=unique_filename,
        original_filename=original_filename,
        file_size=file_size,
        file_hash=file_hash,
        mime_type=mime_type,
        status='completed'  # Set to completed since we're not processing
    )

    try:
        db.session.add(uploaded_file)
        db.session.commit()

        # Since Celery worker is not running, mark as processed immediately
        uploaded_file.processed_at = datetime.utcnow()
        db.session.commit()

        # Note: In production, you would queue for processing here
        # if settings.auto_process_files:
        #     process_uploaded_file.delay(uploaded_file.id)

        return jsonify({
            'message': 'File uploaded successfully',
            'file': uploaded_file.to_dict()
        }), 201
    except Exception as e:
        db.session.rollback()
        if os.path.exists(file_path):
            os.remove(file_path)
        return jsonify({'message': 'Error uploading file'}), 500

@app.route('/api/files', methods=['GET'])
@token_required
def list_files(current_user):
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)

    files = UploadedFile.query.filter_by(user_id=current_user.id)\
                              .order_by(UploadedFile.uploaded_at.desc())\
                              .paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'files': [f.to_dict() for f in files.items],
        'total': files.total,
        'page': page,
        'pages': files.pages,
        'per_page': per_page
    }), 200

@app.route('/api/files/<int:file_id>', methods=['GET'])
@token_required
def get_file(current_user, file_id):
    uploaded_file = UploadedFile.query.filter_by(
        id=file_id,
        user_id=current_user.id
    ).first()

    if not uploaded_file:
        return jsonify({'message': 'File not found'}), 404

    return jsonify(uploaded_file.to_dict()), 200

@app.route('/api/files/<int:file_id>', methods=['DELETE'])
@token_required
def delete_file(current_user, file_id):
    uploaded_file = UploadedFile.query.filter_by(
        id=file_id,
        user_id=current_user.id
    ).first()

    if not uploaded_file:
        return jsonify({'message': 'File not found'}), 404

    # Delete physical file
    file_path = os.path.join(
        app.config['UPLOAD_FOLDER'],
        str(current_user.id),
        uploaded_file.filename
    )

    try:
        # First delete all related print jobs to avoid foreign key constraint
        PrintQueue.query.filter_by(file_id=file_id).delete()

        if os.path.exists(file_path):
            os.remove(file_path)

        db.session.delete(uploaded_file)
        db.session.commit()

        return jsonify({'message': 'File deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting file: {str(e)}")  # Log the actual error
        return jsonify({'message': f'Error deleting file: {str(e)}'}), 500

@app.route('/api/files/<int:file_id>/download', methods=['GET'])
@token_required
def download_file(current_user, file_id):
    uploaded_file = UploadedFile.query.filter_by(
        id=file_id,
        user_id=current_user.id
    ).first()

    if not uploaded_file:
        return jsonify({'message': 'File not found'}), 404

    file_path = os.path.join(
        app.config['UPLOAD_FOLDER'],
        str(current_user.id),
        uploaded_file.filename
    )

    if not os.path.exists(file_path):
        return jsonify({'message': 'File not found on disk'}), 404

    return send_file(
        file_path,
        as_attachment=True,
        download_name=uploaded_file.original_filename,
        mimetype=uploaded_file.mime_type
    )

@app.route('/api/settings', methods=['GET'])
@token_required
def get_settings(current_user):
    settings = UserSettings.query.filter_by(user_id=current_user.id).first()
    if not settings:
        # Create default settings if they don't exist
        settings = UserSettings(user_id=current_user.id)
        db.session.add(settings)
        db.session.commit()

    return jsonify(settings.to_dict()), 200

@app.route('/api/settings', methods=['PUT'])
@token_required
def update_settings(current_user):
    data = request.get_json()

    if not data:
        return jsonify({'message': 'No data provided'}), 400

    settings = UserSettings.query.filter_by(user_id=current_user.id).first()
    if not settings:
        settings = UserSettings(user_id=current_user.id)
        db.session.add(settings)

    # Update settings
    if 'max_file_size_mb' in data:
        max_size = data['max_file_size_mb']
        if not isinstance(max_size, int) or max_size < 1 or max_size > 100:
            return jsonify({'message': 'File size must be between 1 and 100 MB'}), 400
        settings.max_file_size_mb = max_size

    if 'auto_process_files' in data:
        settings.auto_process_files = bool(data['auto_process_files'])

    # Update print settings
    if 'auto_print_enabled' in data:
        settings.auto_print_enabled = bool(data['auto_print_enabled'])

    if 'print_orientation' in data:
        orientation = data['print_orientation']
        if orientation not in ['portrait', 'landscape']:
            return jsonify({'message': 'Print orientation must be portrait or landscape'}), 400
        settings.print_orientation = orientation

    if 'print_copies' in data:
        copies = data['print_copies']
        if not isinstance(copies, int) or copies < 1 or copies > 10:
            return jsonify({'message': 'Print copies must be between 1 and 10'}), 400
        settings.print_copies = copies

    # Update default_station_id
    if 'default_station_id' in data:
        station_id = data['default_station_id']
        if station_id is not None:
            # Verify the station exists and belongs to the user
            station = PrinterStation.query.filter_by(
                id=station_id,
                user_id=current_user.id
            ).first()
            if not station:
                return jsonify({'message': 'Invalid station ID'}), 400
        settings.default_station_id = station_id

    settings.updated_at = datetime.utcnow()

    try:
        db.session.commit()
        return jsonify({
            'message': 'Settings updated successfully',
            'settings': settings.to_dict()
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Error updating settings'}), 500

# Print Queue Endpoints
@app.route('/api/print-queue', methods=['GET'])
@token_required
def get_print_queue(current_user):
    status_filter = request.args.get('status', None)

    query = PrintQueue.query.filter_by(user_id=current_user.id)
    if status_filter:
        query = query.filter_by(status=status_filter)

    print_jobs = query.order_by(PrintQueue.created_at.desc()).limit(20).all()

    return jsonify({
        'print_jobs': [job.to_dict() for job in print_jobs]
    }), 200

@app.route('/api/print-queue/add/<int:file_id>', methods=['POST'])
@token_required
def add_to_print_queue(current_user, file_id):
    data = request.get_json() or {}
    station_id = data.get('station_id', None)

    # Check if file exists and belongs to user
    uploaded_file = UploadedFile.query.filter_by(
        id=file_id,
        user_id=current_user.id
    ).first()

    if not uploaded_file:
        return jsonify({'message': 'File not found'}), 404

    # If station_id provided, verify it exists and belongs to user
    if station_id:
        station = PrinterStation.query.filter_by(
            id=station_id,
            user_id=current_user.id,
            is_active=True
        ).first()
        if not station:
            return jsonify({'message': 'Station not found or inactive'}), 404
    else:
        # Use default station if configured
        settings = UserSettings.query.filter_by(user_id=current_user.id).first()
        if settings and settings.default_station_id:
            station_id = settings.default_station_id

    # Check if already in queue for this station
    existing_job = PrintQueue.query.filter_by(
        user_id=current_user.id,
        file_id=file_id,
        station_id=station_id,
        status='pending'
    ).first()

    if existing_job:
        return jsonify({'message': 'File already in print queue for this station'}), 409

    # Add to print queue
    print_job = PrintQueue(
        user_id=current_user.id,
        file_id=file_id,
        station_id=station_id,
        status='pending'
    )

    try:
        db.session.add(print_job)
        db.session.commit()

        return jsonify({
            'message': 'File added to print queue',
            'print_job': print_job.to_dict()
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Error adding to print queue'}), 500

@app.route('/api/print-queue/<int:job_id>/status', methods=['PUT'])
@token_required
def update_print_job_status(current_user, job_id):
    data = request.get_json()

    if not data or 'status' not in data:
        return jsonify({'message': 'Status is required'}), 400

    new_status = data['status']
    if new_status not in ['pending', 'printing', 'completed', 'failed']:
        return jsonify({'message': 'Invalid status'}), 400

    print_job = PrintQueue.query.filter_by(
        id=job_id,
        user_id=current_user.id
    ).first()

    if not print_job:
        return jsonify({'message': 'Print job not found'}), 404

    print_job.status = new_status

    if new_status == 'completed':
        print_job.printed_at = datetime.utcnow()
    elif new_status == 'failed' and 'error' in data:
        print_job.error_message = data['error']

    try:
        db.session.commit()
        return jsonify({
            'message': 'Print job status updated',
            'print_job': print_job.to_dict()
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Error updating print job status'}), 500

@app.route('/api/print-queue/<int:job_id>', methods=['DELETE'])
@token_required
def remove_from_print_queue(current_user, job_id):
    print_job = PrintQueue.query.filter_by(
        id=job_id,
        user_id=current_user.id
    ).first()

    if not print_job:
        return jsonify({'message': 'Print job not found'}), 404

    try:
        db.session.delete(print_job)
        db.session.commit()
        return jsonify({'message': 'Print job removed from queue'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Error removing print job'}), 500

@app.route('/api/print-queue/next', methods=['GET'])
@token_required
def get_next_print_job(current_user):
    # Get station_id from query params if provided (for printer mode)
    station_id = request.args.get('station_id', type=int)

    # Get user's print settings (we need them for orientation and copies even for stations)
    settings = UserSettings.query.filter_by(user_id=current_user.id).first()

    # For stations, always allow auto-print
    # For regular users, check the auto_print_enabled setting
    if not station_id:
        # Only check auto_print setting for non-station mode
        if not settings or not settings.auto_print_enabled:
            return jsonify({'message': 'Auto-print is disabled'}), 200

    # Build query
    query = PrintQueue.query.filter_by(
        user_id=current_user.id,
        status='pending'
    )

    # Handle station filtering
    # If station_id is provided, get jobs for that station or local jobs (hybrid mode)
    # If no station_id, only get local jobs
    if station_id:
        # Get jobs for this specific station OR local jobs (for hybrid mode)
        from sqlalchemy import or_
        query = query.filter(or_(
            PrintQueue.station_id == station_id,
            PrintQueue.station_id == None
        ))
    else:
        # No station specified, only get local jobs
        query = query.filter_by(station_id=None)

    # Get next pending job
    next_job = query.order_by(PrintQueue.created_at.asc()).first()

    if not next_job:
        return jsonify({'message': 'No pending print jobs'}), 200

    # Update last print check time if settings exist
    if settings:
        settings.last_print_check = datetime.utcnow()
        db.session.commit()

    return jsonify({
        'print_job': next_job.to_dict(),
        'settings': {
            'orientation': settings.print_orientation if settings else 'portrait',
            'copies': settings.print_copies if settings else 1
        }
    }), 200

# Printer Station Endpoints
@app.route('/api/stations/register', methods=['POST'])
@token_required
def register_station(current_user):
    data = request.get_json()

    if not data or not data.get('station_name'):
        return jsonify({'message': 'Station name is required'}), 400

    station_name = data['station_name']
    station_location = data.get('station_location', '')
    capabilities = data.get('capabilities', {})

    # Check if station name already exists for this user
    existing_station = PrinterStation.query.filter_by(
        user_id=current_user.id,
        station_name=station_name
    ).first()

    if existing_station:
        # Reactivate existing station
        existing_station.is_active = True
        existing_station.station_location = station_location
        existing_station.capabilities = capabilities
        existing_station.status = 'online'
        existing_station.last_heartbeat = datetime.utcnow()
        existing_station.updated_at = datetime.utcnow()

        # Create new session
        session_token = secrets.token_urlsafe(32)
        session = StationSession(
            station_id=existing_station.id,
            session_token=session_token,
            ip_address=request.remote_addr,
            user_agent=request.user_agent.string[:500] if request.user_agent else None
        )

        try:
            # Deactivate old sessions
            StationSession.query.filter_by(station_id=existing_station.id).update({'is_active': False})
            db.session.add(session)
            db.session.commit()

            return jsonify({
                'message': 'Station reactivated successfully',
                'station': existing_station.to_dict(),
                'session_token': session_token,
                'station_token': existing_station.station_token
            }), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'message': 'Error reactivating station'}), 500

    # Create new station
    station_token = secrets.token_urlsafe(32)
    station = PrinterStation(
        user_id=current_user.id,
        station_name=station_name,
        station_location=station_location,
        station_token=station_token,
        capabilities=capabilities,
        status='online',
        last_heartbeat=datetime.utcnow()
    )

    # Create session
    session_token = secrets.token_urlsafe(32)
    session = StationSession(
        station_id=None,  # Will be set after station is created
        session_token=session_token,
        ip_address=request.remote_addr,
        user_agent=request.user_agent.string[:500] if request.user_agent else None
    )

    try:
        db.session.add(station)
        db.session.flush()  # Get station ID
        session.station_id = station.id
        db.session.add(session)
        db.session.commit()

        return jsonify({
            'message': 'Station registered successfully',
            'station': station.to_dict(),
            'session_token': session_token,
            'station_token': station_token
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Error registering station'}), 500

@app.route('/api/stations', methods=['GET'])
@token_required
def list_stations(current_user):
    status_filter = request.args.get('status', None)

    query = PrinterStation.query.filter_by(
        user_id=current_user.id,
        is_active=True
    )

    if status_filter:
        query = query.filter_by(status=status_filter)

    stations = query.order_by(PrinterStation.station_name).all()

    # Update status based on heartbeat
    for station in stations:
        if station.last_heartbeat:
            time_since_heartbeat = datetime.utcnow() - station.last_heartbeat
            if time_since_heartbeat.total_seconds() > 60:  # Mark offline if no heartbeat for 1 minute
                station.status = 'offline'

    try:
        db.session.commit()
    except:
        db.session.rollback()

    return jsonify({
        'stations': [station.to_dict() for station in stations]
    }), 200

@app.route('/api/stations/<int:station_id>/heartbeat', methods=['PUT'])
@token_required
def station_heartbeat(current_user, station_id):
    data = request.get_json()
    session_token = data.get('session_token') if data else None

    if not session_token:
        return jsonify({'message': 'Session token is required'}), 400

    # Verify session
    session = StationSession.query.filter_by(
        session_token=session_token,
        station_id=station_id,
        is_active=True
    ).first()

    if not session:
        return jsonify({'message': 'Invalid session'}), 401

    station = PrinterStation.query.filter_by(
        id=station_id,
        user_id=current_user.id
    ).first()

    if not station:
        return jsonify({'message': 'Station not found'}), 404

    # Update heartbeat
    station.last_heartbeat = datetime.utcnow()
    station.status = data.get('status', 'online')
    session.last_activity = datetime.utcnow()

    try:
        db.session.commit()
        return jsonify({
            'message': 'Heartbeat received',
            'station': station.to_dict()
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Error updating heartbeat'}), 500

@app.route('/api/stations/<int:station_id>/reconnect', methods=['POST'])
@token_required
def reconnect_station(current_user, station_id):
    data = request.get_json()
    old_session_token = data.get('session_token') if data else None

    station = PrinterStation.query.filter_by(
        id=station_id,
        user_id=current_user.id
    ).first()

    if not station:
        return jsonify({'message': 'Station not found'}), 404

    # Deactivate old session if it exists
    if old_session_token:
        old_session = StationSession.query.filter_by(
            session_token=old_session_token,
            station_id=station_id
        ).first()
        if old_session:
            old_session.is_active = False

    # Create new session
    new_session = StationSession(
        station_id=station_id,
        session_token=secrets.token_urlsafe(32),
        is_active=True
    )

    # Update station status
    station.status = 'online'
    station.last_heartbeat = datetime.utcnow()

    try:
        db.session.add(new_session)
        db.session.commit()

        return jsonify({
            'message': 'Station reconnected successfully',
            'session_token': new_session.session_token,
            'station': {
                'id': station.id,
                'station_name': station.station_name,
                'station_location': station.station_location,
                'status': station.status,
                'created_at': station.created_at.isoformat(),
                'last_heartbeat': station.last_heartbeat.isoformat() if station.last_heartbeat else None
            }
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Error reconnecting station'}), 500

@app.route('/api/stations/<int:station_id>', methods=['DELETE'])
@token_required
def unregister_station(current_user, station_id):
    station = PrinterStation.query.filter_by(
        id=station_id,
        user_id=current_user.id
    ).first()

    if not station:
        return jsonify({'message': 'Station not found'}), 404

    # Deactivate station instead of deleting (to preserve history)
    station.is_active = False
    station.status = 'offline'

    # Deactivate all sessions
    StationSession.query.filter_by(station_id=station_id).update({'is_active': False})

    try:
        db.session.commit()
        return jsonify({'message': 'Station unregistered successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Error unregistering station'}), 500

@app.route('/api/stations/<int:station_id>/status', methods=['GET'])
@token_required
def get_station_status(current_user, station_id):
    station = PrinterStation.query.filter_by(
        id=station_id,
        user_id=current_user.id
    ).first()

    if not station:
        return jsonify({'message': 'Station not found'}), 404

    # Check heartbeat
    if station.last_heartbeat:
        time_since_heartbeat = datetime.utcnow() - station.last_heartbeat
        if time_since_heartbeat.total_seconds() > 60:
            station.status = 'offline'
            db.session.commit()

    # Get pending jobs count
    pending_jobs = PrintQueue.query.filter_by(
        station_id=station_id,
        status='pending'
    ).count()

    return jsonify({
        'station': station.to_dict(),
        'pending_jobs': pending_jobs,
        'is_online': station.status == 'online'
    }), 200

# Update print queue endpoints to support station routing
@app.route('/api/print-queue/station/<int:station_id>', methods=['GET'])
@token_required
def get_station_print_queue(current_user, station_id):
    # Verify station belongs to user
    station = PrinterStation.query.filter_by(
        id=station_id,
        user_id=current_user.id
    ).first()

    if not station:
        return jsonify({'message': 'Station not found'}), 404

    # Get filter parameters
    status_filter = request.args.get('status', None)  # No default filter - return all
    limit = min(int(request.args.get('limit', 50)), 100)  # Max 100 items
    offset = int(request.args.get('offset', 0))

    query = PrintQueue.query.filter_by(
        station_id=station_id,
        user_id=current_user.id
    )

    if status_filter:
        query = query.filter_by(status=status_filter)

    # Order: pending/printing first (oldest first), then completed/failed (newest first)
    if status_filter in ['pending', 'printing']:
        query = query.order_by(PrintQueue.created_at.asc())
    else:
        query = query.order_by(PrintQueue.created_at.desc())

    # Get total count for pagination
    total_count = query.count()

    # Apply pagination
    print_jobs = query.offset(offset).limit(limit).all()

    # Separate jobs by status for frontend
    pending_jobs = [job.to_dict() for job in print_jobs if job.status == 'pending']
    printing_jobs = [job.to_dict() for job in print_jobs if job.status == 'printing']
    completed_jobs = [job.to_dict() for job in print_jobs if job.status == 'completed']
    failed_jobs = [job.to_dict() for job in print_jobs if job.status == 'failed']

    return jsonify({
        'station': station.to_dict(),
        'print_jobs': [job.to_dict() for job in print_jobs],
        'jobs_by_status': {
            'pending': pending_jobs,
            'printing': printing_jobs,
            'completed': completed_jobs,
            'failed': failed_jobs
        },
        'pagination': {
            'total': total_count,
            'limit': limit,
            'offset': offset
        }
    }), 200

@app.route('/api/print-queue/station/<int:station_id>/history', methods=['GET'])
@token_required
def get_station_print_history(current_user, station_id):
    # Verify station belongs to user
    station = PrinterStation.query.filter_by(
        id=station_id,
        user_id=current_user.id
    ).first()

    if not station:
        return jsonify({'message': 'Station not found'}), 404

    # Get filter parameters
    limit = min(int(request.args.get('limit', 50)), 100)
    offset = int(request.args.get('offset', 0))

    # Optional date filters
    from_date = request.args.get('from_date')  # ISO format
    to_date = request.args.get('to_date')  # ISO format

    # Query for completed and failed jobs only
    query = PrintQueue.query.filter(
        PrintQueue.station_id == station_id,
        PrintQueue.user_id == current_user.id,
        PrintQueue.status.in_(['completed', 'failed'])
    )

    # Apply date filters if provided
    if from_date:
        try:
            from_dt = datetime.fromisoformat(from_date)
            query = query.filter(PrintQueue.created_at >= from_dt)
        except ValueError:
            pass

    if to_date:
        try:
            to_dt = datetime.fromisoformat(to_date)
            query = query.filter(PrintQueue.created_at <= to_dt)
        except ValueError:
            pass

    # Order by newest first for history
    query = query.order_by(PrintQueue.printed_at.desc().nullslast(), PrintQueue.created_at.desc())

    # Get total count for pagination
    total_count = query.count()

    # Apply pagination
    history_jobs = query.offset(offset).limit(limit).all()

    # Calculate statistics
    stats = {
        'total_printed': PrintQueue.query.filter_by(
            station_id=station_id,
            user_id=current_user.id,
            status='completed'
        ).count(),
        'total_failed': PrintQueue.query.filter_by(
            station_id=station_id,
            user_id=current_user.id,
            status='failed'
        ).count(),
        'last_24h': PrintQueue.query.filter(
            PrintQueue.station_id == station_id,
            PrintQueue.user_id == current_user.id,
            PrintQueue.status == 'completed',
            PrintQueue.printed_at >= datetime.utcnow() - timedelta(days=1)
        ).count()
    }

    return jsonify({
        'station': station.to_dict(),
        'history': [job.to_dict() for job in history_jobs],
        'stats': stats,
        'pagination': {
            'total': total_count,
            'limit': limit,
            'offset': offset
        }
    }), 200

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0', port=5000, debug=True)