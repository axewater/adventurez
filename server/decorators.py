from functools import wraps
from flask import abort, current_app
from flask_login import current_user
from models import UserRole
from flask import request

def admin_required(f):
    """Decorator to ensure the logged-in user has the ADMIN role."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            current_app.logger.warning(f"Admin access denied to {request.path}: User not authenticated.")
            # Flask-Login's @login_required usually handles this, but added for clarity
            abort(401) # Unauthorized
        if current_user.role != UserRole.ADMIN:
            current_app.logger.warning(f"Admin access denied for user: {current_user.email} (Role: {current_user.role.value})")
            abort(403) # Forbidden
        return f(*args, **kwargs)
    return decorated_function
