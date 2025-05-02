# /server/api/files.py
import os
import uuid
from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_login import login_required, current_user
from urllib.parse import unquote
from pathlib import Path
from werkzeug.utils import secure_filename, safe_join
from decorators import admin_required
import re # Import regular expressions

# Define the path to the uploads folder relative to the client folder
# This assumes the script runs from the 'server' directory or project root
# Adjust if necessary based on your project structure and how you run the app
# Using current_app.root_path might be more robust in some deployment scenarios
# but this works for the typical Flask development server setup.
server_dir = os.path.dirname(os.path.abspath(__file__))
client_dir = os.path.abspath(os.path.join(server_dir, '..', '..', 'client'))
UPLOAD_FOLDER = os.path.join(client_dir, 'uploads')

# Ensure the base upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Allowed extensions (example, adjust as needed)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'txt', 'json', 'md', 'pdf', 'zip', 'mp3', 'wav', 'ogg'}

IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'} # Specific image types

files_bp = Blueprint('files_bp', __name__)

def allowed_file(filename):
    """Checks if the file extension is allowed."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def is_safe_filesystem_name(name):
    """
    Checks if a filename or folder name is safe for the filesystem, allowing spaces
    but disallowing potentially problematic characters and path traversal.
    """
    if not name or not name.strip():
        return False # Cannot be empty or just whitespace
    # Check for forbidden characters (common across OSes, adjust if needed)
    # Disallows: / \ : * ? " < > |
    if re.search(r'[\\/:\*\?"<>|]', name):
        return False
    # Check for path traversal attempts
    if ".." in name:
        return False
    return True

def get_safe_path(base_path, requested_path=''):
    """
    Constructs a safe path within the base directory, preventing directory traversal.
    Returns the absolute, resolved path or None if the path is unsafe or outside the base.
    """
    base_path_abs = Path(base_path).resolve()
    # Decode URL-encoded characters (like %20 for space) *before* processing
    decoded_path = unquote(requested_path) if requested_path else ''

    # Treat empty or None requested_path as the base path itself
    if not decoded_path:
        return base_path_abs

    # Split the decoded path into components.
    # Do NOT use secure_filename here for navigation, only for new file/folder names.
    # Path traversal is handled by safe_join and the final check.
    path_parts = [part for part in Path(decoded_path).parts if part and part != '.']

    # Use safe_join to prevent traversal attacks at the joining stage
    try:
        # safe_join needs string arguments
        safe_joined_path = safe_join(str(base_path_abs), *path_parts)
        if safe_joined_path is None: # safe_join returns None on failure
            raise ValueError("Path construction failed")
        full_path = Path(safe_joined_path).resolve()
    except (ValueError, TypeError) as e:
        current_app.logger.warning(f"Unsafe path detected during join: Base='{base_path}', Requested='{decoded_path}'. Error: {e}")
        return None

    # Final security check: Ensure the resolved path is still within the base directory
    if base_path_abs == full_path or base_path_abs in full_path.parents:
        return full_path
    else:
        current_app.logger.warning(f"Potential directory traversal attempt: Base='{base_path}', Requested='{requested_path}', Resolved='{full_path}'")
        return None

# --- API Endpoints ---

@files_bp.route('/files', methods=['GET'])
@admin_required # Only admins can list/browse files
def list_files():
    """
    Lists files and directories within a specified path inside the UPLOAD_FOLDER.
    Accepts an optional 'path' query parameter for the subdirectory.
    """
    requested_path = request.args.get('path', '').strip('/') # Get subdirectory path, remove leading/trailing slashes

    # Get the safe, absolute path for the requested directory
    target_dir_path = get_safe_path(UPLOAD_FOLDER, requested_path)

    if target_dir_path is None or not target_dir_path.is_dir():
        # Path was unsafe or doesn't exist/isn't a directory
        return jsonify({"error": "Invalid or inaccessible path"}), 400

    try:
        items = []
        for entry in target_dir_path.iterdir():
            # Calculate relative path for URL generation
            relative_path = entry.relative_to(Path(UPLOAD_FOLDER).resolve()) # Path relative to UPLOAD_FOLDER root
            # Convert to forward slashes for URL consistency
            url_path = str(relative_path).replace(os.sep, '/')

            if entry.is_dir():
                items.append({
                    'name': entry.name,
                    'type': 'directory',
                    'path': url_path # Path relative to UPLOAD_FOLDER
                })
            elif entry.is_file():
                # Get file size
                file_size = entry.stat().st_size
                items.append({
                    'name': entry.name,
                    'type': 'file',
                    'url': f'/uploads/{url_path}', # URL to access the file
                    'path': url_path, # Path relative to UPLOAD_FOLDER
                    'size': file_size # Add file size in bytes
                })
        # Sort directories first, then files, alphabetically
        items.sort(key=lambda x: (x['type'] != 'directory', x['name'].lower()))
        return jsonify(items), 200
    except Exception as e:
        current_app.logger.error(f"Error listing files in {target_dir_path}: {e}")
        return jsonify({"error": "Failed to list files"}), 500

@files_bp.route('/files/folder', methods=['POST'])
@admin_required # Only admins can create folders
def create_folder():
    """Creates a new folder within a specified path inside the UPLOAD_FOLDER."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request body"}), 400

    target_subdir = data.get('path', '').strip('/')
    folder_name = data.get('folder_name', '').strip()

    if not folder_name:
        return jsonify({"error": "Folder name is required"}), 400

    # Validate folder name (allow spaces, block unsafe chars)
    if not is_safe_filesystem_name(folder_name):
        return jsonify({"error": "Invalid folder name"}), 400
    # Use the original folder_name which allows spaces

    # Get the safe, absolute path for the parent directory where the new folder will be created
    parent_dir_path = get_safe_path(UPLOAD_FOLDER, target_subdir)

    if parent_dir_path is None or not parent_dir_path.is_dir():
        return jsonify({"error": "Invalid or inaccessible target path"}), 400

    new_folder_path = parent_dir_path / folder_name # Use original name
    try:
        new_folder_path.mkdir(exist_ok=False) # Create directory, error if exists
        current_app.logger.info(f"Folder '{folder_name}' created successfully in {parent_dir_path}")
        return jsonify({"message": "Folder created successfully", "folder_name": folder_name}), 201
    except FileExistsError:
        return jsonify({"error": f"Folder '{folder_name}' already exists"}), 409
    except Exception as e:
        current_app.logger.error(f"Error creating folder '{folder_name}' in {parent_dir_path}: {e}")
        return jsonify({"error": "Failed to list files"}), 500

@files_bp.route('/files/rename', methods=['PUT'])
@admin_required # Only admins can rename files/folders
def rename_item():
    """Renames a file or folder within the UPLOAD_FOLDER."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request body"}), 400

    current_path = data.get('path', '').strip('/') # Relative path of the item
    new_name = data.get('new_name', '').strip()

    if not current_path:
        return jsonify({"error": "Current item path is required"}), 400
    if not new_name:
        return jsonify({"error": "New name is required"}), 400

    # Validate the new name (allow spaces, block unsafe chars)
    # Also check if it's different from the original name (case-insensitive check might be good)
    if not is_safe_filesystem_name(new_name):
        return jsonify({"error": "Invalid new name provided"}), 400

    # Get the safe, absolute path for the item to be renamed
    item_path = get_safe_path(UPLOAD_FOLDER, current_path)
    if item_path is None or not item_path.exists():
        return jsonify({"error": "Item not found or path is invalid"}), 404

    # Construct the new path
    new_item_path = item_path.parent / new_name # Use original new name

    if new_item_path.exists():
        return jsonify({"error": f"An item named '{new_name}' already exists in this location"}), 409

    try:
        item_path.rename(new_item_path)
        current_app.logger.info(f"Renamed '{item_path.name}' to '{new_name}' in {item_path.parent}")
        return jsonify({"message": "Item renamed successfully", "new_name": new_name}), 200
    except Exception as e:
        current_app.logger.error(f"Error renaming item '{current_path}' to '{new_name}': {e}")
        return jsonify({"error": "Failed to rename item"}), 500

@files_bp.route('/files/upload', methods=['POST'])
@admin_required # Only admins can upload files
def upload_file():
    """Handles file uploads."""
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400

    # Get target directory path from form data
    target_subdir = request.form.get('path', '').strip('/')
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file and allowed_file(file.filename):
        # Secure the filename to prevent directory traversal attacks
        filename = secure_filename(file.filename)
        # Optional: Generate a unique filename to avoid overwrites
        # filename = f"{uuid.uuid4()}_{filename}"

        # Get the safe target directory path
        target_dir_path = get_safe_path(UPLOAD_FOLDER, target_subdir)
        if target_dir_path is None or not target_dir_path.is_dir():
            return jsonify({"error": "Invalid upload path specified"}), 400

        filepath = target_dir_path / filename
        # Calculate relative path for URL
        relative_path = filepath.relative_to(Path(UPLOAD_FOLDER).resolve())
        url_path = str(relative_path).replace(os.sep, '/')

        try:
            file.save(filepath)
            current_app.logger.info(f"File '{filename}' uploaded successfully to {target_dir_path}")
            return jsonify({
                "message": "File uploaded successfully",
                "filename": filename,
                "url": f'/uploads/{url_path}'
            }), 201 # Created
        except Exception as e:
            current_app.logger.error(f"Error saving file '{filename}': {e}")
            return jsonify({"error": "Failed to save file"}), 500
    else:
        return jsonify({"error": "File type not allowed"}), 400

@files_bp.route('/files/<path:filename>', methods=['DELETE'])
@admin_required # Only admins can delete files/folders
def delete_item(filename):
    """
    Deletes a specific file or an *empty* directory from the uploads directory.
    The 'filename' path parameter includes the relative path from UPLOAD_FOLDER.
    """
    current_app.logger.info(f"Received DELETE request for item: '{filename}'")
    # IMPORTANT: Add security checks here in a real application!
    # Only allow deletion for authorized users.
    try:
        # Use get_safe_path to validate the full path to the item to be deleted
        item_path = get_safe_path(UPLOAD_FOLDER, filename.strip('/'))
        current_app.logger.info(f"Attempting to delete resolved path: '{item_path}'")

        # Check if path resolution failed or item doesn't exist
        if item_path is None or not item_path.exists():
            return jsonify({"error": "File or directory not found or path is invalid"}), 404

        if item_path.is_file():
            item_path.unlink() # Delete file
            current_app.logger.info(f"File '{item_path.name}' deleted successfully from {item_path.parent}.")
            return '', 204 # No Content
        elif item_path.is_dir():
            # Attempt to delete the directory
            try:
                # Check if directory is empty *before* attempting to delete
                if not any(item_path.iterdir()):
                    item_path.rmdir()
                    current_app.logger.info(f"Empty directory '{item_path.name}' deleted successfully from {item_path.parent}.")
                    return '', 204 # No Content
                else:
                    current_app.logger.warning(f"Attempted to delete non-empty directory: {item_path}")
                    return jsonify({"error": "Directory is not empty"}), 400
            except OSError as e:
                # Catch potential errors during rmdir (e.g., permissions, race conditions)
                current_app.logger.error(f"OS error deleting directory '{item_path}': {e}")
                return jsonify({"error": f"Failed to delete directory: {e}"}), 500
        else:
            return jsonify({"error": "Item is not a file or directory"}), 400 # Should not happen if exists() check passed
    except Exception as e:
        current_app.logger.error(f"Error deleting item '{filename}': {e}")
        return jsonify({"error": "Failed to delete item"}), 500

@files_bp.route('/images/list', methods=['GET'])
@admin_required # Only admins need the image list for dropdowns in the editor
def list_images():
    """
    Lists image files within specific subdirectories (kamers or entiteiten).
    Accepts a 'type' query parameter ('room', 'entity', or 'adventure').
    """
    image_type = request.args.get('type') # 'room', 'entity', or 'adventure'

    if image_type == 'room':
        subdir = 'kamers'
    elif image_type == 'entity':
        subdir = 'entiteiten'
    elif image_type == 'adventure':
        subdir = 'avonturen'
    else:
        return jsonify({"error": "Invalid 'type' parameter. Use 'room', 'entity', or 'adventure'."}), 400

    # Get the safe, absolute path for the requested image subdirectory
    # Adjust path for 'adventure' type
    if image_type == 'adventure':
        target_dir_path = get_safe_path(UPLOAD_FOLDER, 'avonturen')
    else:
        target_dir_path = get_safe_path(UPLOAD_FOLDER, f'images/{subdir}')

    if target_dir_path is None or not target_dir_path.is_dir():
        # Path was unsafe or doesn't exist/isn't a directory
        # Return empty list instead of error, as the folder might just not exist yet
        return jsonify([]), 200

    try:
        image_files = []
        for entry in target_dir_path.iterdir():
            # Check if it's a file and has an image extension
            # For 'adventure' type, we might allow more general image types if needed,
            # but using IMAGE_EXTENSIONS is a safe default.
            if entry.is_file() and entry.suffix.lower().lstrip('.') in IMAGE_EXTENSIONS:
                image_files.append(entry.name) # Return only the filename
        
        image_files.sort() # Sort alphabetically
        return jsonify(image_files), 200
    except Exception as e:
        current_app.logger.error(f"Error listing images in {subdir}: {e}")
        return jsonify({"error": "Failed to list images"}), 500
