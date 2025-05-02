import uuid
from datetime import datetime
from enum import Enum as PyEnum # Import Python's standard Enum
from sqlalchemy.dialects.postgresql import UUID as PG_UUID # Keep for potential future PG use, renamed to avoid clash
from sqlalchemy import MetaData, Enum as SQLEnum, Text, TIMESTAMP, Integer, ForeignKey, UniqueConstraint, Boolean, JSON, String
from app import db # Import db instance from app
from flask_login import UserMixin, AnonymousUserMixin # Import UserMixin and AnonymousUserMixin for Flask-Login
from argon2 import PasswordHasher

# Define naming conventions for constraints for Alembic migrations
# This provides consistent constraint names across databases.
metadata = MetaData(naming_convention={
    "ix": 'ix_%(column_0_label)s',
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s"
})

# --- Password Hashing ---
ph = PasswordHasher()

# --- User Model ---
class UserRole(PyEnum):
    USER = 'user'
    ADMIN = 'admin'

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(String(100), unique=True, nullable=False, index=True)
    email = db.Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = db.Column(String(255), nullable=False)
    role = db.Column(SQLEnum(UserRole), nullable=False, default=UserRole.USER)
    # NEW: User theme preference ('light', 'dark', or 'system')
    theme_preference = db.Column(String(10), nullable=True, default='system')

    # Relationships
    saved_games = db.relationship('SavedGame', back_populates='user', lazy='dynamic', cascade='all, delete-orphan')
    high_scores = db.relationship('HighScore', back_populates='user', lazy='dynamic', cascade='all, delete-orphan')

    def set_password(self, password):
        self.hashed_password = ph.hash(password)

    def check_password(self, password):
        try:
            return ph.verify(self.hashed_password, password)
        except Exception: # Catch Argon2 verification errors
            return False

    # Required properties/methods for Flask-Login
    @property
    def is_active(self):
        return True # Assuming all users are active unless explicitly deactivated

    @property
    def is_authenticated(self):
        return True # Users loaded from the DB are considered authenticated

    @property
    def is_anonymous(self):
        return False

    def get_id(self):
        return str(self.id) # Return UUID as string

# --- Model Definitions ---

class Game(db.Model):
    __tablename__ = 'games'
    id = db.Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(Text, unique=True, nullable=False)
    created_at = db.Column(TIMESTAMP, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    # NEW: Paths for game start and win images (relative to uploads/avonturen/)
    start_image_path = db.Column(Text, nullable=True)
    # NEW: Description for the game, shown at the start
    description = db.Column(Text, nullable=True, default='Klik op het plaatje om het spel te starten!')
    win_image_path = db.Column(Text, nullable=True)
    # NEW: Versioning
    version = db.Column(String(20), nullable=False, default='1.0.0') # Adventure version
    builder_version = db.Column(String(20), nullable=True) # Version of the builder used

    # Relationships
    rooms = db.relationship('Room', back_populates='game', lazy=True, cascade='all, delete-orphan')
    entities = db.relationship('Entity', back_populates='game', lazy=True, cascade='all, delete-orphan')
    saved_games = db.relationship('SavedGame', back_populates='game', lazy='dynamic', cascade='all, delete-orphan') # One-to-many (one per user)
    high_scores = db.relationship('HighScore', back_populates='game', lazy='dynamic', cascade='all, delete-orphan') # One-to-many (one per user)
    scripts = db.relationship('Script', back_populates='game', lazy=True, cascade='all, delete-orphan')
    conversations = db.relationship('Conversation', back_populates='game', lazy=True, cascade='all, delete-orphan') # NEW: Relationship to conversations

    def __repr__(self):
        return f'<Game {self.name}>'

    def to_dict(self):
        """Serializes the Game object to a dictionary."""
        return {
            'id': str(self.id),
            'name': self.name,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
            'updated_at': self.updated_at.isoformat() + 'Z' if self.updated_at else None,
            'start_image_path': self.start_image_path,
            'description': self.description,
            'win_image_path': self.win_image_path,
            'version': self.version,
            'builder_version': self.builder_version,
        }

class Room(db.Model):
    __tablename__ = 'rooms'
    id = db.Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('games.id'), nullable=False)
    title = db.Column(Text, nullable=False, default='Untitled Room')
    description = db.Column(Text, nullable=True, default='')
    # Position for graph view (nullable, frontend layout handles defaults)
    pos_x = db.Column(Integer, nullable=True)
    pos_y = db.Column(Integer, nullable=True)
    # Index for manual sorting in the list view
    sort_index = db.Column(Integer, nullable=False, default=0)
    # NEW: Path to the associated image file (relative to uploads/images/kamers/)
    image_path = db.Column(Text, nullable=True)

    # Relationships
    game = db.relationship('Game', back_populates='rooms')
    # Connections originating from this room
    connections_from = db.relationship('Connection', foreign_keys='Connection.from_room_id',
                                       back_populates='from_room', lazy='dynamic', cascade='all, delete-orphan')
    # Connections leading to this room (less common to query directly, but possible)
    # connections_to = db.relationship('Connection', foreign_keys='Connection.to_room_id',
    #                                  back_populates='to_room', lazy='dynamic')
    entities = db.relationship('Entity', back_populates='room', lazy=True) # Entities located in this room

    def __repr__(self):
        return f'<Room {self.title} in Game {self.game_id}>'

    def to_dict(self):
        """Serializes the Room object to a dictionary."""
        return {
            'id': str(self.id),
            'game_id': str(self.game_id),
            'title': self.title,
            'description': self.description,
            'pos_x': self.pos_x,
            'pos_y': self.pos_y,
            'sort_index': self.sort_index,
            'image_path': self.image_path,
            # Connections and entities are handled separately in the export
        }

class Connection(db.Model):
    __tablename__ = 'connections'
    id = db.Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_room_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('rooms.id'), nullable=False)
    to_room_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('rooms.id'), nullable=False)
    direction = db.Column(Text, nullable=False) # e.g., 'north', 'south', 'east', 'west', 'up', 'down', 'in', 'out'
    # Optional: Add description for the connection (e.g., "through a rusty door")
    # description = db.Column(Text)
    # NEW: Lock mechanism
    is_locked = db.Column(Boolean, nullable=False, default=False)
    required_key_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('entities.id'), nullable=True) # Null if not locked or no specific key needed

    # Relationships
    from_room = db.relationship('Room', foreign_keys=[from_room_id], back_populates='connections_from')
    to_room = db.relationship('Room', foreign_keys=[to_room_id]) # No back_populates needed here unless querying connections_to
    # NEW: Relationship to the key entity
    required_key = db.relationship('Entity', foreign_keys=[required_key_id]) # Relationship to the specific key needed

    # Ensure a connection from a room in a specific direction is unique within that room
    __table_args__ = (UniqueConstraint('from_room_id', 'direction', name='uq_connection_from_direction'),)

    def __repr__(self):
        return f'<Connection from {self.from_room_id} to {self.to_room_id} via {self.direction}>'

    def to_dict(self):
        """Serializes the Connection object to a dictionary."""
        return {
            'id': str(self.id),
            'from_room_id': str(self.from_room_id),
            'to_room_id': str(self.to_room_id),
            'direction': self.direction,
            'is_locked': self.is_locked,
            'required_key_id': str(self.required_key_id) if self.required_key_id else None,
            # Relationships are not serialized directly, IDs are used
        }

# Define the Enum using Python's standard library Enum
class EntityType(PyEnum):
    ITEM = 'ITEM'
    NPC = 'NPC'
    # Add other types if needed, e.g., SCENERY

class Entity(db.Model):
    __tablename__ = 'entities'
    id = db.Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('games.id'), nullable=False)
    # Entity can be in a room or directly associated with the game
    room_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('rooms.id'), nullable=True)
    # NEW: Add container_id for nesting entities
    container_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('entities.id'), nullable=True)
    type = db.Column(SQLEnum(EntityType), nullable=False)
    name = db.Column(Text, nullable=False)
    description = db.Column(Text, nullable=True, default='')
    is_takable = db.Column(Boolean, nullable=False, default=False)
    is_container = db.Column(Boolean, nullable=False, default=False)
    # NEW: Link to the default conversation for this NPC
    conversation_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('conversations.id'), nullable=True)
    # NEW: Path to the associated image file (relative to uploads/images/entiteiten/)
    image_path = db.Column(Text, nullable=True)
    # NEW: Flag for wandering NPCs
    is_mobile = db.Column(Boolean, nullable=False, default=False)
    # NEW: Optional custom message when picking up the item
    pickup_message = db.Column(Text, nullable=True)

    # Relationships
    game = db.relationship('Game', back_populates='entities')
    room = db.relationship('Room', back_populates='entities') # Location of the entity
    # NEW: Relationship for container
    # The container this entity is inside of
    container = db.relationship('Entity', back_populates='contained_items', remote_side=[id])
    # The items contained within this entity (if it's a container)
    contained_items = db.relationship('Entity', back_populates='container', lazy='dynamic',
                                      cascade='all, delete-orphan') # Items deleted if container is deleted
    # NEW: Relationship back to connections this entity unlocks
    unlocks_connections = db.relationship('Connection', foreign_keys=[Connection.required_key_id], back_populates='required_key', lazy='dynamic')
    # NEW: Relationship to the linked conversation
    conversation = db.relationship('Conversation', foreign_keys=[conversation_id])

    # NEW: Check constraint to ensure an entity is either in a room OR in a container, not both (or neither, like inventory)
    __table_args__ = (
        db.CheckConstraint('NOT(room_id IS NOT NULL AND container_id IS NOT NULL)', name='ck_entity_location'),
    )

    def __repr__(self):
        location = f"in Room {self.room_id}" if self.room_id else (f"in Container {self.container_id}" if self.container_id else "in Game scope/Inventory")
        # Access the enum value using .name for representation if needed, or .value
        enum_name = self.type.name if self.type else 'UNKNOWN_TYPE'
        return f'<{enum_name} {self.name} {location}>'

    def to_dict(self):
        """Serializes the Entity object to a dictionary."""
        return {
            'id': str(self.id),
            'game_id': str(self.game_id),
            'room_id': str(self.room_id) if self.room_id else None,
            'container_id': str(self.container_id) if self.container_id else None,
            'type': self.type.value, # Store the enum value (string)
            'name': self.name,
            'description': self.description,
            'is_takable': self.is_takable,
            'is_container': self.is_container,
            'conversation_id': str(self.conversation_id) if self.conversation_id else None,
            'image_path': self.image_path,
            'is_mobile': self.is_mobile, # Include is_mobile flag
            'pickup_message': self.pickup_message, # Include pickup message
            # Relationships (container, contained_items, unlocks_connections, conversation)
            # are handled by linking IDs during export/import
        }

class Script(db.Model):
    __tablename__ = 'scripts'
    id = db.Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('games.id'), nullable=False)
    # Link script to an entity, room, or game event (TBD)
    # entity_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('entities.id'), nullable=True)
    # room_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('rooms.id'), nullable=True)
    trigger = db.Column(Text, nullable=False) # e.g., 'ON_ENTER', 'ON_TAKE(item_id)', 'ON_USE(item_id, target_id)'
    condition = db.Column(Text, nullable=True) # e.g., 'HAS_ITEM(key_id)', 'NPC_STATE(guard)=="asleep"'
    action = db.Column(Text, nullable=False) # e.g., 'SHOW_MESSAGE("Door unlocked!")', 'MOVE_NPC(guard, room_id)', 'SET_STATE(door, "open")'
    # execution_order = db.Column(Integer, default=0) # If multiple scripts match trigger

    # Relationships
    game = db.relationship('Game', back_populates='scripts')

    def __repr__(self):
        return f'<Script {self.id} for Game {self.game_id} on Trigger {self.trigger}>'

    def to_dict(self):
        """Serializes the Script object to a dictionary."""
        return {
            'id': str(self.id),
            'game_id': str(self.game_id),
            'trigger': self.trigger,
            'condition': self.condition,
            'action': self.action,
            # Relationships are not serialized directly
        }

class Conversation(db.Model):
    __tablename__ = 'conversations'
    id = db.Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('games.id'), nullable=False)
    name = db.Column(Text, nullable=False) # Internal name for the editor
    # Store the conversation structure as JSON
    # Example structure:
    # {
    #   "start_node": "node_1",
    #   "nodes": {
    #     "node_1": {"npc_text": "Hallo!", "options": [{"text": "Hoi", "next_node": "node_2"}]},
    #     "node_2": {"npc_text": "Hoe gaat het?", "options": [{"text": "Goed", "next_node": "node_1"}]}
    #   }
    # }
    structure = db.Column(JSON, nullable=False, default=dict)

    game = db.relationship('Game', back_populates='conversations')

    def to_dict(self):
        """Serializes the Conversation object to a dictionary."""
        return {
            'id': str(self.id),
            'game_id': str(self.game_id),
            'name': self.name,
            'structure': self.structure, # JSON field can be directly included
            # Relationships are not serialized directly
        }

class SavedGame(db.Model):
    """Stores the saved state for a single game."""
    __tablename__ = 'saved_games'
    __table_args__ = (
        db.PrimaryKeyConstraint('user_id', 'game_id', name='pk_saved_game_user_game'),
    )
    user_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    game_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('games.id'), nullable=False)
    # Store the ID of the room the player was last in
    current_room_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('rooms.id'), nullable=False)
    # Store player inventory as a JSON list of entity IDs
    inventory = db.Column(JSON, nullable=False, default=list)
    # Store dynamic game variables (e.g., script-modified states) as JSON
    game_variables = db.Column(JSON, nullable=False, default=dict)
    # Store temporary entity locations (overrides from DB) as JSON
    entity_locations = db.Column(JSON, nullable=False, default=dict)
    saved_at = db.Column(TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship('User', back_populates='saved_games')
    game = db.relationship('Game', back_populates='saved_games')
    current_room = db.relationship('Room') # Relationship to the Room model

class HighScore(db.Model):
    """Stores the high score for a user on a specific game."""
    __tablename__ = 'high_scores'
    __table_args__ = (
        db.PrimaryKeyConstraint('user_id', 'game_id', name='pk_highscore_user_game'),
    )
    user_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    game_id = db.Column(PG_UUID(as_uuid=True), ForeignKey('games.id'), nullable=False)
    score = db.Column(Integer, nullable=False, default=0)
    achieved_at = db.Column(TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship('User', back_populates='high_scores')
    game = db.relationship('Game', back_populates='high_scores')

# --- NEW: System Settings Model ---
class SystemSetting(db.Model):
    """Stores global system settings as key-value pairs."""
    __tablename__ = 'system_settings'
    key = db.Column(String(50), primary_key=True) # Setting key (e.g., 'default_theme')
    value = db.Column(Text, nullable=False) # Setting value (e.g., 'light')
    description = db.Column(Text, nullable=True) # Optional description of the setting

    def __repr__(self):
        return f'<SystemSetting {self.key}={self.value}>'

# --- Anonymous User ---
# Define a custom AnonymousUser for Flask-Login
class AnonymousUser(AnonymousUserMixin):
    def __init__(self):
        self.role = None # Anonymous users don't have a role
        self.name = 'Guest'
        self.theme_preference = 'system' # Default theme for guests
