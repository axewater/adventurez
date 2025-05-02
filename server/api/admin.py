from flask import Blueprint, request, jsonify, current_app
from flask_login import current_user
from pathlib import Path
from app import db
from models import User, UserRole, Game, Room, Entity, Script, Conversation, SystemSetting, SavedGame, HighScore
from decorators import admin_required
from argon2 import PasswordHasher
import uuid
from image_utils import get_absolute_image_path, compress_and_convert_image, delete_file

admin_bp = Blueprint('admin_bp', __name__, url_prefix='/api/admin')
ph = PasswordHasher()

# --- Helper Functions ---
def serialize_user(user):
    """Serializes a User object for the admin panel."""
    return {
        'id': str(user.id),
        'name': user.name,
        'email': user.email,
        'role': user.role.value,
        'theme_preference': user.theme_preference
    }

# --- User Management Routes ---

@admin_bp.route('/users', methods=['GET'])
@admin_required
def list_users():
    """Lists all users."""
    try:
        users = User.query.order_by(User.name).all()
        return jsonify([serialize_user(user) for user in users]), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching users: {e}")
        return jsonify({"error": "Failed to retrieve users"}), 500

@admin_bp.route('/users', methods=['POST'])
@admin_required
def create_user():
    """Creates a new user."""
    data = request.get_json()
    if not data or not data.get('name') or not data.get('email') or not data.get('password') or not data.get('role'):
        return jsonify({"error": "Missing required fields (name, email, password, role)"}), 400

    name = data['name'].strip()
    email = data['email'].strip().lower()
    password = data['password'] # No strip for password
    role_str = data['role'].strip().lower()

    if not name or not email or not password or not role_str:
        return jsonify({"error": "Required fields cannot be empty"}), 400

    # Validate role
    try:
        role = UserRole(role_str)
    except ValueError:
        valid_roles = [r.value for r in UserRole]
        return jsonify({"error": f"Invalid role. Must be one of: {', '.join(valid_roles)}"}), 400

    # Check for existing user/email
    if User.query.filter((User.name == name) | (User.email == email)).first():
        return jsonify({"error": "Username or email already exists"}), 409

    new_user = User(name=name, email=email, role=role)
    new_user.set_password(password)

    try:
        db.session.add(new_user)
        db.session.commit()
        return jsonify(serialize_user(new_user)), 201
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating user: {e}")
        return jsonify({"error": "Failed to create user"}), 500

@admin_bp.route('/users/<uuid:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """Updates user details (email, role, password)."""
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    updated = False

    # Update email if provided and changed
    if 'email' in data:
        new_email = data['email'].strip().lower()
        if not new_email:
            return jsonify({"error": "Email cannot be empty"}), 400
        if new_email != user.email:
            # Check for email conflict
            existing_user = User.query.filter(User.id != user_id, User.email == new_email).first()
            if existing_user:
                return jsonify({"error": "Email already in use by another user"}), 409
            user.email = new_email
            updated = True

    # Update role if provided and changed
    if 'role' in data:
        new_role_str = data['role'].strip().lower()
        try:
            new_role = UserRole(new_role_str)
            if new_role != user.role:
                 # Prevent last admin from being demoted (optional safeguard)
                 if user.role == UserRole.ADMIN and new_role != UserRole.ADMIN:
                     admin_count = User.query.filter_by(role=UserRole.ADMIN).count()
                     if admin_count <= 1:
                         return jsonify({"error": "Cannot remove the last administrator role"}), 400
                 user.role = new_role
                 updated = True
        except ValueError:
            valid_roles = [r.value for r in UserRole]
            return jsonify({"error": f"Invalid role. Must be one of: {', '.join(valid_roles)}"}), 400

    # Update password if provided
    if 'password' in data and data['password']: # Check if password is provided and not empty
        new_password = data['password']
        user.set_password(new_password)
        updated = True

    if updated:
        try:
            db.session.commit()
            return jsonify(serialize_user(user)), 200
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error updating user {user_id}: {e}")
            return jsonify({"error": "Failed to update user"}), 500
    else:
        # No changes detected
        return jsonify(serialize_user(user)), 200 # Or 304 Not Modified? 200 is simpler.


@admin_bp.route('/users/<uuid:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """Deletes a user."""
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Prevent deleting the logged-in admin themselves
    if user.id == current_user.id:
        return jsonify({"error": "Cannot delete your own account"}), 403

    # Prevent deleting the last admin (optional safeguard)
    if user.role == UserRole.ADMIN:
        admin_count = User.query.filter_by(role=UserRole.ADMIN).count()
        if admin_count <= 1:
            return jsonify({"error": "Cannot delete the last administrator"}), 400

    try:
        # Cascade should handle related SavedGame and HighScore deletion
        db.session.delete(user)
        db.session.commit()
        return '', 204
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting user {user_id}: {e}")
        return jsonify({"error": "Failed to delete user"}), 500

# --- System Settings Routes ---

@admin_bp.route('/settings', methods=['GET'])
@admin_required
def get_system_settings():
    """Gets all system settings."""
    try:
        settings = SystemSetting.query.all()
        settings_dict = {setting.key: setting.value for setting in settings}
        # Ensure default theme exists if not set
        if 'default_theme' not in settings_dict:
            settings_dict['default_theme'] = 'light' # Default to light
        # Ensure API key exists (as empty string if not set)
        if 'adventure_store_api_key' not in settings_dict:
            settings_dict['adventure_store_api_key'] = ''
        return jsonify(settings_dict), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching system settings: {e}")
        return jsonify({"error": "Failed to retrieve system settings"}), 500

@admin_bp.route('/settings', methods=['PUT'])
@admin_required
def update_system_settings():
    """Updates one or more system settings."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    updated_settings = {}
    errors = {}

    for key, value in data.items():
        # Validate specific settings if needed
        if key == 'default_theme':
            if value not in ['light', 'dark']:
                errors[key] = "Invalid theme value. Must be 'light' or 'dark'."
                continue
        # No specific validation for API key, just store it
        elif key == 'adventure_store_api_key':
            # Allow empty string for API key
            pass # Just accept the value

        # Update or create the setting
        setting = db.session.get(SystemSetting, key)
        if setting:
            setting.value = str(value) # Store value as string
        else:
            setting = SystemSetting(key=key, value=str(value))
            db.session.add(setting)
        updated_settings[key] = value

    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 400

    try:
        db.session.commit()
        return jsonify(updated_settings), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating system settings: {e}")
        return jsonify({"error": "Failed to update system settings"}), 500

# --- Statistics Route ---

@admin_bp.route('/stats', methods=['GET'])
@admin_required
def get_admin_stats():
    """Gets various statistics for the admin panel."""
    try:
        stats = {
            'user_count': User.query.count(),
            'game_count': Game.query.count(),
            'room_count': Room.query.count(),
            'entity_count': Entity.query.count(),
            'script_count': Script.query.count(),
            'conversation_count': Conversation.query.count(),
            'saved_game_count': SavedGame.query.count(),
            'high_score_count': HighScore.query.count(),
        }
        return jsonify(stats), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching admin stats: {e}")
        return jsonify({"error": "Failed to retrieve statistics"}), 500

# --- NEW: Game Compression Route ---

@admin_bp.route('/games/<uuid:game_id>/compress', methods=['POST'])
@admin_required
def compress_game_images(game_id):
    """
    Compresses all images associated with a specific game.
    Resizes images to fit within 800x800, converts to JPG (80% quality),
    updates database references if extensions change, and deletes original files
    if they were successfully converted to JPG.
    """
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    current_app.logger.info(f"Starting image compression for game '{game.name}' (ID: {game_id})")

    # Fetch associated rooms and entities
    rooms = Room.query.filter_by(game_id=game_id).all()
    entities = Entity.query.filter_by(game_id=game_id).all()

    # Collect unique relative image paths and their associated objects/types
    # Store as {relative_path: [(object, attribute_name, image_type)]}
    image_references = {}

    def add_reference(relative_path, obj, attr_name, img_type):
        if not relative_path: return
        if relative_path not in image_references:
            image_references[relative_path] = []
        image_references[relative_path].append((obj, attr_name, img_type))

    # Game images
    add_reference(game.start_image_path, game, 'start_image_path', 'game_start')
    add_reference(game.win_image_path, game, 'win_image_path', 'game_win')
    # Room images
    for room in rooms:
        add_reference(room.image_path, room, 'image_path', 'room')
    # Entity images
    for entity in entities:
        add_reference(entity.image_path, entity, 'image_path', 'entity')

    processed_count = 0
    converted_count = 0
    failed_count = 0
    original_files_to_delete = set()

    # Process each unique relative path
    for relative_path, references in image_references.items():
        # Assume all references for the same relative path use the same image_type
        _, _, image_type = references[0]

        absolute_source_path = get_absolute_image_path(relative_path, image_type)
        if not absolute_source_path or not absolute_source_path.is_file():
            current_app.logger.warning(f"Compress: Skipping missing source file for relative path '{relative_path}'")
            failed_count += 1
            continue

        new_absolute_path, extension_changed = compress_and_convert_image(absolute_source_path)

        if new_absolute_path:
            processed_count += 1
            if extension_changed:
                converted_count += 1
                new_relative_path = new_absolute_path.name # The new filename (e.g., 'image.jpg')
                # Update all DB objects referencing this image
                for obj, attr_name, _ in references:
                    setattr(obj, attr_name, new_relative_path)
                    current_app.logger.info(f"Compress: Updated DB reference for {obj.__class__.__name__} ID {obj.id}.{attr_name} to '{new_relative_path}'")
                # Mark original file for deletion only if conversion happened and extension changed
                original_files_to_delete.add(absolute_source_path)
        else:
            failed_count += 1
            current_app.logger.error(f"Compress: Failed to process image: {absolute_source_path}")

    # Commit DB changes (updated image paths)
    try:
        db.session.commit()
        current_app.logger.info(f"Compress: Database updates committed for game '{game.name}'.")
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Compress: Database commit failed after image processing for game '{game.name}': {e}", exc_info=True)
        return jsonify({"error": "Failed to save image path updates to database."}), 500

    # Delete original files AFTER successful DB commit
    deleted_originals_count = 0
    for original_path in original_files_to_delete:
        if delete_file(original_path):
            deleted_originals_count += 1

    message = f"Compression complete for game '{game.name}'. Processed: {processed_count}, Converted to JPG: {converted_count}, Failed: {failed_count}."
    if deleted_originals_count > 0:
        message += f" Deleted {deleted_originals_count} original non-JPG files."
    current_app.logger.info(message)
    return jsonify({"message": message, "processed": processed_count, "converted": converted_count, "failed": failed_count, "deleted_originals": deleted_originals_count}), 200
