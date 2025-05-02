import * as api from './api.js';
import { showFlashMessage } from './uiUtils.js';

// --- DOM Elements ---
let adminPanelContent, adminNavBtns, adminSections;
let statsLoading, statsData, statsFields = {};
let usersLoading, usersTable, usersTableBody, addUserBtn;
let settingsLoading, settingsForm, defaultThemeSelect, adventureStoreApiKeyInput, saveSettingsBtn;
let userModal, userModalCloseBtn, userModalForm, userModalTitle, userModalUserId,
    userModalNameInput, userModalEmailInput, userModalPasswordInput,
    userModalPasswordHint, userModalRoleSelect, userModalSubmitBtn, userModalDeleteBtn;

// --- Initialization ---
export function initializeAdminPanel() {
    adminPanelContent = document.getElementById('admin-panel-content');
    if (!adminPanelContent) return; // Don't initialize if the panel doesn't exist for this user

    // Cache elements
    adminNavBtns = adminPanelContent.querySelectorAll('.admin-nav-btn');
    adminSections = adminPanelContent.querySelectorAll('.admin-section');

    statsLoading = document.getElementById('admin-stats-loading');
    statsData = document.getElementById('admin-stats-data');
    statsFields = {
        user: document.getElementById('stats-user-count'),
        game: document.getElementById('stats-game-count'),
        room: document.getElementById('stats-room-count'),
        entity: document.getElementById('stats-entity-count'),
        script: document.getElementById('stats-script-count'),
        conversation: document.getElementById('stats-conversation-count'),
        savedGame: document.getElementById('stats-saved-game-count'),
        highScore: document.getElementById('stats-high-score-count'),
    };

    usersLoading = document.getElementById('admin-users-loading');
    usersTable = document.getElementById('admin-users-table');
    usersTableBody = usersTable?.querySelector('tbody');
    addUserBtn = document.getElementById('add-user-btn');

    settingsLoading = document.getElementById('admin-settings-loading');
    settingsForm = document.getElementById('admin-settings-form');
    defaultThemeSelect = document.getElementById('setting-default-theme');
    adventureStoreApiKeyInput = document.getElementById('setting-adventure-store-api-key');
    saveSettingsBtn = document.getElementById('save-admin-settings-btn');

    // User Modal Elements
    userModal = document.getElementById('user-modal');
    userModalCloseBtn = document.getElementById('user-modal-close');
    userModalForm = document.getElementById('user-modal-form');
    userModalTitle = document.getElementById('user-modal-title');
    userModalUserId = document.getElementById('user-modal-user-id');
    userModalNameInput = document.getElementById('user-modal-name');
    userModalEmailInput = document.getElementById('user-modal-email');
    userModalPasswordInput = document.getElementById('user-modal-password');
    userModalPasswordHint = document.getElementById('user-modal-password-hint');
    userModalRoleSelect = document.getElementById('user-modal-role');
    userModalSubmitBtn = document.getElementById('user-modal-submit');
    userModalDeleteBtn = document.getElementById('user-modal-delete-btn');


    // Add Listeners
    setupAdminNav();
    if (addUserBtn) addUserBtn.addEventListener('click', openUserModalForAdd);
    if (saveSettingsBtn) settingsForm.addEventListener('submit', handleSaveSettings);
    if (userModalCloseBtn) userModalCloseBtn.addEventListener('click', closeUserModal);
    if (userModalForm) userModalForm.addEventListener('submit', handleUserModalSubmit);
    if (userModalDeleteBtn) userModalDeleteBtn.addEventListener('click', handleDeleteUserFromModal);

    // Load initial section (stats)
    loadAdminSection('stats');
}

// --- Navigation ---
function setupAdminNav() {
    adminNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetSection = btn.dataset.section;
            adminNavBtns.forEach(b => b.classList.remove('active'));
            adminSections.forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`admin-${targetSection}-section`)?.classList.add('active');
            loadAdminSection(targetSection); // Load data when switching
        });
    });
}

// --- Data Loading ---
async function loadAdminSection(section) {
    console.log(`Loading admin section: ${section}`);
    switch (section) {
        case 'stats':
            await loadStats();
            break;
        case 'users':
            await loadUsers();
            break;
        case 'settings':
            await loadSettings();
            break;
    }
}

async function loadStats() {
    if (!statsLoading || !statsData) return;
    statsLoading.style.display = 'block';
    statsData.style.display = 'none';
    try {
        const response = await fetch('/api/admin/stats');
        const stats = await api.handleApiResponse(response);
        if (statsFields.user) statsFields.user.textContent = stats.user_count ?? 'N/A';
        if (statsFields.game) statsFields.game.textContent = stats.game_count ?? 'N/A';
        if (statsFields.room) statsFields.room.textContent = stats.room_count ?? 'N/A';
        if (statsFields.entity) statsFields.entity.textContent = stats.entity_count ?? 'N/A';
        if (statsFields.script) statsFields.script.textContent = stats.script_count ?? 'N/A';
        if (statsFields.conversation) statsFields.conversation.textContent = stats.conversation_count ?? 'N/A';
        if (statsFields.savedGame) statsFields.savedGame.textContent = stats.saved_game_count ?? 'N/A';
        if (statsFields.highScore) statsFields.highScore.textContent = stats.high_score_count ?? 'N/A';
        statsData.style.display = 'block';
    } catch (error) {
        console.error("Failed to load admin stats:", error);
        statsLoading.textContent = 'Error loading stats.';
    } finally {
        if (statsLoading) statsLoading.style.display = 'none';
    }
}

async function loadUsers() {
    if (!usersLoading || !usersTable || !usersTableBody) return;
    usersLoading.style.display = 'block';
    usersTable.style.display = 'none';
    usersTableBody.innerHTML = ''; // Clear previous users

    try {
        const response = await fetch('/api/admin/users');
        const users = await api.handleApiResponse(response);
        renderUsersTable(users);
        usersTable.style.display = 'table'; // Show table
    } catch (error) {
        console.error("Failed to load users:", error);
        usersLoading.textContent = 'Error loading users.';
    } finally {
        if (usersLoading) usersLoading.style.display = 'none';
    }
}

async function loadSettings() {
    if (!settingsLoading || !settingsForm || !defaultThemeSelect || !adventureStoreApiKeyInput) return;
    settingsLoading.style.display = 'block';
    settingsForm.style.display = 'none';

    try {
        const response = await fetch('/api/admin/settings');
        const settings = await api.handleApiResponse(response);
        defaultThemeSelect.value = settings.default_theme || 'light';
        adventureStoreApiKeyInput.value = settings.adventure_store_api_key || ''; // Load API key
        // Populate other settings fields here if added
        settingsForm.style.display = 'block';
    } catch (error) {
        console.error("Failed to load settings:", error);
        settingsLoading.textContent = 'Error loading settings.';
    } finally {
        if (settingsLoading) settingsLoading.style.display = 'none';
    }
}

// --- Rendering ---
function renderUsersTable(users) {
    if (!usersTableBody) return;
    usersTableBody.innerHTML = ''; // Clear existing rows
    if (users.length === 0) {
        usersTableBody.innerHTML = '<tr><td colspan="4">No users found.</td></tr>';
        return;
    }

    users.forEach(user => {
        const row = usersTableBody.insertRow();
        row.insertCell().textContent = user.name;
        row.insertCell().textContent = user.email;
        row.insertCell().textContent = user.role;

        const actionsCell = row.insertCell();
        const editButton = document.createElement('button');
        editButton.textContent = 'Edit';
        editButton.classList.add('small-action-btn');
        editButton.addEventListener('click', () => openUserModalForEdit(user));
        actionsCell.appendChild(editButton);

        // Add delete button (optional, handled by modal now)
        // const deleteButton = document.createElement('button');
        // deleteButton.textContent = 'Delete';
        // deleteButton.classList.add('small-action-btn', 'danger');
        // deleteButton.addEventListener('click', () => handleDeleteUser(user.id, user.name));
        // actionsCell.appendChild(deleteButton);
    });
}

// --- User Modal Logic ---
function openUserModalForAdd() {
    if (!userModal || !userModalForm || !userModalTitle || !userModalSubmitBtn || !userModalPasswordHint || !userModalDeleteBtn) return;
    userModalForm.reset();
    userModalUserId.value = ''; // Clear user ID
    userModalTitle.textContent = 'Gebruiker Toevoegen';
    userModalSubmitBtn.textContent = 'Aanmaken';
    userModalPasswordInput.required = true; // Password required for new user
    userModalPasswordHint.style.display = 'none'; // Hide hint for new user
    userModalDeleteBtn.style.display = 'none'; // Hide delete button
    userModal.classList.add('visible');
}

function openUserModalForEdit(user) {
    if (!userModal || !userModalForm || !userModalTitle || !userModalSubmitBtn || !userModalPasswordHint || !userModalDeleteBtn) return;
    userModalForm.reset();
    userModalUserId.value = user.id;
    userModalTitle.textContent = 'Gebruiker Bewerken';
    userModalSubmitBtn.textContent = 'Opslaan';
    userModalNameInput.value = user.name;
    userModalEmailInput.value = user.email;
    userModalRoleSelect.value = user.role;
    userModalPasswordInput.required = false; // Password not required for edit (unless changing)
    userModalPasswordInput.placeholder = 'Laat leeg om niet te wijzigen';
    userModalPasswordHint.style.display = 'block'; // Show hint
    userModalDeleteBtn.style.display = 'inline-block'; // Show delete button
    userModalDeleteBtn.dataset.userId = user.id; // Store ID for delete action
    userModalDeleteBtn.dataset.userName = user.name; // Store name for confirmation
    userModal.classList.add('visible');
}

function closeUserModal() {
    if (userModal) {
        userModal.classList.remove('visible');
    }
}

async function handleUserModalSubmit(event) {
    event.preventDefault();
    const userId = userModalUserId.value;
    const isEditing = !!userId;
    const url = isEditing ? `/api/admin/users/${userId}` : '/api/admin/users';
    const method = isEditing ? 'PUT' : 'POST';

    const userData = {
        name: userModalNameInput.value.trim(),
        email: userModalEmailInput.value.trim(),
        role: userModalRoleSelect.value,
        password: userModalPasswordInput.value // Send password field (empty if not changing during edit)
    };

    // Basic validation
    if (!userData.name || !userData.email || !userData.role) {
        showFlashMessage("Vul aub alle vereiste velden in (Naam, Email, Rol).", 4000);
        return;
    }
    if (!isEditing && !userData.password) {
        showFlashMessage("Wachtwoord is vereist voor nieuwe gebruikers.", 4000);
        return;
    }

    // Remove password from payload if it's empty during edit
    if (isEditing && !userData.password) {
        delete userData.password;
    }

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        const result = await api.handleApiResponse(response); // Handles errors and shows flash message
        showFlashMessage(isEditing ? `Gebruiker "${result.name}" bijgewerkt.` : `Gebruiker "${result.name}" aangemaakt.`);
        closeUserModal();
        await loadUsers(); // Refresh the user list
    } catch (error) {
        // Error already handled by handleApiResponse
        console.error(`Failed to ${isEditing ? 'update' : 'create'} user:`, error);
    }
}

async function handleDeleteUserFromModal() {
    const userId = userModalDeleteBtn.dataset.userId;
    const userName = userModalDeleteBtn.dataset.userName;

    if (!userId || !userName) return;

    if (confirm(`Weet je zeker dat je gebruiker "${userName}" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`)) {
        try {
            const response = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
            await api.handleApiResponse(response); // Handles errors (like 403, 404) and success (204)
            showFlashMessage(`Gebruiker "${userName}" verwijderd.`);
            closeUserModal();
            await loadUsers(); // Refresh the user list
        } catch (error) {
            // Error already handled by handleApiResponse
            console.error(`Failed to delete user ${userId}:`, error);
        }
    }
}


// --- Settings Logic ---
async function handleSaveSettings(event) {
    event.preventDefault();
    if (!defaultThemeSelect || !adventureStoreApiKeyInput) return;

    const settingsData = {
        default_theme: defaultThemeSelect.value,
        adventure_store_api_key: adventureStoreApiKeyInput.value.trim() // Save API key
        // Add other settings here
    };

    try {
        const response = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsData)
        });
        await api.handleApiResponse(response); // Handles errors
        showFlashMessage("Instellingen opgeslagen.");
        // Optionally trigger theme update if default changed?
        // The theme logic should ideally re-fetch system default if user pref is 'system'
    } catch (error) {
        console.error("Failed to save settings:", error);
    }
}
