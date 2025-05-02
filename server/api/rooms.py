from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError
from flask_login import login_required, current_user
import uuid

from decorators import admin_required
from app import db
from models import Game, Room, Connection, Entity

# Create a Blueprint for room routes
rooms_bp = Blueprint('rooms_bp', __name__)

# --- Helper Functions ---

def serialize_room(room, include_connections=False):
    """Converts a Room object into a dictionary for JSON serialization."""
    data = {
        'id': str(room.id),
        'game_id': str(room.game_id),
        'title': room.title,
        'description': room.description,
        'pos_x': room.pos_x, # Include position, can be null
        'pos_y': room.pos_y,
        'sort_index': room.sort_index, # Include sort index
        'image_path': room.image_path, # NEW: Include image path
    }
    if include_connections:
        # Explicitly fetch connections if needed
        connections = Connection.query.filter_by(from_room_id=room.id).all()
        data['connections'] = [
            {
                'id': str(conn.id),
                'to_room_id': str(conn.to_room_id),
                'direction': conn.direction
            } for conn in connections
        ]
    return data

# --- API Endpoints ---

@rooms_bp.route('/games/<uuid:game_id>/rooms', methods=['POST'])
@admin_required # Only admins can create rooms
def create_room(game_id):
    """Creates a new room within a specific game."""
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    data = request.get_json() or {}
    title = data.get('title', 'Untitled Room').strip()
    description = data.get('description', '').strip()
    # Accept optional initial position
    pos_x = data.get('pos_x')
    pos_y = data.get('pos_y')
    image_path = data.get('image_path') # NEW: Get image path

    if not title:
        title = 'Untitled Room' # Default if stripped title is empty

    # Determine the next sort_index
    max_index = db.session.query(db.func.max(Room.sort_index))\
                          .filter(Room.game_id == game_id)\
                          .scalar()
    next_index = (max_index or -1) + 1 # Handle case where there are no rooms yet

    new_room = Room(
        game_id=game_id,
        title=title,
        description=description,
        sort_index=next_index, # Set the calculated sort index
        image_path=image_path # NEW: Set image path
    )
    try:
        db.session.add(new_room)
        db.session.commit()
        return jsonify(serialize_room(new_room)), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error creating room for game {game_id}: {e}")
        return jsonify({"error": "Failed to create room"}), 500


@rooms_bp.route('/games/<uuid:game_id>/rooms', methods=['GET'])
@login_required 
def list_rooms(game_id):
    """Lists all rooms for a specific game."""
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    try:
        # Consider adding pagination later if room lists become very large
        rooms = Room.query.filter_by(game_id=game_id).order_by(Room.sort_index).all() # Order by sort_index
        # Optionally include connections summary here if needed by the list view
        return jsonify([serialize_room(room, include_connections=False) for room in rooms]), 200
    except Exception as e:
        print(f"Error fetching rooms for game {game_id}: {e}")
        return jsonify({"error": "Failed to retrieve rooms"}), 500


@rooms_bp.route('/rooms/<uuid:room_id>', methods=['GET'])
@admin_required # Only admins need full room details for editing
def get_room_details(room_id):
    """Retrieves details for a specific room, including its connections."""
    try:
        room = db.session.get(Room, room_id)
        if room:
            # Include connections when fetching a single room's details
            return jsonify(serialize_room(room, include_connections=True)), 200
        else:
            return jsonify({"error": "Room not found"}), 404
    except Exception as e:
        print(f"Error fetching room {room_id}: {e}")
        return jsonify({"error": "Failed to retrieve room details"}), 500


@rooms_bp.route('/rooms/<uuid:room_id>/entities', methods=['GET'])
@admin_required # Only admins need this for the room editor panel
def get_entities_in_room(room_id):
    """Retrieves entities located directly within a specific room."""
    room = db.session.get(Room, room_id)
    if not room:
        return jsonify({"error": "Room not found"}), 404

    try:
        # Import the serializer function here to avoid circular imports at module level
        from .entities import serialize_entity
        # Fetch entities directly in this room (not in containers within the room)
        entities = Entity.query.filter_by(room_id=room_id, container_id=None).order_by(Entity.name).all()
        return jsonify([serialize_entity(entity) for entity in entities]), 200
    except Exception as e:
        print(f"Error fetching entities for room {room_id}: {e}")
        return jsonify({"error": "Failed to retrieve entities for the room"}), 500


@rooms_bp.route('/rooms/<uuid:room_id>', methods=['PUT'])
@admin_required # Only admins can update rooms
def update_room(room_id):
    """Updates details (title, description) for a specific room."""
    room = db.session.get(Room, room_id)
    if not room:
        return jsonify({"error": "Room not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body cannot be empty"}), 400

    try:
        # Update fields if they are present in the request data
        if 'title' in data:
            title = data['title'].strip()
            room.title = title if title else 'Untitled Room' # Ensure title isn't empty
        if 'description' in data:
            room.description = data['description'].strip()
        # Update positions if provided (allow null to unset, or specific values)
        if 'pos_x' in data:
            # Basic validation: Ensure it's an integer or null
            room.pos_x = int(data['pos_x']) if data['pos_x'] is not None else None
        if 'pos_y' in data:
            room.pos_y = int(data['pos_y']) if data['pos_y'] is not None else None
        # NEW: Update image path (allow null to unset)
        if 'image_path' in data:
            room.image_path = data['image_path'] if data['image_path'] else None

        db.session.commit()
        # Return the updated room data, including connections
        return jsonify(serialize_room(room, include_connections=True)), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error updating room {room_id}: {e}")
        return jsonify({"error": "Failed to update room"}), 500


@rooms_bp.route('/rooms/<uuid:room_id>', methods=['DELETE'])
@admin_required # Only admins can delete rooms
def delete_room(room_id):
    """Deletes a specific room. Connections pointing to/from this room will also be deleted via cascade."""
    room = db.session.get(Room, room_id)
    if not room:
        return jsonify({"error": "Room not found"}), 404

    try:
        # Connections associated via cascade='all, delete-orphan' on Room.connections_from
        # Need to manually delete connections *to* this room if not handled by cascade/DB constraints
        # Let's explicitly delete connections pointing *to* the room first
        Connection.query.filter_by(to_room_id=room_id).delete()
        # Now delete the room itself (which cascades to connections *from* it)
        db.session.delete(room)
        db.session.commit()
        return '', 204 # No Content
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting room {room_id}: {e}")
        return jsonify({"error": "Failed to delete room"}), 500


@rooms_bp.route('/games/<uuid:game_id>/rooms/order', methods=['PUT'])
@admin_required # Only admins can reorder rooms
def update_room_order(game_id):
    """Updates the sort_index for multiple rooms within a game."""
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    data = request.get_json()
    if not isinstance(data, list):
        return jsonify({"error": "Request body must be a list of room IDs"}), 400

    try:
        # Validate all UUIDs first
        room_ids_ordered = [uuid.UUID(room_id_str) for room_id_str in data]
    except ValueError:
        return jsonify({"error": "Invalid room ID format in the list"}), 400

    try:
        for index, room_id in enumerate(room_ids_ordered):
            room = db.session.get(Room, room_id)
            if room and room.game_id == game_id:
                room.sort_index = index
        db.session.commit()
        return jsonify({"message": "Room order updated successfully"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error updating room order for game {game_id}: {e}")
        return jsonify({"error": "Failed to update room order"}), 500
