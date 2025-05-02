# /server/api/play/routes.py
from flask import Blueprint, request, jsonify, current_app
import uuid
from flask_login import login_required, current_user

from app import db
from models import Game, Room, SavedGame, Conversation
from . import state
from .commands import process_command
from .conversation import handle_conversation_input, end_conversation
from .helpers import format_room_description, find_and_execute_scripts, evaluate_condition

# Create a Blueprint for play mode routes
play_bp = Blueprint('play_bp', __name__, url_prefix='/api')

@play_bp.route('/games/<uuid:game_id>/play/command', methods=['POST'])
@login_required
def handle_play_command_route(game_id):
    """Handles player commands during play mode."""
    game = db.session.get(Game, game_id)
    if not game: return jsonify({"error": "Game not found"}), 404

    data = request.get_json()
    if not data: return jsonify({"error": "Invalid request body"}), 400

    command_text = data.get('command', '').strip()
    current_room_id_str = data.get('current_room_id')

    if not command_text: return jsonify({"error": "Command cannot be empty"}), 400
    if not current_room_id_str: return jsonify({"error": "'current_room_id' is required"}), 400

    try:
        current_room_id = uuid.UUID(current_room_id_str)
    except ValueError:
        return jsonify({"error": "Invalid 'current_room_id' format"}), 400

    # --- Check if currently in a conversation ---
    active_conversation = state.conversation_state.get(current_user.id, {}).get(game_id)
    if active_conversation:
        conv_result, next_node_id, still_in_conv = handle_conversation_input(current_user.id, game_id, command_text)
        # Return conversation result directly, including room ID for consistency
        conv_result["current_room_id"] = str(current_room_id) # Keep current room ID
        # Ensure score info is included from conversation handler
        conv_result.setdefault("current_score", state.game_states.get(current_user.id, {}).get(game_id, {}).get('player_score', 0))
        return jsonify(conv_result), 200
    else:
        # --- Process regular command ---
        result = process_command(current_user.id, game_id, current_room_id, command_text)
        status_code = result.pop("status_code", 200) # Get status code or default to 200
        return jsonify(result), status_code


@play_bp.route('/games/<uuid:game_id>/play/save', methods=['POST'])
@login_required
def save_game_state_route(game_id):
    """Saves the current game state to the database."""
    game = db.session.get(Game, game_id)
    if not game: return jsonify({"error": "Game not found"}), 404

    current_room_id_str = request.json.get('current_room_id')
    if not current_room_id_str: return jsonify({"error": "Missing 'current_room_id'"}), 400
    try:
        current_room_uuid = uuid.UUID(current_room_id_str)
        room_check = db.session.query(Room.id).filter_by(id=current_room_uuid, game_id=game_id).first()
        if not room_check: return jsonify({"error": "Invalid 'current_room_id' for this game"}), 400
    except ValueError:
        return jsonify({"error": "Invalid 'current_room_id' format"}), 400

    # Get current state data from the state module
    save_data = state.get_save_data(current_user.id, game_id)

    current_app.logger.info(f"Saving game state for user {current_user.id}, game {game_id}. Data: {save_data}") # DEBUG LOG
    saved_game = db.session.get(SavedGame, (current_user.id, game_id)) # Use composite key
    if not saved_game:
        saved_game = SavedGame(user_id=current_user.id, game_id=game_id)
        db.session.add(saved_game)

    saved_game.current_room_id = current_room_uuid
    saved_game.inventory = save_data["inventory"] # Already list of strings
    saved_game.game_variables = save_data["game_variables"]
    saved_game.entity_locations = save_data["entity_locations"] # Already serialized

    try:
        db.session.commit()
        current_app.logger.info(f"Game state saved successfully for user {current_user.id}, game {game_id}.") # DEBUG LOG
        return jsonify({"message": "Spel opgeslagen!"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error saving game state for {game_id}: {e!r}")
        return jsonify({"error": "Kon spel niet opslaan."}), 500


@play_bp.route('/games/<uuid:game_id>/play/load', methods=['GET'])
@login_required
def load_game_state_route(game_id):
    """Loads the saved game state from the database into memory."""
    saved_game = db.session.get(SavedGame, (current_user.id, game_id)) # Use composite key
    if not saved_game:
        return jsonify({"error": "Geen opgeslagen spel gevonden."}), 404

    current_app.logger.info(f"Loading game state for user {current_user.id}, game {game_id}. DB Data: inventory={saved_game.inventory}, variables={saved_game.game_variables}, locations={saved_game.entity_locations}") # DEBUG LOG

    # Prepare data structure for loading into state module
    saved_data_to_load = {
        "inventory": saved_game.inventory,
        "game_variables": saved_game.game_variables,
        "entity_locations": saved_game.entity_locations or {}
        # player_score is loaded as part of game_variables
    }

    # Load the state into the state module
    state.load_game_session_state(current_user.id, game_id, saved_data_to_load)
    current_app.logger.info(f"In-memory state updated after load for user {current_user.id}, game {game_id}.") # DEBUG LOG

    # Fetch the loaded room details for the response
    loaded_room = db.session.get(Room, saved_game.current_room_id)
    loaded_room_image = loaded_room.image_path if loaded_room else None

    # Send initial room description after loading
    initial_description = ""
    if loaded_room:
        # Ensure score is initialized in state before formatting description or running scripts
        state.game_states.setdefault(current_user.id, {}).setdefault(game_id, {}).setdefault('player_score', 0)
        initial_description = format_room_description(current_user.id, game_id, loaded_room)
        # Execute ON_ENTER scripts for the loaded room
        script_result_on_enter = find_and_execute_scripts(current_user.id, game_id, "ON_ENTER", current_room_id_for_condition=saved_game.current_room_id)
        script_output_on_enter = script_result_on_enter["messages"]
        if script_output_on_enter: initial_description += "\n" + script_output_on_enter
        # Note: points_from_enter are added to the score in state, but not reported as 'points_awarded' on load

    current_score = state.game_states.get(current_user.id, {}).get(game_id, {}).get('player_score', 0)

    return jsonify({
        "message": "Spel geladen!\n\n" + initial_description,
        "current_room_id": str(saved_game.current_room_id),
        "image_path": loaded_room_image,
        "current_score": current_score,
        "in_conversation": False, # Reset conversation state on load
        # Optionally send initial state if needed by client, but usually managed server-side
        # "inventory": saved_game.inventory,
        # "game_variables": saved_game.game_variables
    }), 200


@play_bp.route('/games/<uuid:game_id>/play/reset', methods=['POST'])
@login_required
def reset_game_session_route(game_id):
    """Resets the temporary in-memory state for the current play session."""
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    # Call the reset function from the state module
    state.reset_game_session_state(current_user.id, game_id)

    # Find the starting room (e.g., the one with the lowest sort_index or a specific flag)
    # For now, just find the first room by sort index
    start_room = db.session.query(Room).filter_by(game_id=game_id).order_by(Room.sort_index).first()
    start_room_id = str(start_room.id) if start_room else None
    start_room_image = start_room.image_path if start_room else None
    initial_description = "Sessie gereset.\n\n"
    if start_room:
         # Ensure score is reset (done by reset_game_session_state) and initialized for description/scripts
         state.game_states.setdefault(current_user.id, {}).setdefault(game_id, {}).setdefault('player_score', 0)
         initial_description += format_room_description(current_user.id, game_id, start_room)
         # Execute ON_ENTER scripts for the start room - Pass new room ID for condition check
         script_result_on_enter = find_and_execute_scripts(current_user.id, game_id, "ON_ENTER", current_room_id_for_condition=start_room.id)
         script_output_on_enter = script_result_on_enter["messages"]
         if script_output_on_enter: initial_description += "\n" + script_output_on_enter
         # Note: points_from_enter are added to the score in state, but not reported as 'points_awarded' on reset
    else:
         initial_description += "Kon startlocatie niet vinden."


    return jsonify({
        "current_score": 0, # Score is always 0 after reset
        "message": initial_description,
        "current_room_id": start_room_id,
        "image_path": start_room_image,
        "in_conversation": False,
        }), 200
