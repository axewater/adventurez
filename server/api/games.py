import os
import io
import json
import zipfile
from flask import Blueprint, jsonify, current_app, send_file, request
from flask_login import login_required, current_user
from pathlib import Path
import humanize # For human-readable file sizes

from app import db
from models import Game, Room, Entity, Connection, Script, Conversation, UserRole

games_bp = Blueprint('games', __name__, url_prefix='/api/games')

@games_bp.route('/', methods=['GET'])
@login_required
def list_games():
    games = Game.query.all()
    return jsonify([game.to_dict() for game in games])

@games_bp.route('/<uuid:game_id>', methods=['GET'])
@login_required
def get_game(game_id):
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404
    return jsonify(game.to_dict())

@games_bp.route('/<uuid:game_id>/export', methods=['GET'])
@login_required
def export_game(game_id):
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    # Export game data
    game_data = {
        "game": game.to_dict(),
        "rooms": [room.to_dict() for room in game.rooms],
        "entities": [entity.to_dict() for entity in game.entities],
        "connections": [connection.to_dict() for connection in game.connections],
        "scripts": [script.to_dict() for script in game.scripts],
        "conversations": [conversation.to_dict() for conversation in game.conversations]
    }

    # Create a zip file
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w') as zip_file:
        zip_file.writestr('game_data.json', json.dumps(game_data, indent=2))

        # Add image files
        upload_base_dir = Path(current_app.config['UPLOADS_FOLDER'])
        if game.start_image_path:
            zip_file.write(upload_base_dir / 'avonturen' / game.start_image_path, arcname=f'images/start_image.{game.start_image_path.split(".")[-1]}')
        if game.win_image_path:
            zip_file.write(upload_base_dir / 'avonturen' / game.win_image_path, arcname=f'images/win_image.{game.win_image_path.split(".")[-1]}')
        if game.loss_image_path:
            zip_file.write(upload_base_dir / 'avonturen' / game.loss_image_path, arcname=f'images/loss_image.{game.loss_image_path.split(".")[-1]}')

        for room in game.rooms:
            if room.image_path:
                zip_file.write(upload_base_dir / 'images' / 'kamers' / room.image_path, arcname=f'images/rooms/{room.image_path}')

        for entity in game.entities:
            if entity.image_path:
                zip_file.write(upload_base_dir / 'images' / 'entiteiten' / entity.image_path, arcname=f'images/entities/{entity.image_path}')

    zip_buffer.seek(0)
    return send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        attachment_filename=f'{game.name}.zip'
    )

@games_bp.route('/import', methods=['POST'])
@login_required
def import_game():
    try:
        file = request.files['game_file']
        if not file:
            return jsonify({"error": "No game file provided"}), 400

        # Extract game data from the zip file
        with zipfile.ZipFile(file) as zip_file:
            with zip_file.open('game_data.json') as game_data_file:
                game_data = json.load(game_data_file)

        # Create or update the game
        game = Game.from_dict(game_data['game'])
        db.session.add(game)

        # Create or update rooms, entities, connections, scripts, and conversations
        for room_data in game_data['rooms']:
            room = Room.from_dict(room_data)
            room.game = game
            db.session.add(room)

        for entity_data in game_data['entities']:
            entity = Entity.from_dict(entity_data)
            entity.game = game
            db.session.add(entity)

        for connection_data in game_data['connections']:
            connection = Connection.from_dict(connection_data)
            connection.game = game
            db.session.add(connection)

        for script_data in game_data['scripts']:
            script = Script.from_dict(script_data)
            script.game = game
            db.session.add(script)

        for conversation_data in game_data['conversations']:
            conversation = Conversation.from_dict(conversation_data)
            conversation.game = game
            db.session.add(conversation)

        db.session.commit()

        # Save image files
        upload_base_dir = Path(current_app.config['UPLOADS_FOLDER'])
        for image_path in zip_file.namelist():
            if image_path.startswith('images/'):
                image_name = os.path.basename(image_path)
                image_type = image_name.split('.')[0]
                if image_type == 'start_image':
                    game.start_image_path = image_name
                elif image_type == 'win_image':
                    game.win_image_path = image_name
                elif image_type == 'loss_image':
                    game.loss_image_path = image_name
                elif image_path.startswith('images/rooms/'):
                    room_image_name = os.path.basename(image_path)
                    room = Room.query.filter_by(game_id=game.id, image_path=room_image_name).first()
                    if room:
                        room.image_path = room_image_name
                elif image_path.startswith('images/entities/'):
                    entity_image_name = os.path.basename(image_path)
                    entity = Entity.query.filter_by(game_id=game.id, image_path=entity_image_name).first()
                    if entity:
                        entity.image_path = entity_image_name

                with zip_file.open(image_path) as image_file, open(upload_base_dir / image_path[7:], 'wb') as output_file:
                    output_file.write(image_file.read())

        db.session.add(game)
        db.session.commit()

        return jsonify(game.to_dict()), 201
    except Exception as e:
        current_app.logger.error(f"Error importing game: {e}", exc_info=True)
        return jsonify({"error": f"Internal server error during import: {e}"}), 500

@games_bp.route('/<uuid:game_id>/estimate-size', methods=['GET'])
@login_required # Or @admin_required if only admins should see this
def estimate_game_size(game_id):
    """
    Estimates the total disk size of a game's assets (JSON data and images).
    """
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    total_size_bytes = 0
    upload_base_dir = Path(current_app.config['UPLOADS_FOLDER'])
    files_to_check = set()

    # 1. Estimate size of game_data.json (by serializing current data)
    try:
        # This is a simplified export_data structure for size estimation
        # A more accurate one would involve querying all related objects like in export_game
        game_data_dict = game.to_dict() # Basic game info
        # Add rooms, entities etc. if a more precise JSON size is needed.
        # For now, this is a rough estimate of the JSON part.
        json_data_bytes = json.dumps(game_data_dict).encode('utf-8')
        total_size_bytes += len(json_data_bytes)
    except Exception as e:
        current_app.logger.warning(f"Could not estimate game_data.json size for game {game_id}: {e}")

    # 2. Collect image paths
    if game.start_image_path:
        files_to_check.add(upload_base_dir / 'avonturen' / game.start_image_path)
    if game.win_image_path:
        files_to_check.add(upload_base_dir / 'avonturen' / game.win_image_path)
    if game.loss_image_path:
        files_to_check.add(upload_base_dir / 'avonturen' / game.loss_image_path)

    rooms = Room.query.filter_by(game_id=game_id).all()
    for room in rooms:
        if room.image_path:
            files_to_check.add(upload_base_dir / 'images' / 'kamers' / room.image_path)

    entities = Entity.query.filter_by(game_id=game_id).all()
    for entity in entities:
        if entity.image_path:
            files_to_check.add(upload_base_dir / 'images' / 'entiteiten' / entity.image_path)

    # 3. Sum file sizes
    for file_path in files_to_check:
        try:
            if file_path.is_file():
                total_size_bytes += file_path.stat().st_size
        except FileNotFoundError:
            current_app.logger.warning(f"Estimate size: File not found, skipping: {file_path}")
        except Exception as e:
            current_app.logger.error(f"Estimate size: Error accessing file {file_path}: {e}")

    return jsonify({
        "size_bytes": total_size_bytes,
        "size_readable": humanize.naturalsize(total_size_bytes, binary=True) # e.g., "1.2 MiB"
    }), 200
