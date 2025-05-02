import * as api from './api.js';

let systemDefaultTheme = 'light'; // Cache system default

/**
 * Fetches the system default theme from the admin settings API.
 * Caches the result.
 */
async function fetchSystemDefaultTheme() {
    try {
        // Use the public stats endpoint temporarily if settings isn't public,
        // or ideally create a dedicated public endpoint for default theme.
        // For now, assume /api/admin/settings is accessible (adjust if needed)
        // A better approach would be to pass the default theme from the backend during initial page load.
        const response = await fetch('/api/admin/settings'); // Adjust endpoint if needed
        if (response.ok) {
            const settings = await response.json();
            systemDefaultTheme = settings.default_theme || 'light';
            console.log(`Fetched system default theme: ${systemDefaultTheme}`);
        } else {
             console.warn(`Failed to fetch system settings (status: ${response.status}). Using default theme 'light'.`);
             systemDefaultTheme = 'light'; // Fallback
        }
    } catch (error) {
        console.error("Error fetching system default theme:", error);
        systemDefaultTheme = 'light'; // Fallback on error
    }
}

/**
 * Applies the theme class ('theme-light' or 'theme-dark') to the <body> element.
 * @param {'light' | 'dark' | 'system' | null} userPreference - The user's chosen preference.
 */
export function applyTheme(userPreference) {
    let themeToApply = 'light'; // Default theme

    if (userPreference === 'light' || userPreference === 'dark') {
        themeToApply = userPreference;
    } else { // 'system' or null/undefined
        themeToApply = systemDefaultTheme;
    }

    console.log(`Applying theme: ${themeToApply} (User: ${userPreference}, System: ${systemDefaultTheme})`);
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(`theme-${themeToApply}`);
}

/**
 * Initializes the theme by fetching user preference and system default, then applying the theme.
 */
export async function initializeTheme() {
    // Fetch system default first (can happen in parallel with user prefs)
    await fetchSystemDefaultTheme();

    // Check if user is logged in (simple check based on presence of logout button or user info)
    const isLoggedIn = !!document.querySelector('.logout-button');

    let userPreference = 'system'; // Default for guests

    if (isLoggedIn) {
        try {
            const response = await fetch('/api/prefs/me');
            if (response.ok) {
                const prefs = await response.json();
                userPreference = prefs.theme_preference || 'system';
            } else {
                console.warn(`Failed to fetch user preferences (status: ${response.status}). Using system default.`);
            }
        } catch (error) {
            console.error("Error fetching user preferences:", error);
        }
    }

    applyTheme(userPreference);
}
