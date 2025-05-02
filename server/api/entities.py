from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError
import uuid

from app import db
from models import Game, Room, Entity, EntityType, Conversation
from flask_login import login_required, current_user
from decorators import admin_required

# Create a Blueprint for entity routes
entities_bp = Blueprint('entities_bp', __name__)

# --- Helper Functions ---

def serialize_entity(entity):
    """Converts an Entity object into a dictionary for JSON serialization."""
    return {
        'id': str(entity.id),
        'game_id': str(entity.game_id),
        'room_id': str(entity.room_id) if entity.room_id else None, # Handle nullable room_id
        'container_id': str(entity.container_id) if entity.container_id else None, # Include container_id
        'type': entity.type.name, # Use the enum name (e.g., 'ITEM', 'NPC')
        'name': entity.name,
        'description': entity.description,
        'is_takable': entity.is_takable,
        'is_container': entity.is_container,
        'conversation_id': str(entity.conversation_id) if entity.conversation_id else None, # Include conversation_id
        'image_path': entity.image_path, # NEW: Include image path
        'is_mobile': entity.is_mobile, # NEW: Include mobile flag
        'pickup_message': entity.pickup_message, # NEW: Include pickup message
        # Relationships are handled by linking IDs during export/import
    }

# --- API Endpoints ---

@entities_bp.route('/games/<uuid:game_id>/entities', methods=['POST'])
@admin_required # Only admins can create entities
def create_entity(game_id):
    """Creates a new entity (ITEM or NPC) within a specific game."""
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    data = request.get_json() or {}
    name = data.get('name', 'Unnamed Entity').strip()
    description = data.get('description', '').strip()
    entity_type_str = data.get('type', '').upper()
    room_id_str = data.get('room_id') # Optional: Entity might not be in a room initially
    container_id_str = data.get('container_id') # Optional container ID
    is_takable = data.get('is_takable', False)
    is_container = data.get('is_container', False)
    conversation_id_str = data.get('conversation_id') # Optional conversation ID
    image_path = data.get('image_path') # NEW: Get image path
    is_mobile = data.get('is_mobile', False) # NEW: Get mobile flag
    pickup_message = data.get('pickup_message') # NEW: Get pickup message

    if not name:
        name = 'Unnamed Entity'
    if not entity_type_str or entity_type_str not in EntityType.__members__:
        valid_types = ", ".join(EntityType.__members__.keys())
        return jsonify({"error": f"Invalid or missing entity type. Valid types: {valid_types}"}), 400

    entity_type = EntityType[entity_type_str]
    room_id = None
    conversation_id = None
    container_id = None
    target_room = None

    # Validate room_id if provided
    if room_id_str:
        try:
            room_id = uuid.UUID(room_id_str)
            target_room = db.session.get(Room, room_id)
            if not target_room:
                return jsonify({"error": "Target room not found"}), 404
            # Ensure the room belongs to the correct game
            if target_room.game_id != game_id:
                 return jsonify({"error": "Cannot place entity in a room from a different game"}), 400
        except ValueError:
            return jsonify({"error": "Invalid 'room_id' format"}), 400

    # Validate container_id if provided
    if container_id_str:
        if room_id_str: # Cannot be in both a room and a container
            return jsonify({"error": "Entity cannot be placed in a room and a container simultaneously"}), 400
        try:
            container_id = uuid.UUID(container_id_str)
            target_container = db.session.get(Entity, container_id)
            if not target_container:
                return jsonify({"error": "Target container entity not found"}), 404
            if target_container.game_id != game_id:
                 return jsonify({"error": "Cannot place entity in a container from a different game"}), 400
            if not target_container.is_container:
                 return jsonify({"error": "Target entity is not a container"}), 400
        except ValueError:
            return jsonify({"error": "Invalid 'container_id' format"}), 400

    # Validate conversation_id if provided (only for NPCs)
    if conversation_id_str:
        if entity_type != EntityType.NPC:
            return jsonify({"error": "Conversations can only be linked to NPCs"}), 400
        try:
            conversation_id = uuid.UUID(conversation_id_str)
            target_conversation = db.session.get(Conversation, conversation_id)
            if not target_conversation:
                return jsonify({"error": "Target conversation not found"}), 404
            if target_conversation.game_id != game_id:
                 return jsonify({"error": "Cannot link conversation from a different game"}), 400
        except ValueError:
            return jsonify({"error": "Invalid 'conversation_id' format"}), 400


    new_entity = Entity(
        game_id=game_id,
        room_id=room_id, # Can be None
        container_id=container_id, # Can be None
        type=entity_type,
        name=name,
        description=description,
        is_takable=bool(is_takable),
        is_container=bool(is_container),
        conversation_id=conversation_id if entity_type == EntityType.NPC else None, # Set conversation ID only for NPCs
        image_path=image_path, # NEW: Set image path
        is_mobile=bool(is_mobile) and entity_type == EntityType.NPC, # NEW: Set mobile flag only for NPCs
        pickup_message=pickup_message if entity_type == EntityType.ITEM and pickup_message else None # NEW: Set pickup message only for ITEMs, ensure it's not empty string
    )
    try:
        db.session.add(new_entity)
        db.session.commit()
        return jsonify(serialize_entity(new_entity)), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error creating entity for game {game_id}: {e}")
        return jsonify({"error": "Failed to create entity"}), 500


@entities_bp.route('/games/<uuid:game_id>/entities', methods=['GET'])
@login_required # Only admins need the full list for editing
def list_entities_for_game(game_id):
    """Lists all entities for a specific game."""
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    try:
        # Add filtering later (e.g., by room_id, type) if needed
        entities = Entity.query.filter_by(game_id=game_id).order_by(Entity.name).all()
        return jsonify([serialize_entity(entity) for entity in entities]), 200
    except Exception as e:
        print(f"Error fetching entities for game {game_id}: {e}")
        return jsonify({"error": "Failed to retrieve entities"}), 500


@entities_bp.route('/entities/<uuid:entity_id>', methods=['GET'])
@admin_required # Only admins need full entity details for editing
def get_entity_details(entity_id):
    """Retrieves details for a specific entity."""
    try:
        entity = db.session.get(Entity, entity_id)
        if entity:
            return jsonify(serialize_entity(entity)), 200
        else:
            return jsonify({"error": "Entity not found"}), 404
    except Exception as e:
        print(f"Error fetching entity {entity_id}: {e}")
        return jsonify({"error": "Failed to retrieve entity details"}), 500


@entities_bp.route('/entities/<uuid:entity_id>', methods=['PUT'])
@admin_required # Only admins can update entities
def update_entity(entity_id):
    """Updates details for a specific entity."""
    entity = db.session.get(Entity, entity_id)
    if not entity:
        return jsonify({"error": "Entity not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body cannot be empty"}), 400

    try:
        # Update fields if they are present in the request data
        if 'name' in data:
            name = data['name'].strip()
            entity.name = name if name else 'Unnamed Entity'
        if 'description' in data:
            entity.description = data['description'].strip()
        if 'pickup_message' in data: # NEW: Update pickup message
            entity.pickup_message = data['pickup_message'].strip() if data['pickup_message'] and entity.type == EntityType.ITEM else None
        if 'type' in data:
            entity_type_str = data['type'].upper()
            # Only allow ITEMs to be takable or containers for now? Basic logic.
            if EntityType[entity_type_str] != EntityType.ITEM:
                data['is_takable'] = False
                # Keep conversation ID if type changes TO NPC? Or clear it? Clear for now.
                data['is_container'] = False
                # Clear pickup message if not an ITEM
                entity.pickup_message = None
                # Clear mobile flag if not an NPC
                entity.is_mobile = False
            if entity_type_str not in EntityType.__members__:
                 valid_types = ", ".join(EntityType.__members__.keys())
                 return jsonify({"error": f"Invalid entity type. Valid types: {valid_types}"}), 400
            entity.type = EntityType[entity_type_str]
        if 'room_id' in data:
            room_id_str = data['room_id']
            if room_id_str is None:
                entity.room_id = None # Allow unsetting the room
                entity.container_id = None # Ensure container is also unset if room is explicitly set to null
            else:
                try:
                    room_id = uuid.UUID(room_id_str)
                    target_room = db.session.get(Room, room_id)
                    if not target_room:
                        return jsonify({"error": "Target room not found"}), 404
                    # Ensure the room belongs to the same game as the entity
                    if target_room.game_id != entity.game_id:
                         return jsonify({"error": "Cannot move entity to a room from a different game"}), 400
                    entity.room_id = room_id
                    entity.container_id = None # Ensure container is unset if room is set
                except ValueError:
                    return jsonify({"error": "Invalid 'room_id' format"}), 400

        # Update container_id
        if 'container_id' in data:
            container_id_str = data['container_id']
            if container_id_str is None:
                entity.container_id = None # Allow unsetting the container
            else:
                try:
                    container_id = uuid.UUID(container_id_str)
                    target_container = db.session.get(Entity, container_id)
                    if not target_container:
                        return jsonify({"error": "Target container entity not found"}), 404
                    if target_container.game_id != entity.game_id:
                         return jsonify({"error": "Cannot move entity into a container from a different game"}), 400
                    if not target_container.is_container:
                         return jsonify({"error": "Target entity is not a container"}), 400
                    entity.container_id = container_id
                    entity.room_id = None # Ensure room is unset if container is set
                except ValueError:
                    return jsonify({"error": "Invalid 'container_id' format"}), 400

        # Update conversation_id
        if 'conversation_id' in data:
            conversation_id_str = data['conversation_id']
            if entity.type != EntityType.NPC:
                # Ignore or error if trying to set conversation on non-NPC? Ignore for now.
                entity.conversation_id = None
            elif conversation_id_str is None:
                entity.conversation_id = None # Allow unsetting the conversation
            else:
                try:
                    conversation_id = uuid.UUID(conversation_id_str)
                    target_conversation = db.session.get(Conversation, conversation_id)
                    if not target_conversation:
                        return jsonify({"error": "Target conversation not found"}), 404
                    if target_conversation.game_id != entity.game_id:
                         return jsonify({"error": "Cannot link conversation from a different game"}), 400
                    entity.conversation_id = conversation_id
                except ValueError:
                    return jsonify({"error": "Invalid 'conversation_id' format"}), 400

        # NEW: Update image path (allow null to unset)
        if 'image_path' in data:
            entity.image_path = data['image_path'] if data['image_path'] else None

        # NEW: Update mobile flag (only allow for NPCs)
        if 'is_mobile' in data:
            entity.is_mobile = bool(data['is_mobile']) and entity.type == EntityType.NPC

        # Update boolean attributes, ensuring they are treated as booleans
        if 'is_takable' in data:
            # Only allow ITEMs to be takable
            entity.is_takable = bool(data['is_takable']) and entity.type == EntityType.ITEM
            if not entity.is_takable: # Clear pickup message if not takable
                entity.pickup_message = None
        if 'is_container' in data:
            entity.is_container = bool(data['is_container']) and entity.type == EntityType.ITEM

        # Add updates for other attributes (e.g., JSON attributes) later

        db.session.commit()
        return jsonify(serialize_entity(entity)), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error updating entity {entity_id}: {e}")
        return jsonify({"error": "Failed to update entity"}), 500


@entities_bp.route('/entities/<uuid:entity_id>', methods=['DELETE'])
@admin_required # Only admins can delete entities
def delete_entity(entity_id):
    """Deletes a specific entity."""
    entity = db.session.get(Entity, entity_id)
    if not entity:
        return jsonify({"error": "Entity not found"}), 404

    try:
        # Handle potential dependencies (e.g., scripts referencing this entity) later if needed
        db.session.delete(entity)
        db.session.commit()
        return '', 204 # No Content
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting entity {entity_id}: {e}")
        # Consider potential foreign key constraint errors if other tables reference entities
        return jsonify({"error": "Failed to delete entity"}), 500
