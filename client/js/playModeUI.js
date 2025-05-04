// /client/js/playModeUI.js
// Handles UI updates for the Play Mode tab.

import * as state from './state.js';
import { showFlashMessage } from './uiUtils.js';
import { initializePlayMode, resetPlayMode as resetPlayModeCore } from './playMode.js'; // Import core logic

// --- DOM Elements ---
const playContentWrapper = document.getElementById('play-content-wrapper');
const playStartOverlay = document.getElementById('play-start-overlay');
const playStartImage = document.getElementById('play-start-image');
const playStartDescription = document.getElementById('play-start-description');
const playWinOverlay = document.getElementById('play-win-overlay');
const playWinImage = document.getElementById('play-win-image');
const playLossOverlay = document.getElementById('play-loss-overlay');
const playLossImage = document.getElementById('play-loss-image');
const playLossDescription = document.getElementById('play-loss-description');
const playWinDescription = document.getElementById('play-win-description');
const playRoomImage = document.getElementById('play-room-image');
const playerScoreDisplay = document.getElementById('player-score-display');
const toggleFullscreenBtn = document.getElementById('toggle-fullscreen-btn');
const playTabPlaceholder = document.querySelector('#play-tab p.placeholder');
const playOutputDiv = document.getElementById('play-output');
const playInput = document.getElementById('play-input');
const playInputContainer = document.getElementById('play-input-container');
const playControlsDiv = document.getElementById('play-controls');

// --- UI Update Functions ---

/**
 * Updates the room image displayed in play mode.
 * @param {string | null} imagePath - Relative path to the image or null for default.
 */
export function updateRoomImage(imagePath) {
    const defaultImagePath = '/uploads/images/kamers/standaard_kamer.png';
    const imageUrl = imagePath ? `/uploads/images/kamers/${imagePath}` : defaultImagePath;
    if (playRoomImage) playRoomImage.src = imageUrl;
}

/**
 * Updates the score display.
 * @param {number} score - The current player score.
 */
export function updateScoreDisplay(score) {
    if (playerScoreDisplay) {
        playerScoreDisplay.textContent = `Score: ${score}`;
        playerScoreDisplay.style.display = 'inline-block'; // Ensure visible
    }
}

/**
 * Shows the game won overlay with the appropriate image.
 * @param {string | null} winImagePath - Relative path to the win image or null for default.
 */
export async function showWinOverlay(winImagePath) {
    console.log("Game won! Showing win overlay.");
    if (playContentWrapper) playContentWrapper.style.display = 'none';
    if (playStartOverlay) playStartOverlay.style.display = 'none';
    if (playLossOverlay) playLossOverlay.style.display = 'none';

    if (playWinOverlay && playWinImage) {
        const defaultWinImage = '/uploads/avonturen/standaard_spel_win.png'; // Assuming a default win image exists
        playWinImage.src = winImagePath ? `/uploads/avonturen/${winImagePath}` : defaultWinImage;
        // Optional: Update win description if needed
        // if (playWinDescription) playWinDescription.textContent = "Custom win message?";
        playWinOverlay.style.display = 'flex';
    } else {
        console.error("Win overlay or image element not found!");
        // Fallback: Show a simple alert and reset
        alert("Gefeliciteerd! Je hebt gewonnen!");
        await resetGameAndUI(); // Call the combined reset function
    }
}

/**
 * Shows the game lost overlay with the appropriate image and reason.
 * @param {string | null} reason - The reason for the loss.
 * @param {string | null} lossImagePath - Relative path to the loss image or null for default.
 */
export async function showLossOverlay(reason, lossImagePath) {
    console.log("Game lost! Showing loss overlay.");
    if (playContentWrapper) playContentWrapper.style.display = 'none';
    if (playStartOverlay) playStartOverlay.style.display = 'none';
    if (playWinOverlay) playWinOverlay.style.display = 'none';

    if (playLossOverlay && playLossImage && playLossDescription) {
        const defaultLossImage = '/uploads/avonturen/standaard_verloren.jpg';
        playLossImage.src = lossImagePath ? `/uploads/avonturen/${lossImagePath}` : defaultLossImage;
        playLossDescription.textContent = reason || "Helaas, je hebt verloren."; // Show reason or default
        playLossOverlay.style.display = 'flex';
    } else {
        console.error("Loss overlay elements not found!");
        alert(`Helaas, je hebt verloren.\n${reason || ''}`);
        await resetGameAndUI();
    }
}

/**
 * Hides all overlays (start, win) and shows the main play content area.
 * Also resets the output div and focuses the input.
 */
export function showPlayContentArea() {
    if (playWinOverlay) playWinOverlay.style.display = 'none';
    if (playContentWrapper) {
        playContentWrapper.style.display = 'flex';
        if (playOutputDiv) playOutputDiv.innerHTML = '';
        if (playRoomImage) playRoomImage.style.display = 'block';
        if (playControlsDiv) playControlsDiv.style.display = 'flex';
        if (playerScoreDisplay) playerScoreDisplay.style.display = 'inline-block';
        if (playInputContainer) playInputContainer.style.display = 'flex';
        if (playInput) {
            playInput.disabled = false;
            playInput.value = '';
            playInput.placeholder = "Voer commando in...";
            playInput.focus();
        }
    }
    if (playStartOverlay) playStartOverlay.style.display = 'none';
    if (playLossOverlay) playLossOverlay.style.display = 'none';
}

/**
 * Shows the start overlay with game details.
 * @param {object} gameData - The game data containing name, description, start_image_path.
 */
export function showStartOverlay(gameData) {
    if (playTabPlaceholder) playTabPlaceholder.style.display = 'none';
    if (playContentWrapper) playContentWrapper.style.display = 'none';
    if (playLossOverlay) playLossOverlay.style.display = 'none';
    if (playWinOverlay) playWinOverlay.style.display = 'none';

    if (playStartOverlay && playStartImage && playStartDescription) {
        const startImagePath = gameData.start_image_path;
        const defaultStartImage = '/uploads/avonturen/standaard_spel_start.png';
        playStartImage.src = startImagePath ? `/uploads/avonturen/${startImagePath}` : defaultStartImage;
        playStartDescription.textContent = gameData.description || 'Klik op het plaatje om het spel te starten!';
        playStartOverlay.style.display = 'flex';
    } else {
        console.error("Start overlay elements not found!");
        // If overlay fails, maybe try starting game directly? Or show error.
        showFlashMessage("Fout bij weergeven startscherm.", 5000);
    }
}

/**
 * Resets the UI elements of the play mode tab to their initial state.
 * Hides content, shows placeholder.
 * @param {string} [message="Selecteer een spel om te beginnen met testen."] - Optional message for the placeholder.
 */
export function resetPlayModeUI(message = "Selecteer een spel om te beginnen met testen.") {
    console.log("Resetting Play Mode UI.");
    if (playTabPlaceholder) {
        playTabPlaceholder.textContent = message;
        playTabPlaceholder.style.display = 'block';
    }
    if (playStartOverlay) playStartOverlay.style.display = 'none';
    if (playWinOverlay) playWinOverlay.style.display = 'none';
    if (playLossOverlay) playLossOverlay.style.display = 'none';
    if (playContentWrapper) playContentWrapper.style.display = 'none';

    if (playControlsDiv) playControlsDiv.style.display = 'none';
    if (playerScoreDisplay) playerScoreDisplay.style.display = 'none';
    if (playRoomImage) playRoomImage.src = '/uploads/images/kamers/standaard_kamer.png'; // Reset image
    if (playOutputDiv) playOutputDiv.innerHTML = '';
    if (playInput) playInput.value = '';
}

/**
 * Enables the main command input field.
 */
export function enableMainInput() {
    if (playInput) {
        playInput.disabled = false;
        playInput.focus();
    }
}

/**
 * Disables the main command input field.
 */
export function disableMainInput() {
    if (playInput) {
        playInput.disabled = true;
    }
}

/**
 * Resets the game state via API and then resets the UI.
 * Typically called after winning or manually resetting.
 */
export async function resetGameAndUI() {
    console.log("Resetting game and UI after win or reset request.");
    if (playWinOverlay) playWinOverlay.style.display = 'none';
    if (playLossOverlay) playLossOverlay.style.display = 'none';

    // Re-initialize the play mode, which shows the start overlay or placeholder
    await initializePlayMode(); // Call the main initializer from playMode.js
}

// --- Event Listener Setup ---

/**
 * Sets up event listeners for UI elements specific to playModeUI.
 * @param {function} startGamePlayCallback - Function to call when start overlay is clicked.
 */
export function setupPlayModeUIListeners(startGamePlayCallback) {
    if (toggleFullscreenBtn) {
        toggleFullscreenBtn.addEventListener('click', () => {
            document.body.classList.toggle('playmode-fullscreen');
            const isFullscreen = document.body.classList.contains('playmode-fullscreen');
            toggleFullscreenBtn.innerHTML = isFullscreen ? '🔍' : '🔎'; // Change icon
            toggleFullscreenBtn.title = isFullscreen ? 'Verlaat Focus Modus (Toon UI)' : 'Focus Modus (Verberg UI)'; // Change title
        });
    } else {
        console.warn("Toggle fullscreen button not found.");
    }

    if (playStartOverlay) {
        playStartOverlay.addEventListener('click', startGamePlayCallback);
    } else {
        console.warn("Play start overlay element not found.");
    }

    if (playWinOverlay) {
        playWinOverlay.addEventListener('click', resetGameAndUI);
    } else {
        console.warn("Play win overlay element not found.");
    }

    if (playLossOverlay) {
        playLossOverlay.addEventListener('click', resetGameAndUI);
    } else {
        console.warn("Play loss overlay element not found.");
    }
}
