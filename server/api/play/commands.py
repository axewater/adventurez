# /server/api/play/commands.py
import uuid
import re
import random
from flask_login import current_user
from typing import Dict, Any, Optional, Tuple, Union, List

from sqlalchemy.orm import joinedload

from app import db
from models import Room, Connection, Entity, EntityType, Conversation, Game
from . import state
from .helpers import (
    format_room_description, get_current_entity_location,
    find_and_execute_scripts, execute_action, evaluate_condition
)
from .conversation import start_conversation
from .helpers import get_valid_npc_exits, get_arrival_direction, NpcMovementDetail

# --- Internal Helper Function for Movement ---

def _handle_movement(user_id: uuid.UUID, game_id: uuid.UUID, current_room: Room, direction: str, current_game_vars: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handles the logic for attempting to move in a specific direction.

    Returns:
        A dictionary containing the outcome:
        - next_room_id: UUID of the destination room (or current room if failed).
        - message: String message for the player.
        - room_image_path: Path for the destination room's image.
        - points_awarded: Points gained from ON_ENTER scripts.
        - game_won: Boolean indicating if the game was won.
        - win_image_path: Path for the win image if game_won is True.
    """
    connection = db.session.query(Connection).filter_by(
        from_room_id=current_room.id, direction=direction
    ).options(joinedload(Connection.to_room)).first()

    if connection and connection.to_room:
        connection_state_key = f'unlocked_{connection.direction.lower()}'
        is_unlocked_in_state = current_game_vars.get(connection_state_key, False) is True

        if connection.is_locked and not is_unlocked_in_state:
            return {
                "next_room_id": current_room.id,
                "message": f"De weg naar {direction.capitalize()} is op slot.",
                "room_image_path": current_room.image_path,
                "points_awarded": 0, "game_won": False, "win_image_path": None
            }
        else:
            destination_room = connection.to_room
            message = f"Je gaat {connection.direction.capitalize()}.\n\n"
            message += format_room_description(user_id, game_id, destination_room)
            # Execute ON_ENTER scripts for the new room
            script_result = find_and_execute_scripts(user_id, game_id, "ON_ENTER", current_room_id_for_condition=destination_room.id)
            if script_result["messages"]: message += "\n" + script_result["messages"]
            return {
                "next_room_id": destination_room.id, "message": message, "room_image_path": destination_room.image_path,
                "points_awarded": script_result["points_awarded"], "game_won": script_result["game_won"], "win_image_path": script_result["win_image_path"]
            }
    else:
        return {"next_room_id": current_room.id, "message": "Je kunt niet die kant op.", "room_image_path": current_room.image_path, "points_awarded": 0, "game_won": False, "win_image_path": None}

# --- NEW: NPC Movement Logic ---

def _handle_npc_movement(user_id: uuid.UUID, game_id: uuid.UUID) -> List[NpcMovementDetail]:
    """
    Processes movement for all mobile NPCs in the game for the current turn.
    Updates temporary entity locations and returns details of NPCs that moved.
    """
    moved_npcs: List[NpcMovementDetail] = []
    current_game_vars = state.game_states.setdefault(user_id, {}).setdefault(game_id, {})
    current_locations = state.entity_locations.setdefault(user_id, {}).setdefault(game_id, {})

    # Get all mobile NPCs for this game
    mobile_npcs = db.session.query(Entity).filter_by(
        game_id=game_id,
        is_mobile=True,
        type=EntityType.NPC
    ).all()

    for npc in mobile_npcs:
        # 1. Check if NPC is currently in a room
        npc_loc_info = get_current_entity_location(user_id, game_id, npc.id)
        if not isinstance(npc_loc_info, dict) or 'room_id' not in npc_loc_info:
            continue # NPC is not in a room (maybe inventory, container, or unplaced)

        current_room_id = npc_loc_info['room_id']

        # 2. Decide if the NPC wants to move (25% chance)
        if random.random() <= 0.25: # 25% chance to move
            # 3. Find valid exits
            valid_exits = get_valid_npc_exits(current_room_id, current_game_vars)
            if not valid_exits:
                continue # No valid exits from current room

            # 4. Choose a random exit
            chosen_exit = random.choice(valid_exits)
            next_room_id = chosen_exit.to_room_id

            # 5. Update temporary location and record movement
            current_locations[npc.id] = {'room_id': next_room_id}
            moved_npcs.append({'npc_id': npc.id, 'npc_name': npc.name, 'from_room_id': current_room_id, 'to_room_id': next_room_id, 'direction_used': chosen_exit.direction})
            print(f"NPC Movement: {npc.name} moved from {current_room_id} to {next_room_id} via {chosen_exit.direction}")

    return moved_npcs

def process_command(user_id: uuid.UUID, game_id: uuid.UUID, current_room_id: uuid.UUID, command_text: str) -> Dict[str, Any]:
    """Processes a player command and updates the game state."""

    current_room = db.session.get(Room, current_room_id)
    if not current_room:
        return {"error": "Current room not found", "status_code": 404}

    # Store the player's room ID at the beginning of the turn
    player_room_id_at_start_of_turn = current_room_id

    # Ensure state dictionaries exist
    current_inventory_ids = state.player_inventory.setdefault(user_id, {}).setdefault(game_id, set())
    current_game_vars = state.game_states.setdefault(user_id, {}).setdefault(game_id, {})
    current_locations = state.entity_locations.setdefault(user_id, {}).setdefault(game_id, {})

    # --- Process NPC Movement FIRST ---
    npc_movements_this_turn = _handle_npc_movement(user_id, game_id)

    parts = command_text.split(maxsplit=1)
    verb = parts[0].lower()
    argument = parts[1] if len(parts) > 1 else None

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

    next_room_id = current_room_id
    entity_image_path = None # For 'look [entity]' command
    room_image_path = current_room.image_path # Default to current room image
    in_conversation = False # Default conversation state
    node_type = None # Default conversation node type
    points_awarded = 0 # Track points awarded by scripts/actions this command

    game_won = False
    win_image_path = None

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

    # --- Process Verb (if not handled by script) ---
    if not command_handled_by_script:
        if verb in ["kijk", "look", "l"]:
            if argument:
                # Look at entity or direction
                target_name_lower = argument.lower()
                target_entity, target_connection = _find_target_in_room(user_id, game_id, current_room_id, target_name_lower)

                if target_entity:
                    response_message += target_entity.description or f"Je bekijkt de {target_entity.name}. Er is niets bijzonders aan te zien."
                    entity_image_path = target_entity.image_path
                elif target_connection:
                    connection_state_key = f'unlocked_{target_connection.direction.lower()}'
                    is_unlocked_in_state = current_game_vars.get(connection_state_key, False) is True
                    if target_connection.is_locked and not is_unlocked_in_state:
                        response_message += f"In de richting {target_name_lower.capitalize()} is een doorgang, maar deze zit op slot."
                    else:
                        response_message += f"De doorgang naar {target_name_lower.capitalize()} is open."
                else:
                    response_message += f"Je ziet hier geen '{argument}'."
            else:
                # Look at room
                response_message += format_room_description(user_id, game_id, current_room)
                script_result_on_look: Dict[str, Any] = find_and_execute_scripts(user_id, game_id, "ON_LOOK", current_room_id_for_condition=current_room_id)
                if script_result_on_look["messages"]:
                    response_message += "\n\n" + script_result_on_look["messages"] # Add extra newline for separation
                points_awarded += script_result_on_look["points_awarded"]
                if script_result_on_look["game_won"]: # Check win state after ON_LOOK script
                    game_won = True
                    win_image_path = script_result_on_look["win_image_path"]

        elif verb in ["ga", "loop", "go", "walk"]:
            if not argument:
                response_message += "Waar wil je heen gaan?"
            else:
                direction_full = direction_map.get(argument.lower()) # Translate abbreviation
                if direction_full:
                    move_result = _handle_movement(user_id, game_id, current_room, direction_full, current_game_vars)
                    next_room_id = move_result["next_room_id"]
                    response_message += move_result["message"]
                    room_image_path = move_result["room_image_path"]
                    points_awarded += move_result["points_awarded"]
                    game_won = move_result["game_won"]
                    win_image_path = move_result["win_image_path"]
                else:
                    response_message += "Dat is geen geldige richting."

        # --- Handle single-letter movement commands directly ---
        elif verb in direction_map:
            direction_full = direction_map[verb]
            move_result = _handle_movement(user_id, game_id, current_room, direction_full, current_game_vars)
            next_room_id = move_result["next_room_id"]
            response_message += move_result["message"]
            room_image_path = move_result["room_image_path"]
            points_awarded += move_result["points_awarded"]
            game_won = move_result["game_won"]
            win_image_path = move_result["win_image_path"]

        # --- Inventory Command ---
        elif verb in ["inventaris", "inv", "i"]: # Added 'i'
            if current_inventory_ids:
                inventory_items = db.session.query(Entity).filter(Entity.id.in_(current_inventory_ids)).all()
                item_names = [item.name for item in inventory_items]
                if item_names: response_message += "Je draagt bij je:\n" + "\n".join(f"- {name}" for name in sorted(item_names))
                else: response_message += "Je draagt niets bij je."
            else:
                response_message += "Je draagt niets bij je."

        elif verb in ["gebruik", "use"]:
            if not argument:
                response_message += "Wat wil je gebruiken?"
            elif " op " not in argument.lower():
                 # Simple 'gebruik [item]' - default behavior if no script handled it
                 response_message += "Waar wil je dat op gebruiken?"
            else:
                 # 'gebruik [item] op [target]' - default behavior if no script handled it
                 parts = re.split(r'\s+op\s+', argument, 1, re.IGNORECASE)
                 item_name_lower = parts[0].strip().lower()
                 target_name_lower = parts[1].strip().lower()
                 response_message += f"Je kunt de {item_name_lower} niet op {target_name_lower} gebruiken."

        elif verb in ["pak", "neem", "take"]:
             if not argument: response_message += "Wat wil je pakken?"
             else:
                 item_name_lower = argument.lower()
                 target_entity, _ = _find_target_in_room(user_id, game_id, current_room_id, item_name_lower)

                 take_trigger = f"ON_TAKE({item_name_lower})" # Check if script handles it
                 script_result_on_take: Dict[str, Any] = find_and_execute_scripts(user_id, game_id, take_trigger, current_room_id_for_condition=current_room_id)
                 item_already_in_inventory = target_entity and target_entity.id in current_inventory_ids

                 if script_result_on_take["messages"]:
                     response_message += script_result_on_take["messages"]
                     points_awarded += script_result_on_take["points_awarded"]
                     if script_result_on_take["game_won"]: # Check win state after ON_TAKE script
                         game_won = True
                         win_image_path = script_result_on_take["win_image_path"]
                 elif item_already_in_inventory: 
                     response_message += f"Je hebt de {argument} al."
                 elif not target_entity: 
                     response_message += f"Je ziet hier geen '{argument}'."
                 elif target_entity.type != EntityType.ITEM: 
                     response_message += f"Je kunt '{argument}' niet pakken."
                 elif not target_entity.is_takable: 
                     response_message += f"Je kunt de {argument} niet oppakken."
                 else: 
                     current_inventory_ids.add(target_entity.id)
                     current_locations[target_entity.id] = 'inventory'
                     # NEW: Use custom pickup message if available
                     pickup_msg = target_entity.pickup_message
                     response_message += pickup_msg if pickup_msg else f"Je pakt de {argument}."

        elif verb in ["stop", "leg", "put"]:
            if not argument or " in " not in argument.lower():
                response_message += f"Wat wil je waar in stoppen? Gebruik: '{verb} [voorwerp] in [container]'."
            else:
                parts = re.split(r'\s+in\s+', argument, 1, re.IGNORECASE)
                item_name_lower = parts[0].strip().lower()
                container_name_lower = parts[1].strip().lower()

                item_entity = _find_item_in_inventory(user_id, game_id, item_name_lower)

                if item_entity is None: response_message += f"Je hebt geen '{parts[0]}' bij je."
                elif item_entity == "AMBIGUOUS": response_message += f"Je hebt meerdere voorwerpen genaamd '{parts[0]}'. Wees specifieker."
                else:
                    container_entity, _ = _find_target_in_room(user_id, game_id, current_room_id, container_name_lower)

                    if not container_entity: response_message += f"Je ziet hier geen '{parts[1]}'."
                    elif not container_entity.is_container: response_message += f"Je kunt niets in de {container_entity.name} stoppen."
                    else:
                        current_inventory_ids.remove(item_entity.id)
                        current_locations[item_entity.id] = {'container_id': container_entity.id}
                        response_message += f"Je stopt de {item_entity.name} in de {container_entity.name}."

        elif verb in ["praat", "talk", "spreek"]:
            if not argument:
                response_message += "Met wie wil je praten?"
            else:
                npc_name_lower = argument.lower()
                target_npc, _ = _find_target_in_room(user_id, game_id, current_room_id, npc_name_lower, entity_type=EntityType.NPC)

                if not target_npc:
                    response_message += f"Je ziet hier niemand genaamd '{argument}'."
                elif not target_npc.conversation_id:
                    response_message += f"{target_npc.name} heeft niets te zeggen."
                else:
                    conv_result, _ = start_conversation(user_id, game_id, target_npc.id, target_npc.conversation_id)
                    if "error" in conv_result:
                        response_message += f"Fout bij starten gesprek: {conv_result['error']}"
                    else: 
                        response_message += conv_result.get("message", "Gesprek gestart.")
                        in_conversation = conv_result.get("in_conversation", False)
                        node_type = conv_result.get("node_type")

        elif verb in ["help", "h", "?", "info"]:
            response_message += """
Basis Commando's:
  kijk (l)             : Beschrijf de huidige locatie, objecten en uitgangen.
  kijk [object/richting]: Bekijk een specifiek object of een uitgang.
  ga [richting]        : Verplaats naar een andere locatie (bv. 'ga noord', 'ga n', 'ga omhoog', 'ga omlaag').
                         Richtingen: noord (n), oost (o), zuid (z), west (w), omhoog (h), omlaag (l).
  pak [voorwerp]       : Probeer een voorwerp op te pakken.
  gebruik [item] op [target]: Gebruik een item op iets anders.
  stop [voorwerp] in [container]: Stop een voorwerp uit je inventaris in een container.
  inventaris (inv/i)   : Toon de voorwerpen die je bij je draagt.
  praat [NPC]          : Begin een gesprek met een personage (NPC).
  help (h/?)           : Toon deze help tekst.
  opslaan              : Sla de huidige spelvoortgang op.
  laden                : Laad de opgeslagen spelvoortgang.
  reset                : Reset de huidige speelsessie (inventaris, voortgang).

Probeer dingen uit!
            """.strip()

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
        "win_image_path": win_image_path # NEW: Include win image path if won
    }


# --- Internal Helper Functions for Command Processing ---

def _find_target_in_room(user_id: uuid.UUID, game_id: uuid.UUID, room_id: uuid.UUID, target_name_lower: str, entity_type: Optional[EntityType] = None) -> Tuple[Optional[Entity], Optional[Connection]]:
    """Finds an entity or connection in the current room by name/direction."""
    # 1. Check for Entity first (using current location)
    target_entity = None
    all_game_entities = db.session.query(Entity).filter_by(game_id=game_id).all() # Inefficient, optimize later
    for entity in all_game_entities: 
        loc_info = get_current_entity_location(user_id, game_id, entity.id)
        # Check if entity is in the current room and matches the name and optionally type
        if isinstance(loc_info, dict) and loc_info.get('room_id') == room_id and entity.name.lower() == target_name_lower:
            if entity_type is None or entity.type == entity_type:
                target_entity = entity
                break # Found entity

    if target_entity:
        return target_entity, None

    # 2. If not an entity, check if it's a Connection Direction
    target_connection = db.session.query(Connection).filter_by(
        from_room_id=room_id, direction=target_name_lower
    ).first()

    return None, target_connection


def _find_item_in_inventory(user_id: uuid.UUID, game_id: uuid.UUID, item_name_lower: str) -> Optional[Union[Entity, str]]:
    """Finds an item in the player's inventory by name. Returns Entity, None, or 'AMBIGUOUS'."""
    current_inventory_ids = state.player_inventory.get(user_id, {}).get(game_id, set())
    if not current_inventory_ids:
        return None

    items_in_inventory = db.session.query(Entity).filter(
        Entity.id.in_(current_inventory_ids),
        db.func.lower(Entity.name) == item_name_lower,
        Entity.type == EntityType.ITEM # Ensure it's an item
    ).all()

    if len(items_in_inventory) == 1:
        return items_in_inventory[0]
    elif len(items_in_inventory) > 1:
        return "AMBIGUOUS"
    else:
        return None
