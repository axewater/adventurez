// /client/js/gameManager.js
import * as api from './api.js';
import * as state from './state.js';
import * as uiUtils from './uiUtils.js';
import { fetchRoomsForGame, renderRoomList } from './roomList.js';
import { fetchEntitiesForGame, renderEntityList } from './entityList.js';
import { loadScriptsUI } from './scriptEditor.js';
import { initializePlayMode } from './playMode.js';
import { loadConversationsUI, clearConversationsUI } from './conversationEditor.js';
import { initializeGraphView } from './roomGraph.js';
import { updateSaveStatusIndicator } from './uiUtils.js'; // Import save status updater

// --- DOM Element Caching ---
const gameListUl = document.getElementById('game-list');
const newGameBtn = document.getElementById('new-game-btn');
const gameSettingsBtn = document.getElementById('game-settings-btn');
const deleteGameBtn = document.getElementById('delete-game-btn');
const submitToStoreBtn = document.getElementById('submit-to-store-btn'); // NEW: Submit button

// Room Editor Placeholders/Content
const roomsTabPlaceholder = document.getElementById('rooms-tab-placeholder');
const roomEditorContent = document.getElementById('room-editor-content');
const roomGraphView = document.getElementById('room-graph-view');

// Entity Editor Placeholders/Content
const entitiesTabPlaceholder = document.getElementById('entities-tab-placeholder');
const entityEditorContent = document.getElementById('entity-editor-content');

// Conversation Editor Placeholders/Content
const conversationsTabPlaceholder = document.getElementById('conversations-tab-placeholder');
const conversationEditorContent = document.getElementById('conversation-editor-content');

// --- NEW: Spellen Grid Elements ---
const spellenGrid = document.getElementById('spellen-grid');
const spellenGridPlaceholder = document.getElementById('spellen-grid-placeholder');

// --- NEW: Game Settings Modal Elements ---
const gameSettingsModal = document.getElementById('game-settings-modal');
const gameSettingsModalCloseBtn = document.getElementById('game-settings-modal-close');
const gameSettingsForm = document.getElementById('game-settings-form');
const gameSettingsNameInput = document.getElementById('game-settings-name-input');
const gameSettingsDescriptionTextarea = document.getElementById('game-settings-description-textarea');
const gameStartImageSelect = document.getElementById('game-start-image-select');
const gameStartImageThumbnail = document.getElementById('game-start-image-thumbnail');
const gameWinImageSelect = document.getElementById('game-win-image-select');
const gameWinImageThumbnail = document.getElementById('game-win-image-thumbnail');
const gameSettingsModalTitle = document.querySelector('#game-settings-modal .modal-content h3'); // Get the title element
const gameSettingsSubmitBtn = document.getElementById('game-settings-submit');
const gameSettingsVersionSpan = document.getElementById('game-settings-version'); // NEW: Version span
const gameSettingsBuilderVersionSpan = document.getElementById('game-settings-builder-version'); // NEW: Builder version span

// --- NEW: Import/Export Panel Elements ---
const importExportToggleBtn = document.getElementById('import-export-toggle-btn');
const importExportPanel = document.getElementById('import-export-panel');
const importExportCloseBtn = document.getElementById('import-export-close-btn');
const exportGameSelect = document.getElementById('export-game-select');
const panelExportBtn = document.getElementById('panel-export-btn');
const panelImportInput = document.getElementById('panel-import-input');

// --- NEW: Spellen Tab Action Buttons ---
const spellenTabNewGameBtn = document.getElementById('spellen-tab-new-game-btn');
const spellenTabImportGameBtn = document.getElementById('spellen-tab-import-game-btn');

// --- NEW: Delete Confirmation Modal Elements ---
const deleteConfirmModal = document.getElementById('delete-confirmation-modal');
const deleteConfirmCloseBtn = document.getElementById('delete-confirm-modal-close');
const deleteConfirmMessageSpan = document.getElementById('delete-confirm-game-name');
const deleteConfirmCancelBtn = document.getElementById('delete-confirm-cancel-btn');
const deleteConfirmDeleteBtn = document.getElementById('delete-confirm-delete-btn');

// --- NEW: Submit to Store Modal Elements ---
const submitStoreModal = document.getElementById('submit-to-store-modal');
const submitStoreModalCloseBtn = document.getElementById('submit-store-modal-close');
const submitStoreForm = document.getElementById('submit-store-form');
const submitStoreGameIdInput = document.getElementById('submit-store-game-id');
const submitStoreGameNameSpan = document.getElementById('submit-store-game-name');
const submitStoreGameDescriptionSpan = document.getElementById('submit-store-game-description');
const submitStoreTagsInput = document.getElementById('submit-store-tags');
const submitStoreSubmitBtn = document.getElementById('submit-store-submit-btn');
const submitStoreStatusSpan = document.getElementById('submit-store-status');

// --- Game List Management ---

/**
 * Fetches the list of games from the API and renders them in the sidebar.
 */
export async function fetchGames() {
    console.log("Fetching games...");
    try {
        const response = await fetch('/api/games');
        const fetchedGames = await api.handleApiResponse(response);
        state.setGames(fetchedGames); // Update state
        renderGameList();
        renderSpellenGrid(); // NEW: Render the grid as well
        console.log("Games fetched:", state.games);
    } catch (error) {
        console.error("Failed to fetch games:", error);
        if (gameListUl) gameListUl.innerHTML = '<li>Error loading games.</li>';
    }
}

/**
 * Renders the list of games in the sidebar based on the current state.
 */
export function renderGameList() {
    if (!gameListUl) return;
    gameListUl.innerHTML = ''; // Clear existing list
    if (state.games.length === 0) {
        gameListUl.innerHTML = '<li>No games found.</li>';
    } else {
        state.games.forEach(game => {
            const defaultImagePath = '/uploads/avonturen/standaard_spel_start.png';
            const imagePath = game.start_image_path ? `/uploads/avonturen/${game.start_image_path}` : defaultImagePath;

            const li = document.createElement('li');
            li.dataset.gameId = game.id; // Store game ID

            const img = document.createElement('img');
            img.src = imagePath;
            img.alt = `Thumbnail for ${game.name}`;
            li.appendChild(img);

            const span = document.createElement('span');
            span.textContent = game.name;
            li.appendChild(span);

            // NEW: Add save icon if a saved game exists for this user
            if (game.has_saved_game) {
                const saveIconSpan = document.createElement('span');
                saveIconSpan.classList.add('save-icon');
                saveIconSpan.textContent = '💾';
                saveIconSpan.title = 'Opgeslagen spel beschikbaar';
                li.appendChild(saveIconSpan);
            }

            li.addEventListener('click', () => selectGame(game.id, game.name));
            if (game.id === state.selectedGameId) {
                li.classList.add('selected');
            }
            gameListUl.appendChild(li);
        });
    }
    uiUtils.updateButtonStates();
}

// --- NEW: Spellen Grid Rendering ---

/**
 * Renders the games in a grid view in the "Spellen" tab.
 */
export function renderSpellenGrid() {
    if (!spellenGrid || !spellenGridPlaceholder) {
        console.warn("Spellen grid elements not found.");
        return;
    }

    // Clear previous grid content (excluding the placeholder initially)
    spellenGrid.querySelectorAll('.spel-card').forEach(card => card.remove());

    if (state.games.length === 0) {
        spellenGridPlaceholder.style.display = 'block';
        spellenGridPlaceholder.innerHTML = '<i>Geen spellen gevonden. Maak een nieuw spel aan via de zijbalk.</i>';
    } else {
        spellenGridPlaceholder.style.display = 'none'; // Hide placeholder
        const template = document.getElementById('spel-card-template');
        if (!template) {
            console.error("Spel card template not found!");
            spellenGridPlaceholder.style.display = 'block';
            spellenGridPlaceholder.innerHTML = '<i>Fout: Kan spel kaarten niet laden (template mist).</i>';
            return;
        }

        state.games.forEach(game => {
            const cardClone = template.content.cloneNode(true);
            const cardElement = cardClone.querySelector('.spel-card');
            const thumbnail = cardElement.querySelector('.spel-card-thumbnail');
            const title = cardElement.querySelector('.spel-card-title');
            // const description = cardElement.querySelector('.spel-card-description'); // Uncomment if using description

            // Set data
            title.textContent = game.name;
            const defaultImagePath = '/uploads/avonturen/standaard_spel_start.png';
            thumbnail.src = game.start_image_path ? `/uploads/avonturen/${game.start_image_path}` : defaultImagePath;
            thumbnail.alt = `Thumbnail for ${game.name}`;
            // description.textContent = game.description || 'Geen beschrijving.'; // Uncomment if using description

            // Add event listeners to buttons
            const playBtn = cardElement.querySelector('.spel-action-btn.play');
            const settingsBtn = cardElement.querySelector('.spel-action-btn.settings');
            const exportBtn = cardElement.querySelector('.spel-action-btn.export');
            const submitStoreBtn = cardElement.querySelector('.spel-action-btn.submit-store'); // NEW: Get submit button
            const deleteBtn = cardElement.querySelector('.spel-action-btn.delete');
            const compressBtn = cardElement.querySelector('.spel-action-btn.compress'); // NEW: Get compress button

            if (playBtn) {
                playBtn.addEventListener('click', () => {
                    selectGame(game.id, game.name); // Select the game first
                    uiUtils.switchToTab('play'); // Switch to play tab
                });
            }
            if (settingsBtn) {
                settingsBtn.addEventListener('click', () => openGameSettingsModal('edit', game.id)); // Pass game ID directly
            }
            if (exportBtn) {
                exportBtn.addEventListener('click', () => handleDirectExportGame(game.id)); // Use a direct export function
            }
            if (submitStoreBtn) { // NEW: Add listener for submit button
                submitStoreBtn.addEventListener('click', () => openSubmitToStoreModal(game.id));
            }
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => showDeleteConfirmationModal(game.id, game.name)); // Show confirmation modal
            }
            if (compressBtn) { // NEW: Add listener for compress button
                compressBtn.addEventListener('click', () => handleCompressGameImages(game.id, game.name));
            }

            spellenGrid.appendChild(cardElement);
        });
    }
    // Note: Showing/hiding admin buttons is handled by CSS based on body[data-user-role]
}

/**
 * Handles the selection of a game from the list.
 * @param {string} gameId - The UUID of the selected game.
 * @param {string} gameName - The name of the selected game.
 */
export function selectGame(gameId, gameName) {
    console.log(`Selected game: ${gameName} (ID: ${gameId})`);
    if (state.selectedGameId === gameId) return; // Avoid reloading if same game clicked

    state.setSelectedGameId(gameId);
    state.setUnsavedChanges(false); // Reset unsaved changes when loading a new game
    uiUtils.updateSaveStatusIndicator(); // Update UI
    uiUtils.updateTopBarStatus(); // Use the new function
    // Re-render list to highlight selection
    renderGameList();
    loadGameData(gameId);
}

/**
 * Loads all necessary data (rooms, entities, scripts, conversations) for the newly selected game.
 * @param {string} gameId - The UUID of the game to load data for.
 */
async function loadGameData(gameId) {
    console.log(`Loading data for game ${gameId}...`);
    if (!gameId) {
        uiUtils.clearEditorPanes();
        return;
    }

    // Show room editor, hide placeholder
    if (roomsTabPlaceholder) roomsTabPlaceholder.style.display = 'none';
    if (roomEditorContent) roomEditorContent.style.display = 'block'; // Or 'flex' depending on CSS

    // Show entity editor, hide placeholder
    if (entitiesTabPlaceholder) entitiesTabPlaceholder.style.display = 'none';
    if (entityEditorContent) entityEditorContent.style.display = 'block'; // Or 'flex'

    // Show conversation editor, hide placeholder
    if (conversationsTabPlaceholder) conversationsTabPlaceholder.style.display = 'none';
    if (conversationEditorContent) conversationEditorContent.style.display = 'flex'; // Use flex based on HTML layout

    // Fetch and render rooms, entities, scripts, and conversations concurrently
    try {
        await Promise.all([
            fetchRoomsForGame(gameId),
            fetchEntitiesForGame(gameId),
            loadScriptsUI(gameId), // Assumes loadScriptsUI is async or handles its own loading state
            loadConversationsUI(gameId) // Load conversations
        ]);

        // After data is loaded:
        uiUtils.clearRoomDetailsPanel();
        uiUtils.clearEntityDetailsPanel();
        uiUtils.clearConversationDetailsPanel(); // Clear conversation details
        initializePlayMode(); // Initialize or clear play mode based on loaded rooms

        // If graph view is active, initialize it
        if (roomGraphView?.classList.contains('active')) {
            initializeGraphView();
        }

    } catch (error) {
        console.error(`Failed to load game data for ${gameId}:`, error);
        // Show error messages in relevant panes?
        uiUtils.clearEditorPanes(); // Clear everything on major load failure
        uiUtils.updateTopBarStatus('Error loading game data'); // Use the new function
    }
}

// --- Game Action Button Event Listeners ---

function setupGameActionListeners() {
    if (newGameBtn) {
        newGameBtn.addEventListener('click', async () => {
            // NEW: Open the settings modal in 'create' mode
            openGameSettingsModal('create');
        });
    }


    if (gameSettingsBtn) {
        // NEW: Open the settings modal in 'edit' mode
        gameSettingsBtn.addEventListener('click', () => openGameSettingsModal('edit'));
    }

    // NEW: Submit to Store Button Listener
    if (submitToStoreBtn) {
        submitToStoreBtn.addEventListener('click', openSubmitToStoreModal);
    }

    // NEW: Import/Export Panel Listeners
    if (importExportToggleBtn) importExportToggleBtn.addEventListener('click', toggleImportExportPanel);
    if (importExportCloseBtn) importExportCloseBtn.addEventListener('click', closeImportExportPanel);
    if (panelExportBtn) panelExportBtn.addEventListener('click', handleExportGame);
    if (panelImportInput) panelImportInput.addEventListener('change', handleImportGame);
    if (exportGameSelect) {
        exportGameSelect.addEventListener('change', () => {
            if (panelExportBtn) panelExportBtn.disabled = !exportGameSelect.value;
        });
    }

    // NEW: Add listeners for buttons within the Spellen tab
    if (spellenTabNewGameBtn) {
        spellenTabNewGameBtn.addEventListener('click', () => openGameSettingsModal('create'));
    }
    if (spellenTabImportGameBtn) {
        spellenTabImportGameBtn.addEventListener('click', () => {
            panelImportInput?.click(); // Trigger the hidden file input from the panel
        });
    }

    if (deleteGameBtn) {
        deleteGameBtn.addEventListener('click', async () => {
            if (state.selectedGameId) {
                const gameToDelete = state.getGameById(state.selectedGameId);
                if (gameToDelete) {
                    showDeleteConfirmationModal(gameToDelete.id, gameToDelete.name); // Show confirmation modal
                }
            }
        });
    }
}

// --- NEW: Direct Game Action Handlers (used by grid buttons) ---

/**
 * Shows the delete confirmation modal.
 * @param {string} gameId - The ID of the game to potentially delete.
 * @param {string} gameName - The name of the game.
 */
function showDeleteConfirmationModal(gameId, gameName) {
    if (!deleteConfirmModal || !deleteConfirmMessageSpan || !deleteConfirmDeleteBtn) return;

    deleteConfirmMessageSpan.textContent = gameName; // Set game name in message
    deleteConfirmDeleteBtn.dataset.gameId = gameId; // Store game ID on the button
    deleteConfirmDeleteBtn.dataset.gameName = gameName; // Store name for potential use in actual delete

    deleteConfirmModal.classList.add('visible');
}

/** Closes the delete confirmation modal. */
function closeDeleteConfirmationModal() {
    if (deleteConfirmModal) {
        deleteConfirmModal.classList.remove('visible');
        // Clean up data attributes if needed
        deleteConfirmDeleteBtn.removeAttribute('data-game-id');
        deleteConfirmDeleteBtn.removeAttribute('data-game-name');
    }
}

/** Performs the actual game deletion after confirmation. */
async function performGameDeletion() {
    const gameId = deleteConfirmDeleteBtn.dataset.gameId;
    if (!gameId) return;

    console.log(`Confirmed deletion for game ${gameId}`);
    closeDeleteConfirmationModal(); // Close modal first

    try {
        const response = await fetch(`/api/games/${gameId}`, { method: 'DELETE' });
        await api.handleApiResponse(response); // Checks for errors, expects 204
        console.log("Game deleted:", gameId);
        await fetchGames(); // Refresh game list and grid
        if (state.selectedGameId === gameId) { // Clear selection if deleted game was active
            state.setSelectedGameId(null);
            uiUtils.clearEditorPanes();
            uiUtils.updateTopBarStatus();
        }
    } catch (error) {
        console.error("Failed to delete game after confirmation:", error);
        // Alert handled by handleApiResponse
    }
}

// --- NEW: Game Settings Modal ---

/**
 * Opens the game settings modal.
 * @param {'create' | 'edit'} mode - Determines if the modal is for creating or editing a game.
 * @param {string|null} [gameId=null] - The ID of the game to edit (required for 'edit' mode).
 */
async function openGameSettingsModal(mode = 'edit', gameId = null) {
    if (!gameSettingsModal || !gameSettingsModalTitle || !gameSettingsSubmitBtn) return;
    const targetGameId = (mode === 'edit') ? (gameId || state.selectedGameId) : null;
    gameSettingsForm.dataset.mode = mode; // Store mode in the form's dataset

    if (mode === 'create') {
        gameSettingsModalTitle.textContent = "Nieuw Spel Aanmaken";
        gameSettingsSubmitBtn.textContent = "Maak Spel Aan";
        gameSettingsForm.reset(); // Clear form fields
        gameSettingsNameInput.value = '';
        gameSettingsDescriptionTextarea.value = '';
        await populateGameImageDropdown(gameStartImageSelect, 'start', null);
        await populateGameImageDropdown(gameWinImageSelect, 'win', null);
        updateGameImageThumbnail(gameStartImageThumbnail, 'start', null);
        updateGameImageThumbnail(gameWinImageThumbnail, 'win', null);
        gameSettingsVersionSpan.textContent = '1.0.0'; // NEW: Set default version
        gameSettingsBuilderVersionSpan.textContent = document.body.dataset.appVersion || 'N/A'; // NEW: Set current builder version
    } else { // mode === 'edit'
        if (!targetGameId) return; // Need a selected game for edit mode
        const currentGame = state.getGameById(targetGameId);
        if (!currentGame) {
            console.error("Cannot open settings: Current game data not found.");
            return;
        }
        gameSettingsModalTitle.textContent = "Spel Instellingen";
        gameSettingsSubmitBtn.textContent = "Opslaan";
        gameSettingsNameInput.value = currentGame.name;
        gameSettingsDescriptionTextarea.value = currentGame.description || '';
        await populateGameImageDropdown(gameStartImageSelect, 'start', currentGame.start_image_path);
        await populateGameImageDropdown(gameWinImageSelect, 'win', currentGame.win_image_path);
        updateGameImageThumbnail(gameStartImageThumbnail, 'start', currentGame.start_image_path);
        updateGameImageThumbnail(gameWinImageThumbnail, 'win', currentGame.win_image_path);
        gameSettingsVersionSpan.textContent = currentGame.version || 'N/A'; // NEW: Display version
        gameSettingsBuilderVersionSpan.textContent = document.body.dataset.appVersion || 'N/A'; // NEW: Display builder version
    }

    gameSettingsModal.classList.add('visible');
}

/** Closes the game settings modal. */
function closeGameSettingsModal() {
    if (gameSettingsModal) {
        gameSettingsModal.classList.remove('visible');
    }
}

/**
 * Populates a game image dropdown (start or win).
 * @param {HTMLSelectElement} selectElement - The dropdown element.
 * @param {'start'|'win'} imageType - The type of image (used for default).
 * @param {string|null} selectedImagePath - The currently selected image path.
 */
async function populateGameImageDropdown(selectElement, imageType, selectedImagePath) {
    if (!selectElement) return;
    selectElement.innerHTML = '<option value="">-- Standaard Plaatje --</option>'; // Reset with default
    selectElement.disabled = true;

    try {
        const response = await fetch('/api/images/list?type=adventure'); // Fetch adventure images
        const imageFiles = await api.handleApiResponse(response);

        imageFiles.forEach(filename => {
            const option = document.createElement('option');
            option.value = filename;
            option.textContent = filename;
            selectElement.appendChild(option);
        });
        selectElement.value = selectedImagePath || ""; // Select current or default
        selectElement.disabled = false;
    } catch (error) {
        console.error(`Failed to load adventure images for ${imageType}:`, error);
    }
}

/**
 * Updates a game image thumbnail (start or win).
 * @param {HTMLImageElement} thumbnailElement - The thumbnail img element.
 * @param {'start'|'win'} imageType - The type of image (used for default).
 * @param {string|null} imagePath - The image path filename.
 */
function updateGameImageThumbnail(thumbnailElement, imageType, imagePath) {
    const defaultImagePath = imageType === 'start'
        ? '/uploads/avonturen/standaard_spel_start.png'
        : '/uploads/avonturen/standaard_spel_win.png';
    if (!thumbnailElement) return;

    const imageUrl = imagePath ? `/uploads/avonturen/${imagePath}` : defaultImagePath;
    thumbnailElement.src = imageUrl;
    thumbnailElement.style.display = 'inline-block'; // Ensure visible
}

/** Handles saving game settings from the modal. */
async function handleSaveGameSettings(event) {
    event.preventDefault();
    const mode = gameSettingsForm.dataset.mode || 'edit'; // Get mode from form dataset
    const targetGameId = (mode === 'edit') ? state.selectedGameId : null; // Use selectedGameId for edit

    const gameData = {
        name: gameSettingsNameInput.value.trim(),
        start_image_path: gameStartImageSelect.value || null, // Use null if default selected
        description: gameSettingsDescriptionTextarea.value.trim() || '',
        win_image_path: gameWinImageSelect.value || null,   // Use null if default selected
        version: '1.0.0', // NEW: Set default version
        builder_version: document.body.dataset.appVersion || 'N/A' // NEW: Set current builder version
    };

    if (!gameData.name) {
        uiUtils.showFlashMessage("Spelnaam mag niet leeg zijn.", 5000);
        return;
    }

    try {
        let response;
        let savedGame;

        if (mode === 'create') {
            console.log("Creating new game with data:", gameData);
            response = await fetch('/api/games', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gameData)
            });
            savedGame = await api.handleApiResponse(response);
            console.log("Game created:", savedGame);
            // Update state and UI
            const updatedGames = [...state.games, savedGame];
            updatedGames.sort((a, b) => a.name.localeCompare(b.name));
            state.setGames(updatedGames);
            selectGame(savedGame.id, savedGame.name); // Select the new game
            uiUtils.updateTopBarStatus(); // Ensure status reflects new game name and context
            renderSpellenGrid(); // Update grid view
            state.setUnsavedChanges(false); // New game starts saved
            uiUtils.updateSaveStatusIndicator(); // Update UI
            uiUtils.showFlashMessage("Nieuw spel aangemaakt!");
        } else { // mode === 'edit'
            if (!targetGameId) return;
            console.log(`Updating game ${targetGameId} with data:`, gameData);
            response = await fetch(`/api/games/${targetGameId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gameData)
            });
            savedGame = await api.handleApiResponse(response);
            console.log("Game settings updated:", savedGame);
            await fetchGames(); // Re-fetch games to update list and state cache
            renderSpellenGrid(); // Update grid view
            uiUtils.updateTopBarStatus(); // Ensure status reflects potential name change and context
            selectGame(savedGame.id, savedGame.name); // Re-select to update status etc.
            uiUtils.showFlashMessage("Spel instellingen opgeslagen!");
        }
        closeGameSettingsModal();
    } catch (error) {
        console.error("Failed to save game settings:", error);
        // Alert handled by handleApiResponse
    }
}

// --- NEW: Submit to Store Modal ---

/**
 * Opens the Submit to Store modal and populates it with game details.
 * @param {string} gameId - The ID of the game to submit.
 */
async function openSubmitToStoreModal(gameId) {
    if (!submitStoreModal || !submitStoreGameIdInput || !submitStoreGameNameSpan || !submitStoreGameDescriptionSpan || !submitStoreTagsInput || !submitStoreStatusSpan) return;

    const game = state.getGameById(gameId);
    if (!game) {
        console.error("Cannot open submit modal: Game data not found for ID", gameId);
        uiUtils.showFlashMessage("Kon spel details niet vinden.", 5000);
        return;
    }

    // Populate modal
    submitStoreGameIdInput.value = gameId;
    submitStoreGameNameSpan.textContent = game.name;
    submitStoreGameDescriptionSpan.textContent = game.description || '(Geen omschrijving)';
    submitStoreTagsInput.value = ''; // Clear previous tags
    submitStoreStatusSpan.textContent = ''; // Clear status
    submitStoreSubmitBtn.disabled = false; // Ensure button is enabled

    submitStoreModal.classList.add('visible');
}

/** Closes the Submit to Store modal. */
function closeSubmitToStoreModal() {
    if (submitStoreModal) {
        submitStoreModal.classList.remove('visible');
    }
}

/** Handles the submission of the game to the store API. */
async function handleSubmitToStore(event) {
    event.preventDefault();
    if (!submitStoreGameIdInput || !submitStoreTagsInput || !submitStoreStatusSpan || !submitStoreSubmitBtn) return;

    const gameId = submitStoreGameIdInput.value;
    const tags = submitStoreTagsInput.value.trim();

    submitStoreStatusSpan.textContent = 'Submitting...';
    submitStoreSubmitBtn.disabled = true;

    try {
        const response = await fetch(`/api/store/submit/${gameId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: tags })
        });
        const result = await api.handleApiResponse(response); // Handles errors and success (201)
        submitStoreStatusSpan.textContent = `Success! ${result.message || 'Game submitted.'}`;
        uiUtils.showFlashMessage(`Spel "${result.name || 'Unknown'}" succesvol ingediend bij de store!`);
        // Optionally close modal after a delay on success
        setTimeout(closeSubmitToStoreModal, 2000);
    } catch (error) {
        console.error("Failed to submit game to store:", error);
        submitStoreStatusSpan.textContent = `Error: ${error.message}`;
        submitStoreSubmitBtn.disabled = false; // Re-enable button on error
        // Error flash message shown by handleApiResponse
    }
}

// --- NEW: Import/Export Panel Logic ---

/** Toggles the visibility of the Import/Export slide panel. */
async function toggleImportExportPanel() {
    if (!importExportPanel || !exportGameSelect) return;

    const isVisible = importExportPanel.classList.contains('visible');
    if (!isVisible) {
        // Populate the dropdown when opening the panel
        exportGameSelect.innerHTML = '<option value="">-- Select a Game to Export --</option>'; // Clear and add default
        exportGameSelect.disabled = true;
        if (panelExportBtn) panelExportBtn.disabled = true;

        try {
            // Fetch games again or use cached state if guaranteed fresh
            // Using state here assumes it's reasonably up-to-date
            if (state.games.length > 0) {
                state.games.forEach(game => {
                    const option = document.createElement('option');
                    option.value = game.id;
                    option.textContent = game.name;
                    exportGameSelect.appendChild(option);
                });
                exportGameSelect.disabled = false;
            } else {
                exportGameSelect.innerHTML = '<option value="">-- No Games Available --</option>';
            }
        } catch (error) {
            console.error("Failed to populate export game select:", error);
            exportGameSelect.innerHTML = '<option value="">-- Error Loading Games --</option>';
        }
    }
    importExportPanel.classList.toggle('visible');
}

/** Closes the Import/Export slide panel. */
function closeImportExportPanel() {
    if (importExportPanel) {
        importExportPanel.classList.remove('visible');
    }
}

/** Handles the Export Game button click within the panel. */
async function handleExportGame() {
    const selectedGameId = exportGameSelect.value;
    if (!selectedGameId) {
        uiUtils.showFlashMessage("Please select a game to export.", 4000);
        return;
    }
    handleDirectExportGame(selectedGameId); // Use the direct export function
}

/**
 * Triggers the download for exporting a specific game.
 * @param {string} gameId - The ID of the game to export.
 */
function handleDirectExportGame(gameId) {
    // Trigger download by navigating to the export URL
    window.location.href = `/api/games/${gameId}/export`;
}

/** Handles the file selection for game import. */
async function handleImportGame(event) {
    const file = event.target.files[0];
    if (!file) return;

    console.log("Selected file for import:", file);
    uiUtils.showFlashMessage(`Bezig met importeren van "${file.name}"...`, 5000);

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/games/import', {
            method: 'POST',
            body: formData,
        });
        const result = await api.handleApiResponse(response); // Handles errors and success (201)
        uiUtils.showFlashMessage(`Spel "${result.name}" succesvol geïmporteerd!`);
        await fetchGames(); // Refresh game list and grid
    } catch (error) {
        // Error message is already shown by handleApiResponse
        console.error("Import failed:", error);
    }
    // Reset the input field to allow importing the same file again if needed
    event.target.value = null;
}

// --- NEW: Compress Game Images ---

/**
 * Handles the click on the compress images button for a game.
 * @param {string} gameId - The ID of the game to compress images for.
 * @param {string} gameName - The name of the game.
 */
async function handleCompressGameImages(gameId, gameName) {
    if (!confirm(`Weet je zeker dat je alle afbeeldingen voor het spel "${gameName}" wilt comprimeren?\n\nDit zal:\n- Afbeeldingen verkleinen tot max 800x800px.\n- Alles converteren naar JPG (80% kwaliteit).\n- Originele bestanden (zoals PNG) verwijderen na conversie.\n\nDeze actie kan even duren en kan niet ongedaan worden gemaakt.`)) {
        return;
    }

    uiUtils.showFlashMessage(`Bezig met comprimeren van afbeeldingen voor "${gameName}"... Dit kan even duren.`, 10000); // Longer message duration

    try {
        const response = await fetch(`/api/admin/games/${gameId}/compress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // No body needed for this request
        });
        const result = await api.handleApiResponse(response); // Handles errors and success (200)
        uiUtils.showFlashMessage(result.message || `Afbeeldingen voor "${gameName}" gecomprimeerd.`, 8000); // Show result message
        // Optionally refresh game data if image paths might have changed display (e.g., thumbnails)
        // await fetchGames(); // Could refresh the grid if needed
    } catch (error) {
        console.error(`Failed to compress images for game ${gameId}:`, error);
        // Error flash message shown by handleApiResponse
    }
}

// --- Initialization ---
// Call this from main.js after DOM is loaded
export function initializeGameManager() {
    setupGameActionListeners();
    fetchGames(); // Initial fetch
    uiUtils.updateButtonStates(); // Set initial button states
    uiUtils.updateTopBarStatus(); // Set initial top bar status ("No game loaded")

    // Add listeners for the new modal elements
    if (gameSettingsModalCloseBtn) {
        gameSettingsModalCloseBtn.addEventListener('click', closeGameSettingsModal);
    }
    if (gameSettingsForm) {
        gameSettingsForm.addEventListener('submit', handleSaveGameSettings);
    }
    if (gameStartImageSelect) {
        gameStartImageSelect.addEventListener('change', () => updateGameImageThumbnail(gameStartImageThumbnail, 'start', gameStartImageSelect.value));
    }
    if (gameWinImageSelect) {
        gameWinImageSelect.addEventListener('change', () => updateGameImageThumbnail(gameWinImageThumbnail, 'win', gameWinImageSelect.value));
    }
    if (gameStartImageThumbnail) gameStartImageThumbnail.addEventListener('click', () => uiUtils.showImagePopup(gameStartImageThumbnail.src));
    if (gameWinImageThumbnail) gameWinImageThumbnail.addEventListener('click', () => uiUtils.showImagePopup(gameWinImageThumbnail.src));

    // NEW: Add listeners for delete confirmation modal
    if (deleteConfirmCloseBtn) deleteConfirmCloseBtn.addEventListener('click', closeDeleteConfirmationModal);
    if (deleteConfirmCancelBtn) deleteConfirmCancelBtn.addEventListener('click', closeDeleteConfirmationModal);
    if (deleteConfirmDeleteBtn) deleteConfirmDeleteBtn.addEventListener('click', performGameDeletion);

    // NEW: Add listeners for submit to store modal
    if (submitStoreModalCloseBtn) submitStoreModalCloseBtn.addEventListener('click', closeSubmitToStoreModal);
    if (submitStoreForm) submitStoreForm.addEventListener('submit', handleSubmitToStore);
}
