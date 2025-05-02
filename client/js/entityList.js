// /client/js/entityList.js
import * as api from './api.js';
import * as state from './state.js';
import * as uiUtils from './uiUtils.js';
import { renderEntityDetails } from './entityDetails.js';

// --- DOM Element Caching ---
const entitySearchInput = document.getElementById('entity-search-input');
const entityListUl = document.getElementById('entity-list-ul');

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
 * @param {Array<object>} [entitiesToRender=state.currentEntities] - The array of entities to render. Defaults to all current entities.
 */
export function renderEntityList(entitiesToRender = state.currentEntities) {
    if (!entityListUl) return;

    // Filter based on search input *before* rendering
    const searchTerm = entitySearchInput?.value.trim().toLowerCase() || '';
    const filteredEntities = entitiesToRender.filter(entity =>
        entity.name.toLowerCase().includes(searchTerm) ||
        (entity.description && entity.description.toLowerCase().includes(searchTerm)) ||
        entity.type.toLowerCase().includes(searchTerm)
    );

    entityListUl.innerHTML = ''; // Clear list
    if (filteredEntities.length === 0) {
        entityListUl.innerHTML = '<li>No entities created yet.</li>';
    } else {
        // Sort entities alphabetically by name
        const sortedEntities = [...filteredEntities].sort((a, b) => a.name.localeCompare(b.name));
        sortedEntities.forEach(entity => {
            const li = document.createElement('li');
            li.textContent = `${entity.name} (${entity.type})`; // Show name and type
            li.dataset.entityId = entity.id;
            li.addEventListener('click', () => selectEntity(entity.id));
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

function setupEntitySearchListener() {
    if (entitySearchInput) {
        entitySearchInput.addEventListener('input', () => {
            renderEntityList(); // Re-render the list with the current filter
        });
    }
}

// Initialize search listener when the module loads or via main.js
setupEntitySearchListener();
