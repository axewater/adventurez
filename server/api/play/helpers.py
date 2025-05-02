# /server/api/play/helpers.py
import uuid, re, random
from typing import Optional, Dict, Any, Set, List, Union, Tuple, TypedDict

from flask_login import current_user
from app import db
from models import Room, Connection, Entity, Script, EntityType, HighScore, User, Game
from . import state

# --- Helper Functions ---

def get_current_entity_location(user_id: uuid.UUID, game_id: uuid.UUID, entity_id: uuid.UUID) -> Optional[Union[str, Dict[str, uuid.UUID]]]:
    """Gets the current location (temporary or DB) of an entity."""
    current_locations = state.entity_locations.get(user_id, {}).get(game_id, {})
    temp_loc = current_locations.get(entity_id)

    if temp_loc:
        return temp_loc # Returns 'inventory', {'room_id':...}, or {'container_id':...}
    else:
        # Fetch from DB if not in temporary state
        entity = db.session.get(Entity, entity_id)
        if not entity:
            return None # Entity doesn't exist
        if entity.room_id:
            return {'room_id': entity.room_id}
        elif entity.container_id:
            return {'container_id': entity.container_id}
        else:
            # If no room_id or container_id in DB, assume it's 'unplaced' or potentially 'inventory'
            # This case needs careful handling depending on game design. For now, return None.
            # If an item starts in the DB without a location, it's effectively nowhere until moved.
            return None

def format_room_description(user_id: uuid.UUID, game_id: uuid.UUID, room: Room) -> str:
    """Formats the room description for the player, considering temporary locations and locked exits."""
    # Wrap title in strong tag with a specific class for styling
    # Fetch current game variables to check for temporarily unlocked doors
    current_game_vars = state.game_states.get(user_id, {}).get(game_id, {})
    description = f'<strong class="room-title">{room.title}</strong>\n'
    description += f"{room.description or ''}\n\n" # Ensure description is not None
    current_game_vars = state.game_states.get(user_id, {}).get(game_id, {})
    current_locations = state.entity_locations.get(user_id, {}).get(game_id, {})

    # --- Determine Entities Currently Visible in the Room ---
    visible_entities = []
    # Query all entities potentially related to this game (consider optimization later)
    all_game_entities = db.session.query(Entity).filter_by(game_id=game_id).all()

    for entity in all_game_entities:
        loc_info = get_current_entity_location(user_id, game_id, entity.id)

        if isinstance(loc_info, dict) and loc_info.get('room_id') == room.id:
            visible_entities.append(entity)

    # List containers and their contents
    containers_in_room = [e for e in visible_entities if e.is_container]
    items_in_room_directly = [e for e in visible_entities if not e.is_container]

    if items_in_room_directly:
        description += "Je ziet hier:\n"
        for entity in sorted(items_in_room_directly, key=lambda e: e.name): # Sort for consistent output
            description += f"- {entity.name}\n"
        description += "\n"

    for container in sorted(containers_in_room, key=lambda e: e.name): # Sort for consistent output
        description += f"Je ziet hier ook: {container.name}.\n"
        # TODO: Implement listing items inside containers, checking entity_locations

    # --- List Exits ---
    connections = db.session.query(Connection).filter_by(from_room_id=room.id).all()
    if connections:
        exit_parts = []
        # Sort connections by direction for consistent output
        sorted_connections = sorted(connections, key=lambda c: c.direction)
        for conn in sorted_connections:
            exit_str = conn.direction.upper() # Use direction as the base for the state key
            # Check if the connection is inherently locked AND not marked as unlocked in the current game state
            # Use the current_game_vars fetched at the start of the function
            connection_state_key = f'unlocked_{conn.direction.lower()}' # Key based on direction
            is_unlocked_in_state = current_game_vars.get(connection_state_key, False) is True # Default to False if key not found
            if conn.is_locked and not is_unlocked_in_state:
                exit_str += " (op slot)" # Indicate locked status
            exit_parts.append(exit_str)
        # Wrap "Uitgangen:" in strong tag
        description += f"<strong>Uitgangen:</strong> {', '.join(exit_parts)}\n"
    else:
        description += "Er zijn geen duidelijke uitgangen.\n"

    return description

def evaluate_condition(user_id: uuid.UUID, game_id: uuid.UUID, current_room_id: Optional[uuid.UUID], condition_str: Optional[str]) -> bool:
    """Evaluates a simple condition string against the game state."""
    if not condition_str:
        return True

    # Ensure state dictionaries exist for the user/game
    current_inventory_ids: Set[uuid.UUID] = state.player_inventory.get(user_id, {}).get(game_id, set())
    current_game_vars: Dict[str, Any] = state.game_states.get(user_id, {}).get(game_id, {})
    # current_room_id is passed directly
    # current_locations = state.entity_locations.setdefault(game_id, {}) # Ensure exists if needed

    # Split the condition string into individual lines and evaluate each
    condition_lines = condition_str.strip().split('\n')

    for line in condition_lines:
        line = line.strip().lower()
        if not line: continue # Skip empty lines

        result_for_line = False # Assume false until proven true
        if line.startswith("has_item("):
            item_name_or_id = line[9:-1].strip().lower()
            if not current_inventory_ids: result_for_line = False
            else:
                # Check based on current_inventory_ids which is the source of truth for inventory
                # Need to fetch names if condition uses name
                inventory_entities = db.session.query(Entity.name).filter(Entity.id.in_(current_inventory_ids)).all()
                result_for_line = any(name_tuple[0].lower() == item_name_or_id for name_tuple in inventory_entities)
        elif line.startswith("state("):
            # Example: state(door_unlocked) == "true"
            match = re.match(r"state\((.+?)\)\s*==\s*['\"]?(.+?)['\"]?$", line)
            if match:
                var_name = match.group(1).strip()
                expected_value_str = match.group(2).strip()
                current_value = current_game_vars.get(var_name)
                # Compare based on expected type (simple comparison for now)
                if isinstance(current_value, bool):
                    result_for_line = current_value == (expected_value_str.lower() == 'true')
                else:
                    result_for_line = str(current_value).lower() == expected_value_str.lower()
            else:
                print(f"Warning: Invalid state condition format: {line}")
                result_for_line = False
        elif line.startswith("current_room("):
            # Expect format: CURRENT_ROOM("Room Title")
            try:
                # Extract the title between the quotes
                match = re.match(r'current_room\("(.+?)"\)', line, re.IGNORECASE)
                if match and current_room_id:
                    expected_room_title = match.group(1).strip()
                    current_room = db.session.get(Room, current_room_id)
                    result_for_line = current_room and current_room.title.lower() == expected_room_title.lower()
                else:
                    print(f"Warning: Invalid CURRENT_ROOM format or missing current_room_id. Line: '{line}'")
                    result_for_line = False
            except Exception as e: # Catch potential errors during DB access or comparison
                print(f"Error evaluating CURRENT_ROOM condition: {line}. Error: {e}")
                result_for_line = False
        else:
            print(f"Warning: Unknown condition format: {line}")
            result_for_line = False

        # If any single line evaluates to False, the whole condition is False (AND logic)
        if not result_for_line:
            return False

    # If loop completes without returning False, all lines were True
    return True

def execute_action(user_id: uuid.UUID, game_id: uuid.UUID, action_str: Optional[str]) -> Tuple[str, int]:
    """Executes a simple action string, modifying game state and returning messages."""
    if not action_str:
        return "", 0

    current_inventory_ids: Set[uuid.UUID] = state.player_inventory.setdefault(user_id, {}).setdefault(game_id, set())
    current_game_vars: Dict[str, Any] = state.game_states.setdefault(user_id, {}).setdefault(game_id, {})
    current_locations: Dict[uuid.UUID, Any] = state.entity_locations.setdefault(user_id, {}).setdefault(game_id, {})

    # Split action string into individual commands (separated by newline)
    action_commands = action_str.strip().split('\n')

    action_messages: List[str] = []
    points_awarded_this_action = 0
    for command in action_commands:
        command = command.strip()
        if not command: continue # Skip empty lines

        command_upper = command.upper()

        if command_upper.startswith("SHOW_MESSAGE("):
            message = command[13:-1].strip().strip('"\'')
            action_messages.append(message)
        elif command_upper.startswith("GIVE_ITEM("):
            item_name_or_id = command[10:-1].strip().lower()
            item_entity = db.session.query(Entity).filter(
                Entity.game_id == game_id, db.func.lower(Entity.name) == item_name_or_id, Entity.type == EntityType.ITEM
            ).first()
            if item_entity:
                if item_entity.id not in current_inventory_ids:
                    current_inventory_ids.add(item_entity.id)
                    # --- Update temporary location ---
                    current_locations[item_entity.id] = 'inventory'
                    action_messages.append(f"Je ontvangt: {item_entity.name}.")
                    print(f"Added {item_entity.id} ({item_entity.name}) to inventory. Inventory: {current_inventory_ids}")
                else:
                     action_messages.append(f"Je hebt de {item_entity.name} al.")
            else:
                 print(f"Warning: GIVE_ITEM failed, item '{item_name_or_id}' not found.")
                 action_messages.append(f"[Debug: Item '{item_name_or_id}' not found for GIVE_ITEM]")
        elif command_upper.startswith("SET_STATE("):
            # Execute SET_STATE but DO NOT add to action_messages
            try:
                content = command[10:-1].strip()
                var_name, value = content.split(",", 1)
                var_name = var_name.strip()
                # Convert 'true'/'false' strings to actual booleans if needed, or store as string
                value_str = value.strip().strip('"\'') # Keep value as string for now
                if value_str.lower() == 'true':
                    current_game_vars[var_name] = True
                elif value_str.lower() == 'false':
                    current_game_vars[var_name] = False
                else:
                    current_game_vars[var_name] = value_str # Store as string otherwise
                print(f"Set game state: {var_name} = {current_game_vars[var_name]}")
            except Exception as e:
                print(f"Warning: Invalid SET_STATE format: {command}. Error: {e}")
        # Add other actions like REMOVE_ITEM, MOVE_ENTITY, etc. here
        # elif command_upper.startswith("START_GESPREK("):
        elif command_upper.startswith("ADD_SCORE("):
            try:
                points_str = command[10:-1].strip()
                points_to_add = int(points_str)
                current_score = current_game_vars.setdefault('player_score', 0)
                current_game_vars['player_score'] = current_score + points_to_add
                points_awarded_this_action += points_to_add # Track points awarded by this specific action execution
                print(f"Added {points_to_add} points. New score: {current_game_vars['player_score']}")

                # --- Update High Score ---
                high_score_entry = db.session.get(HighScore, (user_id, game_id))
                if high_score_entry:
                    if current_game_vars['player_score'] > high_score_entry.score:
                        high_score_entry.score = current_game_vars['player_score']
                        print(f"New high score for user {user_id} on game {game_id}: {high_score_entry.score}")
                        db.session.commit() # Commit the updated high score
                else:
                    high_score_entry = HighScore(user_id=user_id, game_id=game_id, score=current_game_vars['player_score'])
                    db.session.add(high_score_entry)
                    print(f"First high score for user {user_id} on game {game_id}: {high_score_entry.score}")
                    db.session.commit() # Commit the new high score entry
                # No message added here, handled by the command processor returning points_awarded
            except ValueError:
                print(f"Warning: Invalid ADD_SCORE format: {command}. Points must be an integer.")
            except Exception as e:
                print(f"Warning: Error processing ADD_SCORE: {command}. Error: {e}")
                db.session.rollback() # Rollback on error during high score update/add
        else:
            print(f"Warning: Unknown action format: {command}")

    return "\n".join(action_messages), points_awarded_this_action

# Define a type for the return value of find_and_execute_scripts
class ScriptExecutionResult(TypedDict):
    messages: str
    points_awarded: int
    win_image_path: Optional[str]
    game_won: bool

def find_and_execute_scripts(user_id: uuid.UUID, game_id: uuid.UUID, trigger_type: str, context: Optional[Dict] = None, current_room_id_for_condition: Optional[uuid.UUID] = None) -> ScriptExecutionResult:
    """Finds scripts matching the trigger, evaluates conditions, executes actions, and checks for win state."""
    state.player_inventory.setdefault(user_id, {}).setdefault(game_id, set())
    current_game_vars = state.game_states.setdefault(user_id, {}).setdefault(game_id, {})

    scripts = Script.query.filter_by(game_id=game_id, trigger=trigger_type).all()
    script_messages: List[str] = []
    # Use the passed current_room_id_for_condition for condition evaluation
    total_points_awarded = 0
    for script in scripts:
        if evaluate_condition(user_id, game_id, current_room_id_for_condition, script.condition):
            action_result, points_awarded = execute_action(user_id, game_id, script.action)
            total_points_awarded += points_awarded
            if action_result:
                script_messages.append(action_result)

    game_won = current_game_vars.get('game_won', False) is True
    win_image_path = None
    if game_won:
        game = db.session.get(Game, game_id)
        win_image_path = game.win_image_path if game else None

    return {
        "messages": "\n".join(script_messages),
        "points_awarded": total_points_awarded,
        "win_image_path": win_image_path,
        "game_won": game_won
    }

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
        # Add more specific directions if needed
    }
    # Default to the direction itself if not found (shouldn't happen with standard directions)
    return reverse_map.get(exit_direction.lower(), exit_direction.capitalize())

# Define a type for NPC movement details
class NpcMovementDetail(TypedDict):
    npc_id: uuid.UUID
    npc_name: str
    from_room_id: uuid.UUID
    to_room_id: uuid.UUID
    direction_used: str

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

    # --- Process NPC Movement FIRST ---
    npc_movements_this_turn = _handle_npc_movement(user_id, game_id)

    parts = command_text.split(maxsplit=1)
    verb = parts[0].lower()
    if len(parts) > 1:
        arg = parts[1].strip()
    else:
        arg = ""

    current_room = db.session.get(Room, current_room_id)
    current_inventory_ids = state.player_inventory.setdefault(user_id, {}).setdefault(game_id, set())
    current_game_vars = state.game_states.setdefault(user_id, {}).setdefault(game_id, {})
    current_locations = state.entity_locations.setdefault(user_id, {}).setdefault(game_id, {})

    # --- Add NPC Arrival Notifications ---
    # Check which NPCs moved *into* the player's *final* room this turn
    npc_arrival_messages = []
    for move in npc_movements_this_turn:
        if move['to_room_id'] == current_room_id:
            arrival_direction = get_arrival_direction(move['direction_used'])
            npc_arrival_messages.append(f"{move['npc_name']} komt binnenwandelen vanuit {arrival_direction}.")
    if npc_arrival_messages:
        final_message = "\n".join(npc_arrival_messages) + "\n\n"
    else:
        final_message = ""

    # Rest of the command processing...
    # ...

    current_score = current_game_vars.get('player_score', 0)

    return {
        "message": final_message,
        "next_room_id": current_room_id,
        "room_image_path": current_room.image_path if current_room else None,
        "points_awarded": 0, # Placeholder, update later
        "game_won": False, # Placeholder, update later
        "win_image_path": None # Placeholder, update later
    }
