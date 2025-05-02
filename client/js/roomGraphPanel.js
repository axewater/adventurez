import * as api from './api.js';
import * as state from './state.js';
import * as uiUtils from './uiUtils.js'; // Import the whole module
import { showCustomContextMenu, hideCustomContextMenu, showFlashMessage, dispatchGameDataChangedEvent, updateSaveStatusIndicator, switchToTab } from './uiUtils.js'; // Import the specific function
import {
    populateEntityLocationDropdown,
    populateEntityConversationDropdown,
    populateEntityImageDropdown,
    updateEntityImageThumbnail, // Correctly imported name
    toggleConversationDropdown
} from './entityDetails.js'; // Functions related to entity details form
import { renderRoomList } from './roomList.js'; // Import the function to render the room list from the correct file
import { selectEntity as selectEntityInMainList, renderEntityList as renderMainEntityList } from './entityList.js'; // Import function to select entity in main list
import { moveEntityToLocation } from './entityDetails.js'; // Import the correctly named function

// --- DOM Element Caching ---
// It's better if these are passed in or queried within functions if they might not exist yet,
// but for simplicity, we'll assume they are available when initializeGraphPanel is called.
let graphDetailsPanel;
let closeGraphPanelBtn;
let graphRoomDetailsForm;
let graphRoomIdInput;
let graphRoomTitleInput;
let graphRoomDescriptionTextarea;
let graphRoomEntitiesListUl;
let addEntityInGraphBtn; // NEW: Button to add entity

// --- NEW: Modal Elements ---
let entityGraphModal;
let entityGraphModalCloseBtn;
let entityGraphForm;
let entityGraphModalTitle; // Reference to the modal title <h3>
let entityGraphRoomIdInput; // Hidden input for room ID (when adding)
let entityGraphEntityIdInput; // Hidden input for entity ID (when editing)
let entityGraphNameInput;
let entityGraphTypeSelect;
let entityGraphDescriptionTextarea;
let entityGraphPickupMessageLabel; // NEW: Pickup message label
let entityGraphPickupMessageTextarea; // NEW: Pickup message textarea
let entityGraphAttributesDiv; // Container for checkboxes
let entityGraphIsTakableCheckbox;
let entityGraphIsContainerCheckbox;
let entityGraphIsMobileCheckbox; // NEW: Mobile checkbox
let entityGraphLocationSelect; // NEW: Location dropdown
let entityGraphConversationSection; // NEW: Conversation section div
let entityGraphConversationSelect; // NEW: Conversation dropdown
let entityGraphImageSelect; // NEW: Image dropdown
let entityGraphImageThumbnail; // NEW: Image thumbnail
let entityGraphSubmit; // Cache submit button

// Keep track of the currently selected node's visual element for deselection
let selectedNodeRect = null;

/**
 * Populates and displays the graph detail panel.
 * Also handles highlighting the selected node visually.
 * @param {object} roomData - The room details.
 * @param {Array<object>} entitiesData - The entities in the room.
 * @param {d3.Selection} nodeRect - The D3 selection of the clicked node's rectangle.
 */
export function showGraphDetailPanel(roomData, entitiesData, nodeRect) {
    // Re-query elements here in case they weren't ready during initialization
    graphDetailsPanel = document.getElementById('graph-details-panel');
    graphRoomDetailsForm = document.getElementById('graph-room-details-form');
    graphRoomIdInput = document.getElementById('graph-room-id-input');
    graphRoomTitleInput = document.getElementById('graph-room-title-input');
    graphRoomDescriptionTextarea = document.getElementById('graph-room-description-textarea');
    graphRoomEntitiesListUl = document.getElementById('graph-room-entities-list');
    addEntityInGraphBtn = document.getElementById('add-entity-in-graph-btn'); // Cache new button

    if (!graphDetailsPanel || !graphRoomDetailsForm || !graphRoomIdInput || !graphRoomTitleInput || !graphRoomDescriptionTextarea || !graphRoomEntitiesListUl) {
        console.error("Graph panel elements not initialized correctly.");
        return;
    }

    // Deselect previous node visually
    if (selectedNodeRect) {
        selectedNodeRect.classed("selected", false).attr("fill", "#666");
    }

    // Select new node visually
    if (nodeRect) {
        nodeRect.classed("selected", true).attr("fill", "#4CAF50");
        selectedNodeRect = nodeRect; // Store reference to the selected rect
    } else {
        selectedNodeRect = null;
    }


    // Populate form
    graphRoomIdInput.value = roomData.id;
    graphRoomTitleInput.value = roomData.title;
    graphRoomDescriptionTextarea.value = roomData.description || '';

    // Populate entity list
    graphRoomEntitiesListUl.innerHTML = ''; // Clear previous
    if (entitiesData.length > 0) {
        entitiesData.forEach(entity => {
            const li = document.createElement('li');
            li.draggable = true;
            li.textContent = `${entity.name} (${entity.type})`;
            li.dataset.entityId = entity.id;
            li.dataset.entityName = entity.name;
            li.dataset.sourceRoomId = roomData.id;

            // NEW: Add context menu listener
            li.addEventListener('contextmenu', (event) => handleEntityContextMenu(event, entity.id, entity.name));

            // NEW: Add double-click listener
            li.addEventListener('dblclick', () => openEditEntityModal(entity.id));

            // Drag start listener for entities
            li.addEventListener('dragstart', (event) => {
                const entityId = entity.id;
                const sourceRoomId = roomData.id;
                console.log(`[DragStart] Entity: ${entityId}, Source Room: ${sourceRoomId}`);
                event.dataTransfer.setData('application/json', JSON.stringify({ entityId, sourceRoomId })); // Use JSON to store both IDs
                event.dataTransfer.effectAllowed = 'move';
                // Optional: Add a class for visual feedback during drag
                // event.target.classList.add('dragging-entity');
            });
            graphRoomEntitiesListUl.appendChild(li);
        });
    } else {
        graphRoomEntitiesListUl.innerHTML = '<li>Geen entiteiten hier.</li>';
    }

    // Enable/disable add entity button based on room selection
    if (addEntityInGraphBtn) {
        addEntityInGraphBtn.disabled = !roomData.id;
    }

    // Show panel with animation
    // Use requestAnimationFrame to ensure the transition triggers after display change (if any)
    requestAnimationFrame(() => {
        graphDetailsPanel.classList.add('visible');
    });
}

/**
 * Closes the graph detail panel and deselects the node visually.
 */
export function closeGraphDetailPanel() {
    if (graphDetailsPanel) {
        // Remove the visible class to trigger the hide animation
        graphDetailsPanel.classList.remove('visible');
    }

    // Clear selection visual in graph
    if (selectedNodeRect) {
        selectedNodeRect.classed("selected", false).attr("fill", "#666");
        selectedNodeRect = null;
    }
    // Clear form? Optional, depends on desired behavior.
    // if (graphRoomDetailsForm) graphRoomDetailsForm.reset();
    // if (graphRoomEntitiesListUl) graphRoomEntitiesListUl.innerHTML = '';
}

/**
 * Handles saving room details from the graph panel.
 * Needs access to the nodes array and updateGraph function from roomGraph.js.
 * @param {Event} event - The form submission event.
 * @param {Array} nodesRef - Reference to the nodes array in roomGraph.js.
 * @param {Function} updateGraphFunc - Reference to the updateGraph function in roomGraph.js.
 */
async function handleSaveGraphRoom(event, nodesRef, updateGraphFunc) {
    event.preventDefault();
    const roomId = graphRoomIdInput?.value;
    console.log(`[handleSaveGraphRoom] Triggered for room ID: ${roomId}`); // Debug log
    if (!roomId) return;

    const updatedData = {
        title: graphRoomTitleInput?.value.trim() || 'Untitled Room',
        description: graphRoomDescriptionTextarea?.value.trim() || ''
        // Position is saved separately on drag end
    };

    console.log(`Saving changes for room ${roomId} from graph panel`);
    try {
        const response = await fetch(`/api/rooms/${roomId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        const updatedRoomData = await api.handleApiResponse(response);
        console.log("Room updated via graph panel:", updatedRoomData);

        // Update the node label in the graph immediately using the references
        const node = nodesRef.find(n => n.id === roomId);
        if (node) {
            node.title = updatedRoomData.title;
            updateGraphFunc(); // Redraw to update label
        }

        // Update the main room list cache in state.js
        const roomIndex = state.currentRooms.findIndex(r => r.id === roomId);
        if (roomIndex !== -1) {
            // Merge updates, preserving potential other fields like pos_x/y
            state.currentRooms[roomIndex] = { ...state.currentRooms[roomIndex], ...updatedRoomData };
            // If the main details panel was showing this room, update its state too
            if (state.selectedRoom && state.selectedRoom.id === roomId) {
                 state.setSelectedRoom(state.currentRooms[roomIndex]);
                 // Optionally re-render the details panel if needed, though state update might suffice
            }
        }

        state.setUnsavedChanges(false); // Assume save is successful
        updateSaveStatusIndicator();
        dispatchGameDataChangedEvent('graphPanelRoomSave'); // Signal change
        alert("Kamer opgeslagen!");

        // NEW: Re-render the main room list to reflect the title change
        renderRoomList();

    } catch (error) {
        console.error(`Failed to save room ${roomId} from graph panel:`, error);
        // Alert is handled by handleApiResponse
    }
}

// --- NEW: Entity Management Functions for Graph Panel ---

/**
 * Opens the modal for adding or editing an entity.
 * @param {object|null} entityData - The entity data to populate the form with (for editing). Null for adding.
 * @param {'add'|'edit'} mode - The mode the modal should open in.
 * @param {string|null} [roomIdOverride=null] - Optional room ID to use, overriding the panel's current room ID (used for context menu add).
 */
export async function openEntityModal(entityData = null, mode = 'add', roomIdOverride = null) {
    const roomId = graphRoomIdInput?.value;
    if ((!roomId && !roomIdOverride) || !state.selectedGameId) {
        console.error("Cannot add entity: Room ID or Game ID is missing.");
        showFlashMessage("Kan entiteit niet toevoegen: Kamer ID of Spel ID ontbreekt.", 4000);
        return;
    }

    // Cache modal elements EVERY time the modal is opened to ensure references are valid
    entityGraphForm = document.getElementById('entity-graph-form');
    entityGraphModalTitle = document.getElementById('entity-graph-modal-title');
    entityGraphRoomIdInput = document.getElementById('entity-graph-room-id');
    entityGraphNameInput = document.getElementById('entity-graph-name');
    entityGraphEntityIdInput = document.getElementById('entity-graph-entity-id'); // Cache new hidden input
    entityGraphTypeSelect = document.getElementById('entity-graph-type');
    entityGraphDescriptionTextarea = document.getElementById('entity-graph-description');
    entityGraphPickupMessageLabel = document.getElementById('entity-graph-pickup-message-label'); // NEW
    entityGraphPickupMessageTextarea = document.getElementById('entity-graph-pickup-message-textarea'); // NEW
    entityGraphAttributesDiv = document.getElementById('entity-graph-attributes');
    entityGraphIsTakableCheckbox = document.getElementById('entity-graph-is-takable');
    entityGraphIsContainerCheckbox = document.getElementById('entity-graph-is-container');
    entityGraphIsMobileCheckbox = document.getElementById('entity-graph-is-mobile'); // NEW
    entityGraphLocationSelect = document.getElementById('entity-graph-location-select');
    entityGraphConversationSection = document.getElementById('entity-graph-conversation-section');
    entityGraphConversationSelect = document.getElementById('entity-graph-conversation-select');
    entityGraphImageSelect = document.getElementById('entity-graph-image-select');
    entityGraphImageThumbnail = document.getElementById('entity-graph-image-thumbnail');
    entityGraphSubmit = document.getElementById('entity-graph-submit'); // Cache submit button

    if (!entityGraphModal) {
        // Only cache the main modal container once, but query the rest each time
        entityGraphModal = document.getElementById('entity-graph-modal');
        entityGraphModalCloseBtn = document.getElementById('entity-graph-modal-close');
    }

    // Reset form and set room ID
    entityGraphForm.reset();
    entityGraphEntityIdInput.value = ''; // Clear entity ID by default
    entityGraphRoomIdInput.value = ''; // Clear room ID by default

    // Reset dropdowns and thumbnail
    entityGraphLocationSelect.innerHTML = '<option value="">-- Niet in een locatie --</option>';
    entityGraphConversationSelect.innerHTML = '<option value="">-- Geen gesprek --</option>';
    entityGraphImageSelect.innerHTML = '<option value="">-- Standaard Plaatje --</option>';
    entityGraphPickupMessageTextarea.value = ''; // NEW: Clear pickup message
    entityGraphIsMobileCheckbox.checked = false; // NEW: Uncheck mobile
    updateEntityImageThumbnail(null, entityGraphImageThumbnail); // Use the specific thumbnail element, show default

    if (mode === 'add') {
        const effectiveRoomId = roomIdOverride || graphRoomIdInput?.value; // Use override if provided
        if (!effectiveRoomId || !state.selectedGameId) {
            console.error("Cannot add entity: Room ID or Game ID is missing.");
            showFlashMessage("Kan entiteit niet toevoegen: Kamer ID of Spel ID ontbreekt.", 4000);
            return;
        }
        entityGraphModalTitle.textContent = "Nieuwe Entiteit Toevoegen";
        entityGraphSubmit.textContent = "Aanmaken";
        entityGraphRoomIdInput.value = effectiveRoomId; // Set room ID for adding
        // Populate dropdowns for adding (no selection needed)
        populateEntityLocationDropdown(effectiveRoomId, null, entityGraphLocationSelect); // Pass the specific select element
        // Set defaults for new fields
        entityGraphPickupMessageTextarea.value = '';
        populateEntityConversationDropdown(null, entityGraphConversationSelect); // Pass specific select
        updateEntityImageThumbnail(null, entityGraphImageThumbnail); // Ensure default is shown for add mode
        await populateEntityImageDropdown(null, entityGraphImageSelect); // Await image loading, pass specific select

    } else if (mode === 'edit' && entityData) {
        entityGraphModalTitle.textContent = "Entiteit Bewerken";
        entityGraphSubmit.textContent = "Opslaan";
        entityGraphEntityIdInput.value = entityData.id; // Set entity ID for editing
        // Populate form
        entityGraphNameInput.value = entityData.name;
        entityGraphDescriptionTextarea.value = entityData.description || '';
        entityGraphPickupMessageTextarea.value = entityData.pickup_message || ''; // NEW: Populate pickup message
        entityGraphTypeSelect.value = entityData.type;
        entityGraphIsTakableCheckbox.checked = entityData.is_takable || false;
        entityGraphIsContainerCheckbox.checked = entityData.is_container || false;
        entityGraphIsMobileCheckbox.checked = entityData.is_mobile || false; // NEW: Populate mobile checkbox
        // Populate and set dropdowns/thumbnail for editing
        populateEntityLocationDropdown(entityData.room_id, entityData.container_id, entityGraphLocationSelect); // Pass the specific select element
        populateEntityConversationDropdown(entityData.conversation_id, entityGraphConversationSelect); // Pass specific select
        await populateEntityImageDropdown(entityData.image_path, entityGraphImageSelect); // Await image loading, pass specific select
        updateEntityImageThumbnail(entityData.image_path, entityGraphImageThumbnail); // Pass the specific thumbnail element
    } else {
        console.error("Invalid mode or missing data for openEntityModal");
        return;
    }

    // Ensure checkboxes and conversation section are correctly enabled/disabled/visible initially
    handleModalEntityTypeChange();

    // Show modal
    entityGraphModal.classList.add('visible');
}

/**
 * Fetches entity data and opens the modal in edit mode.
 * @param {string} entityId - The ID of the entity to edit.
 */
async function openEditEntityModal(entityId) {
    console.log(`Opening edit modal for entity ${entityId}`);
    try {
        const response = await fetch(`/api/entities/${entityId}`);
        const entityData = await api.handleApiResponse(response);
        openEntityModal(entityData, 'edit');
    } catch (error) {
        console.error(`Failed to fetch entity ${entityId} for editing:`, error);
        showFlashMessage(`Kon entiteit details niet laden: ${error.message}`, 4000);
    }
}

/**
 * Closes the add entity modal.
 */
function closeAddEntityModal() {
    if (entityGraphModal) {
        entityGraphModal.classList.remove('visible');
        // Reset title/button/hidden fields for next use
        entityGraphModalTitle.textContent = "Nieuwe Entiteit Toevoegen";
        entityGraphSubmit.textContent = "Aanmaken";
        if (entityGraphEntityIdInput) entityGraphEntityIdInput.value = '';
        if (entityGraphRoomIdInput) entityGraphRoomIdInput.value = '';
    }
}

/**
 * Handles creating the entity when the modal form is submitted.
 * @param {Event} event - The form submission event.
 */
async function handleEntityModalSubmit(event) {
    event.preventDefault(); // Prevent default form submission
    const entityIdToEdit = entityGraphEntityIdInput?.value; // Get entity ID if editing
    const isEditing = !!entityIdToEdit;

    // Find the room ID input field *at the time of submission*
    const roomIdInput = document.getElementById('entity-graph-room-id');
    const roomId = roomIdInput?.value;
    const gameId = state.selectedGameId;
    // Only require roomId if NOT editing (i.e., adding a new entity)
    // Always require gameId
    if ((!isEditing && !roomId) || !gameId || !roomIdInput) { // Also check if roomIdInput was found
        console.error("Cannot add entity: Room ID or Game ID is missing from modal.");
        showFlashMessage("Fout: Kamer ID of Spel ID ontbreekt in modal.", 4000);
        return;
    }

    const entityName = entityGraphNameInput?.value.trim();
    const entityType = entityGraphTypeSelect?.value || 'ITEM';
    const description = entityGraphDescriptionTextarea?.value.trim() || '';
    const pickupMessage = entityGraphPickupMessageTextarea?.value.trim() || null; // NEW: Get pickup message
    const isTakable = entityGraphIsTakableCheckbox?.checked || false;
    const isContainer = entityGraphIsContainerCheckbox?.checked || false;
    const isMobile = entityGraphIsMobileCheckbox?.checked || false; // NEW: Get mobile state
    const locationValue = entityGraphLocationSelect?.value; // Get location value
    const conversationId = entityGraphConversationSelect?.value || null; // Get conversation ID
    const imagePath = entityGraphImageSelect?.value || null; // Get image path

    if (!entityName) {
        showFlashMessage("Entiteit naam mag niet leeg zijn.", 3000);
        entityGraphNameInput?.focus();
        return;
    }

    if (isEditing) {
        // --- EDIT LOGIC ---
        console.log(`Updating entity ${entityIdToEdit} in game ${gameId}`);
        // Parse location selection for editing
        let updatedRoomId = null;
        let updatedContainerId = null;
        if (locationValue) {
            const [type, id] = locationValue.split(':');
            if (type === 'room') {
                updatedRoomId = id;
            } else if (type === 'container') {
                updatedContainerId = id;
            }
        }
        try {
            const response = await fetch(`/api/entities/${entityIdToEdit}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: entityName,
                    type: entityType,
                    description: description,
                    pickup_message: entityType === 'ITEM' ? pickupMessage : null, // NEW: Send pickup message only for ITEM
                    is_takable: entityType === 'ITEM' ? isTakable : false,
                    is_container: entityType === 'ITEM' ? isContainer : false,
                    room_id: updatedRoomId, // Send updated location
                    container_id: updatedContainerId, // Send updated location
                    is_mobile: entityType === 'NPC' ? isMobile : false, // NEW: Send mobile flag only for NPC
                    conversation_id: conversationId, // Send updated conversation
                    image_path: imagePath // Send updated image
                }) // Send updated data
            });
            const updatedEntity = await api.handleApiResponse(response);
            console.log("Entity updated via graph panel:", updatedEntity);

            // 1. Update main state
            const index = state.currentEntities.findIndex(e => e.id === entityIdToEdit);
            if (index !== -1) {
                state.currentEntities[index] = updatedEntity;
            }

            // 2. Update the item in the panel list
            const listItem = graphRoomEntitiesListUl.querySelector(`li[data-entity-id="${entityIdToEdit}"]`);
            if (listItem) {
                listItem.textContent = `${updatedEntity.name} (${updatedEntity.type})`;
                listItem.dataset.entityName = updatedEntity.name;
                // Re-attach listeners if necessary (though usually not needed for text change)
            }

            // 3. Update main entity list UI
            renderMainEntityList();

            // 4. Show feedback
            showFlashMessage(`Entiteit "${updatedEntity.name}" bijgewerkt.`, 3000);
            dispatchGameDataChangedEvent('graphPanelEditEntity');

            // 5. Close the modal
            closeAddEntityModal(); // Use the renamed close function

        } catch (error) {
            console.error(`Failed to update entity ${entityIdToEdit} via graph panel:`, error);
            // Alert handled by handleApiResponse
        }
    } else {
        // --- ADD LOGIC (Existing) ---
        console.log(`Adding new ${entityType} entity "${entityName}" to room ${roomId} in game ${gameId}`);
        const entityData = {
            name: entityName,
            type: entityType,
            description: description,
            pickup_message: entityType === 'ITEM' ? pickupMessage : null, // NEW: Set pickup message only for ITEMs
            room_id: roomId, // Place it directly in the selected room
            is_takable: entityType === 'ITEM' ? isTakable : false, // Only items can be takable
            is_container: entityType === 'ITEM' ? isContainer : false, // Only items can be containers
            is_mobile: entityType === 'NPC' ? isMobile : false, // NEW: Set mobile flag only for NPCs
            conversation_id: conversationId, // Set conversation if selected
            image_path: imagePath // Set image if selected
        };
        try {
            const response = await fetch(`/api/games/${state.selectedGameId}/entities`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entityData)
            });
            const newEntity = await api.handleApiResponse(response); // Assuming API returns the created entity
            console.log("Entity created via graph panel:", newEntity);

            // 1. Update main state
            state.setCurrentEntities([...state.currentEntities, newEntity]);

            // 2. Add to the panel list
            const li = document.createElement('li');
            li.draggable = true;
            li.textContent = `${newEntity.name} (${newEntity.type})`;
            li.dataset.entityId = newEntity.id;
            li.dataset.entityName = newEntity.name;
            li.dataset.sourceRoomId = roomId;
            li.addEventListener('contextmenu', (event) => handleEntityContextMenu(event, newEntity.id, newEntity.name));
            li.addEventListener('dblclick', () => openEditEntityModal(newEntity.id)); // Add dblclick listener

            // Remove "Geen entiteiten" placeholder if present
            const placeholder = graphRoomEntitiesListUl.querySelector('li');
            if (placeholder && placeholder.textContent === 'Geen entiteiten hier.') {
                placeholder.remove();
            }
            graphRoomEntitiesListUl.appendChild(li);

            // 3. Update main entity list UI
            renderMainEntityList();

            // 4. Show feedback
            showFlashMessage(`Entiteit "${newEntity.name}" toegevoegd aan kamer.`, 3000);
            dispatchGameDataChangedEvent('graphPanelAddEntity');

            // 5. Close the modal
            closeAddEntityModal(); // Use the renamed close function

        } catch (error) {
            console.error("Failed to add entity via graph panel:", error);
            // Alert handled by handleApiResponse
        }
    }
}

/**
 * Handles the context menu event on an entity list item in the graph panel.
 * @param {MouseEvent} event - The contextmenu event.
 * @param {string} entityId - The ID of the entity.
 * @param {string} entityName - The name of the entity.
 */
function handleEntityContextMenu(event, entityId, entityName) {
    event.preventDefault();
    event.stopPropagation();

    const menuItems = [
        {
            label: `Bewerk "${entityName}"`, // Changed label
            icon: "📝",
            action: () => openEditEntityModal(entityId) // Changed action
        },
        {
            label: `Verwijder "${entityName}"`,
            icon: "🗑️",
            action: () => handleDeleteEntityFromGraphPanel(entityId, entityName)
        }
        // Removed old "Details" option
    ];

    showCustomContextMenu(event, menuItems);
}

/**
 * Handles enabling/disabling fields in the modal based on selected type.
 */
function handleModalEntityTypeChange() {
    const selectedType = entityGraphTypeSelect?.value;
    const isItem = selectedType === 'ITEM';
    const isNpc = selectedType === 'NPC';

    // Handle Item-specific fields
    if (entityGraphIsTakableCheckbox) {
        entityGraphIsTakableCheckbox.disabled = !isItem;
        if (!isItem) entityGraphIsTakableCheckbox.checked = false;
    }
    if (entityGraphIsContainerCheckbox) {
        entityGraphIsContainerCheckbox.disabled = !isItem;
        if (!isItem) entityGraphIsContainerCheckbox.checked = false;
    }
    // Show/hide pickup message field
    if (entityGraphPickupMessageLabel) entityGraphPickupMessageLabel.style.display = isItem ? 'block' : 'none';
    if (entityGraphPickupMessageTextarea) entityGraphPickupMessageTextarea.style.display = isItem ? 'block' : 'none';
    if (!isItem && entityGraphPickupMessageTextarea) entityGraphPickupMessageTextarea.value = ''; // Clear if not item

    // Handle NPC-specific fields
    if (entityGraphIsMobileCheckbox) {
        entityGraphIsMobileCheckbox.disabled = !isNpc;
        if (!isNpc) entityGraphIsMobileCheckbox.checked = false;
    }
    // Show/hide conversation dropdown
    toggleConversationDropdown(isNpc, entityGraphConversationSection); // Pass the specific section element
    if (!isNpc && entityGraphConversationSelect) entityGraphConversationSelect.value = ''; // Clear if not NPC
}

/**
 * Initializes the graph panel by caching elements and setting up listeners.
 * Needs references to nodes array and updateGraph function from roomGraph.js.
 * @param {Array} nodesRef - Reference to the nodes array in roomGraph.js.
 * @param {Function} updateGraphFunc - Reference to the updateGraph function in roomGraph.js.
 */
export function initializeGraphPanel(nodesRef, updateGraphFunc) {
    // Define the handler function that will be added/removed
    // It needs access to nodesRef and updateGraphFunc from the outer scope
    const saveHandler = (event) => handleSaveGraphRoom(event, nodesRef, updateGraphFunc);

    // Cache DOM elements
    graphDetailsPanel = document.getElementById('graph-details-panel');
    closeGraphPanelBtn = document.getElementById('close-graph-panel-btn');
    graphRoomDetailsForm = document.getElementById('graph-room-details-form');
    graphRoomIdInput = document.getElementById('graph-room-id-input');
    graphRoomTitleInput = document.getElementById('graph-room-title-input');
    graphRoomDescriptionTextarea = document.getElementById('graph-room-description-textarea');
    graphRoomEntitiesListUl = document.getElementById('graph-room-entities-list');
    addEntityInGraphBtn = document.getElementById('add-entity-in-graph-btn'); // Cache new button
    // Cache modal elements
    entityGraphModal = document.getElementById('entity-graph-modal');
    entityGraphModalCloseBtn = document.getElementById('entity-graph-modal-close');
    entityGraphForm = document.getElementById('entity-graph-form');
    entityGraphModalTitle = document.getElementById('entity-graph-modal-title');
    entityGraphRoomIdInput = document.getElementById('entity-graph-room-id'); // Hidden room ID
    entityGraphEntityIdInput = document.getElementById('entity-graph-entity-id');
    entityGraphNameInput = document.getElementById('entity-graph-name');
    entityGraphTypeSelect = document.getElementById('entity-graph-type');
    entityGraphDescriptionTextarea = document.getElementById('entity-graph-description');
    entityGraphPickupMessageLabel = document.getElementById('entity-graph-pickup-message-label'); // NEW
    entityGraphPickupMessageTextarea = document.getElementById('entity-graph-pickup-message-textarea'); // NEW
    entityGraphAttributesDiv = document.getElementById('entity-graph-attributes');
    entityGraphIsTakableCheckbox = document.getElementById('entity-graph-is-takable');
    entityGraphIsContainerCheckbox = document.getElementById('entity-graph-is-container');
    entityGraphIsMobileCheckbox = document.getElementById('entity-graph-is-mobile'); // NEW
    entityGraphLocationSelect = document.getElementById('entity-graph-location-select');
    entityGraphConversationSection = document.getElementById('entity-graph-conversation-section');
    entityGraphConversationSelect = document.getElementById('entity-graph-conversation-select');
    entityGraphImageSelect = document.getElementById('entity-graph-image-select');
    entityGraphImageThumbnail = document.getElementById('entity-graph-image-thumbnail');
    entityGraphSubmit = document.getElementById('entity-graph-submit'); // Cache submit button

    // Add Event Listeners
    if (closeGraphPanelBtn) {
        closeGraphPanelBtn.addEventListener('click', closeGraphDetailPanel);
    } else {
        console.warn("Close graph panel button not found during initialization.");
    }

    if (graphRoomDetailsForm) {
        // Pass references when setting up the submit listener
        // --- IMPORTANT: Remove previous listener before adding a new one ---
        // We need a named function or a stored reference to remove it correctly.
        graphRoomDetailsForm.removeEventListener('submit', saveHandler); // Remove potentially existing listener
        graphRoomDetailsForm.addEventListener('submit', saveHandler); // Add the listener
    } else {
        console.warn("Graph room details form not found during initialization.");
    }

    // NEW: Add listener for the "Add Entity" button to open the modal in 'add' mode
    if (addEntityInGraphBtn) {
        addEntityInGraphBtn.addEventListener('click', () => openEntityModal(null, 'add')); // Open in add mode
    } else {
        console.warn("Add Entity button in graph panel not found during initialization.");
    }

    // NEW: Add listeners for the modal
    if (entityGraphModalCloseBtn) {
        entityGraphModalCloseBtn.addEventListener('click', closeAddEntityModal); // Use renamed close function
    }
    if (entityGraphForm) {
        entityGraphForm.addEventListener('submit', handleEntityModalSubmit); // Use renamed submit handler
    }
    // Listener to enable/disable fields based on type selection in modal
    if (entityGraphTypeSelect) {
        entityGraphTypeSelect.addEventListener('change', handleModalEntityTypeChange);
    }

    // NEW: Listener for image select change in modal
    if (entityGraphImageSelect) {
        entityGraphImageSelect.addEventListener('change', () => {
            const selectedImage = entityGraphImageSelect.value || null;
            updateEntityImageThumbnail(selectedImage, entityGraphImageThumbnail); // Update the modal's thumbnail
            state.setUnsavedChanges(true); // Mark unsaved changes
            updateSaveStatusIndicator();
        });
    }
    // NEW: Listener for thumbnail click in modal
    if (entityGraphImageThumbnail) {
        entityGraphImageThumbnail.addEventListener('click', () => {
            uiUtils.showImagePopup(entityGraphImageThumbnail.src); // Show popup for modal thumbnail
        }); // Pass the modal's thumbnail src
    }

    // Add listeners for input changes to set unsaved flag
    const panelInputs = [graphRoomTitleInput, graphRoomDescriptionTextarea];
    panelInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                state.setUnsavedChanges(true);
                updateSaveStatusIndicator();
            });
        }
    });

    // Add listeners for modal input changes to set unsaved flag (optional, as modal usually saves immediately)
    const modalInputs = [
        entityGraphNameInput, entityGraphDescriptionTextarea, entityGraphPickupMessageTextarea,
        entityGraphTypeSelect, entityGraphLocationSelect, entityGraphConversationSelect, entityGraphImageSelect,
        entityGraphIsTakableCheckbox, entityGraphIsContainerCheckbox, entityGraphIsMobileCheckbox];
    modalInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                state.setUnsavedChanges(true);
                updateSaveStatusIndicator();
            });
        }
    });
}

/**
 * Handles deleting an entity via the context menu in the graph panel.
 * @param {string} entityId - The ID of the entity to delete.
 * @param {string} entityName - The name of the entity for the confirmation message.
 */
async function handleDeleteEntityFromGraphPanel(entityId, entityName) {
    if (!confirm(`Weet je zeker dat je de entiteit "${entityName}" wilt verwijderen?`)) {
        return;
    }

    console.log(`Deleting entity ${entityId} from graph panel context menu`);
    try {
        const response = await fetch(`/api/entities/${entityId}`, {
            method: 'DELETE'
        });
        await api.handleApiResponse(response); // Checks for errors, expects 204

        // 1. Remove from main state cache
        state.setCurrentEntities(state.currentEntities.filter(e => e.id !== entityId));

        // 2. Remove from the panel list
        const listItem = graphRoomEntitiesListUl.querySelector(`li[data-entity-id="${entityId}"]`);
        listItem?.remove();
        // Add placeholder if list becomes empty
        if (graphRoomEntitiesListUl.children.length === 0) {
            graphRoomEntitiesListUl.innerHTML = '<li>Geen entiteiten hier.</li>';
        }

        // 3. Update main entity list UI
        renderMainEntityList();

        // 4. Show feedback
        showFlashMessage(`Entiteit "${entityName}" verwijderd.`, 3000);
        dispatchGameDataChangedEvent('graphPanelDeleteEntity');

    } catch (error) {
        console.error(`Failed to delete entity ${entityId} from graph panel:`, error);
        // Alert handled by handleApiResponse
    }
}
