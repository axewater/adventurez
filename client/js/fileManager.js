// /client/js/fileManager.js
import * as api from './api.js';
import * as uiUtils from './uiUtils.js';

// --- DOM Element Caching ---
const fileListTable = document.getElementById('file-list-table');
const fileListTbody = fileListTable?.querySelector('tbody');
const fileListThead = fileListTable?.querySelector('thead');
const currentPathSpan = document.getElementById('current-file-path');
const uploadFileBtn = document.getElementById('upload-file-btn-icon'); // New upload button
const newFolderBtn = document.getElementById('new-folder-btn-icon');

// --- State ---
let currentSortColumn = 'name'; // Default sort column
let currentSortDirection = 'asc'; // Default sort direction ('asc' or 'desc')
let currentDirectory = ''; // Path relative to the uploads root, e.g., "images/icons" or "" for root

// --- File List Management ---

/**
 * Fetches the list of uploaded files from the server and renders them.
 * @param {string} [directoryPath=''] - The subdirectory path to fetch.
 */
export async function fetchAndRenderFiles(directoryPath = '') {
    if (!fileListTbody) return;
    fileListTbody.innerHTML = '<tr><td colspan="3"><i>Loading...</i></td></tr>'; // Show loading indicator in table (colspan 3)
    currentDirectory = directoryPath; // Update current directory state

    try {
        const response = await fetch(`/api/files?path=${encodeURIComponent(currentDirectory)}`);
        const files = await api.handleApiResponse(response);
        renderFileList(files); // Render the fetched files
    } catch (error) {
        console.error("Failed to fetch file list:", error);
        fileListTbody.innerHTML = '<tr><td colspan="3">Error loading files.</td></tr>'; // Colspan 3
        uiUtils.showFlashMessage(`Error loading files: ${error.message}`, 5000);
    }
}

/**
 * Formats file size in bytes to a human-readable string (KB, MB, GB).
 * @param {number} bytes - The file size in bytes.
 * @returns {string} - The formatted file size string.
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    // Ensure the index is within the bounds of the sizes array
    const sizeIndex = Math.min(i, sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(1)) + ' ' + sizes[sizeIndex];
}

/**
 * Gets an appropriate CSS class for a file type icon based on its extension.
 * @param {string} filename - The name of the file.
 * @returns {string} - A CSS class name (e.g., 'icon-image', 'icon-doc').
 */
function getFileIconClass(filename) {
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    switch (extension) {
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'ico':
        case 'bmp':
        case 'svg':
        case 'webp':
            return 'icon-image';
        case 'txt':
        case 'md':
        case 'doc':
        case 'docx':
            return 'icon-doc';
        case 'pdf':
            return 'icon-pdf';
        case 'json':
            return '⚙️'; // JSON/Config
        case 'zip':
        case 'rar':
        case '7z':
            return 'icon-archive';
        case 'mp3':
        case 'wav':
        case 'ogg':
        case 'aac': // Audio
            return 'icon-audio';
        case 'mp4':
        case 'avi':
        case 'mov': // Video
        case 'mkv':
            return '🎬'; // Video
        default:
            return 'icon-unknown';
    }
}

/**
 * Renders the list of files in the UI.
 * @param {Array<object>} items - Array of file/directory objects { name: string, type: 'file'|'directory', url?: string, path: string, size?: number }.
 */
function renderFileList(items) {
    if (!fileListTable || !fileListThead || !fileListTbody) return;
    fileListTbody.innerHTML = ''; // Clear table body

    // --- Render Breadcrumbs ---
    if (currentPathSpan) {
        currentPathSpan.innerHTML = ''; // Clear previous breadcrumbs

        // Root link
        const rootLink = document.createElement('a');
        rootLink.href = '#'; // Prevent page jump
        rootLink.textContent = '/uploads';
        rootLink.classList.add('breadcrumb-link');
        rootLink.addEventListener('click', (e) => {
            e.preventDefault();
            fetchAndRenderFiles(''); // Navigate to root
        });
        currentPathSpan.appendChild(rootLink);

        // Build path segments
        const pathSegments = currentDirectory.split('/').filter(segment => segment); // Filter out empty strings
        let cumulativePath = '';
        pathSegments.forEach((segment, index) => {
            cumulativePath += (index > 0 ? '/' : '') + segment;
            const separator = document.createElement('span');
            separator.textContent = ' > ';
            separator.classList.add('breadcrumb-separator');
            currentPathSpan.appendChild(separator);

            if (index === pathSegments.length - 1) { // Last segment is the current directory
                const currentSegmentSpan = document.createElement('span');
                currentSegmentSpan.textContent = segment;
                currentSegmentSpan.classList.add('breadcrumb-current');
                currentPathSpan.appendChild(currentSegmentSpan);
            } else { // Intermediate segment, make it a link
                const segmentLink = document.createElement('a');
                segmentLink.href = '#';
                segmentLink.textContent = segment;
                segmentLink.classList.add('breadcrumb-link');
                segmentLink.dataset.path = cumulativePath; // Store path to navigate to
                segmentLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    fetchAndRenderFiles(e.target.dataset.path);
                });
                currentPathSpan.appendChild(segmentLink);
            }
        });
    }

    // Add "Up" directory link if not in the root
    if (currentDirectory) {
        const li = document.createElement('li');
        const tr = document.createElement('tr');
        tr.classList.add('up-directory'); // Add class for styling
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => {
            // Find the last '/' and take the substring before it.
            // If no '/' is found (e.g., currentDirectory is "folder"), the parent is root ("").
            const lastSlashIndex = currentDirectory.lastIndexOf('/');
            const parentPath = lastSlashIndex > -1 ? currentDirectory.substring(0, lastSlashIndex) : '';
            console.log(`Navigating up from '${currentDirectory}' to '${parentPath}'`);
            fetchAndRenderFiles(parentPath);
        });

        const nameTd = document.createElement('td');
        nameTd.innerHTML = '<span class="file-icon icon-up"></span> .. (Up)';
        nameTd.colSpan = 3; // Span across all columns

        tr.appendChild(nameTd);
        fileListTbody.appendChild(tr);
    }

    // --- Sort Items ---
    if (items && items.length > 0) {
        items.sort((a, b) => {
            let valA, valB;
            switch (currentSortColumn) {
                case 'size':
                    // Directories have no size, treat as 0 or -1 for sorting purposes
                    valA = a.type === 'file' ? a.size : -1;
                    valB = b.type === 'file' ? b.size : -1;
                    break;
                case 'type':
                    valA = a.type;
                    valB = b.type;
                    break;
                case 'name':
                default:
                    valA = a.name.toLowerCase();
                    valB = b.name.toLowerCase();
                    break;
            }

            let comparison = 0;
            if (valA < valB) {
                comparison = -1;
            } else if (valA > valB) {
                comparison = 1;
            }

            return currentSortDirection === 'desc' ? (comparison * -1) : comparison;
        });
    }

    // --- Render Table Header ---
    renderTableHeader();

    // --- Render Table Body ---
    if (!items || items.length === 0) {
        // Show "empty" message only if the list is truly empty (no "Up" link added)
        if (fileListTbody.children.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 3; // Span across all columns
            td.textContent = 'This directory is empty.';
            td.style.fontStyle = 'italic';
            td.style.color = '#888';
            td.style.textAlign = 'center';
            tr.appendChild(td);
            fileListTbody.appendChild(tr);
        }
        return;
    }

    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.itemId = item.path; // Use path as a unique identifier for the row if needed
        tr.style.cursor = 'pointer'; // Indicate the row is clickable

        // Icon span
        const iconSpan = document.createElement('span');
        iconSpan.classList.add('file-icon'); // Base class for all icons
        iconSpan.classList.add(item.type === 'directory' ? 'icon-folder' : getFileIconClass(item.name));

        // 1. Name Column
        const nameTd = document.createElement('td');
        const fileNameSpan = document.createElement('span');
        fileNameSpan.textContent = item.name; // Just the name now

        nameTd.appendChild(iconSpan);
        nameTd.appendChild(fileNameSpan);

        // 2. Size Column
        const sizeTd = document.createElement('td');

        // 3. Type Column (will also contain delete button)
        const typeTd = document.createElement('td');
        typeTd.classList.add('type-actions-cell'); // Add class for specific styling

        if (item.type === 'directory') {
            sizeTd.textContent = '—'; // Dash for directory size
            typeTd.textContent = 'Directory';
        } else { // It's a file
            sizeTd.textContent = formatFileSize(item.size);
            const extension = item.name.split('.').pop()?.toLowerCase() || '';
            typeTd.textContent = extension ? `${extension.toUpperCase()} File` : 'File';
        }

        // --- Row Click Listener ---
        // Note: The delete button and its listener have been removed.
        // Deletion is now handled exclusively via the context menu.

        // --- Add Row Click Listener ---
        tr.addEventListener('click', (event) => {
            // Handle row click based on item type
            if (item.type === 'directory') {
                fetchAndRenderFiles(item.path); // Navigate into directory
            } else if (item.type === 'file') {
                window.open(item.url, '_blank'); // Open file in new tab
            }
        });

        // Append all TDs to the TR
        tr.appendChild(nameTd);
        tr.appendChild(sizeTd);
        tr.appendChild(typeTd);
        fileListTbody.appendChild(tr);

        // --- Add Context Menu ---
        tr.addEventListener('contextmenu', (event) => {
            event.preventDefault(); // Prevent default browser context menu
            const menuItems = [];

            // Add Rename action
            menuItems.push({
                label: 'Rename',
                icon: '✏️', // Edit icon
                action: () => handleRenameItem(item.path, item.type, item.name)
            });

            // Add Download action only for files
            if (item.type === 'file') {
                menuItems.push({
                    label: 'Download',
                    icon: '⬇️', // Download icon
                    action: () => window.open(item.url, '_blank') // Simple download action
                });
            }

            menuItems.push({ label: '---' }); // Separator
            menuItems.push({
                label: 'Delete',
                icon: '🗑️', // Trash icon
                action: () => handleDeleteItem(event, item.path, item.type, item.name) // Pass details directly
            });
            uiUtils.showCustomContextMenu(event, menuItems);
        });
    });
}

/** Renders the table header with sortable columns. */
function renderTableHeader() {
    if (!fileListThead) return;
    fileListThead.innerHTML = ''; // Clear existing header

    const tr = document.createElement('tr');
    const columns = [
        { key: 'name', label: 'Name' },
        { key: 'size', label: 'Size' }, // Sortable
        { key: 'type', label: 'Type' } // Sortable by type, contains actions
    ];

    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col.label;
        th.dataset.sortKey = col.key;
        // All columns are potentially sortable now
        if (col.key) {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => handleSort(col.key));

            // Add sort indicator if this is the current sort column
            if (col.key === currentSortColumn) {
                th.classList.add(currentSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
                const arrowSpan = document.createElement('span');
                arrowSpan.classList.add('sort-arrow');
                th.appendChild(arrowSpan);
            }
        }
        tr.appendChild(th);
    });

    fileListThead.appendChild(tr);
}

/** Handles clicking on a table header to sort. */
function handleSort(sortKey) {
    if (currentSortColumn === sortKey) {
        // Toggle direction if clicking the same column
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // Switch to new column, default to ascending
        currentSortColumn = sortKey;
        currentSortDirection = 'asc';
    }
    // Re-fetch and render with new sort order
    fetchAndRenderFiles(currentDirectory);
}

// --- File Upload ---

/**
 * Uploads a list of files to the current directory.
 * @param {FileList} fileList - The list of files to upload.
 */
async function uploadFiles(fileList) {
    if (!fileList || fileList.length === 0) {
        uiUtils.showFlashMessage("No files selected to upload.", 3000);
        return;
    }

    const uploadPromises = [];
    const totalFiles = fileList.length;
    let successCount = 0;
    let failureCount = 0;

    uiUtils.showFlashMessage(`Uploading ${totalFiles} file(s)...`, 2000);

    for (const file of fileList) {
        const formData = new FormData();
        formData.append('path', currentDirectory); // Send current directory path
        formData.append('file', file);

        uploadPromises.push(
            fetch('/api/files/upload', {
                method: 'POST',
                body: formData,
            })
            .then(response => api.handleApiResponse(response)) // Use handleApiResponse to check for errors
            .then(result => {
                console.log(`Upload successful: ${result.filename}`);
                successCount++;
            })
            .catch(error => {
                console.error(`Upload failed for ${file.name}:`, error);
                failureCount++;
                // Alert is handled by handleApiResponse, but we log here too
            })
        );
    }

    // Wait for all uploads to complete
    await Promise.all(uploadPromises);

    // Show summary message and refresh file list
    uiUtils.showFlashMessage(`Upload complete: ${successCount} successful, ${failureCount} failed.`, 5000);
    if (successCount > 0) {
        await fetchAndRenderFiles(currentDirectory); // Refresh the current directory if any succeeded
    }
}

// --- Item Renaming ---

/**
 * Handles renaming a file or folder.
 * @param {string} itemPath - The relative path of the item to rename.
 * @param {string} itemType - 'file' or 'directory'.
 * @param {string} currentName - The current name of the item.
 */
async function handleRenameItem(itemPath, itemType, currentName) {
    const newName = prompt(`Enter the new name for the ${itemType === 'directory' ? 'directory' : 'file'} "${currentName}":`, currentName);

    if (!newName || !newName.trim() || newName.trim() === currentName) {
        if (newName !== null && newName.trim() !== currentName) { // Only alert if user entered empty string, not if cancelled or unchanged
            uiUtils.showFlashMessage("New name cannot be empty.", 5000);
        }
        return;
    }

    const cleanNewName = newName.trim();

    try {
        const response = await fetch('/api/files/rename', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: itemPath, new_name: cleanNewName })
        });
        const result = await api.handleApiResponse(response);

        uiUtils.showFlashMessage(`${itemType === 'directory' ? 'Directory' : 'File'} renamed to '${result.new_name}'.`);
        await fetchAndRenderFiles(currentDirectory); // Refresh the current directory

    } catch (error) { // Error is already handled and alerted by handleApiResponse
        console.error(`Renaming ${itemType} failed:`, error);
        // uiUtils.showFlashMessage(`Rename failed: ${error.message}`, 5000);
    }
}

// --- Item Deletion ---

/**
 * Handles deleting a file or folder, potentially triggered by button or context menu.
 * @param {Event} event - The click event object.
 * @param {string} [forcedPath] - Optional path passed directly (e.g., from context menu).
 * @param {string} [forcedType] - Optional type passed directly.
 * @param {string} [forcedName] - Optional name passed directly.
 */
async function handleDeleteItem(event, forcedPath, forcedType, forcedName) {
    const button = event?.target?.closest('button'); // Find button if event triggered the action
    const itemPath = forcedPath ?? button?.dataset.itemPath;
    const itemName = forcedName ?? button?.dataset.itemName;
    const itemType = forcedType ?? button?.dataset.itemType; // Get type

    if (!itemPath) {
        console.error("Delete button missing item path data.");
        return;
    }

    // Adjust confirmation message based on type
    if (confirm(`Are you sure you want to delete "${itemName}"? This cannot be undone.`)) {
        // Disable button only if it exists (i.e., action triggered by button click)
        if (button) button.disabled = true;
        const originalText = button?.textContent;
        // Change text only if button exists
        if (button) button.textContent = 'Deleting...';

        uiUtils.hideCustomContextMenu(); // Hide context menu if open
        try {
            const response = await fetch(`/api/files/${encodeURIComponent(itemPath)}`, { // Use itemPath in URL
                method: 'DELETE',
            });
            await api.handleApiResponse(response); // Checks for errors (expects 204 or error JSON)

            uiUtils.showFlashMessage(`${itemType === 'directory' ? 'Directory' : 'File'} '${itemName}' successfully deleted.`);
            await fetchAndRenderFiles(currentDirectory); // Refresh the current directory

        } catch (error) { // Error is already handled and alerted by handleApiResponse
            console.error(`Failed to delete ${itemType} ${itemName}:`, error);
            uiUtils.showFlashMessage(`Deletion failed: ${error.message}`, 5000);
            // Re-enable button on failure only if it exists
            if (button) {
                button.disabled = false;
                button.textContent = originalText || 'Delete';
            }
        }
        // No finally needed here, button is removed with list refresh on success
    }
}

// --- Folder Creation ---

/**
 * Handles the click event for the "New Folder" button.
 */
async function handleCreateFolder() {
    const folderName = prompt("Enter the name for the new folder:");
    if (!folderName || !folderName.trim()) {
        if (folderName !== null) { // Only show alert if user entered empty string, not if cancelled
            uiUtils.showFlashMessage("Folder name cannot be empty.", 5000);
        }
        return;
    }

    const cleanFolderName = folderName.trim();
    if (newFolderBtn) newFolderBtn.disabled = true;

    try {
        const response = await fetch('/api/files/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: currentDirectory, folder_name: cleanFolderName })
        });
        const result = await api.handleApiResponse(response);

        uiUtils.showFlashMessage(`Folder '${result.folder_name}' successfully created in /${currentDirectory || ''}.`);
        await fetchAndRenderFiles(currentDirectory); // Refresh the current directory

    } catch (error) { // Error is already handled and alerted by handleApiResponse
        console.error("Folder creation failed:", error);
        // uiUtils.showFlashMessage(`Folder creation failed: ${error.message}`, 5000);
    } finally {
        if (newFolderBtn) newFolderBtn.disabled = false;
    }
}

// --- Initialization ---

/**
 * Sets up event listeners for the file manager UI elements.
 */
export function initializeFileManager() {

    if (newFolderBtn) {
        newFolderBtn.addEventListener('click', handleCreateFolder);
    } else {
        console.warn("New Folder button not found during file manager initialization.");
    }

    // --- NEW: Upload File Button Listener ---
    if (uploadFileBtn) {
        uploadFileBtn.addEventListener('click', () => {
            // Create a temporary file input element
            const tempInput = document.createElement('input');
            tempInput.type = 'file';
            tempInput.multiple = true; // Allow multiple file selection
            // Optional: Set accept attribute based on allowed types if needed
            // tempInput.accept = "image/*,text/plain,...";

            // Listen for the 'change' event when files are selected
            tempInput.addEventListener('change', (event) => {
                if (event.target.files.length > 0) {
                    uploadFiles(event.target.files); // Upload the selected files
                }
                // Clean up the temporary input element
                tempInput.remove();
            });

            // Trigger the click event to open the OS file browser
            tempInput.click();
        });
    } else {
        console.warn("Upload File button not found during file manager initialization.");
    }

    // --- NEW: Drag and Drop Listeners ---
    const fileManagerContent = document.getElementById('file-manager-content');
    if (fileManagerContent) {
        // Prevent default behavior for drag events
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            fileManagerContent.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        // Add visual cue on drag enter/over
        ['dragenter', 'dragover'].forEach(eventName => {
            fileManagerContent.addEventListener(eventName, () => {
                fileManagerContent.classList.add('drag-over');
            }, false);
        });

        // Remove visual cue on drag leave/drop
        ['dragleave', 'drop'].forEach(eventName => {
            fileManagerContent.addEventListener(eventName, () => {
                fileManagerContent.classList.remove('drag-over');
            }, false);
        });

        // Handle dropped files
        fileManagerContent.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                uploadFiles(files); // Upload dropped files
            }
        }, false);
    } else {
        console.warn("File manager content area not found for drag & drop setup.");
    }

    // Initial fetch of root directory files when the module is initialized
    // or when the tab becomes active (handled by tabChanged listener)
    const filesTab = document.getElementById('files-tab');
    if (filesTab && filesTab.classList.contains('active')) {
        fetchAndRenderFiles(''); // Fetch root directory
    }

    console.log("File Manager Initialized.");
}

// Add listener to fetch files when the tab becomes active
// Fetch the root directory by default when switching to the tab
document.addEventListener('tabChanged', (event) => {
    if (event.detail.newTabId === 'files-tab') {
        fetchAndRenderFiles(''); // Explicitly fetch root
    }
});
