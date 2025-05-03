import uuid
import re
from typing import Dict, Any, Optional, Union, Set

from app import db
from models import Entity, EntityType
from . import state, conversation
from .helpers import (
    find_and_execute_scripts, get_current_entity_location,
    find_item_in_inventory, find_target_in_room
)

# --- Inventory Command Handlers ---

def handle_inventory_command(user_id: uuid.UUID, game_id: uuid.UUID) -> str:
    """Handles the 'inventaris'/'inv'/'i' command."""
    current_inventory_ids = state.player_inventory.get(user_id, {}).get(game_id, set())
    if current_inventory_ids:
        inventory_items = db.session.query(Entity).filter(Entity.id.in_(current_inventory_ids)).all()
        item_names = [item.name for item in inventory_items]
        if item_names:
            return "Je draagt bij je:\n" + "\n".join(f"- {name}" for name in sorted(item_names))
        else:
            return "Je draagt niets bij je."
    else:
        return "Je draagt niets bij je."

def handle_take_command(user_id: uuid.UUID, game_id: uuid.UUID, current_room_id: uuid.UUID, argument: Optional[str]) -> Dict[str, Any]:
    """Handles the 'pak'/'neem'/'take' command."""
    response_message = ""
    points_awarded = 0
    game_won = False
    win_image_path = None

    if not argument:
        response_message = "Wat wil je pakken?"
    else:
        item_name_lower = argument.lower()
        target_entity, _ = find_target_in_room(user_id, game_id, current_room_id, item_name_lower)
        current_inventory_ids = state.player_inventory.setdefault(user_id, {}).setdefault(game_id, set())
        current_locations = state.entity_locations.setdefault(user_id, {}).setdefault(game_id, {})

        # --- Execute ON_TAKE script BEFORE adding item to inventory ---
        if target_entity: # Only execute script if target exists
            take_trigger = f"ON_TAKE({target_entity.name})" # Use the actual entity name for the trigger
            script_result_on_take: Dict[str, Any] = find_and_execute_scripts(user_id, game_id, take_trigger, current_room_id_for_condition=current_room_id)
            if script_result_on_take["messages"]:
                response_message += script_result_on_take["messages"] + "\n"
                points_awarded += script_result_on_take["points_awarded"]
                if script_result_on_take["game_won"]: # Check win state after ON_TAKE script
                    game_won = True
                    win_image_path = script_result_on_take["win_image_path"]

        item_already_in_inventory = target_entity and target_entity.id in current_inventory_ids

        if item_already_in_inventory:
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
            pickup_msg = target_entity.pickup_message
            response_message += pickup_msg if pickup_msg else f"Je pakt de {argument}."

    return {"message": response_message, "points_awarded": points_awarded, "game_won": game_won, "win_image_path": win_image_path}

def handle_drop_command(user_id: uuid.UUID, game_id: uuid.UUID, current_room_id: uuid.UUID, argument: Optional[str]) -> Dict[str, Any]:
    """Handles the 'drop'/'leg neer' command (Simple drop in current room)."""
    response_message = ""
    points_awarded = 0 # Drop action itself usually doesn't award points unless scripted

    if not argument:
        response_message = "Wat wil je neerleggen?"
    else:
        item_name_lower = argument.lower()
        item_entity = find_item_in_inventory(user_id, game_id, item_name_lower)
        current_inventory_ids = state.player_inventory.setdefault(user_id, {}).setdefault(game_id, set())
        current_locations = state.entity_locations.setdefault(user_id, {}).setdefault(game_id, {})

        if item_entity is None:
            response_message = f"Je hebt geen '{argument}' bij je."
        elif item_entity == "AMBIGUOUS":
            response_message = f"Je hebt meerdere voorwerpen genaamd '{argument}'. Wees specifieker."
        else:
            # Remove from inventory and place in current room
            current_inventory_ids.remove(item_entity.id)
            current_locations[item_entity.id] = {'room_id': current_room_id}
            response_message = f"Je legt de {item_entity.name} neer."
            # TODO: Consider adding ON_DROP script execution here if needed

    return {"message": response_message, "points_awarded": points_awarded, "game_won": False, "win_image_path": None}


def handle_put_in_command(user_id: uuid.UUID, game_id: uuid.UUID, current_room_id: uuid.UUID, argument: Optional[str]) -> Dict[str, Any]:
    """Handles the 'stop [item] in [container]' command."""
    response_message = ""
    points_awarded = 0 # Put action itself usually doesn't award points unless scripted

    if not argument or " in " not in argument.lower():
        response_message = f"Wat wil je waar in stoppen? Gebruik: 'stop [voorwerp] in [container]'."
    else:
        parts = re.split(r'\s+in\s+', argument, 1, re.IGNORECASE)
        item_name_lower = parts[0].strip().lower()
        container_name_lower = parts[1].strip().lower()

        item_entity = find_item_in_inventory(user_id, game_id, item_name_lower)
        current_inventory_ids = state.player_inventory.setdefault(user_id, {}).setdefault(game_id, set())
        current_locations = state.entity_locations.setdefault(user_id, {}).setdefault(game_id, {})

        if item_entity is None:
            response_message = f"Je hebt geen '{parts[0]}' bij je."
        elif item_entity == "AMBIGUOUS":
            response_message = f"Je hebt meerdere voorwerpen genaamd '{parts[0]}'. Wees specifieker."
        else:
            container_entity, _ = find_target_in_room(user_id, game_id, current_room_id, container_name_lower)

            if not container_entity:
                response_message = f"Je ziet hier geen '{parts[1]}'."
            elif not container_entity.is_container:
                response_message = f"Je kunt niets in de {container_entity.name} stoppen."
            else:
                # TODO: Add ON_PUT_IN script execution check here?
                current_inventory_ids.remove(item_entity.id)
                current_locations[item_entity.id] = {'container_id': container_entity.id}
                response_message = f"Je stopt de {item_entity.name} in de {container_entity.name}."

    return {"message": response_message, "points_awarded": points_awarded, "game_won": False, "win_image_path": None}
