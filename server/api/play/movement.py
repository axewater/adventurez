import uuid
import re
import random
from typing import Dict, Any, Optional, Tuple, Union, List, TypedDict

from sqlalchemy.orm import joinedload

from app import db
from models import Room, Connection, Entity, EntityType
from . import state
from .helpers import format_room_description, find_and_execute_scripts, get_current_entity_location

# --- Direction Mapping ---
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

# --- Type Hint for NPC Movement ---
class NpcMovementDetail(TypedDict):
    npc_id: uuid.UUID
    npc_name: str
    from_room_id: uuid.UUID
    to_room_id: uuid.UUID
    direction_used: str

# --- Helper Functions for Movement ---

def get_valid_npc_exits(room_id: uuid.UUID, current_game_vars: Dict[str, Any]) -> List[Connection]:
    """Finds all connections leading FROM a room that are currently passable by an NPC."""
    valid_exits = []
    connections = db.session.query(Connection).filter_by(from_room_id=room_id).all()
    for conn in connections:
        connection_state_key = f'unlocked_{conn.direction.lower()}'
        is_unlocked_in_state = current_game_vars.get(connection_state_key, False) is True

        if not conn.is_locked or is_unlocked_in_state:
            valid_exits.append(conn)
    return valid_exits

def get_arrival_direction(exit_direction: str) -> str:
    """Returns the direction description for arrival based on the exit direction used."""
    reverse_map = {
        "noord": "het Zuiden",
        "zuid": "het Noorden",
        "oost": "het Westen",
        "west": "het Oosten",
        "omhoog": "Beneden",
        "omlaag": "Boven",
        "in": "Buiten",
        "uit": "Binnen",
    }
    return reverse_map.get(exit_direction.lower(), exit_direction.capitalize())

# --- Core Movement Logic ---

def handle_player_movement(user_id: uuid.UUID, game_id: uuid.UUID, current_room: Room, direction: str) -> Dict[str, Any]:
    """
    Handles the logic for a player attempting to move in a specific direction.

    Returns:
        A dictionary containing the outcome:
        - next_room_id: UUID of the destination room (or current room if failed).
        - message: String message for the player.
        - room_image_path: Path for the destination room's image.
        - points_awarded: Points gained from ON_ENTER scripts.
        - game_won: Boolean indicating if the game was won.
        - win_image_path: Path for the win image if game_won is True.
    """
    current_game_vars = state.game_states.setdefault(user_id, {}).setdefault(game_id, {})
    direction_full = direction_map.get(direction.lower())
    if not direction_full:
        return {"next_room_id": current_room.id, "message": "Dat is geen geldige richting.", "room_image_path": current_room.image_path, "points_awarded": 0, "game_won": False, "win_image_path": None}

    connection = db.session.query(Connection).filter_by(
        from_room_id=current_room.id, direction=direction_full
    ).options(joinedload(Connection.to_room)).first()

    if connection and connection.to_room:
        connection_state_key = f'unlocked_{connection.direction.lower()}'
        is_unlocked_in_state = current_game_vars.get(connection_state_key, False) is True

        if connection.is_locked and not is_unlocked_in_state:
            return {
                "next_room_id": current_room.id,
                "message": f"De weg naar {direction_full.capitalize()} is op slot.",
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


def handle_npc_movement(user_id: uuid.UUID, game_id: uuid.UUID) -> List[NpcMovementDetail]:
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
