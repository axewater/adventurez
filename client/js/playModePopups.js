// /client/js/playModePopups.js
// Handles popups in play mode, primarily the conversation popup.

import { sendPlayCommand } from './playModeCommands.js'; // Import sendPlayCommand

// --- DOM Elements ---
// Use the container ID from the HTML modal structure
const conversationPopup = document.getElementById('entity-image-popup'); // Reusing the modal container
const conversationPopupContent = document.getElementById('conversation-popup-content'); // Inner content div
const conversationNpcImage = document.getElementById('conversation-npc-image');
const conversationNpcName = document.getElementById('conversation-npc-name'); // Optional name display
const conversationNpcText = document.getElementById('conversation-npc-text');
const conversationOptionsList = document.getElementById('conversation-options');
const conversationQuestionInput = document.getElementById('conversation-question-input');
const conversationPopupCloseBtn = document.getElementById('conversation-popup-close');

// --- Popup State ---
let conversationActive = false;
// --- Popup Functions ---

/**
 * Shows the entity image popup with the specified image and description.
 * @param {string} imageFilename - The filename of the entity image.
 * @param {string} npcName - The name of the NPC.
 * @param {string} npcDialogue - The dialogue text of the NPC.
 * @param {string} nodeType - The type of conversation node ('options' or 'question').
 * @param {Array<{text: string}>} options - The available options for the player to choose from.
 */
export function showConversationPopup(imageFilename, npcName, npcDialogue, nodeType, options = []) {
    if (!conversationPopup || !conversationNpcImage || !conversationNpcText || !conversationOptionsList || !conversationQuestionInput) {
        console.warn("Conversation popup elements not found.");
        return;
    }

    conversationActive = true;

    // 1. Set NPC Image
    const imageUrl = `/uploads/images/entiteiten/${imageFilename}`;
    conversationNpcImage.src = imageFilename ? imageUrl : '/uploads/images/entiteiten/_default.png'; // Add a default?
    conversationNpcImage.alt = `Image for ${npcName}`;

    // 2. Set NPC Name (Optional)
    if (conversationNpcName) conversationNpcName.textContent = npcName;

    // 3. Set NPC Dialogue
    // Extract only the NPC's part if options are included in the message string
    // This assumes options are appended after a newline or specific separator
    const dialogueParts = npcDialogue.split('\n'); // Simple split, might need refinement
    conversationNpcText.textContent = dialogueParts[0]; // Assume first line is NPC text

    // 4. Handle Options or Question Input
    conversationOptionsList.innerHTML = ''; // Clear previous options
    conversationQuestionInput.style.display = 'none'; // Hide input by default
    conversationQuestionInput.value = ''; // Clear previous input

    if (nodeType === 'question') {
        conversationQuestionInput.style.display = 'block';
        conversationQuestionInput.placeholder = npcDialogue || "Typ je antwoord..."; // Use full text as prompt?
        conversationQuestionInput.focus();
    } else { // Default to 'options' node type
        // If options were passed separately (preferred)
        if (options && options.length > 0) {
            options.forEach((option, index) => {
                const li = document.createElement('li');
                li.textContent = `${index + 1}. ${option.text}`;
                li.dataset.choiceIndex = index + 1; // Store 1-based index
                li.addEventListener('click', handleOptionClick);
                conversationOptionsList.appendChild(li);
            });
        }
        // Fallback: Try parsing options from the message string if not passed separately
        else if (dialogueParts.length > 1) {
            dialogueParts.slice(1).forEach((line, index) => {
                line = line.trim();
                if (line.match(/^\d+\./)) { // Check if line starts with number and dot
                    const li = document.createElement('li');
                    li.textContent = line;
                    li.dataset.choiceIndex = index + 1; // Store 1-based index
                    li.addEventListener('click', handleOptionClick);
                    conversationOptionsList.appendChild(li);
                }
            });
        }
    }

    conversationPopup.classList.add('visible'); // Make the popup visible
    console.log(`Showing conversation popup for ${npcName}`);
}

/**
 * Hides the entity image popup and clears its content.
 */
export function hideConversationPopup() {
    if (!conversationPopup) return;
    conversationActive = false;

    conversationPopup.classList.remove('visible'); // Hide the popup

    // Clear content to prevent showing old data briefly on next open
    if (conversationNpcImage) conversationNpcImage.src = "";
    if (conversationNpcName) conversationNpcName.textContent = "";
    if (conversationNpcText) conversationNpcText.textContent = "";
    if (conversationOptionsList) conversationOptionsList.innerHTML = "";
    if (conversationQuestionInput) conversationQuestionInput.style.display = 'none';

    console.log("Hiding conversation popup.");
}

/** Checks if the conversation popup is currently active. */
export function isConversationActive() {
    return conversationActive;
}

// --- Event Handlers ---

/** Handles clicking on a conversation option. */
function handleOptionClick(event) {
    const choiceIndex = event.target.dataset.choiceIndex;
    if (choiceIndex) {
        console.log(`Conversation option clicked: ${choiceIndex}`);
        sendPlayCommand(choiceIndex.toString()); // Send the chosen index as the command
    }
}

/** Handles Enter key press in the question input field. */
function handleQuestionInputSubmit(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const answer = conversationQuestionInput.value.trim();
        if (answer) {
            console.log(`Conversation answer submitted: ${answer}`);
            sendPlayCommand(answer); // Send the typed answer as the command
            conversationQuestionInput.value = ''; // Clear input after sending
        }
    }
}


// --- Event Listener Setup ---

/**
 * Sets up the event listener for the popup close button.
 */
export function setupPopupListeners() {
    if (conversationPopupCloseBtn) {
        conversationPopupCloseBtn.addEventListener('click', () => {
            // Optionally send a "quit conversation" command or just hide
            hideConversationPopup();
            // Need to re-enable main input if closed manually
            import('./playModeUI.js').then(ui => ui.enableMainInput());
        });
    } else {
        console.warn("Conversation popup close button not found.");
    }

    // Add listener for Enter key in the question input
    if (conversationQuestionInput) {
        conversationQuestionInput.addEventListener('keydown', handleQuestionInputSubmit);
    }

    // Add listener for Escape key to close the popup
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isConversationActive()) {
            conversationPopupCloseBtn.click(); // Simulate click on close button
        }
    });
}
