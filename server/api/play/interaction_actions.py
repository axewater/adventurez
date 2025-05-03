import uuid
import re
from typing import Dict, Any, Optional, Tuple, Union, Set

from app import db
from models import Entity, EntityType, Room
from . import state, conversation
from .helpers import format_room_description, find_and_execute_scripts, get_current_entity_location, find_item_in_inventory, find_target_in_room

def handle_look_command(user_id: uuid.UUID, game_id: uuid.UUID, current_room: Room, argument: Optional[str]) -> Dict[str, Any]:
    """Handles the 'kijk'/'look'/'l' command."""
    response_message = ""
    entity_image_path = None
    room_image_path = current_room.image_path
    points_awarded = 0
    game_won = False
    win_image_path = None
    current_game_vars = state.game_states.setdefault(user_id, {}).setdefault(game_id, {})

    if argument:
        # Look at entity or direction
        target_name_lower = argument.lower()
        target_entity, target_connection = find_target_in_room(user_id, game_id, current_room.id, target_name_lower)

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
            # Check inventory if not found in room
            item_in_inventory = find_item_in_inventory(user_id, game_id, target_name_lower)
            if item_in_inventory and item_in_inventory != "AMBIGUOUS":
                response_message += item_in_inventory.description or f"Je bekijkt de {item_in_inventory.name} in je inventaris. Er is niets bijzonders aan te zien."
                entity_image_path = item_in_inventory.image_path
                room_image_path = None # Don't show room image when looking at inventory item
            elif item_in_inventory == "AMBIGUOUS":
                response_message += f"Je hebt meerdere dingen genaamd '{argument}' in je inventaris. Wees specifieker."
            else:
                response_message += f"Je ziet hier geen '{argument}' en je hebt het ook niet bij je."
    else:
        # Look at room
        response_message += format_room_description(user_id, game_id, current_room)
        script_result_on_look: Dict[str, Any] = find_and_execute_scripts(user_id, game_id, "ON_LOOK", current_room_id_for_condition=current_room.id)
        if script_result_on_look["messages"]:
            response_message += "\n\n" + script_result_on_look["messages"] # Add extra newline for separation
        points_awarded += script_result_on_look["points_awarded"]
        if script_result_on_look["game_won"]: # Check win state after ON_LOOK script
            game_won = True
            win_image_path = script_result_on_look["win_image_path"]

    return {
        "message": response_message,
        "room_image_path": room_image_path,
        "entity_image_path": entity_image_path,
        "points_awarded": points_awarded,
        "game_won": game_won,
        "win_image_path": win_image_path
    }

def handle_use_command(user_id: uuid.UUID, game_id: uuid.UUID, current_room_id: uuid.UUID, argument: Optional[str]) -> Dict[str, Any]:
    """Handles the 'gebruik'/'use' command."""
    response_message = ""
    # Use command itself doesn't award points, scripts triggered by it do
    points_awarded = 0
    game_won = False
    win_image_path = None

    if not argument:
        response_message = "Wat wil je gebruiken?"
    elif " op " not in argument.lower():
         # Simple 'gebruik [item]' - default behavior if no script handled it
         response_message = "Waar wil je dat op gebruiken?"
    else:
         # 'gebruik [item] op [target]' - default behavior if no script handled it
         parts = re.split(r'\s+op\s+', argument, 1, re.IGNORECASE)
         item_name_lower = parts[0].strip().lower()
         target_name_lower = parts[1].strip().lower()
         response_message = f"Je kunt de {item_name_lower} niet op {target_name_lower} gebruiken."
         # Note: Script execution for ON_USE should happen in process_command *before* this default is reached.

    return {"message": response_message, "points_awarded": points_awarded, "game_won": game_won, "win_image_path": win_image_path}

def handle_talk_command(user_id: uuid.UUID, game_id: uuid.UUID, current_room_id: uuid.UUID, argument: Optional[str]) -> Dict[str, Any]:
    """Handles the 'praat'/'talk'/'spreek' command."""
    response_message = ""
    in_conversation = False
    node_type = None
    entity_image_path = None # Initialize image path
    # Talk command itself doesn't award points, conversation actions do
    points_awarded = 0
    game_won = False
    win_image_path = None

    if not argument:
        response_message = "Met wie wil je praten?"
    else:
        npc_name_lower = argument.lower()
        target_npc, _ = find_target_in_room(user_id, game_id, current_room_id, npc_name_lower, entity_type=EntityType.NPC)

        if not target_npc:
            response_message = f"Je ziet hier niemand genaamd '{argument}'."
        elif not target_npc.conversation_id:
            response_message = f"{target_npc.name} heeft niets te zeggen."
        else:
            conv_result, _ = conversation.start_conversation(user_id, game_id, target_npc.id, target_npc.conversation_id)
            if "error" in conv_result:
                response_message = f"Fout bij starten gesprek: {conv_result['error']}"
            else:
                response_message = conv_result.get("message", "Gesprek gestart.")
                in_conversation = conv_result.get("in_conversation", False)
                entity_image_path = target_npc.image_path # Get NPC image path
                node_type = conv_result.get("node_type")

    return {
        "message": response_message,
        "in_conversation": in_conversation,
        "node_type": node_type,
        "points_awarded": points_awarded,
        "entity_image_path": entity_image_path, # Add image path to result
        "game_won": game_won,
        "win_image_path": win_image_path
    }

def handle_help_command() -> str:
    """Handles the 'help'/'h'/'?'/'info' command."""
    return """
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
