"""
Admin routes for the main Flask application
"""

from flask import jsonify, request
from functools import wraps
from sqlalchemy import text
import jwt
from datetime import datetime
from app import app, db, User, UploadedFile, PrintQueue, PrinterStation

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
            if not user or not hasattr(user, 'is_admin') or not user.is_admin:
                return jsonify({'message': 'Admin access required!'}), 403
            request.current_user = user
        except Exception as e:
            return jsonify({'message': 'Token is invalid!'}), 401

        return f(*args, **kwargs)
    return decorated

@app.route('/api/admin/dashboard', methods=['GET'])
@admin_required
def admin_dashboard():
    """Get admin dashboard statistics"""

    # Get counts
    total_users = db.session.query(User).count()
    total_files = db.session.query(UploadedFile).count()
    total_print_jobs = db.session.query(PrintQueue).count()
    total_stations = db.session.query(PrinterStation).count()

    # Get active counts
    active_users = db.session.execute(
        text("SELECT COUNT(*) FROM users WHERE is_active = true")
    ).scalar() or total_users  # Fallback if column doesn't exist

    pending_jobs = db.session.query(PrintQueue).filter(
        PrintQueue.status == 'pending'
    ).count()

    online_stations = db.session.query(PrinterStation).filter(
        PrinterStation.status == 'online'
    ).count()

    # Get storage usage
    total_storage = db.session.execute(
        text("SELECT SUM(file_size) FROM uploaded_files")
    ).scalar() or 0

    return jsonify({
        'stats': {
            'users': {
                'total': total_users,
                'active': active_users
            },
            'files': {
                'total': total_files,
                'storage_mb': round(total_storage / (1024 * 1024), 2)
            },
            'print_jobs': {
                'total': total_print_jobs,
                'pending': pending_jobs
            },
            'stations': {
                'total': total_stations,
                'online': online_stations
            }
        }
    })

@app.route('/api/admin/users', methods=['GET'])
@admin_required
def admin_get_users():
    """Get all users (admin only)"""

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    users = User.query.paginate(page=page, per_page=per_page)

    user_list = []
    for user in users.items:
        # Get user stats
        file_count = UploadedFile.query.filter_by(user_id=user.id).count()
        print_count = PrintQueue.query.filter_by(user_id=user.id).count()

        user_list.append({
            'id': user.id,
            'username': user.username,
            'created_at': user.created_at.isoformat() if user.created_at else None,
            'is_admin': getattr(user, 'is_admin', False),
            'is_active': getattr(user, 'is_active', True),
            'stats': {
                'files': file_count,
                'print_jobs': print_count
            }
        })

    return jsonify({
        'users': user_list,
        'total': users.total,
        'pages': users.pages,
        'current_page': page
    })

@app.route('/api/admin/users/<int:user_id>/toggle-active', methods=['POST'])
@admin_required
def admin_toggle_user_active(user_id):
    """Toggle user active status (admin only)"""

    if request.current_user.id == user_id:
        return jsonify({'message': 'Cannot modify your own account'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    # Check if is_active column exists
    try:
        current_status = getattr(user, 'is_active', True)
        db.session.execute(
            text("UPDATE users SET is_active = :status WHERE id = :id"),
            {'status': not current_status, 'id': user_id}
        )
        db.session.commit()
        return jsonify({'message': 'User status updated', 'is_active': not current_status})
    except:
        return jsonify({'message': 'Could not update user status'}), 500

@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def admin_delete_user(user_id):
    """Delete a user (admin only)"""

    if request.current_user.id == user_id:
        return jsonify({'message': 'Cannot delete your own account'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    db.session.delete(user)
    db.session.commit()

    return jsonify({'message': 'User deleted successfully'})

@app.route('/api/admin/files', methods=['GET'])
@admin_required
def admin_get_files():
    """Get all files (admin only)"""

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)

    files = UploadedFile.query.order_by(UploadedFile.uploaded_at.desc()).paginate(
        page=page, per_page=per_page
    )

    file_list = []
    for file in files.items:
        file_list.append({
            'id': file.id,
            'filename': file.original_filename,
            'size': file.file_size,
            'size_mb': round(file.file_size / (1024 * 1024), 2),
            'user_id': file.user_id,
            'username': file.owner.username,
            'status': file.status,
            'uploaded_at': file.uploaded_at.isoformat() if file.uploaded_at else None
        })

    return jsonify({
        'files': file_list,
        'total': files.total,
        'pages': files.pages,
        'current_page': page
    })

@app.route('/api/admin/check', methods=['GET'])
@admin_required
def admin_check():
    """Check if user is admin"""
    return jsonify({
        'is_admin': True,
        'username': request.current_user.username
    })

# Import admin routes in app.py
print("✅ Admin routes loaded successfully")