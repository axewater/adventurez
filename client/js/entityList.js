// /client/js/entityList.js
import * as api from './api.js';
import * as state from './state.js';
import * as uiUtils from './uiUtils.js';
import { renderEntityDetails } from './entityDetails.js';

// --- DOM Element Caching ---
const entitySearchInput = document.getElementById('entity-search-input');
const entityListUl = document.getElementById('entity-list-ul');
const addEntityBtn = document.getElementById('add-entity-btn');
const entityFilterButtons = document.querySelectorAll('.entity-filter-buttons .filter-btn');
const entitySortSelect = document.getElementById('entity-sort-select');

let currentEntityTypeFilter = 'all'; // 'all', 'ITEM', 'NPC'
let currentEntitySortOrder = 'name_asc'; // 'name_asc', 'name_desc', 'type_item_first', 'type_npc_first'

// --- Entity List Fetching and Rendering ---

/**
 * Fetches the list of entities for the currently selected game.
 * @param {string} gameId - The UUID of the game.
 */
export async function fetchEntitiesForGame(gameId) {
    if (!gameId) return;
    console.log(`Fetching entities for game ${gameId}`);
    try {
        const response = await fetch(`/api/games/${gameId}/entities`);
        const fetchedEntities = await api.handleApiResponse(response);
        state.setCurrentEntities(fetchedEntities); // Update state
        console.log("Entities fetched:", state.currentEntities);
        renderEntityList(); // Initial render with all entities
        // Reset filters and sort to default when new game data is loaded
        currentEntityTypeFilter = 'all';
        currentEntitySortOrder = 'name_asc';
        updateFilterButtonStates();
        if (entitySortSelect) entitySortSelect.value = currentEntitySortOrder;
    } catch (error) {
        console.error(`Failed to fetch entities for game ${gameId}:`, error);
        if (entityListUl) entityListUl.innerHTML = '<li>Error loading entities.</li>';
        state.setCurrentEntities([]);
    }
    // Clear search input when fetching new entities
    if (entitySearchInput) entitySearchInput.value = '';
}

/**
 * Renders the list of entities based on the current state.
 * Optionally filters the list based on the provided array.
 */
export function renderEntityList() {
    if (!entityListUl) return;

    let entitiesToDisplay = [...state.currentEntities];

    // 1. Filter by search term
    const searchTerm = entitySearchInput?.value.trim().toLowerCase() || '';
    if (searchTerm) {
        entitiesToDisplay = entitiesToDisplay.filter(entity =>
            entity.name.toLowerCase().includes(searchTerm) ||
            (entity.description && entity.description.toLowerCase().includes(searchTerm)) ||
            entity.type.toLowerCase().includes(searchTerm) // Also search by type string
        );
    }

    // 2. Filter by entity type (ITEM or NPC)
    if (currentEntityTypeFilter !== 'all') {
        entitiesToDisplay = entitiesToDisplay.filter(entity => entity.type === currentEntityTypeFilter);
    }

    // 3. Sort entities
    switch (currentEntitySortOrder) {
        case 'name_asc':
            entitiesToDisplay.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'name_desc':
            entitiesToDisplay.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'type_item_first':
            entitiesToDisplay.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'ITEM' ? -1 : 1;
            });
            break;
        case 'type_npc_first':
            entitiesToDisplay.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'NPC' ? -1 : 1;
            });
            break;
    }

    entityListUl.innerHTML = ''; // Clear list
    if (entitiesToDisplay.length === 0) {
        const message = searchTerm || currentEntityTypeFilter !== 'all' ? 'Geen entiteiten gevonden die voldoen aan de criteria.' : 'Nog geen entiteiten aangemaakt.';
        entityListUl.innerHTML = `<li>${message}</li>`;
    } else {
        entitiesToDisplay.forEach(entity => {
            const li = document.createElement('li');
            li.dataset.entityId = entity.id;
            li.addEventListener('click', () => selectEntity(entity.id));

            // Create icon span
            const iconSpan = document.createElement('span');
            iconSpan.classList.add('entity-icon');
            if (entity.type === 'NPC') {
                iconSpan.textContent = '👤'; // User icon for NPC
            } else if (entity.type === 'ITEM') {
                iconSpan.textContent = '📦'; // Box icon for ITEM
            } else {
                iconSpan.textContent = '❓'; // Question mark for unknown types
            }

            // Create text span
            const textSpan = document.createElement('span');
            textSpan.textContent = `${entity.name} (${entity.type})`;

            li.appendChild(iconSpan);
            li.appendChild(textSpan);

            if (state.selectedEntity && entity.id === state.selectedEntity.id) {
                li.classList.add('selected');
            }
            entityListUl.appendChild(li);
        });
    }
}

/**
 * Handles selecting an entity from the list, fetching its details if necessary.
 * @param {string} entityId - The UUID of the entity to select.
 */
export async function selectEntity(entityId) {
    if (state.selectedEntity && state.selectedEntity.id === entityId) return; // Avoid re-selecting

    console.log(`Selecting entity ${entityId}`);
    // Clear previous selection highlight immediately
    const previouslySelected = entityListUl?.querySelector('li.selected');
    if (previouslySelected) {
        previouslySelected.classList.remove('selected');
    }

    try {
        // Fetch full details from API - ensures we have the latest, including room_id
        const response = await fetch(`/api/entities/${entityId}`);
        const entityData = await api.handleApiResponse(response);

        /* // Alternative: Use cached data if sufficient (might lack latest room_id if changed elsewhere)
        const entityData = state.getEntityById(entityId);
        if (!entityData) {
             console.error(`Entity ${entityId} not found in local cache.`);
             throw new Error("Entity not found");
        }
        */

        state.setSelectedEntity(entityData); // Store the selected entity object in state
        console.log("Selected entity details:", state.selectedEntity);

        // Render details in the details panel (function from entityDetails.js)
        renderEntityDetails(state.selectedEntity);

        // Highlight the newly selected item in the list
        const newlySelectedItem = entityListUl?.querySelector(`li[data-entity-id="${entityId}"]`);
        if (newlySelectedItem) {
            newlySelectedItem.classList.add('selected');
        }
    } catch (error) {
        console.error(`Failed to select entity ${entityId}:`, error);
        uiUtils.clearEntityDetailsPanel();
        state.setSelectedEntity(null);
    }
}

// --- Search/Filter Listener ---

function setupEntityListControls() {
    if (entitySearchInput) {
        entitySearchInput.addEventListener('input', () => {
            renderEntityList(); // Re-render the list with the current filter
        });
    }

    entityFilterButtons.forEach(button => {
        button.addEventListener('click', () => {
            currentEntityTypeFilter = button.dataset.filter;
            updateFilterButtonStates();
            renderEntityList();
        });
    });

    if (entitySortSelect) {
        entitySortSelect.addEventListener('change', (event) => {
            currentEntitySortOrder = event.target.value;
            renderEntityList();
        });
    }

    // The addEntityBtn listener is already in entityDetails.js,
    // but we can ensure it's correctly initialized if it wasn't.
    // For now, assume entityDetails.js handles its initialization.
}

/**
 * Updates the active state of filter buttons.
 */
function updateFilterButtonStates() {
    entityFilterButtons.forEach(button => {
        if (button.dataset.filter === currentEntityTypeFilter) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

// Initialize search listener when the module loads or via main.js
setupEntityListControls();

// Ensure initial state of filter buttons is correct
updateFilterButtonStates();
