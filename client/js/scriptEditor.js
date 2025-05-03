// /client/js/scriptEditor.js
import * as api from './api.js';
import * as state from './state.js';
import * as uiUtils from './uiUtils.js';
import { dispatchGameDataChangedEvent } from './uiUtils.js';
import { updateSaveStatusIndicator } from './uiUtils.js';

// --- DOM Elements ---
const scriptsTabPlaceholder = document.getElementById('scripts-tab-placeholder');
const scriptEditorContent = document.getElementById('script-editor-content');
const scriptListUl = document.getElementById('script-list-ul');
const addScriptBtn = document.getElementById('add-script-btn');
const scriptDetailsPanel = document.getElementById('script-details-panel');
const scriptSearchInput = document.getElementById('script-search-input');
const scriptDetailsPlaceholder = document.getElementById('script-details-placeholder');
const scriptDetailsForm = document.getElementById('script-details-form');
const scriptTriggerInput = document.getElementById('script-trigger-input');
const scriptConditionTextarea = document.getElementById('script-condition-textarea');
const scriptActionTextarea = document.getElementById('script-action-textarea');
const saveScriptBtn = document.getElementById('save-script-btn');
const deleteScriptBtn = document.getElementById('delete-script-btn');

// --- Core Functions ---

/**
 * Load scripts for the selected game and display the editor UI.
 * Called by gameManager when a game is selected.
 * @param {string} gameId - The UUID of the game to load scripts for.
 */
export async function loadScriptsUI(gameId) {
    console.log(`Loading scripts UI for game ${gameId}`);
    state.setSelectedGameId(gameId); // Ensure gameId is tracked if needed elsewhere

    if (!gameId) {
        clearScriptsUI();
        return;
    }

    // Ensure elements exist before manipulating style
    if (scriptsTabPlaceholder) scriptsTabPlaceholder.style.display = 'none';
    if (scriptEditorContent) scriptEditorContent.style.display = 'flex'; // Use flex based on HTML layout
    else {
        console.error("Script editor content element not found!");
        return;
    }

    await fetchScriptsForGame(gameId);
    clearScriptDetailsPanel(); // Ensure details are cleared initially
}

/**
 * Fetches scripts for the given game from the API and updates state.
 * @param {string} gameId - The UUID of the game.
 */
async function fetchScriptsForGame(gameId) {
    if (!gameId) return;
    console.log(`Fetching scripts for game ${gameId}`);
    try {
        const response = await fetch(`/api/games/${gameId}/scripts`);
        const fetchedScripts = await api.handleApiResponse(response);
        state.setCurrentScripts(fetchedScripts); // Update state
        console.log("Scripts fetched:", state.currentScripts);
        renderScriptList();
    } catch (error) {
        console.error(`Failed to fetch scripts for game ${gameId}:`, error);
        if (scriptListUl) {
            scriptListUl.innerHTML = '<li>Error loading scripts.</li>';
        }
        state.setCurrentScripts([]);
    }
}

/**
 * Renders the list of scripts based on the current state.
 */
function renderScriptList() {
    if (!scriptListUl) return;

    // Get search term
    const searchTerm = scriptSearchInput?.value.toLowerCase() || '';

    scriptListUl.innerHTML = ''; // Clear list

    // Filter scripts based on search term
    const filteredScripts = state.currentScripts.filter(script => {
        if (!searchTerm) return true; // Show all if search is empty
        const triggerMatch = script.trigger?.toLowerCase().includes(searchTerm);
        const conditionMatch = script.condition?.toLowerCase().includes(searchTerm);
        const actionMatch = script.action?.toLowerCase().includes(searchTerm);
        return triggerMatch || conditionMatch || actionMatch;
    });

    if (filteredScripts.length === 0) {
        scriptListUl.innerHTML = '<li>No scripts created yet.</li>';
    } else {
        const sortedScripts = [...filteredScripts].sort((a, b) => a.trigger.localeCompare(b.trigger));
        sortedScripts.forEach(script => {
            const li = document.createElement('li');
            // Display trigger or a placeholder if trigger is very long/complex
            const displayTrigger = script.trigger.length > 30 ? script.trigger.substring(0, 27) + '...' : script.trigger;
            li.textContent = displayTrigger;
            li.title = script.trigger; // Show full trigger on hover
            li.dataset.scriptId = script.id;
            li.style.cursor = 'pointer'; // Add pointer cursor
            li.style.padding = '8px';
            li.style.marginBottom = '4px';
            li.style.border = '1px solid #eee';
            li.style.borderRadius = '3px';
            li.addEventListener('click', () => selectScript(script.id));
            if (state.selectedScript && script.id === state.selectedScript.id) {
                li.classList.add('selected'); // Apply selected style (needs CSS)
                li.style.backgroundColor = '#e0f2f7'; // Example selected style
                li.style.borderColor = '#b3e5fc';
            } else {
                 li.style.backgroundColor = '#f9f9f9'; // Default background
                 li.addEventListener('mouseenter', () => li.style.backgroundColor = '#efefef');
                 li.addEventListener('mouseleave', () => {
                     if (!li.classList.contains('selected')) {
                        li.style.backgroundColor = '#f9f9f9';
                     }
                 });
            }
            scriptListUl.appendChild(li);
        });
    }
}

/**
 * Handles selecting a script from the list, fetching its details.
 * @param {string} scriptId - The UUID of the script to select.
 */
async function selectScript(scriptId) {
    if (state.selectedScript && state.selectedScript.id === scriptId) return; // Avoid re-selecting

    console.log(`Selecting script ${scriptId}`);
    // Clear previous selection highlight immediately
    const previouslySelected = scriptListUl?.querySelector('li.selected');
    if (previouslySelected) {
        previouslySelected.classList.remove('selected');
        previouslySelected.style.backgroundColor = '#f9f9f9'; // Reset background
        previouslySelected.style.borderColor = '#eee';
    }

    try {
        // Fetch full details (might be redundant if list data is sufficient, but safer)
        const response = await fetch(`/api/scripts/${scriptId}`);
        const scriptData = await api.handleApiResponse(response);
        state.setSelectedScript(scriptData); // Update state
        console.log("Selected script details:", state.selectedScript);
        renderScriptDetails(state.selectedScript);
        // Highlight the newly selected item
        const newlySelectedItem = scriptListUl?.querySelector(`li[data-script-id="${scriptId}"]`);
        if (newlySelectedItem) {
            newlySelectedItem.classList.add('selected');
            newlySelectedItem.style.backgroundColor = '#e0f2f7'; // Selected style
            newlySelectedItem.style.borderColor = '#b3e5fc';
        }
    } catch (error) {
        console.error(`Failed to fetch details for script ${scriptId}:`, error);
        clearScriptDetailsPanel();
        state.setSelectedScript(null);
    }
}

/**
 * Renders the details of the selected script in the form.
 * @param {object} scriptData - The full script object.
 */
function renderScriptDetails(scriptData) {
    if (!scriptData || !scriptDetailsForm || !scriptDetailsPlaceholder) {
        clearScriptDetailsPanel();
        return;
    }
    scriptDetailsPlaceholder.style.display = 'none';
    scriptDetailsForm.style.display = 'block'; // Or 'flex' if needed

    // Populate the separate fields
    if (scriptTriggerInput) scriptTriggerInput.value = scriptData.trigger || '';
    if (scriptConditionTextarea) scriptConditionTextarea.value = scriptData.condition || '';
    if (scriptActionTextarea) scriptActionTextarea.value = scriptData.action || '';
}

/**
 * Clears the script details panel.
 */
function clearScriptDetailsPanel() {
    state.setSelectedScript(null); // Clear selected script state
    if (scriptDetailsForm) {
        scriptDetailsForm.style.display = 'none';
        scriptDetailsForm.reset(); // Clear form fields
    }
    if (scriptDetailsPlaceholder) {
        scriptDetailsPlaceholder.style.display = 'block'; // Or 'flex'
    }
    // Remove selection highlight from the list
    const selectedLi = scriptListUl?.querySelector('li.selected');
    if (selectedLi) {
        selectedLi.classList.remove('selected');
        selectedLi.style.backgroundColor = '#f9f9f9'; // Reset background
        selectedLi.style.borderColor = '#eee';
    }
}

/**
 * Clears the entire script editor UI.
 * Called by uiUtils.clearEditorPanes when a game is closed/deleted.
 */
export function clearScriptsUI() {
    console.log("Clearing script editor UI...");
    // state.setSelectedGameId(null); // Game ID is cleared by clearEditorPanes
    state.setCurrentScripts([]);
    state.setSelectedScript(null);
    if (scriptEditorContent) scriptEditorContent.style.display = 'none';
    if (scriptsTabPlaceholder) scriptsTabPlaceholder.style.display = 'block'; // Or 'flex'
    if (scriptListUl) scriptListUl.innerHTML = '';
    clearScriptDetailsPanel();
}

// --- Event Listeners ---

async function handleAddScript() {
    const currentGameId = state.selectedGameId; // Get current game ID from state
    if (!currentGameId) return;

    const defaultTrigger = `New Trigger ${state.currentScripts.length + 1}`;
    const defaultCondition = ''; // No default condition
    const defaultAction = 'SHOW_MESSAGE("New script action")';
    console.log(`Adding new script to game ${currentGameId}`);

    try {
        const response = await fetch(`/api/games/${currentGameId}/scripts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json'},
            body: JSON.stringify({
                trigger: defaultTrigger,
                condition: '', // Default empty condition
                action: defaultAction
            })
        });
        const newScript = await api.handleApiResponse(response);
        console.log("Script created:", newScript);
        state.setCurrentScripts([...state.currentScripts, newScript]); // Add to local cache
        renderScriptList(); // Update list display
        selectScript(newScript.id); // Select the newly created script
        state.setUnsavedChanges(false); // New script is saved immediately
        updateSaveStatusIndicator(); // Update UI
        dispatchGameDataChangedEvent('scriptEditorAdd'); // Signal change
    } catch (error) {
        console.error("Failed to add script:", error);
        // Alert handled by handleApiResponse
    }
}

async function handleSaveScript(event) {
    event.preventDefault(); // Prevent default form submission
    if (!state.selectedScript || !state.selectedGameId) return;

    // Read values from the separate input fields
    const trigger = scriptTriggerInput?.value.trim();
    const condition = scriptConditionTextarea?.value.trim(); // Keep empty string if blank
    const action = scriptActionTextarea?.value.trim();

    // Basic validation
    if (!trigger) {
        uiUtils.showFlashMessage("Script 'Trigger' cannot be empty.", 5000);
        scriptTriggerInput?.focus();
        return;
    }
    if (!action) {
        uiUtils.showFlashMessage("Script 'Action' cannot be empty.", 5000);
        scriptActionTextarea?.focus();
        return;
    }

    const updatedData = {
        trigger: trigger,
        condition: condition || null, // Send null if condition is empty/whitespace
        action: action
    };

    console.log(`Saving changes for script ${state.selectedScript.id}:`, updatedData);
    try {
        const response = await fetch(`/api/scripts/${state.selectedScript.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        const updatedScriptData = await api.handleApiResponse(response);
        console.log("Script updated:", updatedScriptData);

        // Update local cache (state)
        const index = state.currentScripts.findIndex(s => s.id === state.selectedScript.id);
        const updatedScripts = [...state.currentScripts];
        if (index !== -1) {
            updatedScripts[index] = updatedScriptData;
        }
        state.setCurrentScripts(updatedScripts);
        state.setSelectedScript(updatedScriptData); // Update the selected script object

        // Re-render the list to reflect potential trigger changes
        renderScriptList();
        // Re-render details (might be redundant, but safe)
        renderScriptDetails(state.selectedScript);

        state.setUnsavedChanges(false); // Reset unsaved changes flag
        updateSaveStatusIndicator(); // Update UI
        uiUtils.showFlashMessage("Script saved successfully!"); // Use flash message

    } catch (error) {
        console.error(`Failed to save script ${state.selectedScript.id}:`, error);
        // Alert handled by handleApiResponse
    }
}

async function handleDeleteScript() {
    if (!state.selectedScript || !state.selectedGameId) return;

    if (confirm(`Are you sure you want to delete the script triggered by "${state.selectedScript.trigger}"?`)) {
        console.log(`Deleting script ${state.selectedScript.id}`);
        const scriptIdToDelete = state.selectedScript.id; // Store ID before clearing selection
        try {
            const response = await fetch(`/api/scripts/${scriptIdToDelete}`, {
                method: 'DELETE'
            });
            await api.handleApiResponse(response); // Checks for errors, expects 204

            console.log("Script deleted:", scriptIdToDelete);

            // Remove from local cache (state)
            state.setCurrentScripts(state.currentScripts.filter(s => s.id !== scriptIdToDelete));

            // Clear details panel and update list
            clearScriptDetailsPanel(); // This also clears selectedScript state
            renderScriptList();

            state.setUnsavedChanges(false); // Changes are gone (deleted)
            updateSaveStatusIndicator(); // Update UI
            uiUtils.showFlashMessage("Script deleted successfully."); // Use flash message

        } catch (error) {
            console.error(`Failed to delete script ${scriptIdToDelete}:`, error);
            // Alert handled by handleApiResponse
        }
    }
}

// --- NEW: Helper Icon Logic ---

/**
 * Inserts text into a textarea at the current cursor position or appends it.
 * Adds a newline before the text if the textarea is not empty.
 * @param {HTMLTextAreaElement} textarea - The target textarea element.
 * @param {string} textToInsert - The text to insert.
 */
function insertTextAtCursor(textarea, textToInsert) {
    if (!textarea) return;

    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const currentText = textarea.value;
    const textBefore = currentText.substring(0, startPos);
    const textAfter = currentText.substring(endPos, currentText.length);

    // Add newline if inserting into non-empty textarea at start or end
    let prefix = "";
    if (currentText.length > 0 && (startPos === 0 || startPos === currentText.length)) {
        prefix = "\n";
    }

    textarea.value = textBefore + prefix + textToInsert + textAfter;

    // Move cursor to the end of the inserted text
    textarea.selectionStart = textarea.selectionEnd = startPos + prefix.length + textToInsert.length;
    textarea.focus(); // Keep focus on the textarea

    // Trigger input event to mark unsaved changes
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Creates and shows a temporary dropdown list near a target element.
 * @param {HTMLElement} targetElement - The element near which to show the dropdown (e.g., textarea).
 * @param {Array<object>} items - Array of { label: string, value: string } objects for dropdown options.
 * @param {function(string)} onSelectCallback - Function to call when an item is selected, passing the selected value.
 */
function showTemporaryDropdown(targetElement, items, onSelectCallback) {
    // Remove existing dropdown first
    const existingDropdown = document.getElementById('temp-script-dropdown');
    if (existingDropdown) existingDropdown.remove();

    const dropdown = document.createElement('div');
    dropdown.id = 'temp-script-dropdown';
    dropdown.style.position = 'absolute';
    dropdown.style.border = '1px solid #ccc';
    dropdown.style.backgroundColor = 'white';
    dropdown.style.maxHeight = '150px';
    dropdown.style.overflowY = 'auto';
    dropdown.style.zIndex = '100'; // Ensure it's above textareas

    const targetRect = targetElement.getBoundingClientRect();
    dropdown.style.left = `${targetRect.left + window.scrollX}px`;
    dropdown.style.top = `${targetRect.bottom + window.scrollY + 2}px`; // Position below the element

    items.forEach(item => {
        const option = document.createElement('div');
        option.textContent = item.label;
        option.style.padding = '5px 10px';
        option.style.cursor = 'pointer';
        option.addEventListener('mouseenter', () => option.style.backgroundColor = '#f0f0f0');
        option.addEventListener('mouseleave', () => option.style.backgroundColor = 'white');
        option.addEventListener('click', () => {
            onSelectCallback(item.value);
            dropdown.remove(); // Close dropdown on selection
        });
        dropdown.appendChild(option);
    });

    document.body.appendChild(dropdown);

    // Close dropdown if clicking outside
    setTimeout(() => { // Use timeout to avoid immediate closing from the icon click
        document.addEventListener('click', (event) => {
            if (!dropdown.contains(event.target) && event.target !== targetElement) {
                dropdown.remove();
            }
        }, { once: true, capture: true });
    }, 0);
}

/**
 * Handles clicks on the helper icons.
 * @param {MouseEvent} event - The click event.
 */
function handleHelperIconClick(event) {
    const icon = event.target.closest('.script-helper-icon');
    if (!icon) return;

    const type = icon.dataset.type; // 'condition' or 'action'
    const command = icon.dataset.command;
    const textarea = type === 'condition' ? scriptConditionTextarea : scriptActionTextarea;

    switch (command) {
        // Simple Insertions
        case 'SHOW_MESSAGE': insertTextAtCursor(textarea, 'SHOW_MESSAGE("Your message here")'); break;
        case 'SET_STATE': insertTextAtCursor(textarea, 'SET_STATE(variable_name, "value")'); break;
        case 'ADD_SCORE': insertTextAtCursor(textarea, 'ADD_SCORE(10)'); break;
        case 'SET_GAME_LOSS': insertTextAtCursor(textarea, 'SET_STATE(game_loss, True)'); break;
        case 'SET_LOSS_REASON': insertTextAtCursor(textarea, 'SET_STATE(loss_reason, "You lost because...")'); break;
        case 'SET_LOSS_IMAGE': insertTextAtCursor(textarea, 'SET_STATE(loss_image, "custom_loss_image.jpg")'); break;
        case 'STATE': insertTextAtCursor(textarea, 'STATE(variable_name) == "value"'); break;

        // Insertions Requiring Selection
        case 'HAS_ITEM':
            insertTextAtCursor(textarea, 'HAS_ITEM(ITEM_NAME)');
            const takableItems = state.currentEntities.filter(e => e.is_takable && e.type === 'ITEM');
            showTemporaryDropdown(textarea, takableItems.map(i => ({ label: i.name, value: i.name })), (selectedName) => {
                textarea.value = textarea.value.replace('ITEM_NAME', selectedName);
            });
            break;
        case 'CURRENT_ROOM':
            // Insert placeholder with quotes for the title - Updated to use title
            insertTextAtCursor(textarea, 'CURRENT_ROOM("ROOM_TITLE")');
            const rooms = state.currentRooms;
            // Show dropdown with room titles, value is also the title
            showTemporaryDropdown(textarea, rooms.map(r => ({ label: r.title, value: r.title })), (selectedTitle) => {
                // Replace the placeholder, keeping the quotes - Updated to use title
                textarea.value = textarea.value.replace('"ROOM_TITLE"', `"${selectedTitle}"`);
            });
            break;
        case 'GIVE_ITEM':
            insertTextAtCursor(textarea, 'GIVE_ITEM(ITEM_NAME)');
            const allItems = state.currentEntities.filter(e => e.type === 'ITEM');
            showTemporaryDropdown(textarea, allItems.map(i => ({ label: i.name, value: i.name })), (selectedName) => {
                textarea.value = textarea.value.replace('ITEM_NAME', selectedName);
            });
            break;
        default:
            console.warn(`Unknown script helper command: ${command}`);
    }
}

// --- Initialization ---
export function initializeScriptEditor() {
    console.log("Initializing Script Editor Listeners");
    if (addScriptBtn) {
        addScriptBtn.addEventListener('click', handleAddScript);
    } else {
        console.warn("Add Script button not found.");
    }

    if (scriptDetailsForm) {
        scriptDetailsForm.addEventListener('submit', handleSaveScript);
    } else {
        console.warn("Script details form not found.");
    }

    if (deleteScriptBtn) {
        deleteScriptBtn.addEventListener('click', handleDeleteScript);
    } else {
        console.warn("Delete Script button not found.");
    }

    // Add listeners to form inputs to detect changes
    const inputs = [scriptTriggerInput, scriptConditionTextarea, scriptActionTextarea];
    inputs.forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                state.setUnsavedChanges(true);
                updateSaveStatusIndicator();
            });
        }
    });

    // Add event listener for helper icons using event delegation
    if (scriptDetailsPanel) {
        scriptDetailsPanel.addEventListener('click', handleHelperIconClick);
    }

    // Add event listener for search input
    if (scriptSearchInput) {
        scriptSearchInput.addEventListener('input', renderScriptList);
    } else {
        console.warn("Script search input not found.");
    }
}
