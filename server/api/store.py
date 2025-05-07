import os
import io
import json
import zipfile
import requests # For making HTTP requests OUT to the store API
from flask import Blueprint, jsonify, current_app
from flask_login import login_required
from pathlib import Path
from app import db
from models import Game, Room, Entity, Connection, Script, Conversation, SystemSetting
from decorators import admin_required
from api.games import export_game # Reuse the export logic if possible, or duplicate needed parts
from flask import request # Import Flask's request object for handling INCOMING requests

store_bp = Blueprint('store_bp', __name__, url_prefix='/api/store')

# --- Helper: Get API Key ---
def get_store_api_key():
    """Retrieves the Adventure Store API key from system settings."""
    setting = db.session.get(SystemSetting, 'adventure_store_api_key')
    return setting.value if setting else None

# --- API Endpoint: Get Available Tags ---
@store_bp.route('/available-tags', methods=['GET'])
@admin_required
def get_available_tags():
    """
    Acts as a proxy to fetch available tags from the Adventure Store API.
    This keeps the store API key secure on the server.
    """
    api_key = get_store_api_key()
    if not api_key:
        return jsonify({"error": "Adventure Store API Key is not configured in Admin Settings."}), 400

    store_tags_url = "https://adventurezstore.pleasewaitloading.com/api/tags" # The external store's tags endpoint
    headers = {
        'X-API-Key': api_key
    }

    try:
        current_app.logger.info(f"Fetching tags from store API: {store_tags_url}")
        response = requests.get(store_tags_url, headers=headers, timeout=15)
        response.raise_for_status() # Raise HTTPError for bad responses

        tags_data = response.json()
        current_app.logger.info(f"Successfully fetched {len(tags_data)} tags from store API.")
        return jsonify(tags_data), 200
    except requests.exceptions.RequestException as e:
        current_app.logger.error(f"Error fetching tags from store API: {e}", exc_info=True)
        return jsonify({"error": f"Could not fetch tags from the store: {e}"}), 502 # Bad Gateway
    except Exception as e:
        current_app.logger.error(f"Unexpected error fetching tags: {e}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {e}"}), 500

# --- API Endpoint: Submit Game ---
@store_bp.route('/submit/<uuid:game_id>', methods=['POST'])
@admin_required
def submit_game_to_store(game_id):
    """
    Exports a game as ZIP, collects metadata, and submits it to the Adventure Store API.
    Expects JSON body with 'tags' (comma-separated numeric IDs).
    """
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    # --- Get API Key ---
    api_key = get_store_api_key()
    if not api_key:
        return jsonify({"error": "Adventure Store API Key is not configured in Admin Settings."}), 400

    # --- Get Metadata from Request ---
    data = request.get_json()
    if not data or 'tags' not in data:
        return jsonify({"error": "Missing 'tags' in request body. Expected comma-separated numeric IDs."}), 400

    tags = data.get('tags', '').strip()
    # Basic validation for tags format (comma-separated numbers)
    if not all(tag.isdigit() for tag in tags.split(',') if tag):
         return jsonify({"error": "Invalid format for 'tags'. Expected comma-separated numeric IDs (e.g., '1,5,8')."}), 400

    # --- Log submission details for debugging ---
    current_app.logger.info("=" * 80)
    current_app.logger.info(f"STORE SUBMISSION REQUEST - Game: {game.name} (ID: {game_id})")
    current_app.logger.info(f"Request data:")
    current_app.logger.info(f"  - Tags: {tags}")
    current_app.logger.info(f"  - API Key: {'*' * 8}{api_key[-4:] if api_key and len(api_key) > 4 else 'Not set'}")
    current_app.logger.info(f"Game metadata:")
    current_app.logger.info(f"  - Name: {game.name}")
    current_app.logger.info(f"  - Description: {game.description[:50]}{'...' if game.description and len(game.description) > 50 else ''}")
    current_app.logger.info(f"  - Version: {game.version}")
    current_app.logger.info(f"  - Builder Version: {game.builder_version}")
    current_app.logger.info(f"  - Start Image: {game.start_image_path}")
    current_app.logger.info(f"  - Win Image: {game.win_image_path}")
    current_app.logger.info(f"  - Loss Image: {game.loss_image_path}")
    current_app.logger.info("-" * 80)

    try:
        # Fetch all related data
        rooms = Room.query.filter_by(game_id=game_id).order_by(Room.sort_index).all()
        entities = Entity.query.filter_by(game_id=game_id).all()
        connections = db.session.query(Connection)\
            .join(Room, Connection.from_room_id == Room.id)\
            .filter(Room.game_id == game_id)\
            .all()
        scripts = Script.query.filter_by(game_id=game_id).all()
        conversations = Conversation.query.filter_by(game_id=game_id).all()

        # Serialize data to JSON
        export_data = {
            "game_info": game.to_dict(), # Includes version needed by store API
            "rooms": [room.to_dict() for room in rooms],
            "entities": [entity.to_dict() for entity in entities],
            "connections": [connection.to_dict() for connection in connections],
            "scripts": [script.to_dict() for script in scripts],
            "conversations": [conversation.to_dict() for conversation in conversations]
        }
        # Ensure game_data.json includes the version key required by the store API
        if 'version' not in export_data['game_info']:
             export_data['game_info']['version'] = game.version or '1.0.0' # Add default if missing

        json_data_bytes = json.dumps(export_data, indent=2).encode('utf-8')

        # Collect image paths
        upload_base_dir = Path(current_app.root_path).parent / 'client' / 'uploads'
        image_paths_to_include = set()
        if game.start_image_path: image_paths_to_include.add(('avonturen', game.start_image_path))
        if game.win_image_path: image_paths_to_include.add(('avonturen', game.win_image_path))
        for room in rooms:
            if room.image_path: image_paths_to_include.add(('images/kamers', room.image_path))
        for entity in entities:
            if entity.image_path: image_paths_to_include.add(('images/entiteiten', entity.image_path))

        # Create ZIP file in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add game_data.json
            zip_file.writestr('game_data.json', json_data_bytes)
            # Add images
            for subdir, filename in image_paths_to_include:
                source_path = upload_base_dir / subdir / filename
                zip_path = Path(subdir) / filename
                if source_path.is_file():
                    zip_file.write(source_path, arcname=str(zip_path))
                else:
                    current_app.logger.warning(f"Submit: Image file not found, skipping: {source_path}")

        zip_buffer.seek(0) # Rewind buffer

    except Exception as e:
        current_app.logger.error(f"Error preparing game data/ZIP for store submission (Game ID: {game_id}): {e}", exc_info=True)
        return jsonify({"error": f"Internal error preparing game data: {e}"}), 500

    # --- Submit to Store API ---
    store_api_url = "https://adventurezstore.pleasewaitloading.com/api/submit"
    headers = {
        'X-API-Key': api_key
    }
    files = {
        'adventure_file': (f"{game.name.replace(' ', '_')}.zip", zip_buffer, 'application/zip')
    }
    payload = {
        'name': game.name,
        'description': game.description or 'No description provided.', # Ensure description is not None
        'tags': tags
    }

    try:
        # Log the complete request details before sending
        current_app.logger.info("STORE API REQUEST DETAILS:")
        current_app.logger.info(f"URL: {store_api_url}")
        current_app.logger.info(f"Headers: {json.dumps({k: ('*' * 8 + v[-4:] if k == 'X-API-Key' and len(v) > 4 else v) for k, v in headers.items()})}")
        current_app.logger.info(f"Payload: {json.dumps(payload)}")
        current_app.logger.info(f"Files: {{'adventure_file': (filename, <ZIP buffer>, 'application/zip')}}")
        current_app.logger.info("-" * 80)

        current_app.logger.info(f"Submitting game '{game.name}' to store API at {store_api_url}")
        response = requests.post(store_api_url, headers=headers, data=payload, files=files, timeout=60) # Added timeout
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

        # Check content type before parsing JSON
        if 'application/json' in response.headers.get('Content-Type', ''):
            response_data = response.json()
            current_app.logger.info(f"Store API Response (Game ID: {game_id}): {response.status_code} - {response_data}")
            # Return the success response from the store API directly to the frontend
            return jsonify(response_data), response.status_code # Should be 201
        elif response.status_code == 204:  # No Content
            return jsonify({"success": True, "message": "Game submitted successfully"}), 200
        else:
            # Handle unexpected content type (e.g., HTML error page)
            current_app.logger.error(f"Store API returned non-JSON response (Status: {response.status_code}): {response.text[:500]}")
            return jsonify({"error": "Received unexpected response format from the store API."}), 502 # Bad Gateway

    except requests.exceptions.RequestException as e:
        current_app.logger.error(f"Error submitting game '{game.name}' to store API: {e}", exc_info=True)
        # Provide more specific error messages based on the exception type if possible
        error_message = f"Network error communicating with the store API: {e}"
        status_code = 503 # Default to Service Unavailable for network issues
        if isinstance(e, requests.exceptions.HTTPError):
            status_code = e.response.status_code
            try:
                # Check if the response is HTML
                if 'text/html' in e.response.headers.get('Content-Type', '').lower():
                    error_message = f"Store API returned an unexpected HTML error page (Status {status_code}). Check server logs for details."
                else:
                    # Try to get error details from the response body if it's JSON or plain text
                    error_detail = e.response.json().get('error', e.response.text[:200])
                    error_message = f"Store API returned error (Status {status_code}): {error_detail}"
            except (json.JSONDecodeError, AttributeError):
                error_message = f"Store API returned error (Status {e.response.status_code}): {e.response.text[:200]}"
        elif isinstance(e, requests.exceptions.ConnectionError):
            error_message = "Could not connect to the store API. Please check the URL or network."
        elif isinstance(e, requests.exceptions.Timeout):
            error_message = "The request to the store API timed out."

        return jsonify({"error": error_message}), status_code # Return specific status code if available
    except Exception as e:
        status_code = 500
        # Catch any other unexpected errors during the request
        current_app.logger.error(f"Unexpected error during store API submission (Game ID: {game_id}): {e}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {e}"}), 500
    finally:
        current_app.logger.info("=" * 80 + "\n")
        zip_buffer.close() # Ensure the buffer is closed
