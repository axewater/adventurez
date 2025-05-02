# /server/api/play/conversation.py
import uuid
from typing import Tuple, Dict, Any, Optional

from app import db
from models import Conversation
from . import state
from .helpers import execute_action

def start_conversation(user_id: uuid.UUID, game_id: uuid.UUID, npc_id: uuid.UUID, conversation_id: uuid.UUID) -> Tuple[Dict[str, Any], Optional[str]]:
    """Initiates a conversation and returns the starting message and options."""
    conv = db.session.get(Conversation, conversation_id)
    if not conv or not conv.structure:
        return {"error": "Conversation structure not found or invalid."}, None

    start_node_id = conv.structure.get('start_node')
    nodes = conv.structure.get('nodes', {})
    if not start_node_id or start_node_id not in nodes:
        return {"error": "Invalid start node in conversation."}, None

    # Store conversation state under user_id and game_id
    state.conversation_state.setdefault(user_id, {})
    state.conversation_state[user_id][game_id] = {
        'npc_id': npc_id,
        'conversation_id': conversation_id,
        'current_node_id': start_node_id
    }

    current_node = nodes[start_node_id]
    npc_text = current_node.get('npc_text', '')
    node_type = current_node.get("type", "options")
    options = current_node.get('options', [])

    message = f"{npc_text}\n"
    if node_type == "options":
        formatted_options = []
        for i, option in enumerate(options):
            formatted_options.append(f"{i+1}. {option.get('text', '...')}")
        message += "\n".join(formatted_options)

    # Indicate conversation has started in the response
    return {"message": message, "in_conversation": True, "node_type": node_type}, start_node_id

def handle_conversation_input(user_id: uuid.UUID, game_id: uuid.UUID, user_input: str) -> Tuple[Dict[str, Any], Optional[str], bool]:
    """Processes player input during a conversation."""
    conv_state = state.conversation_state.get(user_id, {}).get(game_id)
    if not conv_state:
        return {"error": "Not currently in a conversation."}, None, False

    conv = db.session.get(Conversation, conv_state['conversation_id'])
    if not conv or not conv.structure or 'nodes' not in conv.structure:
        end_conversation(user_id, game_id)
        return {"error": "Conversation data error."}, None, False

    current_node_id = conv_state['current_node_id']
    nodes = conv.structure['nodes']
    if current_node_id not in nodes:
        end_conversation(user_id, game_id)
        return {"error": "Current conversation node invalid."}, None, False

    current_node = nodes[current_node_id]
    node_type = current_node.get("type", "options") # Default to options node
    next_node_id = None
    npc_response_to_choice = "" # Store NPC's immediate response to the choice
    response_message = ""
    action_result_message = "" # Store messages from actions executed
    in_conversation = True

    if node_type == "question":
        expected_answer = current_node.get("expected_answer", "").lower()
        if user_input.lower() == expected_answer:
            response_message += current_node.get("correct_npc_response", "Correct!") + "\n"
            next_node_id = current_node.get("next_node_correct")
            # Execute action defined on the 'correct' option
            action = current_node.get("action_on_correct")
            points_from_action = 0 # Initialize points - user_id added below
            if action:
                action_result, points_from_action = execute_action(user_id, game_id, action)
                if action_result: action_result_message += action_result + "\n" # Add message if any
        else:
            response_message += current_node.get("incorrect_npc_response", "Dat is niet juist.") + "\n"
            next_node_id = current_node.get("next_node_incorrect") # Go back or different path

    elif node_type == "options":
        try:
            choice_index = int(user_input) - 1
            options = current_node.get('options', [])
            if 0 <= choice_index < len(options):
                chosen_option = options[choice_index]
                npc_response_to_choice = chosen_option.get('npc_response', '') # Store immediate response
                next_node_id = chosen_option.get('next_node')
                # Check for actions on this option
                option_action = chosen_option.get("action")
                points_from_action = 0 # Initialize points - user_id added below
                if option_action:
                    action_result, points_from_action = execute_action(user_id, game_id, option_action)
                    if action_result: action_result_message += action_result + "\n" # Add message if any
            else:
                response_message = "Ongeldige keuze."
                next_node_id = current_node_id # Stay on the same node
        except ValueError:
            response_message = "Voer alsjeblieft een nummer in."
            next_node_id = current_node_id # Stay on the same node

    # --- Determine next step ---
    if next_node_id and next_node_id in nodes:
        # Valid next node exists
        state.conversation_state[user_id][game_id]['current_node_id'] = next_node_id # Update state

        # --- Process the next node ---
        next_node_data = nodes[next_node_id]
        next_npc_text = next_node_data.get('npc_text', '')
        next_node_action = next_node_data.get('action') # Check for action on the node itself
        points_from_node_action = 0 # Initialize points

        # Execute action defined on the next node
        if next_node_action:
            action_result, points_from_node_action = execute_action(user_id, game_id, next_node_action)
            if action_result: action_result_message += action_result + "\n"
            print(f"Executed action on node '{next_node_id}': {next_node_action}") # Debug log

        # Combine immediate response, action results, and the next node's text
        response_message += (npc_response_to_choice + "\n\n" if npc_response_to_choice else "")
        response_message += (action_result_message + "\n" if action_result_message else "")
        response_message += next_npc_text + "\n"

        # Check if this 'next_node' is an end node or has options/is question
        next_node_type = next_node_data.get("type", "options")
        if next_node_type == "question":
            print(f"Conversation moving to question node '{next_node_id}'.")
            in_conversation = True # Stay in conversation
        elif next_node_type == "options":
            next_options = next_node_data.get('options', [])
            if not next_options: # Options node with no options = end node
                print(f"Conversation node '{next_node_id}' is an options node with no options, ending conversation.")
                end_conversation(user_id, game_id)
                in_conversation = False
            else: # Node has options, format and append them
                formatted_options = []
                for i, option in enumerate(next_options):
                    formatted_options.append(f"{i+1}. {option.get('text', '...')}")
                response_message += "\n".join(formatted_options) # Append options
                in_conversation = True # Stay in conversation
        else:
            print(f"Conversation node '{next_node_id}' has unknown type '{next_node_type}', ending conversation.")
            end_conversation(user_id, game_id)
            in_conversation = False

    else: # End conversation because next_node_id was invalid or null
        end_text = current_node.get('end_text', "Gesprek beëindigd.")
        response_message = (npc_response_to_choice + "\n\n" if npc_response_to_choice else "") + end_text
        end_conversation(user_id, game_id)
        in_conversation = False

    # Return the final state
    current_score = state.game_states.get(user_id, {}).get(game_id, {}).get('player_score', 0) # User-specific score
    # Calculate total points awarded during this turn (from option + node actions)
    # Note: points_from_action and points_from_node_action might not be defined if path didn't trigger them
    points_awarded_this_turn = locals().get('points_from_action', 0) + locals().get('points_from_node_action', 0)

    final_node_type = None
    if in_conversation and state.conversation_state.get(user_id, {}).get(game_id): # Check if state still exists for user/game
        current_node_id = state.conversation_state[user_id][game_id]['current_node_id']
        if current_node_id in nodes:
            final_node_type = nodes[current_node_id].get("type", "options")

    return {"message": response_message.strip(), "in_conversation": in_conversation, "node_type": final_node_type, "current_score": current_score, "points_awarded": points_awarded_this_turn}, state.conversation_state.get(user_id, {}).get(game_id, {}).get('current_node_id') if in_conversation else None, in_conversation


def end_conversation(user_id: uuid.UUID, game_id: uuid.UUID):
    """Clears the conversation state for the game."""
    if user_id in state.conversation_state and game_id in state.conversation_state[user_id]:
        del state.conversation_state[user_id][game_id]
    print(f"Conversation ended for user {user_id}, game {game_id}")
