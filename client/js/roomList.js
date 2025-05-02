// /client/js/roomList.js
import * as api from './api.js';
import * as state from './state.js';
import * as uiUtils from './uiUtils.js';
import { renderRoomDetails, populateTargetRoomDropdown } from './roomDetails.js';
import { initializeGraphView } from './roomGraph.js'; // Import D3 graph functions
import { selectNodeInGraph } from './roomGraphActions.js'; // Import D3 graph actions
import { dispatchGameDataChangedEvent } from './uiUtils.js'; // Import the dispatcher

// --- DOM Element Caching ---
const roomListUl = document.getElementById('room-list-ul');
const roomGraphView = document.getElementById('room-graph-view');

// --- Drag & Drop State ---
let draggedRoomId = null;

// --- Room List Fetching and Rendering ---

/**
 * Fetches the list of rooms for the currently selected game.
 * @param {string} gameId - The UUID of the game.
 */
export async function fetchRoomsForGame(gameId) {
    if (!gameId) return;
    console.log(`Fetching rooms for game ${gameId}`);
    try {
        const response = await fetch(`/api/games/${gameId}/rooms`);
        const fetchedRooms = await api.handleApiResponse(response);
        state.setCurrentRooms(fetchedRooms); // Update state
        console.log("Rooms fetched:", state.currentRooms);
        renderRoomList();
        // If graph view is active, update or initialize it
        if (roomGraphView?.classList.contains('active')) {
             initializeGraphView(); // Re-initialize with new room data
        }
    } catch (error) {
        console.error(`Failed to fetch rooms for game ${gameId}:`, error);
        if (roomListUl) roomListUl.innerHTML = '<li>Error loading rooms.</li>';
        state.setCurrentRooms([]);
    }
}

/**
 * Renders the list of rooms based on the current state.
 */
export function renderRoomList() {
    if (!roomListUl) return;
    roomListUl.innerHTML = ''; // Clear list
    if (state.currentRooms.length === 0) {
        roomListUl.innerHTML = '<li>No rooms created yet.</li>';
    } else {
        // Rooms are now fetched pre-sorted by sort_index from the API
        const sortedRooms = state.currentRooms; // Use the order received from the API
        sortedRooms.forEach((room, index) => {
            const li = document.createElement('li');
            // Check if it's the first room (start room)
            const isStartRoom = index === 0;
            li.textContent = isStartRoom ? `(Start) ${room.title}` : room.title;
            li.draggable = true; // Make the list item draggable
            // Add class if it's the start room
            if (isStartRoom) li.classList.add('start-room');
            li.dataset.roomId = room.id;
            li.addEventListener('click', () => selectRoom(room.id));
            if (state.selectedRoom && room.id === state.selectedRoom.id) {
                li.classList.add('selected');
            }
            // Add drag-and-drop event listeners directly to the li
            addDragDropListeners(li);
            roomListUl.appendChild(li);
        });
    }
}

/**
 * Handles selecting a room from the list, fetching its details and entities.
 * @param {string} roomId - The UUID of the room to select.
 */
export async function selectRoom(roomId) {
    const { graphInitialized, updateGraph } = await import('./roomGraph.js');
    if (state.selectedRoom && state.selectedRoom.id === roomId) return; // Avoid re-selecting

    console.log(`Selecting room ${roomId}`);
    // Clear previous selection highlight immediately
    const previouslySelected = roomListUl?.querySelector('li.selected');
    if (previouslySelected) {
        previouslySelected.classList.remove('selected');
    }

    try {
        // Fetch room details and entities concurrently
        const [roomResponse, entitiesResponse] = await Promise.all([
            fetch(`/api/rooms/${roomId}`),
            fetch(`/api/rooms/${roomId}/entities`) // Fetch entities for this room
        ]);

        const roomData = await api.handleApiResponse(roomResponse);
        const entitiesData = await api.handleApiResponse(entitiesResponse);

        state.setSelectedRoom(roomData); // Update state
        console.log("Selected room details:", state.selectedRoom, "Entities in room:", entitiesData);

        // Render details in the details panel (function from roomDetails.js)
        renderRoomDetails(state.selectedRoom, entitiesData);

        // Highlight the newly selected item in the list
        const newlySelectedItem = roomListUl?.querySelector(`li[data-room-id="${roomId}"]`);
        if (newlySelectedItem) {
            newlySelectedItem.classList.add('selected');
        }
        // Also highlight node in graph view if active
        selectNodeInGraph(roomId, graphInitialized, updateGraph); // Call the action version
    } catch (error) {
        console.error(`Failed to fetch details for room ${roomId}:`, error);
        uiUtils.clearRoomDetailsPanel();
        state.setSelectedRoom(null);
    }
}

// --- Drag and Drop Logic ---

function addDragDropListeners(item) {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('dragleave', handleDragLeave);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragend', handleDragEnd);
}

function handleDragStart(e) {
    draggedRoomId = e.target.dataset.roomId;
    e.dataTransfer.effectAllowed = 'move';
    e.target.classList.add('dragging');
    console.log(`Drag Start: ${draggedRoomId}`);
}

function handleDragOver(e) {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
    const targetLi = e.target.closest('li');
    if (targetLi && targetLi.dataset.roomId !== draggedRoomId) {
        targetLi.classList.add('drag-over');
    }
    return false;
}

function handleDragLeave(e) {
    const targetLi = e.target.closest('li');
    if (targetLi) {
        targetLi.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    e.stopPropagation(); // Prevent event bubbling
    e.preventDefault(); // Prevent default browser drop behavior

    const targetLi = e.target.closest('li'); // Find the li element being dropped onto
    if (!targetLi || targetLi.dataset.roomId === draggedRoomId || !roomListUl) {
        // Dropped on itself or not on a valid target li or list doesn't exist
        if (draggedRoomId) { // Ensure cleanup if drop is invalid
             const draggedLi = roomListUl?.querySelector(`li[data-room-id="${draggedRoomId}"]`);
             draggedLi?.classList.remove('dragging');
             roomListUl?.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
             draggedRoomId = null;
        }
        return false;
    }

    const draggedLi = roomListUl.querySelector(`li[data-room-id="${draggedRoomId}"]`);
    if (!draggedLi) return false; // Should not happen

    console.log(`Drop: ${draggedRoomId} onto ${targetLi.dataset.roomId}`);

    // Insert the dragged item before the target item
    roomListUl.insertBefore(draggedLi, targetLi);

    // --- Update Start Room Indicator ---
    // 1. Remove existing indicators
    roomListUl.querySelectorAll('li').forEach((item, index) => {
        item.classList.remove('start-room');
        // Remove "(Start) " prefix if present
        item.textContent = item.textContent.replace(/^\(Start\) /, '');
    });
    // 2. Add indicator to the new first item
    const newFirstItem = roomListUl.querySelector('li:first-child');
    if (newFirstItem) {
        newFirstItem.classList.add('start-room');
        newFirstItem.textContent = `(Start) ${newFirstItem.textContent}`;
    }
    // --- End Update Start Room Indicator ---

    // Clean up visual feedback
    targetLi.classList.remove('drag-over');
    draggedLi.classList.remove('dragging'); // Also remove dragging class here

    // Save the new order to the backend
    const orderedRoomIds = Array.from(roomListUl.children).map(li => li.dataset.roomId);
    console.log("Saving new room order:", orderedRoomIds);
    saveRoomOrder(orderedRoomIds);

    // Update local currentRooms array order to match the visual order immediately
    const roomMap = new Map(state.currentRooms.map(room => [room.id, room]));
    const newOrderedRooms = orderedRoomIds.map(id => roomMap.get(id)).filter(Boolean); // Filter out potential undefined if map fails
    state.setCurrentRooms(newOrderedRooms);

    state.setUnsavedChanges(true); // Mark as unsaved changes
    uiUtils.updateSaveStatusIndicator(); // Update UI
    draggedRoomId = null; // Reset state
    return false;
}

function handleDragEnd(e) {
    // Clean up: remove dragging class from the source element
    e.target.classList.remove('dragging');
    // Clean up any remaining drag-over classes (safety net)
    roomListUl?.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    draggedRoomId = null; // Reset dragged item state
    console.log("Drag End");
}

/**
 * Sends the new order of room IDs to the backend API.
 * @param {string[]} orderedRoomIds - An array of room UUIDs in the desired order.
 */
async function saveRoomOrder(orderedRoomIds) {
    if (!state.selectedGameId) return;
    console.log(`Sending updated room order for game ${state.selectedGameId}`);
    try {
        const response = await fetch(`/api/games/${state.selectedGameId}/rooms/order`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderedRoomIds)
        });
        await api.handleApiResponse(response); // Checks for success or throws error
        console.log("Room order saved successfully.");
        state.setUnsavedChanges(false); // Reset unsaved changes flag
        uiUtils.updateSaveStatusIndicator(); // Update UI
        dispatchGameDataChangedEvent('roomListOrderSave'); // Signal change
        // Optionally re-fetch rooms to get updated sort_index values, though not strictly necessary
        // await fetchRoomsForGame(state.selectedGameId);
    } catch (error) {
        console.error("Failed to save room order:", error);
        uiUtils.showFlashMessage("Kon de nieuwe kamer volgorde niet opslaan. Probeer het opnieuw.", 5000);
        // Consider reverting the visual order or re-fetching to correct it
        await fetchRoomsForGame(state.selectedGameId); // Re-fetch to restore correct order on error
    }
}
