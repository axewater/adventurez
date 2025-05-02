import * as api from './api.js';

const scoresContainer = document.getElementById('scores-container');
const loadingMessage = document.getElementById('scores-loading-message');
const tableWrapper = document.getElementById('scores-table-wrapper');
const scoresTable = document.getElementById('high-scores-table');
const tableHead = scoresTable?.querySelector('thead');
const tableBody = scoresTable?.querySelector('tbody');

/**
 * Fetches high score data from the API.
 * @returns {Promise<object|null>} The high score data or null on error.
 */
async function fetchHighScores() {
    console.log("Fetching high scores...");
    try {
        const response = await fetch('/api/highscores');
        const data = await api.handleApiResponse(response);
        console.log("High scores fetched:", data);
        return data;
    } catch (error) {
        console.error("Failed to fetch high scores:", error);
        if (loadingMessage) {
            loadingMessage.textContent = 'Fout bij het laden van scores.';
            loadingMessage.style.color = 'red';
        }
        return null;
    }
}

/**
 * Renders the high score table based on the fetched data.
 * @param {object} data - The high score data object from the API.
 */
function renderHighScoresTable(data) {
    if (!data || !tableHead || !tableBody || !loadingMessage || !tableWrapper) {
        console.error("High score table elements not found.");
        if (loadingMessage) loadingMessage.textContent = 'Fout bij het weergeven van de tabel.';
        return;
    }

    const { games, scores } = data;

    // Clear previous content
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';
    loadingMessage.style.display = 'none'; // Hide loading message
    tableWrapper.style.display = 'block'; // Show table wrapper

    // --- Create Table Header ---
    const headerRow = tableHead.insertRow();
    // Add User column header
    const userHeader = document.createElement('th');
    userHeader.textContent = 'Gebruiker';
    headerRow.appendChild(userHeader);
    // Add Game column headers
    games.forEach(gameName => {
        const gameHeader = document.createElement('th');
        gameHeader.textContent = gameName;
        headerRow.appendChild(gameHeader);
    });
    // Add Total column header
    const totalHeader = document.createElement('th');
    totalHeader.textContent = 'Totaal';
    headerRow.appendChild(totalHeader);

    // --- Populate Table Body ---
    if (scores.length === 0) {
        const row = tableBody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = games.length + 2; // Span across all columns
        cell.textContent = 'Nog geen scores beschikbaar.';
        cell.style.textAlign = 'center';
        cell.style.fontStyle = 'italic';
    } else {
        scores.forEach(userScoreData => {
            const row = tableBody.insertRow();
            // Add User cell
            const userCell = row.insertCell();
            userCell.textContent = userScoreData.user_name;
            // Add Game score cells
            games.forEach(gameName => {
                const scoreCell = row.insertCell();
                scoreCell.textContent = userScoreData.scores[gameName] ?? 0; // Use 0 if score missing
                scoreCell.classList.add('score-cell'); // Add class for styling
            });
            // Add Total score cell
            const totalCell = row.insertCell();
            totalCell.textContent = userScoreData.total_score;
            totalCell.classList.add('total-score-cell'); // Add class for styling
        });
    }
}

/**
 * Loads and renders the high scores when the Scores tab is activated.
 */
export async function loadAndRenderHighScores() {
    if (!scoresContainer || !loadingMessage || !tableWrapper) return;

    // Show loading message and hide table initially
    loadingMessage.textContent = 'Scores laden...';
    loadingMessage.style.color = ''; // Reset color
    loadingMessage.style.display = 'block';
    tableWrapper.style.display = 'none';

    const scoreData = await fetchHighScores();
    if (scoreData) {
        renderHighScoresTable(scoreData);
    }
    // Error message is handled within fetchHighScores/renderHighScoresTable
}
