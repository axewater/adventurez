// /client/js/playMode.js
// Orchestrator for the Play Mode tab functionality.
// Initializes UI, command handling, state actions, and popups.

import * as api from './api.js';
import * as state from './state.js';
import * as ui from './playModeUI.js';
import * as commands from './playModeCommands.js';
import * as stateActions from './playModeStateActions.js';
import * as popups from './playModePopups.js';
import { dispatchGameDataChangedEvent, updateSaveStatusIndicator, showFlashMessage } from './uiUtils.js';

// --- DOM Elements ---
const playTab = document.getElementById('play-tab');

// --- Play Mode State ---
// State like currentPlayRoomId is now managed in state.js
// Command history and conversation state are managed in playModeCommands.js

// --- Helper Functions ---
// UI update functions (updateRoomImage, updateScoreDisplay, showWinOverlay) moved to playModeUI.js
// Popup functions (showEntityImagePopup, hideEntityImagePopup) moved to playModePopups.js
// Command sending (sendPlayCommand) moved to playModeCommands.js
// State actions (save, load, reset) moved to playModeStateActions.js

// --- Play Mode Logic ---

/**
 * Initializes the Play Mode tab based on the selected game.
 * Shows the start overlay or placeholder.
 */
export async function initializePlayMode() {
    if (!state.selectedGameId) {
        resetPlayMode(); // Reset UI and state if no game selected
        return;
    }
    const currentGame = state.getGameById(state.selectedGameId);
    if (!currentGame) {
        console.error("Cannot initialize Play Mode: Game data not found in state.");
        resetPlayMode("Fout bij laden spelgegevens.");
        return;
    }

    const startRoom = state.currentRooms.length > 0 ? state.currentRooms[0] : null;
    if (!startRoom) {
        console.warn("Cannot start game: No rooms found in the game.");
        resetPlayMode("Geen kamers gedefinieerd. Voeg een kamer toe om te beginnen met spelen.");
        return;
    }

    console.log(`Initializing Play Mode for game: ${currentGame.name}. Start room: ${startRoom?.title || 'None'}`);

    // Show the start overlay using the UI module
    ui.showStartOverlay(currentGame);
}

/**
 * Starts the actual gameplay after the start overlay is clicked.
 * Sets the initial room and sends the first 'look' command.
 */
async function startGamePlay() {
    const startRoom = state.currentRooms.length > 0 ? state.currentRooms[0] : null;
    if (!startRoom) {
        console.error("Cannot start game play: Start room not found.");
        resetPlayMode("Fout: Startkamer niet gevonden."); // Show error in placeholder
        return;
    }

    console.log(`Starting gameplay. Room: ${startRoom.title} (${startRoom.id})`);
    state.setCurrentPlayRoomId(startRoom.id);

    // Show the main play area UI elements
    ui.showPlayContentArea();

    // Send the initial 'look' command using the commands module
    await commands.sendPlayCommand('kijk', true);
}

/**
 * Resets the Play Mode state and UI to its initial state.
 * @param {string} [message="Selecteer een spel om te beginnen met testen."] - Message for the placeholder.
 */
export function resetPlayMode(message = "Selecteer een spel om te beginnen met testen.") {
    console.log("Resetting Play Mode.");
    state.setCurrentPlayRoomId(null);
    commands.resetCommandHistory(); // Reset command history and conversation state
    ui.resetPlayModeUI(message); // Reset UI elements
}

/**
 * Sets up the main event listeners for the Play Mode tab.
 * Delegates listener setup to the specialized modules.
 */
function setupPlayModeListeners() {
    ui.setupPlayModeUIListeners(startGamePlay); // Pass startGamePlay as callback
    commands.setupCommandInputListeners();
    stateActions.setupStateActionListeners();
    popups.setupPopupListeners();

    document.addEventListener('gameDataChanged', handleGameDataChange);
}

/**
 * Handles the custom 'gameDataChanged' event.
 * Shows a message if play mode is active when game data changes externally.
 * @param {CustomEvent} event - The event object.
 */
function handleGameDataChange(event) {
    const playTabActive = playTab?.classList.contains('active');
    const playModeInitialized = state.currentPlayRoomId !== null;

    if (playTabActive && playModeInitialized) {
        isInConversation = false;
        console.log("Game data changed while Play Mode is active. Source:", event.detail.source);
        showFlashMessage("Spelgegevens zijn gewijzigd. Reset Play Mode (🗑️) om updates te zien!", 6000);
    }
}

/**
 * Initializes the overall Play Mode UI and listeners.
 * Called once when the application loads.
 */
export function initializePlayModeUI() {
    setupPlayModeListeners();
    resetPlayMode(); // Initial reset to show placeholder
    updateSaveStatusIndicator();
}
