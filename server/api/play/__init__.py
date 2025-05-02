# This file makes the 'play' directory a Python package.

import uuid

# --- Game State Simulation (Temporary In-Memory Storage) ---

# Key: game_id (UUID), Value: set of entity IDs (UUID) the player is carrying
player_inventory = {}

# Key: game_id (UUID), Value: dict of {state_key (str): value (any)} (e.g., {'door_unlocked': True})
game_states = {}

# --- Temporary Entity Location Tracking ---
# Key: game_id (UUID), Value: dict of {entity_id (UUID): location_info}
# location_info can be 'inventory', {'room_id': uuid}, {'container_id': uuid}
entity_locations = {}

# --- Conversation State (Temporary In-Memory Storage) ---
# Key: game_id (UUID), Value: dict like {'npc_id': uuid, 'conversation_id': uuid, 'current_node_id': str}
conversation_state = {}

def reset_game_session_state(game_id: uuid.UUID):
    """Resets the temporary in-memory state for a specific game session."""
    game_uuid = game_id # Use the validated UUID

    # Clear the temporary state for this game
    if game_uuid in player_inventory:
        del player_inventory[game_uuid]
        print(f"Cleared inventory for game {game_uuid}")
    if game_uuid in game_states:
        del game_states[game_uuid]
        print(f"Cleared game states for game {game_uuid}")
    if game_uuid in entity_locations: # Clear temporary locations
        del entity_locations[game_uuid]
        print(f"Cleared entity locations for game {game_uuid}")
    if game_uuid in conversation_state: # Clear conversation state
        del conversation_state[game_uuid]
        print(f"Cleared conversation state for game {game_uuid}")

    print(f"Reset play session state for game {game_uuid}")

def load_game_session_state(game_id: uuid.UUID, saved_data: dict):
    """Loads game state from saved data into the temporary in-memory store."""
    # --- Convert string keys back to UUIDs when loading entity_locations ---
    entity_locs_loaded = saved_data.get('entity_locations', {})
    entity_locs_deserialized = {}
    for key_str, value in entity_locs_loaded.items():
        try:
            entity_locs_deserialized[uuid.UUID(key_str)] = value
        except ValueError:
            print(f"Warning: Could not convert key '{key_str}' back to UUID when loading game state for {game_id}.")

    player_inventory[game_id] = set(uuid.UUID(inv_id) for inv_id in saved_data.get('inventory', []))
    game_states[game_id] = saved_data.get('game_variables', {})
    entity_locations[game_id] = entity_locs_deserialized # Load the version with UUID keys

    # Clear any active conversation when loading
    if game_id in conversation_state:
        del conversation_state[game_id]

    print(f"Loaded play session state for game {game_id}")

def get_save_data(game_id: uuid.UUID) -> dict:
    """Retrieves the current in-memory state for saving."""
    inventory_ids = list(str(inv_id) for inv_id in player_inventory.get(game_id, set())) # Convert UUIDs to strings
    game_vars = game_states.get(game_id, {})
    entity_locs = entity_locations.get(game_id, {})

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

    return {
        "inventory": inventory_ids,
        "game_variables": game_vars,
        "entity_locations": entity_locs_serializable
    }
