from flask import Blueprint, request, jsonify, send_file, current_app
from sqlalchemy.exc import IntegrityError
from flask_login import login_required, current_user
import uuid
from copy import deepcopy
import json
import zipfile
import io
from decorators import admin_required
import os
from pathlib import Path
from werkzeug.datastructures import FileStorage
from typing import Tuple
from app import db
from config import Config
from flask import current_app
from models import Game, Room, Entity, Connection, Script, Conversation, User, UserRole, SavedGame

# Create a Blueprint for game routes
games_bp = Blueprint('games_bp', __name__)

# --- Helper Functions ---

def serialize_game(game):
    """Converts a Game object into a dictionary for JSON serialization."""
    # Start with the basic serialization from the model
    game_dict = game.to_dict()
    # Add placeholder for the saved game status (will be updated in list_games)
    game_dict['has_saved_game'] = False
    return game_dict

# --- API Endpoints ---

@games_bp.route('/', methods=['GET'])
@login_required # All logged-in users can list games
def list_games():
    """Lists all available games."""
    try:
        games = Game.query.order_by(Game.name).all()
        serialized_games = [serialize_game(game) for game in games]

        # Check for saved games for the current user
        saved_game_ids = {
            str(saved.game_id) for saved in SavedGame.query.filter_by(user_id=current_user.id).all()
        }
        for game_data in serialized_games:
            if game_data['id'] in saved_game_ids:
                game_data['has_saved_game'] = True

        return jsonify(serialized_games), 200
    except Exception as e:
        # Log the exception e
        print(f"Error fetching games: {e}")
        return jsonify({"error": "Failed to retrieve games"}), 500


@games_bp.route('', methods=['POST'])
@admin_required # Only admins can create new games
def create_game():
    """Creates a new game."""
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({"error": "Game name is required"}), 400

    name = data['name'].strip()
    if not name:
         return jsonify({"error": "Game name cannot be empty"}), 400

    # Check if game name already exists
    if db.session.query(Game.id).filter_by(name=name).first():
        return jsonify({"error": f"A game with the name '{name}' already exists"}), 409 # Conflict

    # Get optional fields from request data
    description = data.get('description', 'Click the picture to start the game!') # Use default if not provided
    start_image_path = data.get('start_image_path') # Can be null
    win_image_path = data.get('win_image_path') # Can be null
    loss_image_path = data.get('loss_image_path') # NEW: Get loss image path
    version = data.get('version', '1.0.0') # Get version from request or use default

    new_game = Game(name=name,
                    description=description,
                    start_image_path=start_image_path,
                    win_image_path=win_image_path,
                    loss_image_path=loss_image_path, # NEW: Set loss image path
                    version=version, # Set the version
                    builder_version=current_app.config['APP_VERSION']) # Set current builder version
    try:
        db.session.add(new_game)
        db.session.commit()
        return jsonify(serialize_game(new_game)), 201 # Created
    except IntegrityError as e:
        db.session.rollback()
        # This might happen due to race conditions, though less likely with the check above
        print(f"Integrity error creating game: {e}")
        return jsonify({"error": "Failed to create game due to a database conflict"}), 500
    except Exception as e:
        db.session.rollback()
        print(f"Error creating game: {e}")
        return jsonify({"error": "Failed to create game"}), 500


@games_bp.route('/<uuid:game_id>', methods=['GET'])
@login_required # All logged-in users can get game details (needed for play mode start screen)
def get_game_details(game_id):
    """Retrieves details for a specific game."""
    try:
        game = db.session.get(Game, game_id)
        if game:
            return jsonify(serialize_game(game)), 200
        else:
            return jsonify({"error": "Game not found"}), 404
    except Exception as e:
        print(f"Error fetching game {game_id}: {e}")
        return jsonify({"error": "Failed to retrieve game details"}), 500


@games_bp.route('/<uuid:game_id>', methods=['PUT'])
@admin_required # Only admins can update game details
def update_game(game_id):
    """Updates the details (name, start/win/loss images, description, version) of a specific game."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400
    new_name = data['name'].strip()
    if not new_name:
         return jsonify({"error": "Game name cannot be empty"}), 400

    try:
        game = db.session.get(Game, game_id)
        if not game:
            return jsonify({"error": "Game not found"}), 404

        # Update name if provided and changed
        if 'name' in data:
            new_name = data['name'].strip()
            if not new_name:
                return jsonify({"error": "Game name cannot be empty"}), 400
            if new_name != game.name:
                # Check if the new name conflicts with another existing game
                existing_game = Game.query.filter(Game.id != game_id, Game.name == new_name).first()
                if existing_game:
                    return jsonify({"error": f"A game with the name '{new_name}' already exists"}), 409 # Conflict
                game.name = new_name

        # Update image paths if provided (allow setting to null)
        game.start_image_path = data.get('start_image_path', game.start_image_path)
        game.win_image_path = data.get('win_image_path', game.win_image_path)
        game.loss_image_path = data.get('loss_image_path', game.loss_image_path) # NEW: Update loss image path
        # Update description if provided (allow setting to null or empty)
        game.description = data.get('description', game.description)
        # Update game version if provided
        game.version = data.get('version', game.version)
        # Update the builder version used to save these settings
        game.builder_version = current_app.config['APP_VERSION']
        db.session.commit()
        return jsonify(serialize_game(game)), 200
    except IntegrityError as e:
        db.session.rollback()
        print(f"Integrity error updating game {game_id}: {e}")
        # This could happen if the unique constraint check fails under race conditions
        return jsonify({"error": "Failed to update game due to a database conflict"}), 500
    except Exception as e:
        db.session.rollback()
        print(f"Error updating game {game_id}: {e}")
        return jsonify({"error": "Failed to update game"}), 500


@games_bp.route('/<uuid:game_id>', methods=['DELETE'])
@admin_required # Only admins can delete games
def delete_game(game_id):
    """Deletes a specific game and all its associated data (rooms, entities, etc.)."""
    try:
        game = db.session.get(Game, game_id)
        if not game:
            return jsonify({"error": "Game not found"}), 404

        db.session.delete(game)
        db.session.commit()
        # Return No Content, standard for successful DELETE
        return '', 204
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting game {game_id}: {e}")
        return jsonify({"error": "Failed to delete game"}), 500


@games_bp.route('/<uuid:game_id>/connections', methods=['GET'])
@admin_required # Only admins need the full list for the graph view
def get_all_game_connections(game_id):
    """Retrieves all connections for a specific game."""
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    try:
        # Query connections by joining through rooms belonging to the game
        connections = db.session.query(Connection)\
            .join(Room, Connection.from_room_id == Room.id)\
            .filter(Room.game_id == game_id)\
            .all()

        return jsonify([connection.to_dict() for connection in connections]), 200
    except Exception as e:
        print(f"Error fetching all connections for game {game_id}: {e}")
        return jsonify({"error": "Failed to retrieve connections for the game"}), 500


@games_bp.route('/<uuid:game_id>/export', methods=['GET'])
@admin_required # Only admins can export
def export_game(game_id):
    """
    Exports all data for a specific game, including JSON data and associated images,
    as a single ZIP file.
    """
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    # Define the base upload directory from the client folder perspective
    upload_base_dir = Path(current_app.root_path).parent / 'client' / 'uploads'

    try:
        # Fetch all related data
        rooms = Room.query.filter_by(game_id=game_id).order_by(Room.sort_index).all()
        entities = Entity.query.filter_by(game_id=game_id).all()
        # Fetch connections via rooms to ensure they belong to the game
        connections = db.session.query(Connection)\
            .join(Room, Connection.from_room_id == Room.id)\
            .filter(Room.game_id == game_id)\
            .all()
        scripts = Script.query.filter_by(game_id=game_id).all()
        conversations = Conversation.query.filter_by(game_id=game_id).all()

        # 1. Serialize data to JSON
        export_data = {
            "game_info": game.to_dict(),
            "rooms": [room.to_dict() for room in rooms],
            "entities": [entity.to_dict() for entity in entities],
            "connections": [connection.to_dict() for connection in connections],
            "scripts": [script.to_dict() for script in scripts],
            "conversations": [conversation.to_dict() for conversation in conversations]
        }
        json_data = json.dumps(export_data, indent=2).encode('utf-8')

        # 2. Collect all unique image paths
        image_paths_to_include = set()
        if game.start_image_path:
            image_paths_to_include.add(('avonturen', game.start_image_path))
        if game.win_image_path:
            image_paths_to_include.add(('avonturen', game.win_image_path))
        if game.loss_image_path: # NEW: Include loss image
            image_paths_to_include.add(('avonturen', game.loss_image_path))
        for room in rooms:
            if room.image_path:
                image_paths_to_include.add(('images/kamers', room.image_path))
        for entity in entities:
            if entity.image_path:
                image_paths_to_include.add(('images/entiteiten', entity.image_path))

        # 3. Create ZIP file in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add JSON data
            zip_file.writestr('game_data.json', json_data)

            # Add image files
            for subdir, filename in image_paths_to_include:
                # Construct the full path to the source image file
                source_path = upload_base_dir / subdir / filename
                # Define the destination path within the ZIP archive
                zip_path = Path(subdir) / filename

                if source_path.is_file():
                    try:
                        zip_file.write(source_path, arcname=str(zip_path))
                        current_app.logger.info(f"Added '{source_path}' to ZIP as '{zip_path}'")
                    except Exception as write_err:
                        current_app.logger.warning(f"Could not write file '{source_path}' to ZIP: {write_err}")
                else:
                    current_app.logger.warning(f"Image file not found, skipping: {source_path}")

        # 4. Prepare response
        zip_buffer.seek(0) # Rewind buffer to the beginning

        # Create a filename suggestion for the download
        safe_game_name = "".join(c if c.isalnum() or c in (' ', '_', '-') else '_' for c in game.name)
        zip_filename = f"{safe_game_name.replace(' ', '_').lower()}_export.zip"

        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=zip_filename # Use download_name (Flask >= 2.0) or attachment_filename
        )

    except FileNotFoundError as fnf_error:
        db.session.rollback()
        current_app.logger.error(f"File not found during export for game {game_id}: {fnf_error}")
        return jsonify({"error": f"Failed to export game data: Required file not found ({fnf_error.filename})"}), 500
    except zipfile.BadZipFile as zip_error:
        db.session.rollback()
        current_app.logger.error(f"ZIP file error during export for game {game_id}: {zip_error}")
        return jsonify({"error": "Failed to create export archive."}), 500
    except Exception as e:
        db.session.rollback() # Rollback in case of error during data fetching
        print(f"Error exporting game {game_id}: {e}")
        return jsonify({"error": "Failed to export game data"}), 500


def _import_game_logic(file_stream, filename_for_error_reporting) -> Tuple[dict, int]:
    """
    Internal logic to import a game from a file stream (BytesIO or uploaded file).
    """
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if not file or not file.filename.lower().endswith('.zip'):
        return jsonify({"error": "Invalid file type. Please upload a .zip file."}), 400

    # Define the base upload directory for saving extracted images
    upload_base_dir = Path(current_app.root_path).parent / 'client' / 'uploads'

    try:
        with zipfile.ZipFile(file_stream, 'r') as zip_ref:
            # Check for game_data.json
            if 'game_data.json' not in zip_ref.namelist():
                return jsonify({"error": "ZIP file must contain 'game_data.json'"}), 400

            # Read and parse JSON data
            with zip_ref.open('game_data.json') as json_file:
                try: 
                    data = json.load(json_file)
                except json.JSONDecodeError:
                    return jsonify({"error": "Invalid JSON data in 'game_data.json'"}), 400
    except Exception as e: 
        return jsonify({"error": f"Error processing ZIP file '{filename_for_error_reporting}': {str(e)}"}), 400

    # --- Basic Validation ---
    required_keys = ["game_info", "rooms", "entities", "connections", "scripts", "conversations"]
    if not all(key in data for key in required_keys):
        return jsonify({"error": "Incomplete game data. Missing one or more required keys."}), 400

    game_info = data.get("game_info")
    if not game_info or not isinstance(game_info, dict) or not game_info.get("name"):
        return jsonify({"error": "Invalid or missing 'game_info' or 'game_info.name'"}), 400

    game_name = game_info["name"].strip()
    if not game_name:
        return jsonify({"error": "Game name cannot be empty"}), 400

    # --- Check for Existing Game Name ---
    if db.session.query(Game.id).filter_by(name=game_name).first():
        return jsonify({"error": f"A game with the name '{game_name}' already exists. Please rename the game or the imported file."}), 409 # Conflict

    # --- Start Import Process ---
    try:
        # 1. Create New Game
        new_game = Game(
            name=game_name,
            description=game_info.get('description'),
            start_image_path=game_info.get('start_image_path'),
            win_image_path=game_info.get('win_image_path'),
            loss_image_path=game_info.get('loss_image_path'), # NEW: Import loss image path
            version=game_info.get('version', '1.0.0'), # Get version from import or default
            builder_version=game_info.get('builder_version', current_app.config['APP_VERSION']) # Get builder version or use current
            # created_at, updated_at, id are handled by defaults/DB
        )
        db.session.add(new_game)
        db.session.flush() # Get the new game ID
        new_game_id = new_game.id
        print(f"Importing game '{game_name}' with new ID: {new_game_id}")

        # 2. Create UUID Mappings
        # We need mappings for rooms, entities, and conversations as they can be referenced by others
        room_id_map = {}
        entity_id_map = {}
        conversation_id_map = {}

        # 3. Import Rooms
        for room_data in data.get("rooms", []):
            old_id = room_data.get('id')
            if not old_id: continue # Skip rooms without an ID in the import file
            new_room_id = uuid.uuid4()
            room_id_map[old_id] = new_room_id
            new_room = Room(
                id=new_room_id,
                game_id=new_game_id,
                title=room_data.get('title', 'Untitled Room'),
                description=room_data.get('description', ''),
                pos_x=room_data.get('pos_x'),
                pos_y=room_data.get('pos_y'),
                sort_index=room_data.get('sort_index', 0),
                image_path=room_data.get('image_path')
            )
            db.session.add(new_room)

        # 4. Import Conversations (before entities that might reference them)
        for convo_data in data.get("conversations", []):
            old_id = convo_data.get('id')
            if not old_id: continue
            new_convo_id = uuid.uuid4()
            conversation_id_map[old_id] = new_convo_id
            new_convo = Conversation(
                id=new_convo_id,
                game_id=new_game_id,
                name=convo_data.get('name', 'Untitled Conversation'),
                structure=deepcopy(convo_data.get('structure', {})) # Use deepcopy for mutable JSON
            )
            db.session.add(new_convo)

        # 5. Import Entities (after rooms and conversations)
        for entity_data in data.get("entities", []):
            old_id = entity_data.get('id')
            if not old_id: continue
            new_entity_id = uuid.uuid4()
            entity_id_map[old_id] = new_entity_id
            new_entity = Entity(
                id=new_entity_id,
                game_id=new_game_id,
                room_id=room_id_map.get(entity_data.get('room_id')), # Map old room ID to new
                container_id=entity_id_map.get(entity_data.get('container_id')), # Map old container ID to new
                type=entity_data.get('type'), # Assumes type is valid Enum value
                name=entity_data.get('name', 'Untitled Entity'),
                description=entity_data.get('description', ''),
                is_takable=entity_data.get('is_takable', False),
                is_container=entity_data.get('is_container', False),
                conversation_id=conversation_id_map.get(entity_data.get('conversation_id')), # Map old convo ID to new
                image_path=entity_data.get('image_path')
            )
            db.session.add(new_entity)

        # 6. Import Connections (after rooms and entities)
        for conn_data in data.get("connections", []):
            new_conn = Connection(
                id=uuid.uuid4(), # Generate new ID for the connection itself
                from_room_id=room_id_map.get(conn_data.get('from_room_id')),
                to_room_id=room_id_map.get(conn_data.get('to_room_id')),
                direction=conn_data.get('direction', 'unknown'),
                is_locked=conn_data.get('is_locked', False),
                required_key_id=entity_id_map.get(conn_data.get('required_key_id')) # Map old key ID to new
            )
            # Basic validation: Ensure required fields are mapped correctly
            if new_conn.from_room_id and new_conn.to_room_id:
                db.session.add(new_conn)
            else:
                print(f"Warning: Skipping connection due to missing room mapping: {conn_data}")

        # 7. Extract and Save Images
        # Iterate through all files in the zip EXCEPT game_data.json
        for item_info in zip_ref.infolist():
            if item_info.filename == 'game_data.json' or item_info.is_dir():
                continue # Skip the JSON file and directories

            # Determine the target path on the server
            # item_info.filename should already contain the correct relative path (e.g., 'images/kamers/image.png')
            target_path = upload_base_dir / Path(item_info.filename)

            # Ensure the target directory exists
            target_path.parent.mkdir(parents=True, exist_ok=True)

            # Extract the file, overwriting if it exists
            try:
                with zip_ref.open(item_info.filename) as source, open(target_path, 'wb') as target:
                    target.write(source.read())
                current_app.logger.info(f"Extracted image '{item_info.filename}' to '{target_path}'")
            except Exception as extract_err:
                current_app.logger.warning(f"Could not extract file '{item_info.filename}' from ZIP: {extract_err}")
        # 7. Import Scripts
        for script_data in data.get("scripts", []):
            new_script = Script(
                id=uuid.uuid4(), # Generate new ID
                game_id=new_game_id,
                trigger=script_data.get('trigger', 'UNKNOWN_TRIGGER'),
                condition=script_data.get('condition'),
                action=script_data.get('action', 'SHOW_MESSAGE("Missing action")')
            )
            db.session.add(new_script)

        # 9. Commit Transaction
        db.session.commit()
        print(f"Game '{game_name}' imported successfully.")
        return serialize_game(new_game), 201 # Return the newly created game info

    except zipfile.BadZipFile:
        return jsonify({"error": "Invalid or corrupted ZIP file."}), 400
    except FileNotFoundError as fnf_error: # Catch potential errors during image extraction/saving
        return jsonify({"error": f"Error saving extracted file: {fnf_error}"}), 500
    except IntegrityError as e:
        db.session.rollback()
        print(f"Database integrity error during import: {e}")
        # Check if it's the unique constraint on game name again (race condition?)
        if "uq_games_name" in str(e.orig):
             return jsonify({"error": f"A game with the name '{game_name}' already exists (conflict during save)."}), 409
        return jsonify({"error": "Database error during import. Check data integrity."}), 500
    except Exception as e:
        db.session.rollback()
        print(f"Unexpected error during game import: {e}")
        # Log the full traceback here in a real application
        # import traceback
        # traceback.print_exc()
        return jsonify({"error": f"An unexpected error occurred during import: {e}"}), 500

@games_bp.route('/import', methods=['POST'])
@admin_required # Only admins can import
def import_game():
    """
    Imports a game from an uploaded ZIP file containing game_data.json and associated images.
    Handles the Flask request and calls the internal logic.
    """
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if not file or not file.filename.lower().endswith('.zip'):
        return jsonify({"error": "Invalid file type. Please upload a .zip file."}), 400

    # Use the internal logic function, passing the file stream
    result, status_code = _import_game_logic(file.stream, file.filename)
    if isinstance(result, dict) and status_code == 201:
        return jsonify(result), status_code
    else:
        return result # Return the error response directly

def import_game_from_zip_path(zip_file_path: str) -> Game:
    """
    Imports a game from a ZIP file specified by its path.
    Raises exceptions on errors (e.g., FileNotFoundError, ValueError for bad data, IntegrityError).
    """
    upload_base_dir = Path(current_app.root_path).parent / 'client' / 'uploads'
    zip_filename = os.path.basename(zip_file_path)

    try:
        with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
            # Check for game_data.json
            if 'game_data.json' not in zip_ref.namelist():
                raise ValueError(f"ZIP file '{zip_filename}' must contain 'game_data.json'")

            # Read and parse JSON data
            with zip_ref.open('game_data.json') as json_file:
                try:
                    data = json.load(json_file)
                except json.JSONDecodeError as e:
                    raise ValueError(f"Invalid JSON data in 'game_data.json' from '{zip_filename}': {e}") from e

            # --- Basic Validation ---
            required_keys = ["game_info", "rooms", "entities", "connections", "scripts", "conversations"]
            if not all(key in data for key in required_keys):
                raise ValueError(f"Incomplete game data in '{zip_filename}'. Missing one or more required keys.")

            game_info = data.get("game_info")
            if not game_info or not isinstance(game_info, dict) or not game_info.get("name"):
                raise ValueError(f"Invalid or missing 'game_info' or 'game_info.name' in '{zip_filename}'")

            game_name = game_info["name"].strip()
            if not game_name:
                raise ValueError(f"Game name cannot be empty in '{zip_filename}'")

            # --- Check for Existing Game Name ---
            if db.session.query(Game.id).filter_by(name=game_name).first():
                raise IntegrityError(f"A game with the name '{game_name}' already exists.", params=None, orig=None)

            # --- Start Import Process ---
            # Note: This part is very similar to _import_game_logic, consider further refactoring if needed
            # 1. Create New Game
            new_game = Game(
                name=game_name,
                description=game_info.get('description'),
                start_image_path=game_info.get('start_image_path'),
                win_image_path=game_info.get('win_image_path'),
                loss_image_path=game_info.get('loss_image_path'), # NEW: Import loss image path
                version=game_info.get('version', '1.0.0'), # Get version from import or default
                builder_version=game_info.get('builder_version', current_app.config['APP_VERSION']) # Get builder version or use current
            )
            db.session.add(new_game)
            db.session.flush() # Get the new game ID
            new_game_id = new_game.id
            current_app.logger.info(f"Importing game '{game_name}' from path '{zip_file_path}' with new ID: {new_game_id}")

            # 2. Create UUID Mappings
            room_id_map = {}
            entity_id_map = {}
            conversation_id_map = {}

            # 3. Import Rooms (Simplified - assumes data is valid as checked above)
            for room_data in data.get("rooms", []):
                old_id = room_data.get('id')
                if not old_id: continue
                new_room_id = uuid.uuid4()
                room_id_map[old_id] = new_room_id
                db.session.add(Room(id=new_room_id, game_id=new_game_id, **{k: v for k, v in room_data.items() if k not in ['id', 'game_id']}))

            # 4. Import Conversations
            for convo_data in data.get("conversations", []):
                old_id = convo_data.get('id')
                if not old_id: continue
                new_convo_id = uuid.uuid4()
                conversation_id_map[old_id] = new_convo_id
                db.session.add(Conversation(id=new_convo_id, game_id=new_game_id, name=convo_data.get('name', 'Untitled'), structure=deepcopy(convo_data.get('structure', {}))))

            # 5. Import Entities
            for entity_data in data.get("entities", []):
                old_id = entity_data.get('id')
                if not old_id: continue
                new_entity_id = uuid.uuid4()
                entity_id_map[old_id] = new_entity_id
                entity_args = {k: v for k, v in entity_data.items() if k not in ['id', 'game_id', 'room_id', 'container_id', 'conversation_id']}
                db.session.add(Entity(id=new_entity_id, game_id=new_game_id,
                                      room_id=room_id_map.get(entity_data.get('room_id')),
                                      container_id=entity_id_map.get(entity_data.get('container_id')),
                                      conversation_id=conversation_id_map.get(entity_data.get('conversation_id')),
                                      **entity_args))

            # 6. Import Connections
            for conn_data in data.get("connections", []):
                from_room_id = room_id_map.get(conn_data.get('from_room_id'))
                to_room_id = room_id_map.get(conn_data.get('to_room_id'))
                if from_room_id and to_room_id:
                    conn_args = {k: v for k, v in conn_data.items() if k not in ['id', 'from_room_id', 'to_room_id', 'required_key_id']}
                    db.session.add(Connection(id=uuid.uuid4(), from_room_id=from_room_id, to_room_id=to_room_id,
                                              required_key_id=entity_id_map.get(conn_data.get('required_key_id')),
                                              **conn_args))
                else:
                    current_app.logger.warning(f"Skipping connection due to missing room mapping in '{zip_filename}': {conn_data}")

            # 7. Import Scripts
            for script_data in data.get("scripts", []):
                 script_args = {k: v for k, v in script_data.items() if k not in ['id', 'game_id']}
                 db.session.add(Script(id=uuid.uuid4(), game_id=new_game_id, **script_args))

            # 8. Extract and Save Images
            for item_info in zip_ref.infolist():
                if item_info.filename == 'game_data.json' or item_info.is_dir(): continue
                target_path = upload_base_dir / Path(item_info.filename)
                target_path.parent.mkdir(parents=True, exist_ok=True)
                with zip_ref.open(item_info.filename) as source, open(target_path, 'wb') as target:
                    target.write(source.read())
                current_app.logger.info(f"Extracted image '{item_info.filename}' to '{target_path}' from '{zip_filename}'")

            # 9. Commit Transaction (done outside the 'with zipfile' block)
            db.session.commit()
            current_app.logger.info(f"Game '{game_name}' imported successfully from path '{zip_file_path}'.")
            return new_game

    except FileNotFoundError:
        raise FileNotFoundError(f"ZIP file not found at path: {zip_file_path}")
    except (zipfile.BadZipFile, ValueError, IntegrityError) as e:
        db.session.rollback() # Rollback on known import errors
        raise e # Re-raise the specific error
    except Exception as e:
        db.session.rollback() # Rollback on any unexpected error during import
        current_app.logger.error(f"Unexpected error importing game from path '{zip_file_path}': {e}", exc_info=True)
        raise RuntimeError(f"An unexpected error occurred during import from '{zip_filename}': {e}") from e
