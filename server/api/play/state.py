# /server/api/play/state.py
import uuid
from typing import Dict, Set, Any, Optional

# --- Game State Simulation (Temporary In-Memory Storage) ---
# States are now nested under user_id first, then game_id

# Key: user_id (UUID), Value: { game_id (UUID): set of entity IDs (UUID) }
player_inventory: Dict[uuid.UUID, Dict[uuid.UUID, Set[uuid.UUID]]] = {}

# Key: user_id (UUID), Value: { game_id (UUID): {state_key (str): value (any)} }
# Includes 'player_score': int
game_states: Dict[uuid.UUID, Dict[uuid.UUID, Dict[str, Any]]] = {}

# --- Temporary Entity Location Tracking ---
# Key: user_id (UUID), Value: { game_id (UUID): {entity_id (UUID): location_info} }
# location_info can be 'inventory', {'room_id': uuid}, {'container_id': uuid}
entity_locations: Dict[uuid.UUID, Dict[uuid.UUID, Dict[uuid.UUID, Any]]] = {}

# --- Conversation State (Temporary In-Memory Storage) ---
# Conversation state is likely game-specific, not user-specific for now,
# unless multiple users can interact with the same NPC simultaneously in different states.
# Key: user_id (UUID), Value: { game_id (UUID): { 'npc_id': uuid, 'conversation_id': uuid, 'current_node_id': str } }
# Keyed by user_id first, then game_id
conversation_state: Dict[uuid.UUID, Dict[uuid.UUID, Dict[str, Any]]] = {}

def reset_game_session_state(user_id: uuid.UUID, game_id: uuid.UUID):
    """Resets the temporary in-memory state for a specific game session."""
    game_uuid = game_id # Use the validated UUID

    # Clear the temporary state for this game
    if user_id in player_inventory and game_uuid in player_inventory[user_id]:
        del player_inventory[user_id][game_uuid]
        print(f"Cleared inventory for user {user_id}, game {game_uuid}")
    if user_id in game_states and game_uuid in game_states[user_id]:
        del game_states[user_id][game_uuid]
        # Note: player_score is part of game_states, so it's cleared here too.
        print(f"Cleared game states for user {user_id}, game {game_uuid}")
    if user_id in entity_locations and game_uuid in entity_locations[user_id]: # Clear temporary locations
        del entity_locations[user_id][game_uuid]
        print(f"Cleared entity locations for user {user_id}, game {game_uuid}")
    if user_id in conversation_state and game_uuid in conversation_state[user_id]: # Clear conversation state for this user/game
        del conversation_state[user_id][game_uuid]
        print(f"Cleared conversation state for user {user_id}, game {game_uuid}")

    print(f"Reset play session state for user {user_id}, game {game_uuid}")

def load_game_session_state(user_id: uuid.UUID, game_id: uuid.UUID, saved_data: dict):
    """Loads game state from saved data into the temporary in-memory store."""
    # Ensure user's state dictionaries exist
    player_inventory.setdefault(user_id, {})
    game_states.setdefault(user_id, {})
    entity_locations.setdefault(user_id, {})
    conversation_state.setdefault(user_id, {})

    # Load inventory (convert string IDs back to UUIDs)
    player_inventory[user_id][game_id] = {uuid.UUID(id_str) for id_str in saved_data.get('inventory', [])}

    # --- Convert string keys back to UUIDs when loading entity_locations ---
    entity_locs_loaded = saved_data.get('entity_locations', {})
    entity_locs_deserialized = {}
    for key_str, value in entity_locs_loaded.items():
        try:
            # Deserialize nested UUIDs if present
            deserialized_value = value
            if isinstance(value, dict):
                deserialized_value = {k: uuid.UUID(v) if isinstance(v, str) and k.endswith('_id') else v for k, v in value.items()}
            entity_locs_deserialized[uuid.UUID(key_str)] = deserialized_value
        except ValueError:
            print(f"Warning: Could not convert key '{key_str}' back to UUID when loading game state for user {user_id}, game {game_id}.")
    loaded_vars = saved_data.get('game_variables', {})
    loaded_vars.setdefault('player_score', 0) # Initialize score if missing in save
    game_states[user_id][game_id] = loaded_vars
    entity_locations[user_id][game_id] = entity_locs_deserialized # Load the version with UUID keys

    # Clear any active conversation when loading
    if game_id in conversation_state.get(user_id, {}):
        del conversation_state[user_id][game_id]

    print(f"Loaded play session state for user {user_id}, game {game_id}")

def get_save_data(user_id: uuid.UUID, game_id: uuid.UUID) -> dict:
    """Retrieves the current in-memory state for saving."""
    # Get user-specific state
    user_inventory = player_inventory.get(user_id, {}).get(game_id, set())
    user_game_vars = game_states.get(user_id, {}).get(game_id, {}).copy()
    user_entity_locs = entity_locations.get(user_id, {}).get(game_id, {})

    inventory_ids = list(str(inv_id) for inv_id in user_inventory) # Convert UUIDs to strings
    game_vars = user_game_vars # Use the copy
    entity_locs = user_entity_locs

    # Convert UUID keys in entity_locations to strings for JSON serialization
    entity_locs_serializable = {}
    for key, value in entity_locs.items():
        if isinstance(key, uuid.UUID):
            # Ensure values containing UUIDs are also serialized correctly
            if isinstance(value, dict):
                serializable_value = {}
                for k, v in value.items():
                    serializable_value[k] = str(v) if isinstance(v, uuid.UUID) else v
                entity_locs_serializable[str(key)] = serializable_value
            else: # e.g., 'inventory'
                 entity_locs_serializable[str(key)] = value
        else: # Should ideally not happen if keys are always UUIDs
            entity_locs_serializable[key] = value

    # Ensure player_score is included, defaulting to 0 if not set
    game_vars.setdefault('player_score', 0)

    return {
        "inventory": inventory_ids,
        "game_variables": game_vars,
        "entity_locations": entity_locs_serializable
    }
