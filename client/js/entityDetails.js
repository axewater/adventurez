// /client/js/entityDetails.js
import * as api from './api.js';
import * as state from './state.js';
import * as uiUtils from './uiUtils.js';
import { renderEntityList } from './entityList.js';
import { dispatchGameDataChangedEvent } from './uiUtils.js';
import { updateSaveStatusIndicator } from './uiUtils.js';
import { showGraphDetailPanel, closeGraphDetailPanel } from './roomGraphPanel.js';

// --- DOM Element Caching ---
const addEntityBtn = document.getElementById('add-entity-btn');
const entityDetailsPanel = document.getElementById('entity-details-panel');
const entityDetailsPlaceholder = document.getElementById('entity-details-placeholder');
const entityDetailsForm = document.getElementById('entity-details-form');
const entityNameInput = document.getElementById('entity-name-input');
const entityDescriptionTextarea = document.getElementById('entity-description-textarea');
const entityPickupMessageTextarea = document.getElementById('entity-pickup-message-textarea');
const entityPickupMessageLabel = document.getElementById('entity-pickup-message-label');
const entityTypeSelect = document.getElementById('entity-type-select');
const entityLocationSelect = document.getElementById('entity-location-select');
const saveEntityBtn = document.getElementById('save-entity-btn');
const deleteEntityBtn = document.getElementById('delete-entity-btn');
const entityIsTakableCheckbox = document.getElementById('entity-is-takable-checkbox');
const entityIsContainerCheckbox = document.getElementById('entity-is-container-checkbox');
const entityConversationSection = document.getElementById('entity-conversation-section');
const entityConversationSelect = document.getElementById('entity-conversation-select');
const entityImageSelect = document.getElementById('entity-image-select');
const entityImageThumbnail = document.getElementById('entity-image-thumbnail');
const entityIsMobileCheckbox = document.getElementById('entity-is-mobile-checkbox');

// --- Entity Details Rendering ---

/**
 * Renders the details of the selected entity in the form.
 * @param {object} entityData - The full entity object.
 */
export function renderEntityDetails(entityData) {
    if (!entityData) {
        uiUtils.clearEntityDetailsPanel();
        return;
    }
    if (entityDetailsPlaceholder) entityDetailsPlaceholder.style.display = 'none';
    if (entityDetailsForm) entityDetailsForm.style.display = 'block';

    // Populate form fields
    if (entityNameInput) entityNameInput.value = entityData.name;
    if (entityDescriptionTextarea) entityDescriptionTextarea.value = entityData.description || '';
    if (entityPickupMessageTextarea) entityPickupMessageTextarea.value = entityData.pickup_message || '';
    if (entityTypeSelect) entityTypeSelect.value = entityData.type;

    // Populate and set the location dropdown
    populateEntityLocationDropdown(entityData.room_id, entityData.container_id);

    // Populate attribute checkboxes
    if (entityIsTakableCheckbox) {
        entityIsTakableCheckbox.checked = entityData.is_takable || false;
        // Disable if not an ITEM
        entityIsTakableCheckbox.disabled = entityData.type !== 'ITEM';
    }
    if (entityIsContainerCheckbox) {
        entityIsContainerCheckbox.checked = entityData.is_container || false;
        entityIsContainerCheckbox.disabled = entityData.type !== 'ITEM';
    }
    // Show/hide pickup message field based on type
    togglePickupMessageField(entityData.type === 'ITEM');

    // Populate and set the conversation dropdown (only visible for NPCs)
    populateEntityConversationDropdown(entityData.conversation_id);
    toggleConversationDropdown(entityData.type === 'NPC');

    // Populate and set image dropdown
    populateEntityImageDropdown(entityData.image_path);
    updateEntityImageThumbnail(entityData.image_path);
}

/**
 * Populates the dropdown list of locations (rooms and containers) for the entity editor.
 * Sets the selected option based on the entity's current location (room or container).
 * @param {string | null} selectedRoomId - The UUID of the room the entity is in, or null.
 * @param {string | null} selectedContainerId - The UUID of the container the entity is in, or null.
 * @param {HTMLSelectElement} targetSelectElement - The specific select element to populate. Defaults to the main panel's select.
 */
export function populateEntityLocationDropdown(selectedRoomId, selectedContainerId, targetSelectElement = entityLocationSelect) {
    if (!targetSelectElement) return;
    targetSelectElement.innerHTML = '<option value="">-- Niet in een locatie --</option>'; // Reset with default

    if (!state.currentRooms || state.currentRooms.length === 0) {
        // Still might have containers, don't disable yet
    }

    targetSelectElement.disabled = false;
    let currentSelectionValue = "";
    if (selectedRoomId) {
        currentSelectionValue = `room:${selectedRoomId}`;
    } else if (selectedContainerId) {
        currentSelectionValue = `container:${selectedContainerId}`;
    }

    // Add Rooms
    // Sort rooms by title for the dropdown
    const sortedRooms = [...state.currentRooms].sort((a, b) => a.title.localeCompare(b.title));
    sortedRooms.forEach(room => {
        const option = document.createElement('option');
        option.value = `room:${room.id}`; // Prefix value with 'room:'
        option.textContent = room.title;
        if (currentSelectionValue === option.value) {
            option.selected = true;
        }
        targetSelectElement.appendChild(option);
    });

    // Add Container Entities
    const currentEntityId = state.selectedEntity?.id; // Get ID of the entity being edited
    const containerEntities = state.currentEntities.filter(entity =>
        entity.is_container && entity.id !== currentEntityId // Exclude the entity itself
    );
    // Sort containers by name
    containerEntities.sort((a, b) => a.name.localeCompare(b.name));

    containerEntities.forEach(container => {
        const option = document.createElement('option');
        option.value = `container:${container.id}`; // Prefix value with 'container:'
        option.textContent = `(ITEM) ${container.name}`; // Prefix text with '(ITEM) '
        if (currentSelectionValue === option.value) {
            option.selected = true;
        }
        targetSelectElement.appendChild(option);
    });
}

// --- NEW: Conversation Dropdown Logic ---

/**
 * Populates the conversation dropdown in the entity editor.
 * Sets the selected option based on the entity's current conversation_id.
 * @param {string | null} selectedConversationId - The UUID of the conversation linked to the entity, or null.
 * @param {HTMLSelectElement} targetSelectElement - The specific select element to populate. Defaults to the main panel's select.
 */
export function populateEntityConversationDropdown(selectedConversationId, targetSelectElement = entityConversationSelect) {
    if (!targetSelectElement) return;
    targetSelectElement.innerHTML = '<option value="">-- Geen gesprek --</option>'; // Reset with default

    if (!state.currentConversations || state.currentConversations.length === 0) {
        targetSelectElement.disabled = true;
        return;
    }

    targetSelectElement.disabled = false;
    // Sort conversations by name for the dropdown
    const sortedConversations = [...state.currentConversations].sort((a, b) => a.name.localeCompare(b.name));

    sortedConversations.forEach(conv => {
        const option = document.createElement('option');
        option.value = conv.id;
        option.textContent = conv.name;
        if (selectedConversationId && conv.id === selectedConversationId) {
            option.selected = true;
        }
        targetSelectElement.appendChild(option);
    });
}

/**
 * Shows or hides the conversation dropdown section.
 * @param {boolean} show - True to show, false to hide.
 * @param {HTMLElement} targetSectionElement - The specific section element to show/hide. Defaults to the main panel's section.
 */
export function toggleConversationDropdown(show, targetSectionElement = entityConversationSection) {
    if (targetSectionElement) {
        targetSectionElement.style.display = show ? 'block' : 'none';
    }
}

// --- NEW: Pickup Message Field Logic ---

/**
 * Shows or hides the pickup message textarea and label.
 * @param {boolean} show - True to show, false to hide.
 */
function togglePickupMessageField(show) {
    if (entityPickupMessageLabel) entityPickupMessageLabel.style.display = show ? 'block' : 'none';
    if (entityPickupMessageTextarea) entityPickupMessageTextarea.style.display = show ? 'block' : 'none';
}

// --- NEW: Image Dropdown Logic ---

/**
 * Fetches available entity images and populates the dropdown.
 * Sets the selected option based on the entity's current image_path.
 * @param {string | null} selectedImagePath - The filename of the image currently associated with the entity, or null.
 * @param {HTMLSelectElement} targetSelectElement - The specific select element to populate. Defaults to the main panel's select.
 */
export async function populateEntityImageDropdown(selectedImagePath, targetSelectElement = entityImageSelect) {
    if (!targetSelectElement) return;
    targetSelectElement.innerHTML = '<option value="">-- Standaard Plaatje --</option>'; // Reset with default
    targetSelectElement.disabled = true; // Disable while loading

    try {
        const response = await fetch('/api/images/list?type=entity');
        const imageFiles = await api.handleApiResponse(response);

        imageFiles.forEach(filename => {
            const option = document.createElement('option');
            option.value = filename;
            option.textContent = filename; // Keep filename as text
            targetSelectElement.appendChild(option);
        });
        // Set the selected value AFTER populating all options
        targetSelectElement.value = selectedImagePath || ""; // Select the image or the default ("")
        targetSelectElement.disabled = false; // Enable after loading
    } catch (error) {
        console.error("Failed to load entity images:", error);
        uiUtils.showFlashMessage("Fout bij het laden van entiteit afbeeldingen.", 5000); // Use flash message instead of alert
    }
}

/**
 * Updates the visibility and source of the entity image thumbnail.
 * @param {string | null} imagePath - The filename of the image, or null.
 * @param {HTMLImageElement} targetThumbnailElement - The specific img element to update. Defaults to the main panel's thumbnail.
 */
export function updateEntityImageThumbnail(imagePath, targetThumbnailElement = entityImageThumbnail) {
    const defaultImagePath = '/uploads/images/entiteiten/standaard_entiteit.png'; // Define default path
    if (!targetThumbnailElement) return;

    if (imagePath) {
        const imageUrl = `/uploads/images/entiteiten/${imagePath}`; // Construct full URL
        targetThumbnailElement.src = imageUrl;
        targetThumbnailElement.style.display = 'inline-block';
    } else {
        targetThumbnailElement.src = defaultImagePath; // Show default image
        targetThumbnailElement.style.display = 'inline-block'; // Ensure thumbnail is visible
    }
}

// --- Event Listeners ---

async function handleAddEntity() {
    if (!state.selectedGameId) return;

    const defaultName = `New Entity ${state.currentEntities.length + 1}`;
    const defaultType = 'ITEM'; // Default to ITEM
    console.log(`Adding new ${defaultType} entity to game ${state.selectedGameId}`);

    try {
        const response = await fetch(`/api/games/${state.selectedGameId}/entities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: defaultName,
                type: defaultType,
                // Initially not placed in any room or container
                room_id: null,
                container_id: null,
                is_takable: false, // Default attributes
                is_container: false,
                conversation_id: null, // Default to no conversation
                image_path: null, // Default to no image
                is_mobile: false, // Default to not mobile
                pickup_message: null // Default to no pickup message
            })
        });
        const newEntity = await api.handleApiResponse(response);
        console.log("Entity created:", newEntity);

        // Update state and UI
        state.setCurrentEntities([...state.currentEntities, newEntity]);
        renderEntityList(); // Update list display

        // Manually call selectEntity from entityList.js
        const entityListModule = await import('./entityList.js');
        entityListModule.selectEntity(newEntity.id); // Select the newly created entity
        state.setUnsavedChanges(false); // New entity is saved immediately
        updateSaveStatusIndicator(); // Update UI
        dispatchGameDataChangedEvent('entityDetailsAdd'); // Signal change
    } catch (error) {
        console.error("Failed to add entity:", error);
        uiUtils.showFlashMessage("Fout bij het toevoegen van entiteit.", 5000); // Use flash message instead of alert
    }
}

async function handleSaveEntity(event) {
    event.preventDefault(); // Prevent default form submission
    if (!state.selectedEntity) return;

    const updatedData = {
        name: entityNameInput?.value.trim() || 'Unnamed Entity', // Use optional chaining
        description: entityDescriptionTextarea?.value.trim() || '',
        pickup_message: entityPickupMessageTextarea?.value.trim() || null, // Send pickup message (null if empty)
        type: entityTypeSelect?.value || 'ITEM',
        // Determine room_id and container_id based on selection
        room_id: null,
        container_id: null,
        is_takable: entityIsTakableCheckbox?.checked || false,
        is_container: entityIsContainerCheckbox?.checked || false,
        conversation_id: entityConversationSelect?.value || null, // Send conversation ID (null if none selected)
        image_path: entityImageSelect?.value || null, // Send selected image filename (or null for default)
        is_mobile: entityIsMobileCheckbox?.checked || false
    };

    // Parse the location selection
    const locationValue = entityLocationSelect?.value;
    if (locationValue) {
        const [type, id] = locationValue.split(':');
        if (type === 'room') {
            updatedData.room_id = id;
        } else if (type === 'container') {
            updatedData.container_id = id;
        }
    }

    console.log(`Saving changes for entity ${state.selectedEntity.id}`);
    try {
        const response = await fetch(`/api/entities/${state.selectedEntity.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        const updatedEntityData = await api.handleApiResponse(response);
        console.log("Entity updated:", updatedEntityData);

        // Update local cache (state)
        const index = state.currentEntities.findIndex(e => e.id === state.selectedEntity.id);
        const updatedEntities = [...state.currentEntities];
        if (index !== -1) {
            updatedEntities[index] = updatedEntityData;
        }
        state.setCurrentEntities(updatedEntities);
        state.setSelectedEntity(updatedEntityData); // Update the selected entity object

        // Re-render the list to reflect potential name/type changes
        renderEntityList();
        // Re-render details (might be redundant, but safe)
        renderEntityDetails(state.selectedEntity);

        uiUtils.showFlashMessage("Entiteit opgeslagen!"); // Use flash message instead of alert
        state.setUnsavedChanges(false); // Reset unsaved changes flag
        updateSaveStatusIndicator(); // Update UI
        dispatchGameDataChangedEvent('entityDetailsSave'); // Signal change
    } catch (error) {
        console.error(`Failed to save entity ${state.selectedEntity.id}:`, error);
        uiUtils.showFlashMessage("Fout bij het opslaan van entiteit.", 5000); // Use flash message instead of alert
    }
}

async function handleDeleteEntity() {
    if (!state.selectedEntity) return;

    if (confirm(`Weet je zeker dat je de entiteit "${state.selectedEntity.name}" wilt verwijderen?`)) {
        console.log(`Deleting entity ${state.selectedEntity.id}`);
        const entityIdToDelete = state.selectedEntity.id; // Store ID before clearing selection
        try {
            const response = await fetch(`/api/entities/${entityIdToDelete}`, {
                method: 'DELETE'
            });
            await api.handleApiResponse(response); // Checks for errors, expects 204

            console.log("Entity deleted:", entityIdToDelete);

            // Remove from local cache (state)
            state.setCurrentEntities(state.currentEntities.filter(e => e.id !== entityIdToDelete));

            // Clear details panel and update list
            uiUtils.clearEntityDetailsPanel(); // This also clears selectedEntity state
            renderEntityList();

            uiUtils.showFlashMessage("Entiteit verwijderd."); // Use flash message instead of alert
            state.setUnsavedChanges(false); // Changes are gone (deleted)
            updateSaveStatusIndicator(); // Update UI
            dispatchGameDataChangedEvent('entityDetailsDelete'); // Signal change
        } catch (error) {
            console.error(`Failed to delete entity ${entityIdToDelete}:`, error);
            uiUtils.showFlashMessage("Fout bij het verwijderen van entiteit.", 5000); // Use flash message instead of alert
        }
    }
}

/**
 * Handles disabling/enabling attribute checkboxes based on selected entity type.
 */
function handleEntityTypeChange() {
    const selectedType = entityTypeSelect?.value;
    const isItem = selectedType === 'ITEM';
    const isNpc = selectedType === 'NPC';

    if (entityIsTakableCheckbox) entityIsTakableCheckbox.disabled = !isItem;
    togglePickupMessageField(isItem); // Show/hide pickup message field
    if (entityIsContainerCheckbox) entityIsContainerCheckbox.disabled = !isItem;
    if (entityIsMobileCheckbox) entityIsMobileCheckbox.disabled = !isNpc; // Enable only for NPC
    // If type changed away from ITEM, uncheck the boxes and clear pickup message
    if (!isItem) {
        if (entityIsTakableCheckbox) entityIsTakableCheckbox.checked = false;
        if (entityPickupMessageTextarea) entityPickupMessageTextarea.value = '';
        if (entityIsContainerCheckbox) entityIsContainerCheckbox.checked = false;
    }
    // If type changed away from NPC, uncheck mobile and clear conversation
    if (!isNpc) {
        if (entityIsMobileCheckbox) entityIsMobileCheckbox.checked = false;
        if (entityConversationSelect) entityConversationSelect.value = '';
    }
    toggleConversationDropdown(isNpc); // Show conversation dropdown only for NPC
}

/**
 * Handles changes in the entity image dropdown.
 */ // This handler is for the MAIN panel's dropdown
function handleEntityImageChange() {
    const selectedImage = entityImageSelect?.value || null;
    updateEntityImageThumbnail(selectedImage); // Update the thumbnail display
    state.setUnsavedChanges(true);
    updateSaveStatusIndicator();
}

/**
 * Handles clicking the entity image thumbnail to show the popup.
 */ // This handler is for the MAIN panel's thumbnail
function handleThumbnailClick() {
    const imageUrl = entityImageThumbnail?.src;
    if (imageUrl && imageUrl !== '#') { // Ensure src is valid
        uiUtils.showImagePopup(imageUrl); // Use the utility function
    }
}

// --- NEW: Function to Move Entity via Drag and Drop ---

/**
 * Handles moving an entity to a different room or container via drag-and-drop.
 * Makes the API call and updates the UI.
 * @param {string} entityId - The ID of the entity being moved.
 * @param {string} targetLocationId - The ID of the room or container to move the entity to.
 * @param {string} targetLocationType - The type of the target location ('room' or 'container').
 * @param {string} sourceLocationId - The ID of the room or container the entity is currently in.
 * @param {string} sourceLocationType - The type of the source location ('room' or 'container').
 */
export async function moveEntityToLocation(entityId, targetLocationId, targetLocationType, sourceLocationId, sourceLocationType) {
    console.log(`[moveEntityToLocation] Attempting to move entity ${entityId} from ${sourceLocationType} ${sourceLocationId} to ${targetLocationType} ${targetLocationId}`);

    try {
        console.log(`[moveEntityToLocation] Sending PUT request to /api/entities/${entityId}`);
        const response = await fetch(`/api/entities/${entityId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room_id: targetLocationType === 'room' ? targetLocationId : null,
                container_id: targetLocationType === 'container' ? targetLocationId : null
            }) // Update only the room_id or container_id
        });
        const updatedEntity = await api.handleApiResponse(response);
        console.log("Entity moved successfully via API:", updatedEntity);
        console.log("[moveEntityToLocation] API call successful. Proceeding with UI updates.");

        // 1. Update the entity in the main state cache
        const entityIndex = state.currentEntities.findIndex(e => e.id === entityId);
        if (entityIndex !== -1) {
            state.currentEntities[entityIndex] = updatedEntity;
        } else {
            // If somehow not found, add it (less likely)
            state.setCurrentEntities([...state.currentEntities, updatedEntity]);
        }

        // 2. Remove the entity from the graph panel list if it's open for the source room
        const graphPanelList = document.getElementById('graph-room-entities-list');
        const graphPanelRoomIdInput = document.getElementById('graph-room-id-input');
        if (graphPanelList && graphPanelRoomIdInput?.value === sourceLocationId) {
            const listItem = graphPanelList.querySelector(`li[data-entity-id="${entityId}"]`);
            listItem?.remove();
            // Add placeholder if list becomes empty
            if (graphPanelList.children.length === 0) {
                graphPanelList.innerHTML = '<li>Geen entiteiten hier.</li>';
            }
        }

        // 3. Dispatch event to notify other parts of the UI (like main entity list)
        dispatchGameDataChangedEvent('entityDragDropMove');

        // 4. Show flash message
        const targetLocation = targetLocationType === 'room'
            ? state.getRoomById(targetLocationId)
            : state.getEntityById(targetLocationId);
        const message = `'${updatedEntity.name}' verplaatst naar '${targetLocation?.title || 'Unknown Location'}'`;
        console.log(`[moveEntityToLocation] Preparing to show flash message: "${message}"`);
        // Use flash message instead of alert
        uiUtils.showFlashMessage(message);
        console.log("[moveEntityToLocation] Flash message function called.");

    } catch (error) {
        console.error(`Failed to move entity ${entityId}:`, error);
        uiUtils.showFlashMessage("Fout bij het verplaatsen van entiteit.", 5000); // Use flash message instead of alert
        // Consider reverting UI changes if necessary, though optimistic update is often fine here.
    }
}

// --- Initialization ---
export function initializeEntityDetails() {
    if (addEntityBtn) addEntityBtn.addEventListener('click', handleAddEntity);
    if (entityDetailsForm) entityDetailsForm.addEventListener('submit', handleSaveEntity);
    if (deleteEntityBtn) deleteEntityBtn.addEventListener('click', handleDeleteEntity);

    // Add listeners to form inputs/selects to detect changes
    const inputs = [
        entityNameInput,
        entityDescriptionTextarea,
        entityPickupMessageTextarea, // NEW: Include pickup message textarea
        entityTypeSelect,
        entityLocationSelect, // Use renamed ID
        entityIsTakableCheckbox,
        entityIsContainerCheckbox,
        entityConversationSelect, // Include conversation dropdown
        entityImageSelect, // Include image dropdown
        entityIsMobileCheckbox // Include mobile checkbox
    ];
    // Also disable attribute checkboxes when type changes away from ITEM
    // And handle conversation dropdown visibility
    if (entityTypeSelect) entityTypeSelect.addEventListener('change', handleEntityTypeChange); // Handles both attributes and conversation dropdown

    inputs.forEach(input => {
        if (input) {
            input.addEventListener('input', () => { // 'input' for text/textarea, 'change' for select
                state.setUnsavedChanges(true);
                updateSaveStatusIndicator();
            });
        }
    });
    // Add listener for image select changes
    if (entityImageSelect) entityImageSelect.addEventListener('change', handleEntityImageChange);
    // Add listener for thumbnail click
    if (entityImageThumbnail) entityImageThumbnail.addEventListener('click', handleThumbnailClick);
}
