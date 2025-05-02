// /client/js/state.js

// Shared application state variables

export let selectedGameId = null;
export let games = []; // Cache of fetched game data {id, name, ...}
export let currentRooms = []; // Cache of rooms for the selected game {id, title, ...}
export let selectedRoom = null; // The fully loaded room object currently being edited {id, title, description, connections: [...]}
export let currentEntities = []; // Cache of entities for the selected game {id, name, type, ...}
export let selectedEntity = null; // The entity object currently being edited {id, name, ...}
export let currentScripts = []; // Cache of scripts for the selected game {id, trigger, ...}
export let selectedScript = null; // The script object currently being edited {id, trigger, ...}
export let currentConversations = []; // Cache of conversations for the selected game {id, name, ...}
export let selectedConversation = null; // The conversation object currently being edited {id, name, structure}
export let currentPlayRoomId = null; // UUID of the room the player is currently in during Play Mode

export let currentUserRole = 'guest'; // Default role, updated on initialization
export let hasUnsavedChanges = false; // Track unsaved changes status

// --- State Modifiers ---
// It's often better to update state via functions to encapsulate logic
// and potentially notify other parts of the application if needed.

export function setSelectedGameId(id) {
    selectedGameId = id;
}

export function setGames(newGames) {
    games = newGames;
}

export function setCurrentRooms(newRooms) {
    currentRooms = newRooms;
}

export function setSelectedRoom(room) {
    selectedRoom = room;
}

export function setCurrentEntities(newEntities) {
    currentEntities = newEntities;
}

export function setSelectedEntity(entity) {
    selectedEntity = entity;
}

export function setCurrentScripts(newScripts) {
    currentScripts = newScripts;
}

export function setSelectedScript(script) {
    selectedScript = script;
}

export function setCurrentConversations(newConversations) {
    currentConversations = newConversations;
}

export function setSelectedConversation(conversation) {
    selectedConversation = conversation;
}

export function setCurrentPlayRoomId(roomId) {
    currentPlayRoomId = roomId;
}

export function setCurrentUserRole(role) {
    currentUserRole = role;
    console.log(`User role set to: ${currentUserRole}`);
}

/**
 * Sets the unsaved changes flag and notifies the UI.
 * @param {boolean} status - True if there are unsaved changes, false otherwise.
 */
export function setUnsavedChanges(status) {
    hasUnsavedChanges = status;
    // Notify UI to update the indicator (handled by calling uiUtils.updateSaveStatusIndicator)
    // We'll call the UI update function directly from where setUnsavedChanges is called.
}

export function getGameById(id) {
    return games.find(g => g.id === id);
}

export function getRoomById(id) {
    return currentRooms.find(r => r.id === id);
}

export function getEntityById(id) {
    return currentEntities.find(e => e.id === id);
}

export function getScriptById(id) {
    return currentScripts.find(s => s.id === id);
}

export function getConversationById(id) {
    return currentConversations.find(c => c.id === id);
}

export function getRoomTitle(roomId) {
    const room = getRoomById(roomId);
    return room ? room.title : 'Unknown Room';
}

export function getRoomMap() {
    return new Map(currentRooms.map(room => [room.id, room.title]));
}
