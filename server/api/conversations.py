# /server/api/conversations.py
from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError
from flask_login import login_required, current_user
import uuid

from decorators import admin_required
from app import db
from models import Game, Conversation, Entity, EntityType

# Create a Blueprint for conversation routes
conversations_bp = Blueprint('conversations_bp', __name__)

# --- Helper Functions ---

def serialize_conversation(conversation):
    """Converts a Conversation object into a dictionary for JSON serialization."""
    return {
        'id': str(conversation.id),
        'game_id': str(conversation.game_id),
        'name': conversation.name,
        'structure': conversation.structure, # Structure is already JSON-compatible
    }

# --- API Endpoints ---

@conversations_bp.route('/games/<uuid:game_id>/conversations', methods=['POST'])
@admin_required # Only admins can create conversations
def create_conversation(game_id):
    """Creates a new conversation within a specific game."""
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    data = request.get_json() or {}
    name = data.get('name', 'Unnamed Conversation').strip()
    structure = data.get('structure', {}) # Default to empty structure

    if not name:
        name = 'Unnamed Conversation'
    # Basic validation for structure (can be expanded)
    if not isinstance(structure, dict):
        return jsonify({"error": "Conversation 'structure' must be a JSON object"}), 400

    # Default structure if empty
    if not structure:
        structure = {
            "start_node": "node_start",
            "nodes": {
                "node_start": {
                    "npc_text": "Hallo, avonturier!",
                    "options": [
                        {"text": "Doei", "next_node": None} # Option to end conversation
                    ]
                }
            }
        }


    new_conversation = Conversation(
        game_id=game_id,
        name=name,
        structure=structure
    )
    try:
        db.session.add(new_conversation)
        db.session.commit()
        return jsonify(serialize_conversation(new_conversation)), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error creating conversation for game {game_id}: {e}")
        return jsonify({"error": "Failed to create conversation"}), 500


@conversations_bp.route('/games/<uuid:game_id>/conversations', methods=['GET'])
@admin_required # Only admins need the full list for the editor
def list_conversations_for_game(game_id):
    """Lists all conversations for a specific game."""
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    try:
        conversations = Conversation.query.filter_by(game_id=game_id).order_by(Conversation.name).all()
        return jsonify([serialize_conversation(conv) for conv in conversations]), 200
    except Exception as e:
        print(f"Error fetching conversations for game {game_id}: {e}")
        return jsonify({"error": "Failed to retrieve conversations"}), 500


@conversations_bp.route('/conversations/<uuid:conversation_id>', methods=['GET'])
@admin_required # Only admins need details for editing
def get_conversation_details(conversation_id):
    """Retrieves details for a specific conversation."""
    try:
        conversation = db.session.get(Conversation, conversation_id)
        if conversation:
            return jsonify(serialize_conversation(conversation)), 200
        else:
            return jsonify({"error": "Conversation not found"}), 404
    except Exception as e:
        print(f"Error fetching conversation {conversation_id}: {e}")
        return jsonify({"error": "Failed to retrieve conversation details"}), 500


@conversations_bp.route('/conversations/<uuid:conversation_id>', methods=['PUT'])
@admin_required # Only admins can update conversations
def update_conversation(conversation_id):
    """Updates details for a specific conversation."""
    conversation = db.session.get(Conversation, conversation_id)
    if not conversation:
        return jsonify({"error": "Conversation not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body cannot be empty"}), 400

    try:
        updated = False
        if 'name' in data:
            name = data['name'].strip()
            conversation.name = name if name else 'Unnamed Conversation'
            updated = True
        if 'structure' in data:
            structure = data['structure']
            if not isinstance(structure, dict):
                 return jsonify({"error": "Conversation 'structure' must be a JSON object"}), 400
            # Add more validation for the structure if needed
            conversation.structure = structure
            updated = True

        if not updated:
             return jsonify({"error": "No valid fields provided for update"}), 400

        db.session.commit()
        return jsonify(serialize_conversation(conversation)), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error updating conversation {conversation_id}: {e}")
        return jsonify({"error": "Failed to update conversation"}), 500


@conversations_bp.route('/conversations/<uuid:conversation_id>', methods=['DELETE'])
@admin_required # Only admins can delete conversations
def delete_conversation(conversation_id):
    """Deletes a specific conversation."""
    conversation = db.session.get(Conversation, conversation_id)
    if not conversation:
        return jsonify({"error": "Conversation not found"}), 404

    try:
        # Check if any NPC is using this conversation before deleting?
        linked_npcs = Entity.query.filter_by(conversation_id=conversation_id).count()
        if linked_npcs > 0:
            return jsonify({"error": f"Cannot delete conversation, it is linked to {linked_npcs} NPC(s)."}), 409 # Conflict

        db.session.delete(conversation)
        db.session.commit()
        return '', 204 # No Content
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting conversation {conversation_id}: {e}")
        return jsonify({"error": "Failed to delete conversation"}), 500
