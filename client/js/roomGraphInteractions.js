/* global d3 */ // Inform linters about global variables

import * as state from './state.js'; // Import the state module
import { openEntityModal } from './roomGraphPanel.js'; // Import the modal function
import * as api from './api.js';
import * as uiUtils from './uiUtils.js'; // Import the whole module
import { showCustomContextMenu } from './uiUtils.js'; // Import the specific function
import { addEdgeToGraph, removeNodeFromGraph, removeEdgeFromGraph } from './roomGraphActions.js'; // Import graph modification actions
import { selectRoom, renderRoomList } from './roomList.js'; // Import for selecting/updating list view
import { saveNodePosition } from './d3GraphHandlers.js'; // Import saveNodePosition

// --- Constants ---
const ALL_DIRECTIONS = ['noord', 'oost', 'zuid', 'west', 'omhoog', 'omlaag', 'in', 'uit'];

// --- Linking Mode Functions ---

/**
 * Starts the linking process from a source node.
 * @param {string} sourceNodeId - The ID of the node to start linking from.
 * @param {object} graphRefs - Object containing references { svg, zoomLayer, nodes, tempLinkLineRef, isLinkingRef, linkingSourceNodeIdRef }.
 */
export function startLinking(sourceNodeId, graphRefs) {
    if (!graphRefs.svg || !graphRefs.zoomLayer) return;
    graphRefs.isLinkingRef.current = true;
    graphRefs.linkingSourceNodeIdRef.current = sourceNodeId;
    console.log(`Starting link from node: ${sourceNodeId}`);

    const sourceNode = graphRefs.nodes.find(n => n.id === sourceNodeId);
    if (!sourceNode) {
        cancelLinking(graphRefs);
        return;
    }

    // Create temporary line attached to the zoomLayer
    graphRefs.tempLinkLineRef.current = graphRefs.zoomLayer.append("line")
        .attr("class", "temp-link")
        .attr("x1", sourceNode.x)
        .attr("y1", sourceNode.y)
        .attr("x2", sourceNode.x) // Initially points to itself
        .attr("y2", sourceNode.y)
        .attr("stroke", "#ff8c00") // Orange color for temp line
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5")
        .style("pointer-events", "none"); // Don't let it interfere with clicks

    graphRefs.svg.style("cursor", "crosshair");
}

/**
 * Cancels the linking process.
 * @param {object} graphRefs - Object containing references { svg, tempLinkLineRef, isLinkingRef, linkingSourceNodeIdRef }.
 */
export function cancelLinking(graphRefs) {
    if (!graphRefs.isLinkingRef.current) return;
    // Ensure this runs *before* any potential new click/link start
    console.log("Cancelling link.");
    graphRefs.isLinkingRef.current = false;
    graphRefs.linkingSourceNodeIdRef.current = null;
    if (graphRefs.tempLinkLineRef.current) {
        graphRefs.tempLinkLineRef.current.remove();
        graphRefs.tempLinkLineRef.current = null;
    }
    if (graphRefs.svg) graphRefs.svg.style("cursor", "default"); // Reset cursor
}

/**
 * Finds the opposite direction for standard directions.
 * @param {string} direction - The direction (e.g., 'noord').
 * @returns {string|null} - The opposite direction or null if not standard.
 */
function getOppositeDirection(direction) {
    const opposites = {
        'noord': 'zuid',
        'zuid': 'noord',
        'oost': 'west',
        'west': 'oost',
        'omhoog': 'omlaag',
        'omlaag': 'omhoog',
        'in': 'uit',
        'uit': 'in'
    };
    return opposites[direction.toLowerCase()] || null;
}

/**
 * Finds the first available standard direction from a source room.
 * @param {string} sourceRoomId - The ID of the source room.
 * @param {Array} existingConnections - Array of connections originating from the source room.
 * @returns {string} - The first available direction (defaults to 'noord').
 */
function findAvailableDirection(sourceRoomId, existingConnections) {
    const usedDirections = new Set(existingConnections.map(c => c.direction.toLowerCase()));
    for (const dir of ALL_DIRECTIONS) {
        if (!usedDirections.has(dir)) {
            return dir;
        }
    }
    return 'noord'; // Fallback if all standard directions are somehow used
}

/**
 * Finishes the linking process when a target node is clicked.
 * @param {string} targetNodeId - The ID of the target node.
 * @param {object} graphRefs - Object containing references { nodes, links, simulation, updateGraph, isLinkingRef, linkingSourceNodeIdRef, tempLinkLineRef, svg }.
 * @returns {Promise<boolean>} - True if linking finished successfully, false otherwise.
 */
export async function finishLinking(targetNodeId, graphRefs) {
    if (!graphRefs.isLinkingRef.current || !graphRefs.linkingSourceNodeIdRef.current || targetNodeId === graphRefs.linkingSourceNodeIdRef.current) {
        // Don't cancel here if it's just a self-click, let the node click handler proceed.
        // Only cancel if not linking or no source node.
        if (!graphRefs.isLinkingRef.current || !graphRefs.linkingSourceNodeIdRef.current) {
            cancelLinking(graphRefs);
        }
        return false; // Indicate linking did not finish successfully
    }

    console.log(`Finishing link from ${graphRefs.linkingSourceNodeIdRef.current} to ${targetNodeId}`);
    const sourceId = graphRefs.linkingSourceNodeIdRef.current; // Store before cancelling
    const targetId = targetNodeId;
    let success = false; // Track if the API call was successful

    // --- Determine Smart Default Direction ---
    let defaultDirection = 'noord'; // Start with default
    try {
        // 1. Fetch existing connections from the source room
        const sourceConnectionsResponse = await fetch(`/api/rooms/${sourceId}/connections`);
        const sourceConnections = await api.handleApiResponse(sourceConnectionsResponse);

        // 2. Check for existing connections between source and target (in either direction)
        const existingConnectionToTarget = sourceConnections.find(c => c.to_room_id === targetId);
        const existingConnectionFromTargetResponse = await fetch(`/api/rooms/${targetId}/connections`);
        const targetConnections = await api.handleApiResponse(existingConnectionFromTargetResponse);
        const existingConnectionFromTarget = targetConnections.find(c => c.to_room_id === sourceId);

        if (existingConnectionFromTarget) {
            // If a connection exists from target back to source, suggest the opposite direction
            const opposite = getOppositeDirection(existingConnectionFromTarget.direction);
            if (opposite && !sourceConnections.some(c => c.direction === opposite)) { // Check if opposite is available from source
                defaultDirection = opposite;
            } else {
                // Opposite not standard or already taken, find first available
                defaultDirection = findAvailableDirection(sourceId, sourceConnections);
            }
        } else {
            // No connection from target to source, find first available from source
            defaultDirection = findAvailableDirection(sourceId, sourceConnections);
        }
        console.log(`Smart default direction determined: ${defaultDirection}`);
    } catch (error) {
        console.error("Error determining smart default direction:", error);
        // Proceed with the basic 'noord' default if fetching connections fails
    }

    // Make API call to create the connection
    try {
        const response = await fetch(`/api/rooms/${sourceId}/connections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Use the determined smart default direction
            body: JSON.stringify({ to_room_id: targetId, direction: defaultDirection })
        });
        const newConnection = await api.handleApiResponse(response);
        console.log("Connection created via graph:", newConnection);

        // Add edge to graph visualization
        addEdgeToGraph(newConnection, graphRefs.nodes, graphRefs.links, graphRefs.simulation, graphRefs.updateGraph);

        // Update state if needed
        if (state.selectedRoom && state.selectedRoom.id === sourceId) {
            if (!state.selectedRoom.connections) state.selectedRoom.connections = [];
            state.selectedRoom.connections.push(newConnection);
            // TODO: If room details panel (list view) is open, update its connection list UI
            // import('./roomDetails.js').then(mod => mod.renderConnectionsList(state.selectedRoom.connections));
        }

        uiUtils.dispatchGameDataChangedEvent('graphLinkCreated');
        state.setUnsavedChanges(true); // Mark changes
        uiUtils.updateSaveStatusIndicator();
        success = true; // Mark as successful

    } catch (error) {
        console.error("Failed to create connection via graph:", error);
        // Alert handled by handleApiResponse
    } finally {
        cancelLinking(graphRefs); // Clean up linking state regardless of success/failure
    }
    return success; // Return true only if the API call succeeded
}

// --- Event Handlers for Graph Interactions ---

/**
 * Handles mouse movement on the SVG, updating the temporary link line.
 * @param {Event} event - The D3 mousemove event.
 * @param {object} graphRefs - Object containing references { zoomLayer, tempLinkLineRef, isLinkingRef }.
 */
export function handleSvgMouseMove(event, graphRefs) {
    if (!graphRefs.isLinkingRef.current || !graphRefs.tempLinkLineRef.current || !graphRefs.zoomLayer) return;
    // Get mouse position relative to the zoomLayer group
    const [mouseX, mouseY] = d3.pointer(event, graphRefs.zoomLayer.node());
    graphRefs.tempLinkLineRef.current.attr("x2", mouseX).attr("y2", mouseY);
}

/**
 * Handles clicks on the SVG background.
 * @param {Event} event - The D3 click event.
 * @param {object} graphRefs - Object containing references { svg, zoomLayer, isLinkingRef, tempLinkLineRef, linkingSourceNodeIdRef }.
 */
export function handleSvgClick(event, graphRefs) {
    uiUtils.hideCustomContextMenu(); // Hide menu on any click on the SVG background
    // If clicking on the background while linking, cancel linking
    // Check if the click target is the SVG itself or the zoomLayer group
    const isBackgroundClick = event.target === graphRefs.svg?.node() || event.target === graphRefs.zoomLayer?.node();

    if (graphRefs.isLinkingRef.current && isBackgroundClick) {
        cancelLinking(graphRefs);
    }
    // Otherwise, the click might be handled by zoom/pan or node click
}

/**
 * Handles right-clicking on a node. Shows context menu or cancels linking.
 * @param {Event} event - The D3 contextmenu event.
 * @param {object} d - The data object (node data) bound to the clicked element.
 * @param {object} graphRefs - Object containing references { svg, zoomLayer, nodes, tempLinkLineRef, isLinkingRef, linkingSourceNodeIdRef, links, simulation, updateGraph, graphContainer }.
 */
export function handleNodeRightClick(event, d, graphRefs) {
    event.preventDefault(); // Prevent browser context menu
    event.stopPropagation(); // Prevent background right-click

    if (graphRefs.isLinkingRef.current) {
        cancelLinking(graphRefs); // Right-click cancels linking mode
    } else {
        // Show custom context menu
        const menuItems = [
            { label: "🔗 Maak verbinding", action: () => startLinking(d.id, graphRefs) },
            { label: "➕ Nieuwe Entiteit", action: () => openEntityModal(null, 'add', d.id) }, // NEW: Add Entity option
            { label: "🗑️ Verwijder Kamer", action: () => deleteRoomFromGraph(d.id, d.title, graphRefs) },
            { label: "---" }, // Separator
            // { label: "Details...", action: () => handleNodeClick(event, d, () => false) } // Open details panel
        ];
        uiUtils.showCustomContextMenu(event, menuItems);
    }
}

/**
 * Sorts the graph nodes using the force simulation and fits them into the view.
 * @param {object} graphRefs - Object containing references { nodes, links, simulation, svg, zoomLayer, zoomBehavior, updateGraph }.
 */
async function sortAndFitGraph(graphRefs) {
    const { nodes, simulation, svg, zoomLayer, zoomBehavior, updateGraph } = graphRefs;

    if (!nodes || nodes.length === 0 || !simulation || !svg || !zoomLayer || !zoomBehavior) {
        uiUtils.showFlashMessage("Kan grafiek niet sorteren: Geen data of simulatie beschikbaar.", 3000);
        return;
    }

    console.log("Starting graph sort and fit...");
    uiUtils.showFlashMessage("Grafiek sorteren...", 2000);

    // 1. Unfix nodes
    nodes.forEach(node => {
        node.fx = null;
        node.fy = null;
    });

    // 2. Restart simulation with some energy
    simulation.alphaTarget(0.3).restart(); // Heat up simulation

    // 3. Wait for simulation to cool down (e.g., 1.5 seconds)
    setTimeout(async () => {
        simulation.alphaTarget(0); // Cool down simulation

        // 4. Fix nodes at their new positions
        const positionUpdates = [];
        nodes.forEach(node => {
            node.fx = node.x;
            node.fy = node.y;
            // Check if position changed significantly before adding to save queue
            const roundedX = Math.round(node.x);
            const roundedY = Math.round(node.y);
            if (roundedX !== node.orig_x || roundedY !== node.orig_y) {
                positionUpdates.push({ id: node.id, x: roundedX, y: roundedY });
                node.orig_x = roundedX; // Update original position cache
                node.orig_y = roundedY;
            }
        });
        console.log(`Nodes fixed. ${positionUpdates.length} positions changed.`);

        // 5. Calculate bounds
        if (nodes.length === 0) return; // No nodes to calculate bounds for

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(node => {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x);
            maxY = Math.max(maxY, node.y);
        });

        // Handle case with only one node
        if (nodes.length === 1) {
            minX -= 50; maxX += 50;
            minY -= 50; maxY += 50;
        }

        const boundsWidth = maxX - minX;
        const boundsHeight = maxY - minY;

        // 6. Calculate zoom/pan
        const svgWidth = svg.node().clientWidth;
        const svgHeight = svg.node().clientHeight;
        const padding = 80; // Pixels padding around the bounds

        const scaleX = svgWidth / (boundsWidth + padding * 2);
        const scaleY = svgHeight / (boundsHeight + padding * 2);
        const scale = Math.min(scaleX, scaleY, 1.5); // Limit max zoom-in scale

        const translateX = (svgWidth / 2) - scale * (minX + boundsWidth / 2);
        const translateY = (svgHeight / 2) - scale * (minY + boundsHeight / 2);

        const transform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);

        // 7. Apply zoom/pan smoothly
        svg.transition()
            .duration(750)
            .call(zoomBehavior.transform, transform);

        // 8. Save new positions (after fixing and zooming)
        if (positionUpdates.length > 0) {
            console.log("Saving updated node positions...");
            // Use Promise.all to save concurrently, but be mindful of potential rate limits if many nodes move
            await Promise.all(positionUpdates.map(update => saveNodePosition(update.id, update.x, update.y)));
            console.log("Node positions saved.");
            uiUtils.showFlashMessage("Grafiek gesorteerd en posities opgeslagen.", 3000);
        } else {
            uiUtils.showFlashMessage("Grafiek gesorteerd.", 2000);
        }

    }, 1500); // Wait 1.5 seconds
}

/**
 * Handles right-clicking on the SVG background to show a context menu.
 * @param {Event} event - The D3 contextmenu event.
 * @param {object} graphRefs - Object containing references { svg, zoomLayer, nodes, links, simulation, updateGraph, graphContainer, isLinkingRef, linkingSourceNodeIdRef, tempLinkLineRef, zoomBehavior }.
 */
export async function handleBackgroundRightClick(event, graphRefs) {
    event.preventDefault();
    if (graphRefs.isLinkingRef.current) {
        cancelLinking(graphRefs);
        return;
    }
    if (!state.selectedGameId) {
        console.warn("Cannot add room: No game selected.");
        return;
    }

    // Get coordinates relative to the zoomLayer (where nodes are positioned)
    const [mouseX, mouseY] = d3.pointer(event, graphRefs.zoomLayer.node());
    const posX = Math.round(mouseX);
    const posY = Math.round(mouseY);
    console.log(`Background right-click at graph coordinates: x=${posX}, y=${posY}`);

    // Define menu items
    const menuItems = [
        {
            label: "Nieuwe Kamer",
            action: () => createRoomAtPosition(posX, posY, graphRefs)
        },
        {
            label: "Reset View",
            action: () => resetGraphZoom(graphRefs)
        },
        {
            label: "Sorteer",
            icon: "🪄", // Optional icon
            action: () => sortAndFitGraph(graphRefs)
        }
    ];

    // Show the context menu
    uiUtils.showCustomContextMenu(event, menuItems);
}

/**
 * Resets the graph zoom and pan to the default identity transform.
 * @param {object} graphRefs - Object containing references { svg, zoomBehavior }.
 */
function resetGraphZoom(graphRefs) {
    if (graphRefs.svg && graphRefs.zoomBehavior) {
        console.log("Resetting graph zoom/pan.");
        // Use a transition for a smoother reset
        graphRefs.svg.transition()
            .duration(750) // Duration in milliseconds
            .call(graphRefs.zoomBehavior.transform, d3.zoomIdentity); // Reset to default transform
    } else {
        console.warn("Cannot reset zoom: SVG or zoom behavior not found in graphRefs.");
    }
}

/**
 * Creates a new room at the specified graph coordinates.
 * (Moved logic from the original handleBackgroundRightClick)
 * @param {number} posX - The x-coordinate for the new room.
 * @param {number} posY - The y-coordinate for the new room.
 * @param {object} graphRefs - Object containing references { nodes, simulation, updateGraph, graphContainer }.
 */
async function createRoomAtPosition(posX, posY, graphRefs) {
    console.log(`Attempting to create new room via context menu at: x=${posX}, y=${posY}`);

    // --- Determine the next available room number ---
    const baseTitle = "Nieuwe Kamer";
    let nextRoomNumber = 1;
    const existingRoomNumbers = state.currentRooms
        .map(room => {
            const match = room.title.match(/^Nieuwe Kamer (\d+)$/);
            return match ? parseInt(match[1], 10) : 0;
        })
        .filter(num => num > 0); // Filter out rooms that don't match the pattern

    if (existingRoomNumbers.length > 0) {
        nextRoomNumber = Math.max(...existingRoomNumbers) + 1;
    }
    const newRoomTitle = `${baseTitle} ${nextRoomNumber}`;
    console.log(`Calculated next room title: ${newRoomTitle}`);
    // --- End of numbering logic ---

    try {
        const response = await fetch(`/api/games/${state.selectedGameId}/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Send initial position along with the calculated numbered title
            body: JSON.stringify({ title: newRoomTitle, pos_x: posX, pos_y: posY })
        });
        const newRoom = await api.handleApiResponse(response);
        console.log("Room created:", newRoom);

        // Update state and UI
        state.setCurrentRooms([...state.currentRooms, newRoom]);
        // Use the imported graph action function
        import('./roomGraphActions.js').then(actions => {
            actions.addNodeToGraph(newRoom, graphRefs.nodes, graphRefs.simulation, graphRefs.updateGraph, graphRefs.graphContainer);
        });
        renderRoomList(); // Update list view
        selectRoom(newRoom.id); // Select the new room in the list view
        state.setUnsavedChanges(true);
        uiUtils.updateSaveStatusIndicator();
        uiUtils.dispatchGameDataChangedEvent('graphContextMenuAddRoom');
    } catch (error) {
        console.error("Failed to create room via graph:", error);
        // Alert handled by handleApiResponse
    }
}

/**
 * Handles left-clicking on a link line or label to cycle directions.
 * Now receives individual connection data.
 * @param {Event} event - The D3 click event.
 * @param {object} connData - The individual connection data object {id, direction, from_room_id, ...}.
 * @param {object} graphRefs - Object containing references { updateGraph }.
 */
export async function handleLinkClick(event, connData, graphRefs) {
    event.preventDefault();
    event.stopPropagation();
    uiUtils.hideCustomContextMenu(); // Hide any open menu

    if (!connData || !connData.id) {
        console.warn("Clicked link path has invalid connection data:", connData);
        return;
    }
    const connectionIdToModify = connData.id;
    await updateConnectionDirection(connectionIdToModify, null, connData, graphRefs); // Pass null for targetDirection to cycle
}

/**
 * Handles right-clicking on a link line or label to show direction choices and delete option.
 * @param {Event} event - The D3 contextmenu event.
 * @param {object} d - The grouped link data object.
 * @param {object} connData - The individual connection data object {id, direction, from_room_id, ...}.
 * @param {object} graphRefs - Object containing references { updateGraph, links, simulation }. // links ref might be less useful now
 */
export function handleLinkRightClick(event, connData, graphRefs) {
    event.preventDefault();
    event.stopPropagation();

    if (!connData || !connData.id) return;

    const connectionIdToModify = connData.id; // Target the specific connection clicked
    console.log(`Right-clicked connection path ${connectionIdToModify}. Direction: ${connData.direction}`);

    const menuItems = ALL_DIRECTIONS.map(direction => ({
        label: direction.charAt(0).toUpperCase() + direction.slice(1), // Capitalize
        action: () => updateConnectionDirection(connectionIdToModify, direction, connData, graphRefs) // Pass connData instead of group data
    }));

    // Add separator and delete option
    menuItems.push({ label: "---" });
    menuItems.push({
        label: `Verwijder Verbinding (${connData.direction.toUpperCase()})`,
        icon: "🗑️", // Add trash icon
        action: () => deleteSingleConnectionFromGraph(connData, graphRefs) // New function to delete just one connection
    });

    uiUtils.showCustomContextMenu(event, menuItems);
}

// --- Helper Functions (Moved from roomGraph.js) ---

/**
 * Deletes a room and updates the graph and UI.
 * @param {string} roomId - The ID of the room to delete.
 * @param {string} roomTitle - The title of the room for confirmation.
 * @param {object} graphRefs - Object containing references { nodes, links, simulation, updateGraph }.
 */
async function deleteRoomFromGraph(roomId, roomTitle, graphRefs) {
    if (!confirm(`Weet je zeker dat je de kamer "${roomTitle}" wilt verwijderen? Dit verwijdert ook alle verbindingen.`)) {
        return;
    }

    console.log(`Deleting room ${roomId} from graph`);
    try {
        const response = await fetch(`/api/rooms/${roomId}`, { method: 'DELETE' });
        await api.handleApiResponse(response); // Checks for 204 or throws error

        // Remove from graph data using the imported action
        removeNodeFromGraph(roomId, graphRefs.nodes, graphRefs.links, graphRefs.simulation, graphRefs.updateGraph);

        // Remove from main state cache
        state.setCurrentRooms(state.currentRooms.filter(r => r.id !== roomId));

        // If this room was selected, clear the details panel
        if (state.selectedRoom && state.selectedRoom.id === roomId) {
            uiUtils.clearRoomDetailsPanel(); // Clears state.selectedRoom too
        }

        renderRoomList(); // Update the list view
        state.setUnsavedChanges(true); // Deletion is a change to save (implicitly)
        uiUtils.updateSaveStatusIndicator();
        uiUtils.dispatchGameDataChangedEvent('graphDeleteRoom');
        uiUtils.showFlashMessage(`Kamer "${roomTitle}" verwijderd.`, 3000);
    } catch (error) {
        console.error(`Failed to delete room ${roomId} from graph:`, error);
        // Alert handled by handleApiResponse
    }
}

/**
 * Deletes a single connection from the graph and backend.
 * @param {object} connData - The individual connection data object.
 * @param {object} graphRefs - Object containing references { links, simulation, updateGraph }.
 */
async function deleteSingleConnectionFromGraph(connData, graphRefs) {
    const sourceRoom = state.getRoomById(connData.from_room_id);
    const targetRoom = state.getRoomById(connData.to_room_id);
    const sourceTitle = sourceRoom?.title || 'Unknown Room';
    const targetTitle = targetRoom?.title || 'Unknown Room';
    const direction = connData.direction.toUpperCase();

    if (!confirm(`Weet je zeker dat je de verbinding ${direction} van "${sourceTitle}" naar "${targetTitle}" wilt verwijderen?`)) {
        return;
    }

    console.log(`Deleting connection ${connData.id} (${direction} from ${sourceTitle} to ${targetTitle})`);

    try {
        const response = await fetch(`/api/connections/${connData.id}`, { method: 'DELETE' });
        await api.handleApiResponse(response); // Checks for 204 or throws error

        // Remove edge from graph data using the existing action function
        // This function needs to correctly find the group and remove the connection ID
        removeEdgeFromGraph(connData.id, graphRefs.links, graphRefs.simulation, graphRefs.updateGraph);

        state.setUnsavedChanges(true); // Mark changes
        uiUtils.updateSaveStatusIndicator();
        uiUtils.dispatchGameDataChangedEvent('graphDeleteSingleConnection');
        uiUtils.showFlashMessage(`Verbinding ${direction} verwijderd.`, 3000);
    } catch (error) {
        console.error(`Failed to delete connection ${connData.id}:`, error);
        // Alert handled by handleApiResponse
    }
}

/**
 * Updates a connection's direction via API and refreshes the graph.
 * Cycles to next available direction if targetDirection is null.
 * @param {string} connectionId - The ID of the connection to update.
 * @param {string | null} targetDirection - The desired new direction or null for cycling.
 * @param {object} connData - The individual connection data object being modified.
 * @param {object} graphRefs - Object containing references { updateGraph }.
 */
async function updateConnectionDirection(connectionId, targetDirection, connData, graphRefs) {
    try {
        const sourceRoomId = connData.from_room_id;
        const currentDirection = connData.direction;

        // Fetch existing directions *from the source room*
        const connectionsResponse = await fetch(`/api/rooms/${sourceRoomId}/connections`);
        const existingConnections = await api.handleApiResponse(connectionsResponse);
        const existingDirections = new Set(existingConnections.map(c => c.direction));
        console.log(`Existing directions from room ${sourceRoomId}:`, existingDirections);

        let newDirection = null;
        if (targetDirection) { // If a specific direction was chosen (right-click)
            if (!existingDirections.has(targetDirection) || targetDirection === currentDirection) {
                newDirection = targetDirection; // Allow setting if not taken OR if setting to current
            } else {
                uiUtils.showFlashMessage(`Richting '${targetDirection.toUpperCase()}' is al in gebruik vanuit deze kamer.`, 3000);
                return; // Don't proceed if the specific target is already taken
            }
        } else { // Cycle to the next available direction (left-click)
            const currentIndex = ALL_DIRECTIONS.indexOf(currentDirection);
            for (let i = 1; i < ALL_DIRECTIONS.length; i++) {
                const nextIndex = (currentIndex + i) % ALL_DIRECTIONS.length;
                const potentialDirection = ALL_DIRECTIONS[nextIndex];
                if (!existingDirections.has(potentialDirection)) {
                    newDirection = potentialDirection;
                    break;
                }
            }
        }

        if (newDirection === null) {
            uiUtils.showFlashMessage("Geen andere beschikbare richtingen gevonden.", 3000);
            console.log("No available direction found to cycle to.");
            return; // Stop if no available direction found
        }

        console.log(`Attempting to set direction to: ${newDirection}`);

        // --- Make the API call with the determined newDirection ---
        const response = await fetch(`/api/connections/${connectionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction: newDirection })
        });
        const updatedConnection = await api.handleApiResponse(response);
        console.log("Connection direction updated:", updatedConnection);

        // Update the connection data within its group in the main `links` array
        const group = graphRefs.links.find(l => l.connectionIds.includes(connectionId));
        if (group) {
            const connIndex = group.connections.findIndex(c => c.id === connectionId);
            if (connIndex !== -1) {
                group.connections[connIndex].direction = newDirection;
            }
            else {
                 console.error(`Connection ID ${connectionId} not found in its group's connections array during update.`);
            }
        }
        else {
            console.error(`Connection ID ${connectionId} not found in link group ${linkGroupData.id} during update.`);
        }

        graphRefs.updateGraph(); // Trigger redraw to update the label

        // Update state (e.g., selected room connections)
        if (state.selectedRoom && state.selectedRoom.connections) {
            const stateConnIndex = state.selectedRoom.connections.findIndex(c => c.id === connectionId);
            if (stateConnIndex !== -1) {
                state.selectedRoom.connections[stateConnIndex].direction = newDirection;
                // TODO: If the main room details panel (list view) is open, re-render its connections list UI
                // import('./roomDetails.js').then(mod => mod.renderConnectionsList(state.selectedRoom.connections));
            }
        }

        state.setUnsavedChanges(true);
        uiUtils.updateSaveStatusIndicator();
        uiUtils.dispatchGameDataChangedEvent('graphLinkDirectionUpdate');
        uiUtils.showFlashMessage(`Verbinding bijgewerkt naar ${updatedConnection.direction.toUpperCase()}`, 2000);

    } catch (error) {
        console.error(`Failed to update direction for connection ${connectionId}:`, error);
        uiUtils.showFlashMessage(`Fout bij bijwerken verbinding: ${error.message}`, 4000);
        // Alert handled by handleApiResponse for specific errors like 409 Conflict
    }
}
