// /client/js/conversationEditor.js
import * as api from './api.js';
import * as state from './state.js';
import { initializeConversationGraph, destroyConversationGraph } from './conversationGraph.js';
import { dispatchGameDataChangedEvent, updateSaveStatusIndicator, clearConversationDetailsPanel } from './uiUtils.js';

// --- DOM Elements ---
const conversationsTabPlaceholder = document.getElementById('conversations-tab-placeholder');
const conversationEditorContent = document.getElementById('conversation-editor-content');
const conversationListUl = document.getElementById('conversation-list-ul');
const addConversationBtn = document.getElementById('add-conversation-btn');
const conversationDetailsPlaceholder = document.getElementById('conversation-details-placeholder');
const conversationDetailsForm = document.getElementById('conversation-details-form');
const conversationNameInput = document.getElementById('conversation-name-input');
const conversationStructureTextarea = document.getElementById('conversation-structure-textarea');
const saveConversationBtn = document.getElementById('save-conversation-btn');
const deleteConversationBtn = document.getElementById('delete-conversation-btn');
const conversationEditorView = document.getElementById('conversation-editor-view');
const conversationGraphView = document.getElementById('conversation-graph-view');

// --- State ---
// Add to state.js:
// export let currentConversations = [];
// export let selectedConversation = null;

// --- Core Functions ---

/**
 * Load conversations for the selected game and display the editor UI.
 * Called by gameManager when a game is selected.
 * @param {string} gameId - The UUID of the game to load conversations for.
 */
export async function loadConversationsUI(gameId) {
    console.log(`Loading conversations UI for game ${gameId}`);
    // state.setSelectedGameId(gameId); // Game ID should already be set by gameManager

    if (!gameId) {
        clearConversationsUI();
        return;
    }

    // Ensure elements exist before manipulating style
    if (conversationsTabPlaceholder) conversationsTabPlaceholder.style.display = 'none';
    if (conversationEditorContent) conversationEditorContent.style.display = 'flex'; // Use flex based on HTML layout
    else {
        console.error("Conversation editor content element not found!");
        return;
    }

    await fetchConversationsForGame(gameId);
    clearConversationDetailsPanel(); // Ensure details are cleared initially
}

/**
 * Fetches conversations for the given game from the API and updates state.
 * @param {string} gameId - The UUID of the game.
 */
async function fetchConversationsForGame(gameId) {
    if (!gameId) return;
    console.log(`Fetching conversations for game ${gameId}`);
    try {
        const response = await fetch(`/api/games/${gameId}/conversations`);
        const fetchedConversations = await api.handleApiResponse(response);
        state.setCurrentConversations(fetchedConversations); // Update state
        console.log("Conversations fetched:", state.currentConversations);
        renderConversationList();
        // Also update conversation dropdowns elsewhere (e.g., in entity editor)
        dispatchGameDataChangedEvent('conversationListLoad');
    } catch (error) {
        console.error(`Failed to fetch conversations for game ${gameId}:`, error);
        if (conversationListUl) {
            conversationListUl.innerHTML = '<li>Error loading conversations.</li>';
        }
        state.setCurrentConversations([]);
    }
}

/**
 * Renders the list of conversations based on the current state.
 */
function renderConversationList() {
    if (!conversationListUl) return;
    conversationListUl.innerHTML = ''; // Clear list
    if (state.currentConversations.length === 0) {
        conversationListUl.innerHTML = '<li>No conversations created yet.</li>';
    } else {
        // Sort conversations by name for consistency
        const sortedConversations = [...state.currentConversations].sort((a, b) => a.name.localeCompare(b.name));
        sortedConversations.forEach(conv => {
            const li = document.createElement('li');
            li.textContent = conv.name;
            li.title = `ID: ${conv.id}`; // Show ID on hover
            li.dataset.conversationId = conv.id;
            li.style.cursor = 'pointer';
            li.style.padding = '8px';
            li.style.marginBottom = '4px';
            li.style.border = '1px solid #eee';
            li.style.borderRadius = '3px';
            li.addEventListener('click', () => selectConversation(conv.id));
            if (state.selectedConversation && conv.id === state.selectedConversation.id) {
                li.classList.add('selected'); // Apply selected style (needs CSS)
                li.style.backgroundColor = '#fff8e1'; // Example selected style (light yellow)
                li.style.borderColor = '#ffecb3';
            } else {
                 li.style.backgroundColor = '#f9f9f9'; // Default background
                 li.addEventListener('mouseenter', () => li.style.backgroundColor = '#efefef');
                 li.addEventListener('mouseleave', () => {
                     if (!li.classList.contains('selected')) {
                        li.style.backgroundColor = '#f9f9f9';
                     }
                 });
            }
            conversationListUl.appendChild(li);
        });
    }
}

/**
 * Handles selecting a conversation from the list, fetching its details.
 * @param {string} conversationId - The UUID of the conversation to select.
 */
async function selectConversation(conversationId) {
    if (state.selectedConversation && state.selectedConversation.id === conversationId) return; // Avoid re-selecting

    console.log(`Selecting conversation ${conversationId}`);
    // Clear previous selection highlight immediately
    const previouslySelected = conversationListUl?.querySelector('li.selected');
    if (previouslySelected) {
        previouslySelected.classList.remove('selected');
        previouslySelected.style.backgroundColor = '#f9f9f9'; // Reset background
        previouslySelected.style.borderColor = '#eee';
    }

    try {
        // Fetch full details (safer than relying on list cache)
        const response = await fetch(`/api/conversations/${conversationId}`);
        const convData = await api.handleApiResponse(response);
        state.setSelectedConversation(convData); // Update state
        console.log("Selected conversation details:", state.selectedConversation);
        renderConversationDetails(state.selectedConversation);
        // Highlight the newly selected item
        const newlySelectedItem = conversationListUl?.querySelector(`li[data-conversation-id="${conversationId}"]`);
        if (newlySelectedItem) {
            newlySelectedItem.classList.add('selected');
            newlySelectedItem.style.backgroundColor = '#fff8e1'; // Selected style
            newlySelectedItem.style.borderColor = '#ffecb3';
        }

        // If graph view is active, initialize or update it
        if (conversationGraphView?.classList.contains('active')) {
            initializeConversationGraph();
        }
    } catch (error) {
        console.error(`Failed to fetch details for conversation ${conversationId}:`, error);
        clearConversationDetailsPanel();
        state.setSelectedConversation(null);
    }
}

/**
 * Renders the details of the selected conversation in the form.
 * @param {object} convData - The full conversation object.
 */
function renderConversationDetails(convData) {
    if (!convData || !conversationDetailsForm || !conversationDetailsPlaceholder) {
        clearConversationDetailsPanel();
        return;
    }
    conversationDetailsPlaceholder.style.display = 'none';
    conversationDetailsForm.style.display = 'block'; // Or 'flex' if needed

    if (conversationNameInput) conversationNameInput.value = convData.name || '';
    if (conversationStructureTextarea) {
        // Pretty-print the JSON structure for readability
        try {
            conversationStructureTextarea.value = JSON.stringify(convData.structure || {}, null, 2);
        } catch (e) {
            console.error("Error stringifying conversation structure:", e);
            conversationStructureTextarea.value = "Error displaying structure.";
        }
    }
}



/**
 * Clears the entire conversation editor UI.
 * Called by uiUtils.clearEditorPanes when a game is closed/deleted.
 */
export function clearConversationsUI() {
    console.log("Clearing conversation editor UI...");
    state.setCurrentConversations([]);
    state.setSelectedConversation(null);
    if (conversationEditorContent) conversationEditorContent.style.display = 'none';
    if (conversationsTabPlaceholder) conversationsTabPlaceholder.style.display = 'block'; // Or 'flex'
    if (conversationListUl) conversationListUl.innerHTML = '';
    destroyConversationGraph(); // Destroy graph when clearing UI
    clearConversationDetailsPanel();
}

// --- Event Listeners ---

async function handleAddConversation() {
    const currentGameId = state.selectedGameId; // Get current game ID from state
    if (!currentGameId) return;

    const defaultName = `New Conversation ${state.currentConversations.length + 1}`;
    console.log(`Adding new conversation to game ${currentGameId}`);

    try {
        const response = await fetch(`/api/games/${currentGameId}/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json'},
            // Send minimal data, backend uses defaults for structure
            body: JSON.stringify({ name: defaultName })
        });
        const newConv = await api.handleApiResponse(response);
        console.log("Conversation created:", newConv);
        state.setCurrentConversations([...state.currentConversations, newConv]); // Add to local cache
        renderConversationList(); // Update list display
        selectConversation(newConv.id); // Select the newly created conversation
        state.setUnsavedChanges(false); // New conversation is saved immediately
        updateSaveStatusIndicator(); // Update UI

        // If graph view is active, initialize it for the new conversation
        if (conversationGraphView?.classList.contains('active')) {
            initializeConversationGraph();
        }
        dispatchGameDataChangedEvent('conversationEditorAdd'); // Signal change
    } catch (error) {
        console.error("Failed to add conversation:", error);
        // Alert handled by handleApiResponse
    }
}

async function handleSaveConversation(event) {
    event.preventDefault(); // Prevent default form submission
    if (!state.selectedConversation || !state.selectedGameId) return;

    const name = conversationNameInput?.value.trim();
    let structure;
    try {
        structure = JSON.parse(conversationStructureTextarea?.value || '{}');
        if (typeof structure !== 'object' || structure === null) {
            throw new Error("Structure must be a JSON object.");
        }
    } catch (e) {
        alert(`Invalid JSON in structure: ${e.message}`);
        conversationStructureTextarea?.focus();
        return;
    }

    // Basic validation
    if (!name) {
        alert("Conversation 'Name' cannot be empty.");
        conversationNameInput?.focus();
        return;
    }

    const updatedData = { name, structure };

    console.log(`Saving changes for conversation ${state.selectedConversation.id}:`, updatedData);
    try {
        const response = await fetch(`/api/conversations/${state.selectedConversation.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        const updatedConvData = await api.handleApiResponse(response);
        console.log("Conversation updated:", updatedConvData);

        // Update local cache (state)
        const index = state.currentConversations.findIndex(c => c.id === state.selectedConversation.id);
        const updatedConversations = [...state.currentConversations];
        if (index !== -1) {
            updatedConversations[index] = updatedConvData;
        }
        state.setCurrentConversations(updatedConversations);
        state.setSelectedConversation(updatedConvData); // Update the selected object

        // Re-render the list to reflect potential name changes
        renderConversationList();
        // Re-render details (might be redundant, but safe)
        renderConversationDetails(state.selectedConversation);

        // If graph view is active, update it
        if (conversationGraphView?.classList.contains('active')) {
            initializeConversationGraph(); // Re-initialize to reflect changes
        }
        state.setUnsavedChanges(false); // Reset unsaved changes flag
        updateSaveStatusIndicator(); // Update UI
        alert("Conversation saved successfully!"); // Simple feedback
        dispatchGameDataChangedEvent('conversationEditorSave'); // Signal change

    } catch (error) {
        console.error(`Failed to save conversation ${state.selectedConversation.id}:`, error);
        // Alert handled by handleApiResponse
    }
}

async function handleDeleteConversation() {
    if (!state.selectedConversation || !state.selectedGameId) return;

    if (confirm(`Are you sure you want to delete the conversation "${state.selectedConversation.name}"? This cannot be undone if NPCs are using it.`)) {
        console.log(`Deleting conversation ${state.selectedConversation.id}`);
        const convIdToDelete = state.selectedConversation.id; // Store ID before clearing selection
        try {
            const response = await fetch(`/api/conversations/${convIdToDelete}`, {
                method: 'DELETE'
            });
            await api.handleApiResponse(response); // Checks for errors, expects 204 or 409

            console.log("Conversation deleted:", convIdToDelete);

            // Remove from local cache (state)
            state.setCurrentConversations(state.currentConversations.filter(c => c.id !== convIdToDelete));

            // Clear details panel and update list
            clearConversationDetailsPanel(); // This also clears selectedConversation state
            destroyConversationGraph(); // Destroy graph if it was showing the deleted convo
            renderConversationList();

            state.setUnsavedChanges(false); // Changes are gone (deleted)
            updateSaveStatusIndicator(); // Update UI
            alert("Conversation deleted successfully.");
            dispatchGameDataChangedEvent('conversationEditorDelete'); // Signal change

        } catch (error) {
            console.error(`Failed to delete conversation ${convIdToDelete}:`, error);
            // Alert handled by handleApiResponse (will show conflict message etc.)
        }
    }
}

// --- Initialization ---
export function initializeConversationEditor() {
    // Note: setupConversationViewSwitching is called from main.js now, passing initializeConversationGraph
    // uiUtils.setupConversationViewSwitching(initializeConversationGraph); // Setup view switcher

    console.log("Initializing Conversation Editor Listeners");
    if (addConversationBtn) {
        addConversationBtn.addEventListener('click', handleAddConversation);
    } else {
        console.warn("Add Conversation button not found.");
    }

    if (conversationDetailsForm) {
        conversationDetailsForm.addEventListener('submit', handleSaveConversation);
    } else {
        console.warn("Conversation details form not found.");
    }

    if (deleteConversationBtn) {
        deleteConversationBtn.addEventListener('click', handleDeleteConversation);
    } else {
        console.warn("Delete Conversation button not found.");
    }

    // Add listeners to form inputs to detect changes
    const inputs = [conversationNameInput, conversationStructureTextarea];
    inputs.forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                state.setUnsavedChanges(true);
                updateSaveStatusIndicator();
            });
        }
    });
}
