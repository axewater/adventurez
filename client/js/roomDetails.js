// /client/js/roomDetails.js
import * as api from './api.js';
import * as state from './state.js';
import * as uiUtils from './uiUtils.js';
import { renderRoomList, fetchRoomsForGame, selectRoom } from './roomList.js';
import { addNodeToGraph, addEdgeToGraph, removeNodeFromGraph, removeEdgeFromGraph } from './roomGraphActions.js';
import { dispatchGameDataChangedEvent } from './uiUtils.js';
import { updateSaveStatusIndicator } from './uiUtils.js';

// --- DOM Element Caching ---
const addRoomBtn = document.getElementById('add-room-btn');
const roomDetailsPanel = document.getElementById('room-details-panel');
const roomDetailsPlaceholder = document.getElementById('room-details-placeholder');
const roomDetailsForm = document.getElementById('room-details-form');
const roomTitleInput = document.getElementById('room-title-input');
const roomDescriptionTextarea = document.getElementById('room-description-textarea');
const saveRoomBtn = document.getElementById('save-room-btn');
const deleteRoomBtn = document.getElementById('delete-room-btn');
const roomConnectionsListUl = document.getElementById('room-connections-list');
const connectionDirectionSelect = document.getElementById('connection-direction-select');
const connectionTargetRoomSelect = document.getElementById('connection-target-room-select');
const addConnectionBtn = document.getElementById('add-connection-btn');
const roomImageSelect = document.getElementById('room-image-select');
const roomImageThumbnail = document.getElementById('room-image-thumbnail');
const roomDetailEntitiesListUl = document.getElementById('room-detail-entities-list');

const roomIdValueSpan = document.getElementById('room-id-value');
const copyRoomIdBtn = document.getElementById('copy-room-id-btn');

// --- Room Details Rendering ---

/**
 * Renders the details of the selected room in the form.
 * @param {object} roomData - The full room object including connections.
 * @param {Array<object>} entitiesData - Array of entity objects in the room.
 */
export function renderRoomDetails(roomData, entitiesData) {
    if (!roomData) {
        uiUtils.clearRoomDetailsPanel();
        return;
    }
    if (roomDetailsPlaceholder) roomDetailsPlaceholder.style.display = 'none';
    if (roomDetailsForm) roomDetailsForm.style.display = 'block';

    if (roomTitleInput) roomTitleInput.value = roomData.title;
    if (roomDescriptionTextarea) roomDescriptionTextarea.value = roomData.description;

    // Display Room ID
    if (roomIdValueSpan) roomIdValueSpan.textContent = roomData.id;
    if (copyRoomIdBtn) {
        copyRoomIdBtn.dataset.roomId = roomData.id; // Store ID for the button
    }

    // Populate and set image dropdown
    populateRoomImageDropdown(roomData.image_path);
    updateRoomImageThumbnail(roomData.image_path);

    renderConnectionsList(roomData.connections || []);
    populateTargetRoomDropdown(roomData.id);
    renderEntitiesInRoomList(entitiesData);
}

/**
 * Renders the list of connections for the selected room.
 * @param {Array<object>} connections - Array of connection objects {id, to_room_id, direction}.
 */
function renderConnectionsList(connections) {
    if (!roomConnectionsListUl) return;
    roomConnectionsListUl.innerHTML = ''; // Clear existing list
    if (!connections || connections.length === 0) {
        roomConnectionsListUl.innerHTML = '<li>No connections defined yet.</li>';
        return;
    }

    // Use the room map from state for efficiency
    const roomMap = state.getRoomMap();

    connections.forEach(conn => {
        const li = document.createElement('li');
        const targetRoomName = roomMap.get(conn.to_room_id) || 'Unknown Room';
        li.innerHTML = `
            <span>${conn.direction.toUpperCase()} &rarr; ${targetRoomName}</span>
            <button class="delete-connection-btn" data-connection-id="${conn.id}" title="Delete Connection">&times;</button>
        `;
        // Add event listener for the delete button
        const deleteBtn = li.querySelector('.delete-connection-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent triggering room selection
                const connectionId = e.target.dataset.connectionId;
                if (confirm(`Delete connection: ${conn.direction.toUpperCase()} to ${targetRoomName}?`)) {
                    await deleteConnection(connectionId);
                }
            });
        }
        roomConnectionsListUl.appendChild(li);
    });
}

/**
 * Renders the list of entities present in the selected room.
 * @param {Array<object>} entities - Array of entity objects {id, name, type}.
 */
function renderEntitiesInRoomList(entities) {
    if (!roomDetailEntitiesListUl) return;
    roomDetailEntitiesListUl.innerHTML = ''; // Clear existing list

    if (!entities || entities.length === 0) {
        roomDetailEntitiesListUl.innerHTML = '<li>No entities in this room.</li>';
        return;
    }

    // Sort entities alphabetically by name
    const sortedEntities = [...entities].sort((a, b) => a.name.localeCompare(b.name));

    sortedEntities.forEach(entity => {
        const li = document.createElement('li');
        li.textContent = `${entity.name} (${entity.type})`;
        li.style.cursor = 'pointer'; // Indicate it's clickable
        li.title = `Click to go to entity "${entity.name}"`;
        li.dataset.entityId = entity.id;

        // Add click listener to switch tab and select entity
        li.addEventListener('click', () => {
            uiUtils.switchToTab('entities'); // Switch to the Entities tab
            import('./entityList.js').then(module => module.selectEntity(entity.id)); // Select the entity in the main list
        });
        roomDetailEntitiesListUl.appendChild(li);
    });
}

/**
 * Populates the dropdown list of target rooms for adding connections.
 * Excludes the currently selected room.
 * @param {string} currentRoomId - The UUID of the room currently being edited.
 */
export function populateTargetRoomDropdown(currentRoomId) {
    if (!connectionTargetRoomSelect) return;
    connectionTargetRoomSelect.innerHTML = '<option value="">To Room...</option>'; // Reset
    if (!state.currentRooms || state.currentRooms.length <= 1) {
        // No other rooms to connect to
        connectionTargetRoomSelect.disabled = true;
        return;
    }

    connectionTargetRoomSelect.disabled = false;
    const sortedRooms = [...state.currentRooms].sort((a, b) => a.title.localeCompare(b.title));

    sortedRooms.forEach(room => {
        if (room.id !== currentRoomId) { // Don't list the current room as a target
            const option = document.createElement('option');
            option.value = room.id;
            option.textContent = room.title;
            connectionTargetRoomSelect.appendChild(option);
        }
    });
}

/**
 * Updates the visibility and source of the room image thumbnail.
 * @param {string | null} imagePath - The filename of the image, or null.
 */
function updateRoomImageThumbnail(imagePath) {
    if (!roomImageThumbnail) return;
    const defaultImagePath = '/uploads/images/kamers/standaard_kamer.png'; // Define default path

    if (imagePath) {
        const imageUrl = `/uploads/images/kamers/${imagePath}`; // Construct full URL for rooms
        roomImageThumbnail.src = imageUrl;
        roomImageThumbnail.style.display = 'inline-block';
    } else {
        roomImageThumbnail.src = defaultImagePath; // Show default image
        roomImageThumbnail.style.display = 'inline-block'; // Ensure thumbnail is visible
    }
}

/**
 * Fetches available room images and populates the dropdown.
 * Sets the selected option based on the room's current image_path.
 * @param {string | null} selectedImagePath - The filename of the image currently associated with the room, or null.
 */
async function populateRoomImageDropdown(selectedImagePath) {
    if (!roomImageSelect) return;
    roomImageSelect.innerHTML = '<option value="">-- Standaard Plaatje --</option>'; // Reset with default
    roomImageSelect.disabled = true; // Disable while loading

    try {
        const response = await fetch('/api/images/list?type=room');
        const imageFiles = await api.handleApiResponse(response);

        imageFiles.forEach(filename => {
            const option = document.createElement('option');
            option.value = filename;
            option.textContent = filename; // Keep filename as text
            roomImageSelect.appendChild(option);
        });
        // Set the selected value AFTER populating all options
        roomImageSelect.value = selectedImagePath || ""; // Select the image or the default ("")
        roomImageSelect.disabled = false; // Enable after loading
    } catch (error) {
        console.error("Failed to load room images:", error);
        // Keep dropdown disabled or show error message?
    }
}

/**
 * Handles changes in the room image dropdown.
 */
function handleRoomImageChange() {
    const selectedImage = roomImageSelect?.value || null;
    updateRoomImageThumbnail(selectedImage); // Update the thumbnail display
    state.setUnsavedChanges(true);
    updateSaveStatusIndicator();
}

/**
 * Handles clicking the room image thumbnail to show the popup.
 */
function handleRoomThumbnailClick() {
    const imageUrl = roomImageThumbnail?.src;
    if (imageUrl && imageUrl !== '#') { // Ensure src is valid
        uiUtils.showImagePopup(imageUrl); // Use the utility function
    }
}

/**
 * Handles clicking the copy room ID button.
 */
async function handleCopyRoomId() {
    const roomId = copyRoomIdBtn?.dataset.roomId;
    if (!roomId) return;

    try {
        await navigator.clipboard.writeText(roomId);
        uiUtils.showFlashMessage("Kamer ID gekopieerd!", 2000); // Short duration confirmation
    } catch (err) {
        console.error('Failed to copy Room ID: ', err);
        uiUtils.showFlashMessage("Kopiëren mislukt.", 3000);
    }
}

// --- Event Listeners ---

async function handleAddRoom() {
    if (!state.selectedGameId) return;
    const { nodes: graphNodes, simulation: graphSimulation, updateGraph: graphUpdate, graphContainer: graphCont } = await import('./roomGraph.js');

    const defaultTitle = `Nieuwe Kamer ${state.currentRooms.length + 1}`;
    console.log(`Adding new room to game ${state.selectedGameId}`);
    try {
        const response = await fetch(`/api/games/${state.selectedGameId}/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Send minimal data, backend uses defaults
            body: JSON.stringify({ title: defaultTitle })
        });
        const newRoom = await api.handleApiResponse(response);
        console.log("Room created:", newRoom);

        // Update state and UI
        state.setCurrentRooms([...state.currentRooms, newRoom]);
        renderRoomList(); // Update list display
        selectRoom(newRoom.id); // Select the newly created room

        // Add node to graph if active
        addNodeToGraph(newRoom, graphNodes, graphSimulation, graphUpdate, graphCont);

        // Set unsaved changes flag and update UI
        state.setUnsavedChanges(true);
        updateSaveStatusIndicator();

    } catch (error) {
        console.error("Failed to add room:", error);
        uiUtils.showFlashMessage(`Error: Failed to add room.`, 5000); // Use flash message for errors
    }
}

async function handleSaveRoom(event) {
    event.preventDefault(); // Prevent default form submission
    if (!state.selectedRoom) return;

    const updatedData = {
        title: roomTitleInput?.value.trim() || 'Untitled Room',
        description: roomDescriptionTextarea?.value.trim() || '',
        image_path: roomImageSelect?.value || null // Send selected image filename (or null for default)
        // Note: Position saving is handled by roomGraph.js via drag'n'drop
    };

    console.log(`Saving changes for room ${state.selectedRoom.id}`);
    try {
        const response = await fetch(`/api/rooms/${state.selectedRoom.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        const updatedRoomData = await api.handleApiResponse(response);
        console.log("Room updated:", updatedRoomData);

        // Update local cache (state)
        const index = state.currentRooms.findIndex(r => r.id === state.selectedRoom.id);
        const updatedRooms = [...state.currentRooms];
        if (index !== -1) {
            // Preserve connections data if the PUT response doesn't include it fully
            // (Our current PUT response *does* include connections, so this merge is robust)
            updatedRooms[index] = { ...updatedRooms[index], ...updatedRoomData };
        }
        state.setCurrentRooms(updatedRooms);
        state.setSelectedRoom(updatedRooms[index]); // Update the selected room object

        // Re-render the list to reflect potential title changes
        renderRoomList();
        // Re-render details (might be redundant if PUT returns full data, but safe)
        renderRoomDetails(state.selectedRoom, updatedRoomData.entities || []);

        // Update node label in graph view if active
        // D3 version: The updateGraph function called by addNode/addEdge etc. handles label updates
        // If only title changed, we might need a specific updateNodeLabel function or rely on updateGraph.

        uiUtils.showFlashMessage("Kamer succesvol opgeslagen!"); // Use flash message

        // Reset unsaved changes flag and update UI
        state.setUnsavedChanges(false);
        updateSaveStatusIndicator();

        // Dispatch event to signal change
        dispatchGameDataChangedEvent('roomDetailsSave');

    } catch (error) {
        console.error(`Failed to save room ${state.selectedRoom.id}:`, error);
        uiUtils.showFlashMessage(`Error: Failed to save room.`, 5000); // Use flash message for errors
    }
}

async function handleDeleteRoom() {
    if (!state.selectedRoom) return;
    const { nodes: graphNodes, links: graphLinks, simulation: graphSimulation, updateGraph: graphUpdate } = await import('./roomGraph.js');

    if (confirm(`Are you sure you want to delete the room "${state.selectedRoom.title}"? This will also remove connections to and from it.`)) {
        console.log(`Deleting room ${state.selectedRoom.id}`);
        const roomIdToDelete = state.selectedRoom.id; // Store ID before clearing selection
        try {
            const response = await fetch(`/api/rooms/${roomIdToDelete}`, {
                method: 'DELETE'
            });
            await api.handleApiResponse(response); // Checks for errors, expects 204

            console.log("Room deleted:", roomIdToDelete);

            // Remove from local cache (state)
            state.setCurrentRooms(state.currentRooms.filter(r => r.id !== roomIdToDelete));

            // Clear details panel and update list
            uiUtils.clearRoomDetailsPanel(); // This also clears selectedRoom state
            renderRoomList();

            // Remove node from graph view if active
            removeNodeFromGraph(roomIdToDelete, graphNodes, graphLinks, graphSimulation, graphUpdate);

            uiUtils.showFlashMessage("Kamer succesvol verwijderd."); // Use flash message

            // Reset unsaved changes flag and update UI
            state.setUnsavedChanges(false);
            updateSaveStatusIndicator();

            // Dispatch event to signal change
            dispatchGameDataChangedEvent('roomDetailsDelete');

            // Re-fetch rooms to ensure consistency after deletion? Optional.
            // await fetchRoomsForGame(state.selectedGameId);

        } catch (error) {
            console.error(`Failed to delete room ${roomIdToDelete}:`, error);
            uiUtils.showFlashMessage(`Error: Failed to delete room.`, 5000); // Use flash message for errors
        }
    }
}

async function handleAddConnection() {
    if (!state.selectedRoom) return;
    const { nodes: graphNodes, links: graphLinks, simulation: graphSimulation, updateGraph: graphUpdate } = await import('./roomGraph.js');

    const direction = connectionDirectionSelect?.value;
    const targetRoomId = connectionTargetRoomSelect?.value;

    if (!direction || !targetRoomId) {
        uiUtils.showFlashMessage("Selecteer aub een richting en een doel kamer.", 5000);
        return;
    }

    console.log(`Adding connection from ${state.selectedRoom.id}: ${direction} -> ${targetRoomId}`);

    try {
        const response = await fetch(`/api/rooms/${state.selectedRoom.id}/connections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to_room_id: targetRoomId, direction: direction })
        });
        const newConnection = await api.handleApiResponse(response);
        console.log("Connection created:", newConnection);

        // Add connection to the selected room's data locally in state
        if (state.selectedRoom) {
            if (!state.selectedRoom.connections) {
                state.selectedRoom.connections = [];
            }
            state.selectedRoom.connections.push(newConnection);

            // Re-render the connections list and reset the form
            renderConnectionsList(state.selectedRoom.connections);
            if (connectionDirectionSelect) connectionDirectionSelect.value = '';
            if (connectionTargetRoomSelect) connectionTargetRoomSelect.value = '';

            // Add edge to graph view if active
            addEdgeToGraph(newConnection, graphNodes, graphLinks, graphSimulation, graphUpdate);

            // Set unsaved changes flag and update UI
            state.setUnsavedChanges(true);
            updateSaveStatusIndicator();

            // Dispatch event to signal change
            dispatchGameDataChangedEvent('roomDetailsAddConnection');
        }

    } catch (error) {
        console.error("Failed to add connection:", error);
        uiUtils.showFlashMessage(`Error: Failed to add connection.`, 5000); // Use flash message for errors
    }
}

/**
 * Handles deleting a connection via its button.
 * @param {string} connectionId - The UUID of the connection to delete.
 */
async function deleteConnection(connectionId) {
    if (!state.selectedRoom) return;
    const { links: graphLinks, simulation: graphSimulation, updateGraph: graphUpdate } = await import('./roomGraph.js');
    console.log(`Deleting connection ${connectionId}`);
    try {
        const response = await fetch(`/api/connections/${connectionId}`, {
            method: 'DELETE'
        });
        await api.handleApiResponse(response); // Checks for errors, expects 204

        console.log("Connection deleted:", connectionId);

        // Remove connection from local selected room data in state
        if (state.selectedRoom && state.selectedRoom.connections) {
            state.selectedRoom.connections = state.selectedRoom.connections.filter(c => c.id !== connectionId);
        }

        // Re-render the connections list
        renderConnectionsList(state.selectedRoom?.connections || []);

        // Remove edge from graph view if active
        removeEdgeFromGraph(connectionId, graphLinks, graphSimulation, graphUpdate);

        // Set unsaved changes flag and update UI
        state.setUnsavedChanges(true);
        updateSaveStatusIndicator();

        // Dispatch event to signal change
        dispatchGameDataChangedEvent('roomDetailsDeleteConnection');

    } catch (error) {
        console.error(`Failed to delete connection ${connectionId}:`, error);
        uiUtils.showFlashMessage(`Error: Failed to delete connection.`, 5000); // Use flash message for errors
    }
}

// --- Initialization ---
export function initializeRoomDetails() {
    if (addRoomBtn) addRoomBtn.addEventListener('click', handleAddRoom);
    if (roomDetailsForm) roomDetailsForm.addEventListener('submit', handleSaveRoom);
    if (deleteRoomBtn) deleteRoomBtn.addEventListener('click', handleDeleteRoom);
    if (addConnectionBtn) addConnectionBtn.addEventListener('click', handleAddConnection);

    // Add listeners to form inputs/selects to detect changes
    const inputs = [roomTitleInput, roomDescriptionTextarea, roomImageSelect];
    inputs.forEach(input => {
        if (input) {
            input.addEventListener('input', () => { // 'input' for text/textarea
                state.setUnsavedChanges(true);
                updateSaveStatusIndicator();
            });
        }
    });
    // Add listener for image select changes (using 'change' event)
    if (roomImageSelect) roomImageSelect.addEventListener('change', handleRoomImageChange);
    // Add listener for thumbnail click
    if (roomImageThumbnail) roomImageThumbnail.addEventListener('click', handleRoomThumbnailClick);
    // Add listener for copy room ID button
    if (copyRoomIdBtn) copyRoomIdBtn.addEventListener('click', handleCopyRoomId);
}
