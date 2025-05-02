from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError
import uuid

from app import db
from models import Room, Connection, Entity, EntityType
from decorators import admin_required

from flask_login import login_required, current_user

# Create a Blueprint for connection routes
connections_bp = Blueprint('connections_bp', __name__)


# --- Helper Functions ---

def serialize_connection(connection):
    """Converts a Connection object into a dictionary for JSON serialization."""
    return {
        'id': str(connection.id),
        'from_room_id': str(connection.from_room_id),
        'to_room_id': str(connection.to_room_id),
        'direction': connection.direction,
        'is_locked': connection.is_locked,
        'required_key_id': str(connection.required_key_id) if connection.required_key_id else None,
    }

# --- API Endpoints ---

@connections_bp.route('/rooms/<uuid:from_room_id>/connections', methods=['POST'])
@admin_required # Only admins can create connections
def create_connection(from_room_id):
    """Creates a new connection originating from a specific room."""
    from_room = db.session.get(Room, from_room_id)
    if not from_room:
        return jsonify({"error": "Origin room not found"}), 404

    data = request.get_json()
    if not data or not data.get('to_room_id') or not data.get('direction'):
        return jsonify({"error": "Missing required fields: 'to_room_id' and 'direction'"}), 400

    to_room_id_str = data.get('to_room_id')
    direction = data.get('direction', '').strip().lower() # Normalize direction
    is_locked = data.get('is_locked', False) # Default to unlocked
    required_key_id_str = data.get('required_key_id') # Optional key ID

    if not direction:
        return jsonify({"error": "'direction' cannot be empty"}), 400

    try:
        to_room_id = uuid.UUID(to_room_id_str) # Validate UUID format
    except ValueError:
        return jsonify({"error": "Invalid 'to_room_id' format"}), 400

    # Check if the target room exists and belongs to the same game
    to_room = db.session.get(Room, to_room_id)
    if not to_room:
        return jsonify({"error": "Target room not found"}), 404
    if to_room.game_id != from_room.game_id:
         return jsonify({"error": "Cannot connect rooms from different games"}), 400

    # Prevent self-connections? Optional, depends on game logic desired.
    if from_room_id == to_room_id:
        return jsonify({"error": "Cannot connect a room to itself"}), 400

    # Check if a connection in this direction already exists (handled by unique constraint too)
    existing_connection = Connection.query.filter_by(from_room_id=from_room_id, direction=direction).first()
    if existing_connection:
        return jsonify({"error": f"A connection already exists from this room going '{direction}'"}), 409 # Conflict

    # Validate required_key_id if provided
    required_key_id = None
    if is_locked and required_key_id_str:
        try:
            required_key_id = uuid.UUID(required_key_id_str)
            # Check if the key entity exists, belongs to the same game, and is an ITEM
            key_entity = db.session.get(Entity, required_key_id)
            if not key_entity:
                return jsonify({"error": "Required key entity not found"}), 404
            if key_entity.game_id != from_room.game_id:
                 return jsonify({"error": "Required key must belong to the same game"}), 400
            if key_entity.type != EntityType.ITEM: # Only allow ITEMs to be keys for now
                 return jsonify({"error": "Required key must be an ITEM type entity"}), 400
        except ValueError:
            return jsonify({"error": "Invalid 'required_key_id' format"}), 400

    new_connection = Connection(
        from_room_id=from_room_id,
        to_room_id=to_room_id,
        direction=direction,
        is_locked=bool(is_locked),
        required_key_id=required_key_id if is_locked else None # Only store key if locked
    )
    try:
        db.session.add(new_connection)
        db.session.commit()
        return jsonify(serialize_connection(new_connection)), 201
    except IntegrityError as e:
        db.session.rollback()
        # This primarily catches the unique constraint violation if the check above fails under race conditions
        print(f"Integrity error creating connection from {from_room_id}: {e}")
        return jsonify({"error": "Failed to create connection due to a database conflict (likely duplicate direction)"}), 409
    except Exception as e:
        db.session.rollback()
        print(f"Error creating connection from {from_room_id}: {e}")
        return jsonify({"error": "Failed to create connection"}), 500


@connections_bp.route('/rooms/<uuid:from_room_id>/connections', methods=['GET'])
@login_required
def list_connections_from_room(from_room_id):
    """Lists all connections originating from a specific room."""
    room = db.session.get(Room, from_room_id)
    if not room:
        return jsonify({"error": "Room not found"}), 404

    try:
        connections = Connection.query.filter_by(from_room_id=from_room_id).all()
        return jsonify([serialize_connection(conn) for conn in connections]), 200
    except Exception as e:
        print(f"Error fetching connections for room {from_room_id}: {e}")
        return jsonify({"error": "Failed to retrieve connections"}), 500


@connections_bp.route('/connections/<uuid:connection_id>', methods=['PUT'])
@admin_required # Only admins can update connections
def update_connection(connection_id):
    """Updates details for a specific connection (e.g., direction, lock status, key)."""
    connection = db.session.get(Connection, connection_id)
    if not connection:
        return jsonify({"error": "Connection not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body cannot be empty"}), 400

    try:
        updated = False
        # Update direction
        if 'direction' in data:
            direction_value = data['direction']
            if direction_value is None:
                # Frontend should ideally prevent sending null, but handle defensively
                return jsonify({"error": "'direction' cannot be null"}), 400
            new_direction = direction_value.strip().lower()
            if not new_direction:
                return jsonify({"error": "'direction' cannot be empty"}), 400
            # Check for conflict ONLY if direction is changing
            if new_direction != connection.direction:
                existing = Connection.query.filter_by(
                    from_room_id=connection.from_room_id, direction=new_direction
                ).first()
                if existing:
                    return jsonify({"error": f"A connection already exists from this room going '{new_direction}'"}), 409
            connection.direction = new_direction
            updated = True

        # Update lock status and key (add later if needed)
        # if 'is_locked' in data: ...
        # if 'required_key_id' in data: ...

        if not updated:
            return jsonify({"error": "No valid fields provided for update"}), 400

        db.session.commit()
        return jsonify(serialize_connection(connection)), 200

    except IntegrityError as e:
        db.session.rollback()
        # This might happen due to race conditions on the unique constraint check
        print(f"Integrity error updating connection {connection_id}: {e}")
        return jsonify({"error": "Failed to update connection due to a database conflict (likely duplicate direction)"}), 409
    except Exception as e:
        db.session.rollback()
        print(f"Error updating connection {connection_id}: {e}")
        return jsonify({"error": "Failed to update connection"}), 500


@connections_bp.route('/connections/<uuid:connection_id>', methods=['DELETE'])
@admin_required # Only admins can delete connections
def delete_connection(connection_id):
    """Deletes a specific connection."""
    connection = db.session.get(Connection, connection_id)
    if not connection:
        return jsonify({"error": "Connection not found"}), 404

    try:
        db.session.delete(connection)
        db.session.commit()
        return '', 204 # No Content
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting connection {connection_id}: {e}")
        return jsonify({"error": "Failed to delete connection"}), 500
