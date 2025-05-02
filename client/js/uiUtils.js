import * as state from './state.js';
import { clearScriptsUI } from './scriptEditor.js';
import { resetPlayMode } from './playMode.js';
import { destroyGraph } from './roomGraph.js';
import { destroyConversationGraph } from './conversationGraph.js';
import { unselectNodeInGraph } from './roomGraphActions.js';
import { renderSpellenGrid } from './gameManager.js';
import { fetchAndRenderFiles } from './fileManager.js';

// --- DOM Element Caching ---
// Cache frequently accessed elements to avoid repeated lookups
const gameStatus = document.getElementById('game-status')?.querySelector('span');
const renameGameBtn = document.getElementById('rename-game-btn'); // Keep rename button for now, might remove later if settings modal handles it
const gameSettingsBtn = document.getElementById('game-settings-btn');
const deleteGameBtn = document.getElementById('delete-game-btn');
const importExportToggleBtn = document.getElementById('import-export-toggle-btn');
const submitToStoreBtn = document.getElementById('submit-to-store-btn');
const testGameBtn = document.getElementById('test-game-btn');
const saveStatusIndicator = document.getElementById('save-status-indicator');

const tabs = document.querySelectorAll('.tab-button');
const tabPanes = document.querySelectorAll('.tab-pane');

// Room Editor Elements
const roomsTabPlaceholder = document.getElementById('rooms-tab-placeholder');
const roomEditorContent = document.getElementById('room-editor-content');
const roomListUl = document.getElementById('room-list-ul');
const roomDetailsPanel = document.getElementById('room-details-panel');
const roomDetailsPlaceholder = document.getElementById('room-details-placeholder');
const roomDetailsForm = document.getElementById('room-details-form');
const roomConnectionsListUl = document.getElementById('room-connections-list');
const connectionTargetRoomSelect = document.getElementById('connection-target-room-select');
const roomImageThumbnail = document.getElementById('room-image-thumbnail');
const roomDetailEntitiesListUl = document.getElementById('room-detail-entities-list');
const viewSwitchBtns = document.querySelectorAll('.view-switch-btn');
const roomListView = document.getElementById('room-list-details-view');
const roomGraphView = document.getElementById('room-graph-view');

// Entity Editor Elements
const entitiesTabPlaceholder = document.getElementById('entities-tab-placeholder');
const entityEditorContent = document.getElementById('entity-editor-content');
const entityListUl = document.getElementById('entity-list-ul');
const entityDetailsPanel = document.getElementById('entity-details-panel');
const entityDetailsPlaceholder = document.getElementById('entity-details-placeholder');
const entityDetailsForm = document.getElementById('entity-details-form');
const entityRoomSelect = document.getElementById('entity-room-select');
const entityImageThumbnail = document.getElementById('entity-image-thumbnail');

// Conversation Editor Elements
const conversationsTabPlaceholder = document.getElementById('conversations-tab-placeholder');
const conversationEditorContent = document.getElementById('conversation-editor-content');
const conversationListUl = document.getElementById('conversation-list-ul');
const conversationDetailsPlaceholder = document.getElementById('conversation-details-placeholder');
const conversationDetailsForm = document.getElementById('conversation-details-form');
const conversationViewSwitchBtns = document.querySelectorAll('#conversations-tab .view-switch-btn');
const conversationEditorView = document.getElementById('conversation-editor-view');
const conversationGraphView = document.getElementById('conversation-graph-view');

// Files Tab Elements
const filesTabPlaceholder = document.getElementById('files-tab-placeholder');
const fileManagerContent = document.getElementById('file-manager-content');
const fileListUl = document.getElementById('file-list-ul');

// --- Tab and View Switching ---

export function setupTabSwitching(roomGraphInitializer, conversationGraphInitializer, onTabSwitchCallback = null) {
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all tabs and panes
            tabs.forEach(t => t.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            // Activate clicked tab and corresponding pane
            tab.classList.add('active');
            const targetPaneId = tab.getAttribute('data-tab') + '-tab';
            const targetPane = document.getElementById(targetPaneId);
            if (targetPane) {
                targetPane.classList.add('active');
                console.log(`Switched to tab: ${tab.getAttribute('data-tab')}`);
                // If switching to Rooms tab and graph view was active, re-initialize graph
                if (tab.getAttribute('data-tab') === 'rooms' && document.getElementById('room-graph-view')?.classList.contains('active')) {
                    roomGraphInitializer(); // Pass the function to call
                }
                // If switching to Conversations tab and graph view was active, re-initialize graph
                if (tab.getAttribute('data-tab') === 'conversations' && document.getElementById('conversation-graph-view')?.classList.contains('active')) {
                    conversationGraphInitializer(); // Call conversation graph initializer
                }
                // If switching to Spellen tab, render the grid
                if (tab.getAttribute('data-tab') === 'spellen') {
                    renderSpellenGrid(); // Render the grid when tab is activated
                }
                // Call the generic callback if provided
                if (onTabSwitchCallback) {
                    onTabSwitchCallback(targetPaneId);
                }
                updateTopBarStatus(); // Update status text when tab changes
            } else {
                 console.error(`Target pane not found: ${targetPaneId}`);
            }
        });
    });
}

export function setupRoomViewSwitching(graphInitializer) {
    viewSwitchBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetView = btn.getAttribute('data-view');
            console.log(`Switching room editor view to: ${targetView}`);

            // Update button active state
            viewSwitchBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show/hide view panes
            document.querySelectorAll('#room-editor-content .view-pane').forEach(pane => {
                pane.classList.remove('active');
            });
            const targetViewElement = document.getElementById(`room-${targetView}-view`);
            if (targetViewElement) {
                targetViewElement.classList.add('active');
            } else {
                 console.error(`Target view element not found: room-${targetView}-view`);
            }


            // Initialize graph if switching to graph view
            if (targetView === 'graph') {
                graphInitializer(); // Pass the function to call
            }
        });
    });
}

/**
 * Sets up the view switcher specifically for the Conversations tab.
 * @param {Function} graphInitializer - The function to call to initialize the conversation graph.
 */
export function setupConversationViewSwitching(graphInitializer) {
    conversationViewSwitchBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetView = btn.getAttribute('data-view');
            console.log(`Switching conversation editor view to: ${targetView}`);

            // Update button active state
            conversationViewSwitchBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show/hide view panes within the conversations tab
            document.querySelectorAll('#conversation-editor-content .view-pane').forEach(pane => {
                pane.classList.remove('active');
            });
            const targetViewElement = document.getElementById(`conversation-${targetView}-view`);
            if (targetViewElement) targetViewElement.classList.add('active');

            // Initialize graph if switching to graph view and a conversation is selected
            if (targetView === 'graph' && state.selectedConversation) {
                graphInitializer();
            }
        });
    });
}

// --- UI State Updates ---

/**
 * Updates the enabled/disabled state of game action buttons based on whether a game is selected.
 */
export function updateButtonStates() {
    const gameIsSelected = state.selectedGameId !== null;
    if (renameGameBtn) renameGameBtn.disabled = !gameIsSelected;
    if (gameSettingsBtn) gameSettingsBtn.disabled = !gameIsSelected;
    if (deleteGameBtn) deleteGameBtn.disabled = !gameIsSelected;
    if (submitToStoreBtn) submitToStoreBtn.disabled = !gameIsSelected; // Disable submit to store button if no game is selected
    // The Import/Export button itself is always enabled
    if (testGameBtn) testGameBtn.disabled = !gameIsSelected;
}

/**
 * Updates the game status display in the top bar based on the selected game and active tab.
 */
export function updateTopBarStatus() {
    if (gameStatus) {
        let statusText = 'No game loaded';
        const currentGame = state.selectedGameId ? state.getGameById(state.selectedGameId) : null;

        if (currentGame) {
            const activeTabButton = document.querySelector('#editor-tabs .tab-button.active');
            const activeTab = activeTabButton ? activeTabButton.getAttribute('data-tab') : null;

            switch (activeTab) {
                case 'play':
                    statusText = `Playing: ${currentGame.name}`;
                    break;
                case 'scores':
                case 'spellen':
                    statusText = 'HighScores:';
                    break;
                case null: // Should not happen if a game is selected, but handle defensively
                case 'rooms':
                case 'entities':
                case 'scripts':
                case 'conversations':
                case 'files': // Add other editor tabs here
                default: // Default to Editing for any other tab when a game is loaded
                    statusText = `Editing: ${currentGame.name}`;
                    break;
            }
        }
        gameStatus.textContent = statusText;
    } else {
        console.warn("Game status element not found in top bar.");
    }
}

/**
 * Updates the save status indicator in the top bar.
 */
export function updateSaveStatusIndicator() {
    if (saveStatusIndicator) {
        saveStatusIndicator.textContent = state.hasUnsavedChanges ? '* Unsaved' : 'Saved';
        saveStatusIndicator.classList.toggle('status-unsaved', state.hasUnsavedChanges);
        saveStatusIndicator.classList.toggle('status-saved', !state.hasUnsavedChanges);
        saveStatusIndicator.title = state.hasUnsavedChanges ? 'You have unsaved changes.' : 'All changes saved.';
    }
}

// --- Clearing UI Sections ---

/**
 * Clears the room details panel, resetting the form and showing the placeholder.
 */
export function clearRoomDetailsPanel() {
    const { graphInitialized, updateGraph } = state; // Assuming these might be needed, adjust if not
    state.setSelectedRoom(null); // Clear selected room state
    if (roomDetailsForm) {
        roomDetailsForm.style.display = 'none';
        roomDetailsForm.reset(); // Clear form fields
    }
    if (roomDetailsPlaceholder) {
        roomDetailsPlaceholder.style.display = 'block';
    }
    if (roomConnectionsListUl) {
        roomConnectionsListUl.innerHTML = ''; // Clear connections list
    }
    if (connectionTargetRoomSelect) {
        connectionTargetRoomSelect.innerHTML = '<option value="">To Room...</option>'; // Clear target dropdown
    }
    // Hide the room thumbnail when clearing details
    if (roomImageThumbnail) {
        roomImageThumbnail.style.display = 'none';
    }
    // Clear the entity list in the room details
    if (roomDetailEntitiesListUl) {
        roomDetailEntitiesListUl.innerHTML = '';
    }
    // Remove selection highlight from the list
    const selectedLi = roomListUl?.querySelector('li.selected');
    if (selectedLi) {
        selectedLi.classList.remove('selected');
    }
    // Unselect nodes in graph view
    // Need to dynamically import graph state or pass it if needed by unselectNodeInGraph
    import('./roomGraph.js').then(graphModule => {
        unselectNodeInGraph(graphModule.graphInitialized, graphModule.updateGraph); // Call the action version
    }).catch(err => console.error("Failed to load roomGraph module for unselectNodeInGraph", err));
}

/**
 * Clears the entity details panel, resetting the form and showing the placeholder.
 */
export function clearEntityDetailsPanel() {
    state.setSelectedEntity(null); // Clear selected entity state
    if (entityDetailsForm) {
        entityDetailsForm.style.display = 'none';
        entityDetailsForm.reset(); // Clear form fields
    }
     if (entityDetailsPlaceholder) {
        entityDetailsPlaceholder.style.display = 'block';
    }
    if (entityRoomSelect) {
        entityRoomSelect.innerHTML = '<option value="">-- Not in a room --</option>'; // Clear room dropdown
    }
    // Hide the thumbnail when clearing details
    if (entityImageThumbnail) {
        entityImageThumbnail.style.display = 'none';
    }
    // Remove selection highlight from the list
    const selectedLi = entityListUl?.querySelector('li.selected');
    if (selectedLi) {
        selectedLi.classList.remove('selected');
    }
}

/**
 * Clears the conversation details panel, resetting the form and showing the placeholder.
 */
export function clearConversationDetailsPanel() {
    state.setSelectedConversation(null); // Clear selected conversation state
    if (conversationDetailsForm) {
        conversationDetailsForm.style.display = 'none';
        conversationDetailsForm.reset(); // Clear form fields
    }
     if (conversationDetailsPlaceholder) {
        conversationDetailsPlaceholder.style.display = 'block';
    }
    // Remove selection highlight from the list
    const selectedLi = conversationListUl?.querySelector('li.selected');
    if (selectedLi) {
        selectedLi.classList.remove('selected');
        // Reset specific styles if needed
    }
}

/** Clears the file list UI */
export function clearFilesUI() {
    if (fileListUl) fileListUl.innerHTML = '<li>Selecteer een spel om bestanden te zien.</li>';
    // Optionally clear upload status/input if needed
}

/**
 * Clears all editor panes when a game is deleted or deselected.
 */
export function clearEditorPanes() {
    console.log("Clearing editor panes...");
    state.setSelectedGameId(null);
    state.setSelectedRoom(null);
    state.setCurrentRooms([]);
    state.setSelectedEntity(null);
    state.setCurrentEntities([]);
    state.setSelectedScript(null);
    state.setCurrentScripts([]);
    state.setCurrentConversations([]); // Clear conversations
    state.setSelectedConversation(null); // Clear selected conversation

    // Reset Room Tab
    if (roomEditorContent) roomEditorContent.style.display = 'none';
    if (roomsTabPlaceholder) roomsTabPlaceholder.style.display = 'block';
    if (roomListUl) roomListUl.innerHTML = '';
    clearRoomDetailsPanel();

    // Reset Entity Tab
    if (entityEditorContent) entityEditorContent.style.display = 'none';
    if (entitiesTabPlaceholder) entitiesTabPlaceholder.style.display = 'block';
    if (entityListUl) entityListUl.innerHTML = '';
    clearEntityDetailsPanel();

    // Reset Conversation Tab
    if (conversationEditorContent) conversationEditorContent.style.display = 'none';
    if (conversationsTabPlaceholder) conversationsTabPlaceholder.style.display = 'block';
    if (conversationListUl) conversationListUl.innerHTML = '';
    clearConversationDetailsPanel();
    destroyConversationGraph(); // Destroy conversation graph

    // Reset Script Tab
    clearScriptsUI(); // Call imported function

    // Reset Play Mode Tab
    resetPlayMode(); // Call imported function

    // Reset Files Tab
    clearFilesUI(); // Call the new clear function

    // Reset game status display and sidebar buttons
    updateTopBarStatus(); // Use the new function
    updateButtonStates();
    updateSaveStatusIndicator(); // Reset save status indicator

    // Destroy D3 graph instance if it exists
    destroyGraph(); // Call imported function
}

// --- Event Dispatching ---

/**
 * Dispatches a custom event to signal that game data has changed.
 * @param {string} source - Identifier of the module/action causing the change (e.g., 'roomDetailsSave').
 */
export function dispatchGameDataChangedEvent(source) {
    console.log(`Dispatching gameDataChanged event from: ${source}`);
    const event = new CustomEvent('gameDataChanged', { detail: { source } });
    document.dispatchEvent(event);
}

/**
 * Displays a temporary flash message at the bottom of the screen.
 * @param {string} message - The message text to display.
 * @param {number} [duration=3000] - How long the message should be visible in milliseconds.
 */
export function showFlashMessage(message, duration = 3000) {
    console.log(`[showFlashMessage] Received message: "${message}", Duration: ${duration}`);
    const container = document.getElementById('flash-message-container');
    if (!container) {
        console.error("Flash message container not found!");
        return;
    }

    container.textContent = message;
    console.log("[showFlashMessage] Setting container text and adding 'visible' class.");
    container.classList.add('visible'); // Make it visible (triggers CSS transition)

    // Set a timer to hide the message after the duration
    setTimeout(() => {
        console.log("[showFlashMessage] Timeout reached. Removing 'visible' class.");
        container.classList.remove('visible'); // Make it invisible again
    }, duration);
}

// --- NEW: Image Popup ---
const imagePopupContainer = document.getElementById('entity-image-popup'); // Assuming generic ID now
const imagePopupImg = document.getElementById('entity-image-popup-img');
const imagePopupCloseBtn = document.getElementById('entity-image-popup-close');

/**
 * Shows the image popup with the specified image URL.
 * @param {string} imageUrl - The URL of the image to display.
 */
export function showImagePopup(imageUrl) {
    if (imagePopupContainer && imagePopupImg) {
        imagePopupImg.src = imageUrl;
        imagePopupContainer.classList.add('visible');
    }
}

/** Hides the image popup. */
export function hideImagePopup() {
    if (imagePopupContainer) {
        imagePopupContainer.classList.remove('visible');
        if (imagePopupImg) imagePopupImg.src = ''; // Clear src
    }
}

// --- NEW: Custom Context Menu ---

/**
 * Creates and shows a custom context menu at the event coordinates.
 * @param {MouseEvent} event - The mouse event (usually contextmenu).
 * @param {Array<object>} items - Array of menu item objects { label: string, action: function, icon?: string } or { label: "---" } for separator.
 */
export function showCustomContextMenu(event, items) {
    event.preventDefault();
    event.stopPropagation(); // Prevent triggering other listeners (like background click)

    hideCustomContextMenu(); // Hide any existing menu first

    const contextMenu = document.createElement('div');
    contextMenu.id = 'custom-context-menu';
    contextMenu.style.position = 'absolute';
    contextMenu.style.left = `${event.pageX}px`;
    contextMenu.style.top = `${event.pageY}px`;
    contextMenu.style.backgroundColor = 'white';
    contextMenu.style.border = '1px solid #ccc';
    contextMenu.style.boxShadow = '2px 2px 5px rgba(0,0,0,0.2)';
    contextMenu.style.padding = '5px 0';
    contextMenu.style.zIndex = '1000'; // Ensure it's on top

    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.padding = '0';
    ul.style.margin = '0';

    items.forEach(item => {
        const li = document.createElement('li');
        if (item.label === "---") {
            li.classList.add('separator');
        } else {
            // Add icon if provided
            if (item.icon) {
                li.innerHTML = `<span class="menu-icon">${item.icon}</span> ${item.label}`;
            } else {
                li.textContent = item.label;
            }
            li.style.padding = '8px 15px';
            li.style.cursor = 'pointer';
            li.addEventListener('mouseenter', () => li.style.backgroundColor = '#f0f0f0');
            li.addEventListener('mouseleave', () => li.style.backgroundColor = 'white');
            li.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent SVG click handler from hiding menu too early
                item.action();
                hideCustomContextMenu();
            });
        }
        ul.appendChild(li);
    });

    contextMenu.appendChild(ul);
    document.body.appendChild(contextMenu);

    // Add a listener to hide the menu when clicking outside
    // Use setTimeout to allow the click that opened the menu to finish processing
    setTimeout(() => {
        document.addEventListener('click', hideCustomContextMenuOnClickOutside, { capture: true, once: true });
    }, 0);
}

export function hideCustomContextMenu() {
    const contextMenu = document.getElementById('custom-context-menu');
    if (contextMenu) {
        contextMenu.remove();
    }
    // Remove the outside click listener when hiding the menu explicitly
    document.removeEventListener('click', hideCustomContextMenuOnClickOutside, { capture: true });
}

/**
 * Click listener to hide the context menu if the click is outside of it.
 * @param {MouseEvent} event
 */
function hideCustomContextMenuOnClickOutside(event) {
    const contextMenu = document.getElementById('custom-context-menu');
    // If the click target is not the context menu itself or a descendant, hide it
    if (contextMenu && !contextMenu.contains(event.target)) {
        hideCustomContextMenu();
    }
}

// --- Initialize Popup Close Button ---
if (imagePopupCloseBtn) {
    imagePopupCloseBtn.addEventListener('click', hideImagePopup);
}

/**
 * Programmatically switches to the specified tab.
 * @param {string} tabDataAttribute - The value of the 'data-tab' attribute of the target tab button (e.g., 'rooms', 'entities').
 */
export function switchToTab(tabDataAttribute) {
    const targetTabButton = document.querySelector(`.tab-button[data-tab="${tabDataAttribute}"]`);
    if (targetTabButton) {
        // Check if it's already active to avoid unnecessary clicks/logic
        if (!targetTabButton.classList.contains('active')) {
            targetTabButton.click(); // Simulate a click to trigger the existing switching logic
            console.log(`Programmatically switched to tab: ${tabDataAttribute}`);
        } else {
            console.log(`Tab ${tabDataAttribute} is already active.`);
        }
    } else {
        console.error(`Could not find tab button with data-tab="${tabDataAttribute}"`);
    }
}
