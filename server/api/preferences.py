from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from app import db
from models import User

preferences_bp = Blueprint('preferences_bp', __name__, url_prefix='/api/prefs')

@preferences_bp.route('/me', methods=['GET'])
@login_required
def get_my_preferences():
    """Gets the logged-in user's preferences (including theme)."""
    # We can expand this later to include more preferences
    return jsonify({
        'id': str(current_user.id),
        'name': current_user.name,
        'email': current_user.email,
        'role': current_user.role.value,
        'theme_preference': current_user.theme_preference or 'system' # Default to system if null
    }), 200

@preferences_bp.route('/me', methods=['PUT'])
@login_required
def update_my_preferences():
    """Updates the logged-in user's preferences."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    updated = False
    errors = {}

    # Update theme preference
    if 'theme_preference' in data:
        new_theme = data['theme_preference']
        if new_theme not in ['light', 'dark', 'system']:
            errors['theme_preference'] = "Invalid theme value. Must be 'light', 'dark', or 'system'."
        else:
            if current_user.theme_preference != new_theme:
                current_user.theme_preference = new_theme
                updated = True

    # Add more preference updates here later if needed

    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 400

    if updated:
        try:
            db.session.commit()
            # Return the updated preferences
            return jsonify({
                'id': str(current_user.id),
                'name': current_user.name,
                'email': current_user.email,
                'role': current_user.role.value,
                'theme_preference': current_user.theme_preference
            }), 200
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error updating preferences for user {current_user.id}: {e}")
            return jsonify({"error": "Failed to update preferences"}), 500
    else:
        # No changes detected, return current preferences
        return jsonify({
            'id': str(current_user.id),
            'name': current_user.name,
            'email': current_user.email,
            'role': current_user.role.value,
            'theme_preference': current_user.theme_preference
        }), 200
