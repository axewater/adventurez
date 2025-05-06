// /client/js/main.js
// Main entry point for the Text Adventure Builder client-side application

import { initializeGameManager } from './gameManager.js';
import { initializeGameSettingsListeners } from './gameSettings.js'; // Import settings listeners
import { initializeRoomDetails } from './roomDetails.js';
import { initializeEntityDetails } from './entityDetails.js';
import { initializeScriptEditor } from './scriptEditor.js';
import { initializeConversationEditor } from './conversationEditor.js';
import { initializePlayModeUI } from './playMode.js';
import { setupTabSwitching, setupRoomViewSwitching, setupConversationViewSwitching } from './uiUtils.js';
import { initializeFileManager, fetchAndRenderFiles } from './fileManager.js';
import { initializeGraphView } from './roomGraph.js'; // Import D3 graph initializer
import { loadAndRenderHighScores } from './highScores.js'; // NEW: Import high score loader
import { initializeAdminPanel } from './adminPanel.js'; // NEW: Import admin panel initializer
import { initializeUserPreferences } from './userPreferences.js'; // NEW: Import user preferences initializer
import { initializeTheme } from './theme.js'; // NEW: Import theme initializer

// Import state setter
import { setCurrentUserRole } from './state.js';

// --- Main Initialization Function ---
async function initializeApp() {
    console.log("Text Adventure Builder UI Initializing (Modular)...");

    // --- Get User Role from Backend ---
    const userRole = document.body.dataset.userRole || 'guest';
    setCurrentUserRole(userRole); // Store role in shared state

    // --- Initialize Theme ---
    await initializeTheme(); // Initialize theme based on prefs/defaults

    // Setup core UI interactions
    // Pass graph initializers to the switching functions so they can call them when needed
    const { initializeConversationGraph } = await import('./conversationGraph.js'); // Dynamically import conversation graph initializer
    setupTabSwitching(initializeGraphView, initializeConversationGraph, (newTabId) => {
        // Add a callback to handle specific actions when tabs switch
        if (newTabId === 'files-tab') {
            fetchAndRenderFiles(); // Fetch files when switching to the Files tab
        } else if (newTabId === 'scores-tab') { // NEW: Handle scores tab
            loadAndRenderHighScores(); // Load scores when switching to the Scores tab
        } else if (newTabId === 'admin-tab') { // NEW: Handle admin tab
            initializeAdminPanel(); // Initialize admin panel when switching to it
        }
        // Add other tab-specific actions here if needed
        // e.g., if (newTabId === 'rooms-tab' && roomGraphView?.classList.contains('active')) {
        //     initializeGraphView();
        // }
    });
    setupRoomViewSwitching(initializeGraphView);
    // NEW: Setup conversation view switcher
    setupConversationViewSwitching(initializeConversationGraph);

    // Initialize user profile dropdown
    setupUserProfileDropdown();

    // Initialize manager modules which handle fetching initial data and setting up listeners
    initializeGameManager(); // Fetches games, sets up game list and actions
    initializeGameSettingsListeners(); // Listeners are now initialized within initializeGameManager
    initializeRoomDetails(); // Sets up listeners for room detail form, connections etc.
    initializeEntityDetails(); // Sets up listeners for entity detail form
    initializeScriptEditor(); // Sets up listeners for script editor form
    initializeConversationEditor(); // Sets up listeners for conversation editor form
    initializePlayModeUI(); // Sets up listeners for play mode input
    initializeFileManager(); // NEW: Initialize file manager listeners
    initializeUserPreferences(); // NEW: Initialize user preferences modal listeners
    // initializeAdminPanel(); // Don't initialize immediately, wait for tab switch

    // Note: initializeGraphView is not called here directly,
    // it's called by setupRoomViewSwitching when switching to the graph view,
    // or by gameManager.loadGameData if the graph view is already active when data loads.

    console.log("Initialization Complete.");
}

// --- User Profile Dropdown ---
function setupUserProfileDropdown() {
    const profileTrigger = document.querySelector('.user-profile-trigger');
    const profileDropdown = document.querySelector('.user-profile-dropdown');
    
    if (profileTrigger && profileDropdown) {
        // Toggle dropdown when clicking on the trigger
        profileTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            profileDropdown.classList.remove('active');
        });
    }
}

// --- DOMContentLoaded Listener ---
// Ensures the DOM is fully loaded before running any initialization code
document.addEventListener('DOMContentLoaded', initializeApp);
