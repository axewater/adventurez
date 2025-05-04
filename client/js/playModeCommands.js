// /client/js/playModeCommands.js
// Handles player command input, history, and sending commands to the backend.

import * as api from './api.js';
import * as state from './state.js';
import * as ui from './playModeUI.js';
import * as popups from './playModePopups.js';
import * as conversationPopup from './playModePopups.js'; // Use a more specific name
import { showFlashMessage } from './uiUtils.js';

// --- DOM Elements ---
const playInput = document.getElementById('play-input');
const playOutputDiv = document.getElementById('play-output');
const historyPrevBtn = document.getElementById('history-prev-btn'); // Optional: Can be removed if only using arrow keys

// --- Command History State ---
let commandHistory = [];
let historyIndex = -1;
let currentInputBuffer = ""; // Stores input typed before navigating history

// --- Conversation State ---
// let isInConversation = false; // Now managed by conversationPopup state
let currentConversationNodeType = "options";

/**
 * Sends a command to the backend API and handles the response.
 * @param {string} command - The command string entered by the player.
 * @param {boolean} [isInitialization=false] - Flag indicating if this is the initial 'look' command.
 */
export async function sendPlayCommand(command, isInitialization = false) {
    let result = null; // Declare result outside the try block
    const gameId = state.selectedGameId;
    const roomId = state.currentPlayRoomId;

    if (!gameId || !roomId || !command || !playInput || !playOutputDiv) {
        console.error("Cannot send command: Missing gameId, roomId, command, or DOM elements.");
        return;
    }

    console.log(`Sending command: '${command}' from room: ${roomId}`);
    playInput.disabled = true; // Disable input while processing

    try {
        const response = await fetch(`/api/games/${gameId}/play/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: command, current_room_id: roomId })
        });
        result = await api.handleApiResponse(response); // Assign to the outer 'result'

        // Check for loss condition FIRST
        if (result.game_loss) {
            ui.updateScoreDisplay(result.current_score); // Update score one last time
            await ui.showLossOverlay(result.loss_reason, result.loss_image_path);
        } else if (result.game_won) { // Check for win condition if not lost
            ui.updateScoreDisplay(result.current_score); // Update score one last time
            await ui.showWinOverlay(result.win_image_path);
        } else {
            // Normal command processing
            const wasInConversation = conversationPopup.isConversationActive();
            const nowInConversation = result.in_conversation || false;
            currentConversationNodeType = result.node_type || "options";

            if (nowInConversation) {
                // Started or continuing conversation
                conversationPopup.showConversationPopup(
                    result.entity_image_path, // NPC image
                    result.npc_name || 'NPC', // NPC name (needs backend update)
                    result.message, // Includes NPC text and options/prompt
                    currentConversationNodeType,
                    result.options || [] // Pass options if available (needs backend update)
                );
                ui.disableMainInput(); // Disable main input
            } else if (wasInConversation && !nowInConversation) {
                // Conversation just ended
                conversationPopup.hideConversationPopup();
                ui.enableMainInput(); // Re-enable main input
                // Display the final message in the main output
                playOutputDiv.innerHTML += `\n<div style="white-space: pre-wrap;">${result.message}</div>\n`;
            } else {
                // Not in conversation, normal command
                ui.updateRoomImage(result.image_path); // Update room image only if not in convo

                // Add command echo and response to output
                if (!isInitialization) {
                    playOutputDiv.innerHTML += `\n<span style="color: #007bff;">&gt; ${command}</span>\n`;
                }
                playOutputDiv.innerHTML += `\n<div style="white-space: pre-wrap;">${result.message}</div>\n`;

                // Update input placeholder for normal commands
                playInput.placeholder = "Voer commando in...";
            }

            // Update score and show points flash message (always)
            ui.updateScoreDisplay(result.current_score);
            if (result.points_awarded && result.points_awarded > 0) {
                showFlashMessage(`+${result.points_awarded} Punten`, 4000);
            }

            // Update current room ID in state
            state.setCurrentPlayRoomId(result.current_room_id);

            // Scroll output to bottom
            playOutputDiv.scrollTop = playOutputDiv.scrollHeight;
        }

    } catch (error) {
        console.error("Failed to send play command:", error);
        playOutputDiv.innerHTML += `\n<span style="color: red;">Fout bij het verwerken van het commando.</span>\n`;
        playOutputDiv.scrollTop = playOutputDiv.scrollHeight;
        // Optionally reset conversation state on error?
        conversationPopup.hideConversationPopup(); // Hide popup on error
        // playInput.placeholder = "Voer commando in...";
    } finally {
        // Re-enable input only if not in a win state
        if (result && !result.game_won && !result.game_loss) { // Check if result exists before accessing properties
             playInput.disabled = false;
             playInput.focus();
        }
    }
}

/**
 * Resets the command history state.
 */
export function resetCommandHistory() {
    commandHistory = [];
    historyIndex = -1;
    currentInputBuffer = "";
    // isInConversation = false; // Handled by conversationPopup state
    currentConversationNodeType = "options";
}

/**
 * Sets up event listeners for the command input field (Enter, Arrow keys).
 */
export function setupCommandInputListeners() {
    if (playInput) {
        playInput.addEventListener('keydown', async (event) => {
            if (playInput.disabled || conversationPopup.isConversationActive()) return; // Ignore if disabled OR conversation popup is active

            if (event.key === 'Enter') {
                event.preventDefault();
                const command = playInput.value.trim();
                if (command) {
                    // Add to history only if different from the last command
                    if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== command) {
                        commandHistory.push(command);
                    }
                    historyIndex = -1; // Reset history navigation index
                    currentInputBuffer = ""; // Clear buffer
                    playInput.value = ''; // Clear input field
                    await sendPlayCommand(command); // Send the command
                }
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (commandHistory.length > 0) {
                    if (historyIndex === -1) {
                        // Starting history navigation, save current input
                        currentInputBuffer = playInput.value;
                        historyIndex = commandHistory.length - 1; // Start from the last command
                    } else if (historyIndex > 0) {
                        // Move further back in history
                        historyIndex--;
                    }
                    // Update input field with history item
                    playInput.value = commandHistory[historyIndex];
                    // Move cursor to end (using setTimeout to ensure it happens after value update)
                    setTimeout(() => playInput.selectionStart = playInput.selectionEnd = playInput.value.length, 0);
                }
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (historyIndex !== -1) { // Only act if navigating history
                    if (historyIndex < commandHistory.length - 1) {
                        // Move forward in history
                        historyIndex++;
                        playInput.value = commandHistory[historyIndex];
                    } else {
                        // Reached the end of history, restore original buffer
                        historyIndex = -1;
                        playInput.value = currentInputBuffer;
                    }
                    // Move cursor to end
                    setTimeout(() => playInput.selectionStart = playInput.selectionEnd = playInput.value.length, 0);
                }
            } else {
                // Any other key press while navigating history should reset the index
                // Use setTimeout to check after the key press has potentially modified the value
                 setTimeout(() => {
                     if (historyIndex !== -1) {
                         // If user starts typing something new, stop history navigation
                         // We assume if the value is different from the history item, they started typing
                         if (playInput.value !== commandHistory[historyIndex]) {
                            historyIndex = -1;
                            currentInputBuffer = ""; // Clear buffer as they are typing new input
                            console.log("Reset history index due to typing.");
                         }
                     }
                 }, 0);
            }
        });
    } else {
        console.warn("Play mode input element not found.");
    }

    // Optional: Listener for the history button if kept
    if (historyPrevBtn) {
        historyPrevBtn.addEventListener('click', () => {
            // Simulate ArrowUp key press logic
             if (commandHistory.length > 0) {
                if (historyIndex === -1) {
                    currentInputBuffer = playInput.value;
                    historyIndex = commandHistory.length - 1;
                } else if (historyIndex > 0) {
                    historyIndex--;
                }
                playInput.value = commandHistory[historyIndex];
                playInput.focus();
                setTimeout(() => playInput.selectionStart = playInput.selectionEnd = playInput.value.length, 0);
            }
        });
    }
}
