// /client/js/playMode.js
import * as api from './api.js';
import * as state from './state.js';
import { renderGameList } from './gameManager.js';
import { dispatchGameDataChangedEvent, updateSaveStatusIndicator, showFlashMessage } from './uiUtils.js';

// --- DOM Elements ---
const playTab = document.getElementById('play-tab');
const playTabPlaceholder = document.querySelector('#play-tab p.placeholder');
const playStartOverlay = document.getElementById('play-start-overlay');
const playStartImage = document.getElementById('play-start-image');
const playStartDescription = document.getElementById('play-start-description');
const playWinOverlay = document.getElementById('play-win-overlay');
const playWinImage = document.getElementById('play-win-image');
const playWinDescription = document.getElementById('play-win-description');
const playContentWrapper = document.getElementById('play-content-wrapper');
const playOutputDiv = document.getElementById('play-output');
const playInput = document.getElementById('play-input');
const playInputContainer = document.getElementById('play-input-container');
const playControlsDiv = document.getElementById('play-controls'); // Container for buttons
const saveGameBtn = document.getElementById('save-game-btn');
const loadGameBtn = document.getElementById('load-game-btn');
const resetGameBtn = document.getElementById('reset-game-btn');
const historyPrevBtn = document.getElementById('history-prev-btn');
const playRoomImage = document.getElementById('play-room-image');
const playerScoreDisplay = document.getElementById('player-score-display');
const toggleFullscreenBtn = document.getElementById('toggle-fullscreen-btn');

// --- Entity Image Popup Elements ---
const entityImagePopup = document.getElementById('entity-image-popup');
const entityImagePopupImg = document.getElementById('entity-image-popup-img');
const entityImagePopupDescription = document.getElementById('entity-image-popup-description');
const entityImagePopupCloseBtn = document.getElementById('entity-image-popup-close');

// --- Play Mode State ---
let commandHistory = [];
let historyIndex = -1;
let currentInputBuffer = "";

let isInConversation = false;
let currentConversationNodeType = "options";

// --- Helper Functions ---

function updateRoomImage(imagePath) {
    const defaultImagePath = '/uploads/images/kamers/standaard_kamer.png';
    const imageUrl = imagePath ? `/uploads/images/kamers/${imagePath}` : defaultImagePath;
    if (playRoomImage) playRoomImage.src = imageUrl;
}

function showEntityImagePopup(imageFilename, descriptionText) {
    if (!entityImagePopup || !entityImagePopupImg || !entityImagePopupDescription) return;

    const imageUrl = `/uploads/images/entiteiten/${imageFilename}`;
    entityImagePopupImg.src = imageUrl;
    entityImagePopupImg.alt = `Image for ${imageFilename}`;

    entityImagePopupDescription.textContent = descriptionText;

    entityImagePopup.classList.add('visible');
    console.log(`Showing entity image popup: ${imageUrl}`);
}

function hideEntityImagePopup() {
    if (!entityImagePopup) return;
    entityImagePopup.classList.remove('visible');
    if (entityImagePopupImg) entityImagePopupImg.src = "";
    if (entityImagePopupDescription) entityImagePopupDescription.textContent = "";
    console.log("Hiding entity image popup.");
}

function updateScoreDisplay(score) {
    if (playerScoreDisplay) {
        playerScoreDisplay.textContent = `Score: ${score}`;
        playerScoreDisplay.style.display = 'inline-block';
    }
}

async function showWinOverlay(winImagePath) {
    console.log("Game won! Showing win overlay.");
    if (playContentWrapper) playContentWrapper.style.display = 'none';
    if (playStartOverlay) playStartOverlay.style.display = 'none';

    if (playWinOverlay && playWinImage) {
        const defaultWinImage = '/uploads/avonturen/standaard_spel_win.png';
        playWinImage.src = winImagePath ? `/uploads/avonturen/${winImagePath}` : defaultWinImage;
        playWinOverlay.style.display = 'flex';
    } else {
        console.error("Win overlay or image element not found!");
        // Fallback: Show a simple alert and reset
        alert("Gefeliciteerd! Je hebt gewonnen!");
        await resetGameAndUI();
    }
}

async function resetGameAndUI() {
    console.log("Resetting game and UI after win or reset request.");
    if (playWinOverlay) playWinOverlay.style.display = 'none'; // Hide win overlay

    const gameId = state.selectedGameId;
    if (gameId) {
        // Call backend reset (optional, but good for consistency if reset button does it)
        // await fetch(`/api/games/${gameId}/play/reset`, { method: 'POST' });
    }
    // Re-initialize the play mode, which shows the start overlay
    await initializePlayMode();
}

// --- Play Mode Logic ---

export async function initializePlayMode() {
    if (!state.selectedGameId) {
        resetPlayMode();
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

    console.log(`Initializing Play Mode for game: ${currentGame.name}. Start room: ${startRoom.title}`);

    if (playTabPlaceholder) playTabPlaceholder.style.display = 'none';
    if (playContentWrapper) playContentWrapper.style.display = 'none';
    if (playWinOverlay) playWinOverlay.style.display = 'none'; // Ensure win overlay is hidden
    if (playStartOverlay && playStartImage) {
        const startImagePath = currentGame.start_image_path;
        const defaultStartImage = '/uploads/avonturen/standaard_spel_start.png';
        playStartImage.src = startImagePath ? `/uploads/avonturen/${startImagePath}` : defaultStartImage;
        playStartDescription.textContent = currentGame.description || 'Klik op het plaatje om het spel te starten!';
        playStartOverlay.style.display = 'flex';
    } else {
        console.error("Start overlay or image element not found!");
        await startGamePlay();
    }
}

async function startGamePlay() {
    const startRoom = state.currentRooms.length > 0 ? state.currentRooms[0] : null;
    if (!startRoom) {
        console.error("Cannot start game play: Start room not found.");
        return;
    }

    console.log(`Starting gameplay. Room: ${startRoom.title} (${startRoom.id})`);
    state.setCurrentPlayRoomId(startRoom.id);

    if (playStartOverlay) playStartOverlay.style.display = 'none';
    if (playWinOverlay) playWinOverlay.style.display = 'none'; // Ensure win overlay is hidden
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

    await sendPlayCommand('kijk', true);
}

export function resetPlayMode(message = "Selecteer een spel om te beginnen met testen.") {
    isInConversation = false;
    currentConversationNodeType = "options";
    console.log("Resetting Play Mode.");
    state.setCurrentPlayRoomId(null);

    if (playTabPlaceholder) {
        playTabPlaceholder.textContent = message;
        playTabPlaceholder.style.display = 'block';
    }
    if (playStartOverlay) playStartOverlay.style.display = 'none';
    if (playWinOverlay) playWinOverlay.style.display = 'none'; // Hide win overlay on reset
    if (playContentWrapper) playContentWrapper.style.display = 'none';

    if (playControlsDiv) {
        playControlsDiv.style.display = 'none';
    }
    if (playerScoreDisplay) {
        playerScoreDisplay.style.display = 'none';
    }
    commandHistory = [];
    historyIndex = -1;
}

async function sendPlayCommand(command, isInitialization = false) {
    const gameId = state.selectedGameId;
    const roomId = state.currentPlayRoomId;

    if (!gameId || !roomId || !command || !playInput || !playOutputDiv) return;

    console.log(`Sending command: '${command}' from room: ${roomId}`);
    playInput.disabled = true;

    try {
        const response = await fetch(`/api/games/${gameId}/play/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: command, current_room_id: roomId })
        });
        const result = await api.handleApiResponse(response);

        // Check for win condition FIRST
        if (result.game_won) {
            updateScoreDisplay(result.current_score); // Update score one last time
            await showWinOverlay(result.win_image_path);
        } else {
            // Normal command processing
            isInConversation = result.in_conversation || false;
            currentConversationNodeType = result.node_type || "options";

            updateRoomImage(result.image_path);

            if (result.entity_image_path) {
                showEntityImagePopup(result.entity_image_path, result.message);
            } else {
                hideEntityImagePopup();
            }

            updateScoreDisplay(result.current_score);

            if (result.points_awarded && result.points_awarded > 0) {
                showFlashMessage(`+${result.points_awarded} Punten`, 4000);
            }

            if (!isInitialization) {
                playOutputDiv.innerHTML += `\n<span style="color: #007bff;">&gt; ${command}</span>\n`;
            }
            playOutputDiv.innerHTML += `\n<div style="white-space: pre-wrap;">${result.message}</div>\n`;

            if (isInConversation) {
                playInput.placeholder = (currentConversationNodeType === "question")
                    ? "Geef je antwoord..."
                    : "Voer keuze (nummer) in...";
            } else {
                playInput.placeholder = "Voer commando in...";
            }
        }

        state.setCurrentPlayRoomId(result.current_room_id);

        playOutputDiv.scrollTop = playOutputDiv.scrollHeight;

    } catch (error) {
        console.error("Failed to send play command:", error);
        playOutputDiv.innerHTML += `\n<span style="color: red;">Fout bij het verwerken van het commando.</span>\n`;
    } finally {
        playInput.disabled = false;
        playInput.focus();
    }
}

function setupPlayModeListeners() {
    if (playInput) {
        playInput.addEventListener('keydown', async (event) => {
            if (playInput.disabled) return;

            if (event.key === 'Enter') {
                event.preventDefault();
                const command = playInput.value.trim();
                if (command) {
                    if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== command) {
                        commandHistory.push(command);
                    }
                    historyIndex = -1;
                    currentInputBuffer = "";
                    playInput.value = '';
                    await sendPlayCommand(command);
                }
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (commandHistory.length > 0) {
                    if (historyIndex === -1) {
                        currentInputBuffer = playInput.value;
                        historyIndex = commandHistory.length - 1;
                    } else if (historyIndex > 0) {
                        historyIndex--;
                    }
                    playInput.value = commandHistory[historyIndex];
                    setTimeout(() => playInput.selectionStart = playInput.selectionEnd = playInput.value.length, 0);
                }
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (historyIndex !== -1) {
                    if (historyIndex < commandHistory.length - 1) {
                        historyIndex++;
                        playInput.value = commandHistory[historyIndex];
                    } else {
                        historyIndex = -1;
                        playInput.value = currentInputBuffer;
                    }
                    setTimeout(() => playInput.selectionStart = playInput.selectionEnd = playInput.value.length, 0);
                }
            } else {
                 setTimeout(() => {
                     if (historyIndex !== -1) {
                         historyIndex = -1;
                         currentInputBuffer = "";
                         console.log("Reset history index due to typing.");
                     }
                 }, 0);
            }
        });
    } else {
        console.warn("Play mode input element not found.");
    }

    if (saveGameBtn) {
        saveGameBtn.addEventListener('click', async () => {
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
                    body: JSON.stringify({ current_room_id: roomId })
                });
                const result = await api.handleApiResponse(response);
                showFlashMessage(result.message || "Spel opgeslagen!", 4000); // Use flash message

                // Update game list UI
                const gameIndex = state.games.findIndex(g => g.id === gameId);
                if (gameIndex !== -1) {
                    state.games[gameIndex].has_saved_game = true;
                    renderGameList(); // Re-render the list to show the save icon
                }
            } catch (error) {
                console.error("Failed to save game:", error);
                showFlashMessage("Fout bij opslaan spel.", 5000); // Use flash message for error
            }
        });
    } else {
         console.warn("Save game button not found.");
    }

    if (loadGameBtn) {
        loadGameBtn.addEventListener('click', async () => {
            const gameId = state.selectedGameId;
            if (!gameId) {
                showFlashMessage("Kan niet laden: Geen spel geselecteerd.", 5000);
                return;
            }
            console.log("Loading game state...");
            try {
                const response = await fetch(`/api/games/${gameId}/play/load`);
                const result = await api.handleApiResponse(response);
                state.setCurrentPlayRoomId(result.current_room_id);
                updateRoomImage(result.image_path);
                updateScoreDisplay(result.current_score);
                showFlashMessage("Spel geladen!", 4000); // Use flash message
                // The room description is now part of the result.message from the backend
                // We still need to display it in the main output area.
                if (playOutputDiv) playOutputDiv.innerHTML = '';
                await sendPlayCommand('kijk', true); // 'kijk' will display the room description from the backend
            } catch (error) {
                console.error("Failed to load game:", error);
                showFlashMessage("Fout bij laden spel. Mogelijk geen opgeslagen spel aanwezig.", 5000); // Use flash message for error
            }
        });
    } else {
         console.warn("Load game button not found.");
    }

    if (resetGameBtn) {
        resetGameBtn.addEventListener('click', async () => {
            const gameId = state.selectedGameId;
            if (!gameId) {
                showFlashMessage("Kan niet resetten: Geen spel geselecteerd.", 5000);
                return;
            }
            if (confirm("Weet je zeker dat je de huidige speelsessie wilt resetten? Alle voortgang (inventaris, variabelen) gaat verloren.")) {
                console.log("Resetting game session...");
                try {
                    const response = await fetch(`/api/games/${gameId}/play/reset`, { method: 'POST' });
                    await api.handleApiResponse(response);
                    showFlashMessage("Spel gereset. Je begint opnieuw.", 4000); // Use flash message
                    await resetGameAndUI();
                } catch (error) {
                    console.error("Failed to reset game:", error);
                    showFlashMessage("Fout bij resetten spel.", 5000);
                }
            }
        });
    } else {
        console.warn("Reset game button not found.");
    }

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

    if (entityImagePopupCloseBtn) {
        entityImagePopupCloseBtn.addEventListener('click', hideEntityImagePopup);
    } else {
        console.warn("Entity image popup close button not found.");
    }

    if (playStartOverlay) {
        playStartOverlay.addEventListener('click', startGamePlay);
    } else {
        console.warn("Play start overlay element not found.");
    }

    if (playWinOverlay) {
        playWinOverlay.addEventListener('click', resetGameAndUI);
    } else {
        console.warn("Play win overlay element not found.");
    }

    document.addEventListener('gameDataChanged', handleGameDataChange);
}

function handleGameDataChange(event) {
    const playTabActive = playTab?.classList.contains('active');
    const playModeInitialized = state.currentPlayRoomId !== null;

    if (playTabActive && playModeInitialized) {
        isInConversation = false;
        console.log("Game data changed while Play Mode is active. Source:", event.detail.source);
        showFlashMessage("Spelgegevens zijn gewijzigd. Start Play Mode opnieuw om updates te zien!", 5000);
    }
}

export function initializePlayModeUI() {
    setupPlayModeListeners();
    resetPlayMode();
    updateSaveStatusIndicator();
}
