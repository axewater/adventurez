// /client/js/gameSettings.js
// Handles the logic for the Game Settings modal (create/edit)

import * as api from './api.js';
import * as state from './state.js';
import * as uiUtils from './uiUtils.js';
// Import necessary functions from gameManager
import { fetchGames, selectGame, renderSpellenGrid } from './gameManager.js';

// --- DOM Element Caching ---
const gameSettingsModal = document.getElementById('game-settings-modal');
const gameSettingsModalCloseBtn = document.getElementById('game-settings-modal-close');
const gameSettingsForm = document.getElementById('game-settings-form');
const gameSettingsNameInput = document.getElementById('game-settings-name-input');
const gameSettingsDescriptionTextarea = document.getElementById('game-settings-description-textarea');
const gameStartImageSelect = document.getElementById('game-start-image-select');
const gameStartImageThumbnail = document.getElementById('game-start-image-thumbnail');
const gameWinImageSelect = document.getElementById('game-win-image-select');
const gameWinImageThumbnail = document.getElementById('game-win-image-thumbnail');
const gameLossImageSelect = document.getElementById('game-loss-image-select');
const gameLossImageThumbnail = document.getElementById('game-loss-image-thumbnail');
const gameSettingsModalTitle = document.querySelector('#game-settings-modal .modal-content h3');
const gameSettingsVersionInput = document.getElementById('game-settings-version-input');
const gameSettingsSubmitTopBtn = document.getElementById('game-settings-submit-top');
const gameSettingsSubmitBottomBtn = document.getElementById('game-settings-submit-bottom');
const gameSettingsCancelBtn = document.getElementById('game-settings-cancel-btn');
const gameSettingsVersionSpan = document.getElementById('game-settings-version');
const gameSettingsBuilderVersionSpan = document.getElementById('game-settings-builder-version');

// --- Modal Logic ---

/**
 * Opens the game settings modal.
 * @param {'create' | 'edit'} mode - Determines if the modal is for creating or editing a game.
 * @param {string|null} [gameId=null] - The ID of the game to edit (required for 'edit' mode).
 */
export async function openGameSettingsModal(mode = 'edit', gameId = null) {
    if (!gameSettingsModal || !gameSettingsModalTitle || !gameSettingsSubmitBottomBtn || !gameSettingsSubmitTopBtn) return;
    const targetGameId = (mode === 'edit') ? (gameId || state.selectedGameId) : null;
    gameSettingsForm.dataset.mode = mode; // Store mode in the form's dataset
    gameSettingsForm.dataset.targetGameId = targetGameId || ''; // Store target ID for edit mode

    if (mode === 'create') {
        gameSettingsModalTitle.textContent = "Create New Game";
        gameSettingsSubmitBottomBtn.textContent = "Create Game";
        gameSettingsForm.reset(); // Clear form fields
        gameSettingsNameInput.value = '';
        gameSettingsDescriptionTextarea.value = '';
        await populateGameImageDropdown(gameStartImageSelect, 'start', null);
        await populateGameImageDropdown(gameWinImageSelect, 'win', null);
        await populateGameImageDropdown(gameLossImageSelect, 'loss', null);
        updateGameImageThumbnail(gameStartImageThumbnail, 'start', null);
        updateGameImageThumbnail(gameWinImageThumbnail, 'win', null);
        updateGameImageThumbnail(gameLossImageThumbnail, 'loss', null);
        gameSettingsVersionInput.value = '1.0.0'; // Set default version for new games
        gameSettingsVersionSpan.textContent = '1.0.0'; // Set default version
        gameSettingsBuilderVersionSpan.textContent = document.body.dataset.appVersion || 'N/A'; // Set current builder version
    } else { // mode === 'edit'
        if (!targetGameId) {
            console.error("Cannot open settings: No game ID provided for edit mode.");
            uiUtils.showFlashMessage("Select a game or provide a game ID to edit settings.", 5000);
            return;
        }
        const currentGame = state.getGameById(targetGameId);
        if (!currentGame) {
            console.error("Cannot open settings: Game data not found for ID:", targetGameId);
            uiUtils.showFlashMessage("Could not find game data to edit settings.", 5000);
            return;
        }
        gameSettingsModalTitle.textContent = "Game Settings";
        gameSettingsSubmitBottomBtn.textContent = "Save";
        gameSettingsNameInput.value = currentGame.name;
        gameSettingsDescriptionTextarea.value = currentGame.description || '';
        await populateGameImageDropdown(gameStartImageSelect, 'start', currentGame.start_image_path);
        await populateGameImageDropdown(gameWinImageSelect, 'win', currentGame.win_image_path);
        await populateGameImageDropdown(gameLossImageSelect, 'loss', currentGame.loss_image_path);
        updateGameImageThumbnail(gameStartImageThumbnail, 'start', currentGame.start_image_path);
        updateGameImageThumbnail(gameWinImageThumbnail, 'win', currentGame.win_image_path);
        updateGameImageThumbnail(gameLossImageThumbnail, 'loss', currentGame.loss_image_path);
        gameSettingsVersionInput.value = currentGame.version || '1.0.0'; // Set current version or default
        gameSettingsVersionSpan.textContent = currentGame.version || 'N/A';
        gameSettingsBuilderVersionSpan.textContent = document.body.dataset.appVersion || 'N/A';
    }

    gameSettingsModal.classList.add('visible');
}

/** Closes the game settings modal. */
function closeGameSettingsModal() {
    if (gameSettingsModal) {
        gameSettingsModal.classList.remove('visible');
        // Clean up dataset attributes
        gameSettingsForm.removeAttribute('data-mode');
        gameSettingsForm.removeAttribute('data-target-game-id');
    }
}

/**
 * Populates a game image dropdown (start, win, or loss).
 * @param {HTMLSelectElement|null} selectElement - The dropdown element.
 * @param {'start'|'win'|'loss'} imageType - The type of image (used for default).
 * @param {string|null} selectedImagePath - The currently selected image path.
 */
async function populateGameImageDropdown(selectElement, imageType, selectedImagePath) {
    if (!selectElement) return;
    selectElement.innerHTML = '<option value="">-- Default Image --</option>'; // Reset with default
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
        // Optionally add a placeholder or error message in the dropdown
        selectElement.innerHTML = '<option value="">-- Error Loading Images --</option>';
    }
}

/**
 * Updates a game image thumbnail (start, win, or loss).
 * @param {HTMLImageElement|null} thumbnailElement - The thumbnail img element.
 * @param {'start'|'win'|'loss'} imageType - The type of image (used for default).
 * @param {string|null} imagePath - The image path filename.
 */
function updateGameImageThumbnail(thumbnailElement, imageType, imagePath) {
    const defaultImagePath = imageType === 'start'
        ? '/uploads/avonturen/standaard_spel_start.png'
        : imageType === 'win'
            ? '/uploads/avonturen/standaard_spel_win.png' // Assuming a default win image exists
            : '/uploads/avonturen/standaard_verloren.jpg'; // Default loss image
    if (!thumbnailElement) return;

    const imageUrl = imagePath ? `/uploads/avonturen/${imagePath}` : defaultImagePath;
    thumbnailElement.src = imageUrl;
    thumbnailElement.style.display = 'inline-block'; // Ensure visible
}

/** Handles saving game settings from the modal. */
async function handleSaveGameSettings(event) {
    event.preventDefault(); // Prevent default form submission

    const mode = gameSettingsForm.dataset.mode || 'edit'; // Get mode from form dataset
    const targetGameId = gameSettingsForm.dataset.targetGameId || null; // Get target ID from form dataset

    const gameData = {
        name: gameSettingsNameInput.value.trim(),
        start_image_path: gameStartImageSelect.value || null, // Use null if default selected
        description: gameSettingsDescriptionTextarea.value.trim() || '',
        win_image_path: gameWinImageSelect.value || null,   // Use null if default selected
        loss_image_path: gameLossImageSelect.value || null, // Get loss image path
        version: gameSettingsVersionInput.value.trim() || '1.0.0', // Get version from input or use default
        // Version is handled server-side on create/update if needed, or set here if required
        // builder_version: document.body.dataset.appVersion || 'N/A' // Set current builder version
    };

    if (!gameData.name) {
        uiUtils.showFlashMessage("Game name cannot be empty.", 5000);
        return;
    }

    try {
        let response;
        let savedGame;

        if (mode === 'create') {
            console.log("Attempting to CREATE new game...");
            response = await fetch('/api/games', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gameData)
            });
            savedGame = await api.handleApiResponse(response);
            console.log("Game created:", savedGame);
            // Update state and UI (using imported functions)
            await fetchGames(); // Re-fetch all games to update the list and grid
            selectGame(savedGame.id, savedGame.name); // Select the new game
            uiUtils.showFlashMessage("New game created!");
        } else { // mode === 'edit'
            if (!targetGameId) {
                 console.error("Save failed: targetGameId is missing for edit mode.");
                 uiUtils.showFlashMessage("Error: Could not determine which game to save.", 5000);
                 return;
            }
            console.log(`Attempting to UPDATE game ${targetGameId}...`);
            response = await fetch(`/api/games/${targetGameId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gameData)
            });
            savedGame = await api.handleApiResponse(response);
            console.log("Game settings updated:", savedGame);
            // Update state and UI (using imported functions)
            await fetchGames(); // Re-fetch games to update list and state cache
            renderSpellenGrid(); // Update grid view
            // If the currently selected game was edited, re-select it to update UI elements
            if (state.selectedGameId === savedGame.id) {
                selectGame(savedGame.id, savedGame.name);
            }
            uiUtils.showFlashMessage("Game settings saved!");
        }
        closeGameSettingsModal();
    } catch (error) {
        console.error("Failed to save game settings:", error);
        // Error message is shown by handleApiResponse
    }
}

// --- Initialization ---

/** Sets up event listeners for the game settings modal elements. */
export function initializeGameSettingsListeners() {
    if (gameSettingsModalCloseBtn) {
        gameSettingsModalCloseBtn.addEventListener('click', closeGameSettingsModal);
    }
    if (gameSettingsForm) {
        // Use submit event on the form itself, triggered by either submit button
        gameSettingsForm.addEventListener('submit', handleSaveGameSettings);
    }
    if (gameStartImageSelect) {
        gameStartImageSelect.addEventListener('change', () => updateGameImageThumbnail(gameStartImageThumbnail, 'start', gameStartImageSelect.value));
    }
    if (gameWinImageSelect) {
        gameWinImageSelect.addEventListener('change', () => updateGameImageThumbnail(gameWinImageThumbnail, 'win', gameWinImageSelect.value));
    }
    if (gameLossImageSelect) {
        gameLossImageSelect.addEventListener('change', () => updateGameImageThumbnail(gameLossImageThumbnail, 'loss', gameLossImageSelect.value));
    }
    if (gameStartImageThumbnail) gameStartImageThumbnail.addEventListener('click', () => uiUtils.showImagePopup(gameStartImageThumbnail.src));
    if (gameWinImageThumbnail) gameWinImageThumbnail.addEventListener('click', () => uiUtils.showImagePopup(gameWinImageThumbnail.src));
    if (gameLossImageThumbnail) gameLossImageThumbnail.addEventListener('click', () => uiUtils.showImagePopup(gameLossImageThumbnail.src));

    if (gameSettingsCancelBtn) {
        gameSettingsCancelBtn.addEventListener('click', closeGameSettingsModal);
    }
    console.log("Game Settings Modal listeners initialized.");
}
