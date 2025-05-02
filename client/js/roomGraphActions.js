/* global d3 */ // Inform linters about global variables

import * as api from './api.js';
import * as state from './state.js';
import { showGraphDetailPanel, closeGraphDetailPanel } from './roomGraphPanel.js';

// --- Graph Modification Helpers ---
// These functions now accept graph state (nodes, links, simulation, updateGraph) as arguments.

/**
 * Adds a new node to the graph data and updates the visualization.
 * @param {object} room - The room object {id, title, pos_x, pos_y}.
 * @param {Array} nodes - The current D3 nodes array.
 * @param {d3.Simulation} simulation - The D3 simulation instance.
 * @param {Function} updateGraph - Function to trigger graph update.
 * @param {HTMLElement} graphContainer - The container element for positioning.
 */
export function addNodeToGraph(room, nodes, simulation, updateGraph, graphContainer) {
    if (!simulation) return;
    // Check if node already exists
    if (nodes.some(n => n.id === room.id)) {
        console.warn(`Node ${room.id} already exists in graph data. Skipping add.`);
        return;
    }

    const newNode = {
        id: room.id,
        title: room.title,
        fx: (room.pos_x !== null && !isNaN(room.pos_x)) ? Number(room.pos_x) : null,
        fy: (room.pos_y !== null && !isNaN(room.pos_y)) ? Number(room.pos_y) : null,
        orig_x: room.pos_x,
        orig_y: room.pos_y,
        x: (room.pos_x !== null && !isNaN(room.pos_x)) ? Number(room.pos_x) : (graphContainer?.clientWidth / 2 || 300),
        y: (room.pos_y !== null && !isNaN(room.pos_y)) ? Number(room.pos_y) : (graphContainer?.clientHeight / 2 || 200)
    };
    nodes.push(newNode);
    // We don't add links here, links are added/updated separately
    updateGraph(); // Update to show the new node
}

/**
 * Adds or updates an edge in the graph data based on a new connection.
 * This will find the corresponding grouped link and update its directions/IDs,
 * or create a new grouped link if necessary.
 * @param {object} connection - The connection object {id, from_room_id, to_room_id, direction}.
 * @param {Array} nodes - The current D3 nodes array.
 * @param {Array} links - The current D3 grouped links array.
 * @param {d3.Simulation} simulation - The D3 simulation instance.
 * @param {Function} updateGraph - Function to trigger graph update.
 */
export function addEdgeToGraph(connection, nodes, links, simulation, updateGraph) {
    if (!simulation) return;

    const sourceNode = nodes.find(n => n.id === connection.from_room_id);
    const targetNode = nodes.find(n => n.id === connection.to_room_id);

    if (sourceNode && targetNode) {
        const pairKey = [connection.from_room_id, connection.to_room_id].sort().join('-');
        let group = links.find(l => l.id === pairKey);

        if (group) {
            // Group exists, update it
            if (!group.connectionIds.includes(connection.id)) {
                group.connections.push({ // Add detailed info
                    id: connection.id,
                    direction: connection.direction || ' ',
                    from_room_id: connection.from_room_id,
                    to_room_id: connection.to_room_id,
                });
                group.connectionIds.push(connection.id);
            } else {
                 console.warn(`Connection ${connection.id} already exists in group ${pairKey}. Skipping add.`);
                 return;
            }
        } else {
            // Group doesn't exist, create it
             const newGroup = {
                id: pairKey,
                source: sourceNode,
                target: targetNode,
                connections: [{ // Add detailed info
                    id: connection.id,
                    direction: connection.direction || ' ',
                    from_room_id: connection.from_room_id,
                    to_room_id: connection.to_room_id,
                }],
                connectionIds: [connection.id]
            };
            links.push(newGroup);
        }
        updateGraph(); // Update visualization
    } else {
        console.warn(`Cannot add link for connection ${connection.id}: source or target node not found in graph data.`);
    }
}

/**
 * Removes a node (and connected edges) from the graph data and updates the visualization.
 * @param {string} roomId - The UUID of the room/node to remove.
 * @param {Array} nodes - The current D3 nodes array.
 * @param {Array} links - The current D3 grouped links array.
 * @param {d3.Simulation} simulation - The D3 simulation instance.
 * @param {Function} updateGraph - Function to trigger graph update.
 */
export function removeNodeFromGraph(roomId, nodes, links, simulation, updateGraph) {
    if (!simulation) return;
    const initialNodeCount = nodes.length;
    const updatedNodes = nodes.filter(n => n.id !== roomId);

    // Also remove any grouped links connected to this node
    const initialLinkCount = links.length;
    const updatedLinks = links.filter(l => l.source.id !== roomId && l.target.id !== roomId);

    // Important: Update the original arrays passed by reference (or handle state management differently)
    nodes.length = 0;
    nodes.push(...updatedNodes);
    links.length = 0;
    links.push(...updatedLinks);


    if (nodes.length < initialNodeCount || links.length < initialLinkCount) {
        console.log(`Removed node ${roomId} and associated links from graph data.`);
        updateGraph();
    }
}

/**
 * Removes a specific connection ID from its corresponding grouped link.
 * If the group becomes empty, it removes the group.
 * @param {string} connectionId - The UUID of the connection to remove.
 * @param {Array} links - The current D3 grouped links array.
 * @param {d3.Simulation} simulation - The D3 simulation instance.
 * @param {Function} updateGraph - Function to trigger graph update.
 */
export function removeEdgeFromGraph(connectionId, links, simulation, updateGraph) {
    if (!simulation) return;
    let groupModified = false;
    let groupRemoved = false;

    const updatedLinks = links.filter(group => {
        const index = group.connectionIds.indexOf(connectionId);
        if (index !== -1) {
            group.connectionIds.splice(index, 1);
            // Also remove from the detailed connections array
            group.connections = group.connections.filter(c => c.id !== connectionId);
            groupModified = true;
            if (group.connectionIds.length === 0) {
                groupRemoved = true;
                return false; // Filter out this group
            }
        }
        return true; // Keep the group
    });

    // Update the original array
    links.length = 0;
    links.push(...updatedLinks);

    if (groupModified || groupRemoved) {
        console.log(`Removed connection ${connectionId}. Group modified: ${groupModified}, Group removed: ${groupRemoved}.`);
        updateGraph(); // Update visualization
    } else {
         console.warn(`Connection ID ${connectionId} not found in any link group.`);
    }
}

/**
 * Selects a node in the graph view (visually updates it).
 * Assumes state.selectedRoom has been updated beforehand.
 * @param {string} roomId - The UUID of the room/node to select.
 * @param {boolean} graphInitialized - Flag indicating if the graph SVG/simulation exists.
 * @param {Function} updateGraph - Function to trigger graph update.
 */
export function selectNodeInGraph(roomId, graphInitialized, updateGraph) {
    // The actual selection state is managed by state.selectedRoom.
    // We just need to trigger a visual update based on that state, *if the graph exists*.
    if (graphInitialized) { // Check if graph is initialized before updating
        updateGraph();
    }
}

/**
 * Unselects any selected node in the graph view.
 * @param {boolean} graphInitialized - Flag indicating if the graph SVG/simulation exists.
 * @param {Function} updateGraph - Function to trigger graph update.
 */
export function unselectNodeInGraph(graphInitialized, updateGraph) {
    // Clear the selection in the main state, then update the graph
    state.setSelectedRoom(null);
    // Update the graph *if it exists*
    if (graphInitialized) { // Check if graph is initialized before updating
        updateGraph();
    }
}

/**
 * Handles clicking on a node (room). Opens the side panel with details.
 * If in linking mode, finishes the link; otherwise, shows details.
 * @param {Event} event - The D3 click event object.
 * @param {object} d - The data object (node data) bound to the clicked element.
 * @param {Function} finishLinkingCallback - Callback function to finalize linking mode.
 */
export async function handleNodeClick(event, d, finishLinkingCallback) {
    // Check if we are currently in linking mode (imported or passed state)
    // For now, assume finishLinkingCallback handles the check and returns true if linking was finished
    const linkFinished = await finishLinkingCallback(d.id);
    if (linkFinished) {
        return; // Don't open details panel if we just finished creating a link
    }
    event.stopPropagation(); // Prevent triggering SVG click/zoom
    console.log('Clicked node ' + d.id + ' (' + d.title + ')');

    const nodeRect = d3.select(event.currentTarget); // Get the clicked rectangle element
    try {
        // 1. Fetch full room details
        const roomResponse = await fetch(`/api/rooms/${d.id}`);
        const roomData = await api.handleApiResponse(roomResponse);

        // 2. Fetch entities specifically for this room
        const entitiesResponse = await fetch(`/api/rooms/${d.id}/entities`);
        const entitiesData = await api.handleApiResponse(entitiesResponse);

        // 3. Show the panel
        showGraphDetailPanel(roomData, entitiesData, nodeRect);

    } catch (error) {
        console.error(`Failed to load details for room ${d.id} in graph panel:`, error);
        alert(`Error loading room details: ${error.message}`);
        closeGraphDetailPanel(); // Close panel on error
    }
}

// --- Export newly needed actions ---
export {
    // removeEdgeFromGraph is exported inline above
};
