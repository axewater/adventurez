import * as uiUtils from './uiUtils.js';

/**
 * Handles the response from API calls, checking for errors and parsing JSON.
 * Throws an error if the response is not ok.
 * @param {Response} response - The fetch Response object.
 * @returns {Promise<object|null>} - The parsed JSON data or null for 204 No Content.
 * @throws {Error} - If the response status is not ok.
 */
export async function handleApiResponse(response) {
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error structure' }));
        const errorMessage = errorData?.error || `HTTP error! status: ${response.status}`;
        console.error("API Error:", errorMessage);
        uiUtils.showFlashMessage(`Error: ${errorMessage}`, 5000); // Use flash message for errors
        throw new Error(errorMessage);
    }
    // Handle 204 No Content specifically for DELETE requests
    return response.status === 204 ? null : response.json();
}

// Add other generic API call wrappers here if needed later
// e.g., export async function get(url) { ... }
// export async function post(url, data) { ... }
// export async function put(url, data) { ... }
// export async function del(url) { ... }
