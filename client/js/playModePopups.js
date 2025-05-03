// /client/js/playModePopups.js
// Handles the entity image popup functionality in play mode.

// --- DOM Elements ---
const entityImagePopup = document.getElementById('entity-image-popup');
const entityImagePopupImg = document.getElementById('entity-image-popup-img');
const entityImagePopupDescription = document.getElementById('entity-image-popup-description');
const entityImagePopupCloseBtn = document.getElementById('entity-image-popup-close');

// --- Popup Functions ---

/**
 * Shows the entity image popup with the specified image and description.
 * @param {string} imageFilename - The filename of the entity image.
 * @param {string} descriptionText - The text description to display.
 */
export function showEntityImagePopup(imageFilename, descriptionText) {
    if (!entityImagePopup || !entityImagePopupImg || !entityImagePopupDescription) {
        console.warn("Entity image popup elements not found.");
        return;
    }

    // Construct the full URL, assuming images are in a specific folder
    const imageUrl = `/uploads/images/entiteiten/${imageFilename}`;
    entityImagePopupImg.src = imageUrl;
    entityImagePopupImg.alt = `Image for ${descriptionText || imageFilename}`; // Use description or filename as alt text

    entityImagePopupDescription.textContent = descriptionText || ''; // Set description text

    entityImagePopup.classList.add('visible'); // Make the popup visible (requires CSS)
    console.log(`Showing entity image popup: ${imageUrl}`);
}

/**
 * Hides the entity image popup and clears its content.
 */
export function hideEntityImagePopup() {
    if (!entityImagePopup) return;

    entityImagePopup.classList.remove('visible'); // Hide the popup

    // Clear content to prevent showing old data briefly on next open
    if (entityImagePopupImg) entityImagePopupImg.src = "";
    if (entityImagePopupDescription) entityImagePopupDescription.textContent = "";

    console.log("Hiding entity image popup.");
}

// --- Event Listener Setup ---

/**
 * Sets up the event listener for the popup close button.
 */
export function setupPopupListeners() {
    if (entityImagePopupCloseBtn) {
        entityImagePopupCloseBtn.addEventListener('click', hideEntityImagePopup);
    } else {
        console.warn("Entity image popup close button not found.");
    }

    // Optional: Add listener to close popup on clicking outside the image/description area
    if (entityImagePopup) {
        entityImagePopup.addEventListener('click', (event) => {
            // Close only if the click is directly on the background overlay,
            // not on the image or description elements inside.
            if (event.target === entityImagePopup) {
                hideEntityImagePopup();
            }
        });
    }
}
