// /client/js/playModeStateActions.js
// Handles actions related to saving, loading, and resetting game state.

import * as api from './api.js';
import * as state from './state.js';
import * as ui from './playModeUI.js';
import * as commands from './playModeCommands.js';
import { renderGameList } from './gameManager.js'; // To update save icon
import { showFlashMessage } from './uiUtils.js';
import { initializePlayMode } from './playMode.js'; // For resetting

// --- DOM Elements ---
const saveGameBtn = document.getElementById('save-game-btn');
const loadGameBtn = document.getElementById('load-game-btn');
const resetGameBtn = document.getElementById('reset-game-btn');

// --- Action Functions ---

/**
 * Saves the current game state via API call.
 */
async function saveGameState() {
    const gameId = state.selectedGameId;
    const roomId = state.currentPlayRoomId;
    if (!gameId || !roomId) {
        showFlashMessage("Kan niet opslaan: Geen spel of huidige kamer geselecteerd.", 5000);
        return;
    }
    console.log("Saving game state...");
    try {
        const response = await fetch(`/api/games/${gameId}/play/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Send current room ID, backend fetches other state (inventory, vars) from memory
            body: JSON.stringify({ current_room_id: roomId })
        });
        const result = await api.handleApiResponse(response);
        showFlashMessage(result.message || "Spel opgeslagen!", 4000);

        // Update game list UI to show save icon
        const gameIndex = state.games.findIndex(g => g.id === gameId);
        if (gameIndex !== -1) {
            // Assuming the backend confirms save success implicitly or via message
            // We need a way to know if a save file *exists* for the game/user
            // Let's assume the backend handles this and we just re-fetch game list or update manually
            // For now, just mark it locally and re-render
             state.games[gameIndex].has_saved_game = true; // TODO: Confirm this logic aligns with backend/DB state
             renderGameList(); // Re-render the list
        }
    } catch (error) {
        console.error("Failed to save game:", error);
        // Error message shown by handleApiResponse
    }
}

/**
 * Loads the saved game state via API call and updates the UI.
 */
async function loadGameState() {
    const gameId = state.selectedGameId;
    if (!gameId) {
        showFlashMessage("Kan niet laden: Geen spel geselecteerd.", 5000);
        return;
    }
    console.log("Loading game state...");
    try {
        const response = await fetch(`/api/games/${gameId}/play/load`);
        const result = await api.handleApiResponse(response);

        // Update client state based on loaded data
        state.setCurrentPlayRoomId(result.current_room_id);
        // Backend state (inventory, vars) is loaded server-side, client doesn't need direct access here.

        // Update UI elements
        ui.updateRoomImage(result.image_path);
        ui.updateScoreDisplay(result.current_score);
        showFlashMessage("Spel geladen!", 4000);

        // Show the main play area (hides overlays)
        ui.showPlayContentArea();

        // Send 'look' command to display the loaded room description and state
        await commands.sendPlayCommand('kijk', true);

    } catch (error) {
        console.error("Failed to load game:", error);
        // Error message shown by handleApiResponse, potentially add more context
        showFlashMessage("Fout bij laden spel. Mogelijk geen opgeslagen spel aanwezig.", 5000);
    }
}

/**
 * Resets the current game session via API call and resets the UI.
 */
async function resetGameState() {
    const gameId = state.selectedGameId;
    if (!gameId) {
        showFlashMessage("Kan niet resetten: Geen spel geselecteerd.", 5000);
        return;
    }

    // Confirmation dialog
    if (confirm("Weet je zeker dat je de huidige speelsessie wilt resetten? Alle voortgang (inventaris, variabelen) gaat verloren.")) {
        console.log("Resetting game session...");
        try {
            const response = await fetch(`/api/games/${gameId}/play/reset`, { method: 'POST' });
            await api.handleApiResponse(response); // Check for success (usually 204)

            showFlashMessage("Spel gereset. Je begint opnieuw.", 4000);

            // Reset client-side state and UI by re-initializing play mode
            await initializePlayMode(); // This should show the start overlay again

        } catch (error) {
            console.error("Failed to reset game:", error);
            // Error message shown by handleApiResponse
        }
    }
}

// --- Event Listener Setup ---

/**
 * Sets up event listeners for the save, load, and reset buttons.
 */
export function setupStateActionListeners() {
    if (saveGameBtn) {
        saveGameBtn.addEventListener('click', saveGameState);
    } else {
         console.warn("Save game button not found.");
    }

    if (loadGameBtn) {
        loadGameBtn.addEventListener('click', loadGameState);
    } else {
         console.warn("Load game button not found.");
    }

    if (resetGameBtn) {
        resetGameBtn.addEventListener('click', resetGameState);
    } else {
        console.warn("Reset game button not found.");
    }
}
