# /server/api/play/commands.py
import uuid
import re
from typing import Dict, Any, Optional, List

from sqlalchemy.orm import joinedload

from app import db
from models import Room, Game
from . import state
from .helpers import (
    find_and_execute_scripts
)
from .movement import (
    handle_player_movement, handle_npc_movement, get_arrival_direction, direction_map, NpcMovementDetail
)
from .inventory_actions import handle_inventory_command, handle_take_command, handle_put_in_command, handle_drop_command
from .interaction_actions import handle_look_command, handle_use_command, handle_talk_command, handle_help_command

def process_command(user_id: uuid.UUID, game_id: uuid.UUID, current_room_id: uuid.UUID, command_text: str) -> Dict[str, Any]:
    """Processes a player command and updates the game state."""

    current_room = db.session.get(Room, current_room_id)
    if not current_room:
        return {"error": "Current room not found", "status_code": 404}

    # Store the player's room ID at the beginning of the turn
    player_room_id_at_start_of_turn = current_room_id

    # Ensure game state dictionary exists for score tracking etc.
    current_game_vars = state.game_states.setdefault(user_id, {}).setdefault(game_id, {})

    # --- Process NPC Movement FIRST ---
    npc_movements_this_turn = handle_npc_movement(user_id, game_id)

    response_message = ""
    # --- Direction Abbreviations ---
    direction_map = {
        "n": "noord", "noord": "noord",
        "o": "oost", "oost": "oost",
        "z": "zuid", "zuid": "zuid",
        "w": "west", "west": "west",
        "h": "omhoog", "omhoog": "omhoog",
        "l": "omlaag", "omlaag": "omlaag",
        "in": "in",
        "uit": "uit",
    }

    parts = command_text.split(maxsplit=1)
    verb = parts[0].lower()
    argument = parts[1].strip() if len(parts) > 1 else None

    next_room_id = current_room_id
    entity_image_path = None # For 'look [entity]' command
    room_image_path = current_room.image_path # Default to current room image
    in_conversation = False # Default conversation state
    node_type = None # Default conversation node type
    points_awarded = 0 # Track points awarded by scripts/actions this command

    game_won = False
    win_image_path = None
    game_loss = False # NEW: Loss status
    loss_reason = None # NEW: Reason for losing
    loss_image_path = None # NEW: Path to loss image
    default_loss_image = "standaard_verloren.jpg" # Hardcoded default

    # --- Execute ON_COMMAND scripts first ---
    # TODO: Improve trigger matching (e.g., ON_COMMAND(verb), ON_COMMAND(verb object))
    command_trigger = f"ON_COMMAND({command_text})" # Simple trigger for now - Pass current room ID for condition check
    script_result_on_command: Dict[str, Any] = find_and_execute_scripts(user_id, game_id, command_trigger, current_room_id_for_condition=current_room_id)
    command_handled_by_script = bool(script_result_on_command["messages"]) # Flag if script produced output
    if command_handled_by_script:
        points_awarded += script_result_on_command["points_awarded"] # Add points from script
        response_message += script_result_on_command["messages"] + "\n\n"
        if script_result_on_command["game_won"]:
            game_won = True
            win_image_path = script_result_on_command["win_image_path"]
        # NEW: Check for loss state from script
        if script_result_on_command["game_loss"]:
            game_loss = True
            loss_reason = script_result_on_command["loss_reason"]
            loss_image_path = script_result_on_command["loss_image"] # Custom image from script

    # --- Process Verb (if not handled by script) ---
    if not command_handled_by_script:
        # Interaction Commands
        if verb in ["kijk", "look", "l"]:
            result = handle_look_command(user_id, game_id, current_room, argument)
            response_message += result["message"]
            room_image_path = result["room_image_path"] # Can be None if looking at inventory
            entity_image_path = result["entity_image_path"]
            points_awarded += result["points_awarded"]
            game_won = result["game_won"] or game_won # Keep existing win state if true
            win_image_path = result["win_image_path"] or win_image_path
            # NEW: Check loss state from look command (e.g., ON_LOOK script)
            if result.get("game_loss"): # Check if key exists and is true
                game_loss = True
                loss_reason = result.get("loss_reason")
                loss_image_path = result.get("loss_image")

        elif verb in ["gebruik", "use"]:
            result = handle_use_command(user_id, game_id, current_room_id, argument)
            response_message += result["message"]
            # Use command itself doesn't award points directly

        elif verb in ["praat", "talk", "spreek"]:
            result = handle_talk_command(user_id, game_id, current_room_id, argument)
            response_message += result["message"]
            in_conversation = result["in_conversation"]
            node_type = result["node_type"]
            # Talk command itself doesn't award points directly

        elif verb in ["help", "h", "?", "info"]:
            response_message += handle_help_command()

        # Movement Commands
        elif verb in ["ga", "loop", "go", "walk"]:
            if not argument:
                response_message += "Waar wil je heen gaan?"
            else:
                move_result = handle_player_movement(user_id, game_id, current_room, argument)
                next_room_id = move_result["next_room_id"]
                response_message += move_result["message"]
                room_image_path = move_result["room_image_path"]
                points_awarded += move_result["points_awarded"]
                game_won = move_result["game_won"] or game_won
                win_image_path = move_result["win_image_path"] or win_image_path
                # NEW: Check loss state from movement (e.g., ON_ENTER script)
                if move_result.get("game_loss"):
                    game_loss = True
                    loss_reason = move_result.get("loss_reason")
                    loss_image_path = move_result.get("loss_image")

        elif verb in direction_map:
            # Handle single-letter movement commands directly
            move_result = handle_player_movement(user_id, game_id, current_room, verb)
            next_room_id = move_result["next_room_id"]
            response_message += move_result["message"]
            room_image_path = move_result["room_image_path"]
            points_awarded += move_result["points_awarded"]
            game_won = move_result["game_won"] or game_won
            win_image_path = move_result["win_image_path"] or win_image_path
            # NEW: Check loss state from movement (e.g., ON_ENTER script)
            if move_result.get("game_loss"):
                game_loss = True
                loss_reason = move_result.get("loss_reason")
                loss_image_path = move_result.get("loss_image")

        # Inventory Commands
        elif verb in ["inventaris", "inv", "i"]: # Added 'i'
            response_message += handle_inventory_command(user_id, game_id)

        elif verb in ["pak", "neem", "take"]:
             result = handle_take_command(user_id, game_id, current_room_id, argument)
             response_message += result["message"]
             points_awarded += result["points_awarded"]
             game_won = result["game_won"] or game_won
             win_image_path = result["win_image_path"] or win_image_path
             # NEW: Check loss state from take command (e.g., ON_TAKE script)
             if result.get("game_loss"):
                 game_loss = True
                 loss_reason = result.get("loss_reason")
                 loss_image_path = result.get("loss_image")

        elif verb in ["stop", "leg", "put"]:
            # Check if it's 'stop X in Y' or just 'leg neer X'
            if argument and " in " in argument.lower():
                result = handle_put_in_command(user_id, game_id, current_room_id, argument)
            else:
                # Assume 'leg neer' (drop) if 'in' is not present
                result = handle_drop_command(user_id, game_id, current_room_id, argument)
            response_message += result["message"]
            # Drop/Put commands usually don't award points directly

        else:
            # Default "don't understand" if no script handled it and verb is unknown
            response_message += f"Ik begrijp '{command_text}' niet."

    # --- Add NPC Departure/Arrival Notifications ---
    # Check which NPCs moved *into* the player's *final* room this turn
    npc_arrival_messages = []
    npc_departure_messages = []
    for move in npc_movements_this_turn:
        # Check for arrivals into the room the player *ends up* in
        if move['to_room_id'] == next_room_id:
            arrival_direction = get_arrival_direction(move['direction_used'])
            npc_arrival_messages.append(f"{move['npc_name']} komt binnenwandelen vanuit {arrival_direction}.")
        # Check for departures from the room the player *started* in
        elif move['from_room_id'] == player_room_id_at_start_of_turn:
            departure_direction = move['direction_used'].capitalize()
            npc_departure_messages.append(f"{move['npc_name']} gaat richting {departure_direction}.")
    if npc_departure_messages:
        response_message = "\n".join(npc_departure_messages) + "\n\n" + response_message # Prepend departure messages
    if npc_arrival_messages:
        response_message = "\n".join(npc_arrival_messages) + "\n\n" + response_message # Prepend arrival messages

    # --- Determine Final Loss Image Path ---
    if game_loss:
        # Priority: Custom script image > Game default loss image > Hardcoded default
        if not loss_image_path: # If script didn't provide one
            game = db.session.get(Game, game_id)
            if game and game.loss_image_path:
                loss_image_path = game.loss_image_path
            else:
                loss_image_path = default_loss_image # Fallback to hardcoded
        # Ensure win state is false if loss state is true
        game_won = False

    # --- Final Response Formatting ---
    final_message = response_message.strip()
    if not final_message and command_handled_by_script:
        # If a script handled the command but produced no output message
        final_message = "Oké."
    elif not final_message:
        # If no script handled it and the verb processing resulted in no message
        final_message = "Er gebeurt niets bijzonders."

    current_score = current_game_vars.get('player_score', 0)

    return {
        "message": final_message,
        "in_conversation": in_conversation,
        "node_type": node_type,
        "image_path": room_image_path,
        "entity_image_path": entity_image_path,
        "current_score": current_score,
        "points_awarded": points_awarded,
        "current_room_id": str(next_room_id),
        "game_won": game_won, # NEW: Include win status
        "win_image_path": win_image_path, # NEW: Include win image path if won
        "game_loss": game_loss, # NEW: Include loss status
        "loss_reason": loss_reason, # NEW: Include loss reason if lost
        "loss_image_path": loss_image_path # NEW: Include loss image path if lost
    }
