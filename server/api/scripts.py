from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError
from flask_login import login_required, current_user
import uuid

from decorators import admin_required
from app import db
from models import Game, Script # Import Script model

# Create a Blueprint for script routes
scripts_bp = Blueprint('scripts_bp', __name__)

# --- Helper Functions ---

def serialize_script(script):
    """Converts a Script object into a dictionary for JSON serialization."""
    return {
        'id': str(script.id),
        'game_id': str(script.game_id),
        'trigger': script.trigger,
        'condition': script.condition,
        'action': script.action,
        # Add other fields like execution_order if implemented
    }

# --- API Endpoints ---

@scripts_bp.route('/games/<uuid:game_id>/scripts', methods=['POST'])
@admin_required # Only admins can create scripts
def create_script(game_id):
    """Creates a new script within a specific game."""
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    data = request.get_json() or {}
    trigger = data.get('trigger', '').strip()
    condition = data.get('condition', '').strip() # Condition is optional
    action = data.get('action', '').strip()

    if not trigger:
        return jsonify({"error": "Script 'trigger' is required"}), 400
    if not action:
        return jsonify({"error": "Script 'action' is required"}), 400

    # Basic validation (more complex validation might be needed based on DSL/structure)
    if len(trigger) > 500 or len(action) > 1000 or (condition and len(condition) > 1000):
         return jsonify({"error": "Script fields exceed maximum length"}), 400

    new_script = Script(
        game_id=game_id,
        trigger=trigger,
        condition=condition if condition else None, # Store null if empty
        action=action
    )
    try:
        db.session.add(new_script)
        db.session.commit()
        return jsonify(serialize_script(new_script)), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error creating script for game {game_id}: {e}")
        return jsonify({"error": "Failed to create script"}), 500


@scripts_bp.route('/games/<uuid:game_id>/scripts', methods=['GET'])
@admin_required # Only admins need the script list for editing
def list_scripts_for_game(game_id):
    """Lists all scripts for a specific game."""
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    try:
        # Add filtering/sorting later if needed
        scripts = Script.query.filter_by(game_id=game_id).order_by(Script.trigger).all() # Example sort
        return jsonify([serialize_script(script) for script in scripts]), 200
    except Exception as e:
        print(f"Error fetching scripts for game {game_id}: {e}")
        return jsonify({"error": "Failed to retrieve scripts"}), 500


@scripts_bp.route('/scripts/<uuid:script_id>', methods=['GET'])
@admin_required # Only admins need script details for editing
def get_script_details(script_id):
    """Retrieves details for a specific script."""
    try:
        script = db.session.get(Script, script_id)
        if script:
            return jsonify(serialize_script(script)), 200
        else:
            return jsonify({"error": "Script not found"}), 404
    except Exception as e:
        print(f"Error fetching script {script_id}: {e}")
        return jsonify({"error": "Failed to retrieve script details"}), 500


@scripts_bp.route('/scripts/<uuid:script_id>', methods=['PUT'])
@admin_required # Only admins can update scripts
def update_script(script_id):
    """Updates details for a specific script."""
    script = db.session.get(Script, script_id)
    if not script:
        return jsonify({"error": "Script not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body cannot be empty"}), 400

    try:
        updated = False
        if 'trigger' in data:
            trigger = data['trigger'].strip()
            if not trigger:
                 return jsonify({"error": "Script 'trigger' cannot be empty"}), 400
            if len(trigger) > 500:
                 return jsonify({"error": "Trigger exceeds maximum length"}), 400
            script.trigger = trigger
            updated = True
        if 'condition' in data: # Allow setting condition to empty/null
            condition = data['condition'].strip()
            if len(condition) > 1000:
                 return jsonify({"error": "Condition exceeds maximum length"}), 400
            script.condition = condition if condition else None
            updated = True
        if 'action' in data:
            action = data['action'].strip()
            if not action:
                 return jsonify({"error": "Script 'action' cannot be empty"}), 400
            if len(action) > 1000:
                 return jsonify({"error": "Action exceeds maximum length"}), 400
            script.action = action
            updated = True

        if not updated:
             return jsonify({"error": "No valid fields provided for update"}), 400

        db.session.commit()
        return jsonify(serialize_script(script)), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error updating script {script_id}: {e}")
        return jsonify({"error": "Failed to update script"}), 500


@scripts_bp.route('/scripts/<uuid:script_id>', methods=['DELETE'])
@admin_required # Only admins can delete scripts
def delete_script(script_id):
    """Deletes a specific script."""
    script = db.session.get(Script, script_id)
    if not script:
        return jsonify({"error": "Script not found"}), 404

    try:
        db.session.delete(script)
        db.session.commit()
        return '', 204 # No Content
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting script {script_id}: {e}")
        return jsonify({"error": "Failed to delete script"}), 500
