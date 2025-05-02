import * as api from './api.js';
import { showFlashMessage } from './uiUtils.js';
import { applyTheme } from './theme.js'; // Import theme applying function

// --- DOM Elements ---
let prefsModal, prefsModalCloseBtn, prefsForm, themeSelect, prefsSubmitBtn, prefsLink;

// --- Initialization ---
export function initializeUserPreferences() {
    prefsModal = document.getElementById('user-preferences-modal');
    prefsModalCloseBtn = document.getElementById('user-preferences-modal-close');
    prefsForm = document.getElementById('user-preferences-form');
    themeSelect = document.getElementById('prefs-theme-select');
    prefsSubmitBtn = document.getElementById('user-preferences-submit');
    prefsLink = document.getElementById('user-prefs-link');

    if (prefsLink) {
        prefsLink.addEventListener('click', (e) => {
            e.preventDefault();
            openPreferencesModal();
        });
    }

    if (prefsModalCloseBtn) {
        prefsModalCloseBtn.addEventListener('click', closePreferencesModal);
    }

    if (prefsForm) {
        prefsForm.addEventListener('submit', handleSaveChanges);
    }
}

// --- Modal Control ---
async function openPreferencesModal() {
    if (!prefsModal || !themeSelect) return;

    // Fetch current preferences
    try {
        const response = await fetch('/api/prefs/me');
        const prefs = await api.handleApiResponse(response);
        themeSelect.value = prefs.theme_preference || 'system';
        // Populate other fields here if added later
        prefsModal.classList.add('visible');
    } catch (error) {
        console.error("Failed to load user preferences:", error);
        showFlashMessage("Kon voorkeuren niet laden.", 5000);
    }
}

function closePreferencesModal() {
    if (prefsModal) {
        prefsModal.classList.remove('visible');
    }
}

// --- Save Changes ---
async function handleSaveChanges(event) {
    event.preventDefault();
    if (!themeSelect) return;

    const updatedPrefs = {
        theme_preference: themeSelect.value
        // Add other preferences here
    };

    try {
        const response = await fetch('/api/prefs/me', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedPrefs)
        });
        const savedPrefs = await api.handleApiResponse(response); // Handles errors
        showFlashMessage("Voorkeuren opgeslagen.");
        closePreferencesModal();
        // Immediately apply the new theme preference
        applyTheme(savedPrefs.theme_preference);
    } catch (error) {
        console.error("Failed to save preferences:", error);
        // Error flash message shown by handleApiResponse
    }
}
