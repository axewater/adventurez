/* global d3 */ // Inform linters about global variables

import * as api from './api.js';
import * as state from './state.js';
import * as uiUtils from './uiUtils.js'; // Import the whole module for consistency
import { initializeGraphPanel } from './roomGraphPanel.js';
import { moveEntityToLocation } from './entityDetails.js'; // Import the move function
import { createDragHandlers, createTickHandler, createZoomHandler } from './d3GraphHandlers.js';
import { handleNodeClick } from './roomGraphActions.js'; // Import only node click action
import {
    startLinking, cancelLinking, finishLinking, handleSvgMouseMove, handleSvgClick,
    handleNodeRightClick, handleLinkClick, handleLinkRightClick, handleBackgroundRightClick
} from './roomGraphInteractions.js'; // Import interaction handlers

// Dynamic import for selectRoom to avoid circular dependencies
// let selectRoomFunction; // No longer needed if using the side panel
// import('./roomList.js').then(module => {
//     selectRoomFunction = module.selectRoom;
// }).catch(err => console.error("Failed to load roomList module for selectRoom", err));

// --- DOM Element Caching ---
const graphContainer = document.getElementById('graph-container');

// --- D3 Simulation State ---
let simulation;
let svg;
let linkGroup, nodeGroup, textGroup, markerGroup; // SVG groups
let nodes = []; // D3 data {id, title, x, y, fx, fy, orig_x, orig_y, isStart}
let links = []; // D3 data representing *grouped* connections {id, source: {id,...}, target: {id,...}, connections: [], connectionIds: []}
let graphInitialized = false; // Flag to track if SVG/simulation exists

let zoomLayer; // Group for zoom/pan
let zoomBehavior; // Store the zoom behavior instance

// --- Linking State ---
let isLinking = false;
let linkingSourceNodeId = null;
let tempLinkLine = null; // D3 selection for the temporary line

// --- Constants ---
const NODE_RADIUS = 30;
const NODE_WIDTH = 80;
const NODE_HEIGHT = 40;

// --- Refs for Interaction Handlers ---
// Create refs to pass mutable state to interaction handlers
const graphRefs = {
    svg: null,
    zoomLayer: null,
    nodes: nodes, // Reference the module-level array
    links: links, // Reference the module-level array
    simulation: null,
    zoomBehavior: null, // Add ref for zoom behavior
    updateGraph: updateGraph, // Reference the module-level function
    graphContainer: graphContainer,
    // Refs for linking state (using objects to pass by reference)
    isLinkingRef: { current: isLinking },
    linkingSourceNodeIdRef: { current: linkingSourceNodeId },
    tempLinkLineRef: { current: tempLinkLine }
};

/**
 * Initializes or re-initializes the D3 graph view.
 */
export async function initializeGraphView() {
    if (!state.selectedGameId || !state.currentRooms) {
        console.warn("Cannot initialize graph view: No game selected or no rooms loaded.");
        if (graphContainer) graphContainer.innerHTML = '<p style="text-align: center; padding: 20px;">Load a game with rooms to see the graph.</p>';
        return;
    }
    if (!graphContainer) {
        console.error("D3 graph container not found.");
        return;
    }
     if (typeof d3 === 'undefined') {
        console.error("D3 library not loaded.");
        if (graphContainer) graphContainer.innerHTML = '<p style="text-align: center; padding: 20px; color: red;">Error: D3 library failed to load.</p>';
        return;
    }


    console.log("Initializing D3 graph view...");
    console.log("Initializing Graph View. Current Rooms in State:", state.currentRooms); // Log rooms data

    // Destroy previous instance if exists
    destroyGraph(); // Clear SVG, simulation, etc.
    graphContainer.innerHTML = ''; // Clear container
    graphInitialized = false; // Reset flag

    // Fetch all connections for the current game
    let allConnections = [];
    try {
        console.log(`Fetching all connections for game ${state.selectedGameId}...`);
        const response = await fetch(`/api/games/${state.selectedGameId}/connections`);
        allConnections = await api.handleApiResponse(response);
        console.log("All connections fetched:", allConnections);
    } catch (error) {
        console.error("Failed to fetch all connections for graph:", error);
        // Proceed with nodes only, or show error? For now, proceed.
    }

    // --- Prepare D3 Data ---
    const nodeMap = new Map();
    nodes = state.currentRooms.map((room, index) => {
        const node = {
            id: room.id,
            title: room.title,
            fx: (room.pos_x !== null && !isNaN(room.pos_x)) ? Number(room.pos_x) : null,
            fy: (room.pos_y !== null && !isNaN(room.pos_y)) ? Number(room.pos_y) : null,
            orig_x: room.pos_x,
            orig_y: room.pos_y,
            isStart: index === 0 // Add flag for the start room
        };
        nodeMap.set(room.id, node);
        return node;
    });
    console.log("Prepared Nodes for D3:", JSON.stringify(nodes)); // Log prepared nodes

    // --- Group connections between the same two nodes ---
    const groupedLinksMap = new Map();
    allConnections.forEach(conn => {
        const sourceNode = nodeMap.get(conn.from_room_id);
        const targetNode = nodeMap.get(conn.to_room_id);

        if (sourceNode && targetNode) {
            // Create a unique key for the pair of nodes, regardless of direction
            const pairKey = [conn.from_room_id, conn.to_room_id].sort().join('-');

            if (!groupedLinksMap.has(pairKey)) {
                groupedLinksMap.set(pairKey, {
                    id: pairKey, // Use pairKey as the unique ID for the grouped link
                    source: sourceNode, // Define source/target based on first connection encountered for the pair
                    target: targetNode,
                    connections: [], // Store detailed connection info instead of just directions
                    connectionIds: []
                });
            }

            const group = groupedLinksMap.get(pairKey);
            group.connections.push({
                id: conn.id,
                direction: conn.direction || ' ',
                from_room_id: conn.from_room_id,
                to_room_id: conn.to_room_id,
                // Add is_locked, required_key_id later if needed for visual cues
            });
            group.connectionIds.push(conn.id);

        } else {
            console.warn(`Skipping connection ${conn.id} because source or target room not found.`);
        }
    });

    // Convert map values to array for D3
    links = Array.from(groupedLinksMap.values());
    console.log("Prepared Grouped Links for D3:", JSON.stringify(links.map(l => ({ ...l, source: l.source.id, target: l.target.id, connections: l.connections.map(c => c.id) })))); // Log grouped links


    if (nodes.length === 0) {
        console.warn("No nodes to display in the graph.");
        if (graphContainer) graphContainer.innerHTML = '<p style="text-align: center; padding: 20px;">No rooms found to display in the graph.</p>';
        // Allow D3 to handle empty data if needed, but log the warning.
    }

    // --- Setup SVG (Delayed) ---
    // Use setTimeout to ensure the container is rendered and has dimensions
    setTimeout(() => {
        if (!graphContainer || !graphContainer.isConnected) { // Check if still in DOM
            console.error("Graph container disappeared before setTimeout callback.");
            return;
        }
    const width = graphContainer.clientWidth;
    const height = graphContainer.clientHeight;
    console.log(`Graph Container Dimensions: width=${width}, height=${height}`); // Log container size

    if (width === 0 || height === 0) {
        if (graphContainer) graphContainer.innerHTML = '<p style="text-align: center; padding: 20px; color: red;">Error: Graph container size is zero.</p>';
        return; // Stop if container has no size
    }

    svg = d3.select(graphContainer).append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height])
        // Pass graphRefs to event handlers
        .on('contextmenu', (event) => handleBackgroundRightClick(event, graphRefs))
        .on('mousemove', (event) => handleSvgMouseMove(event, graphRefs))
        .on('click', (event) => handleSvgClick(event, graphRefs))
        .attr("style", "max-width: 100%; height: auto;");

    // Update graphRefs with the *correct* SVG element AFTER it's created
    graphRefs.svg = svg;

    // Define arrow markers
    markerGroup = svg.append("defs");
    markerGroup.append("marker")
        .attr("id", "arrow")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 8) // Distance from the end of the path to the marker tip
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto-start-reverse") // Ensures arrow points correctly on paths
      .append("path")
        .attr("fill", "#999")
        .attr("d", "M0,-5L10,0L0,5");

    // Create groups for links, nodes, text (order matters for z-index)
    zoomLayer = svg.append("g"); // Group for zoom/pan
    // Update graphRefs
    graphRefs.zoomLayer = zoomLayer;

    linkGroup = zoomLayer.append("g").attr("class", "link-groups"); // Renamed for clarity
    nodeGroup = zoomLayer.append("g").attr("class", "nodes");
    textGroup = zoomLayer.append("g").attr("class", "node-texts"); // Changed class name for clarity

    // --- Setup Force Simulation ---
    // Create handlers using factories, passing necessary context
    const tickHandler = createTickHandler(linkGroup, nodeGroup, textGroup, NODE_WIDTH, NODE_HEIGHT);

    simulation = d3.forceSimulation(nodes)
        // Link force now uses the grouped links. Ensure source/target are correctly referenced.
        .force("link", d3.forceLink(links).id(d => d.id).distance(150).strength(0.5)) // Adjust distance/strength as needed
        .force("charge", d3.forceManyBody().strength(-400)) // Repulsion strength
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(NODE_WIDTH / 2 + 20)) // Collision based on node size + buffer
        .on("tick", tickHandler); // Use the created tick handler

    // Update graphRefs
    graphRefs.simulation = simulation;

    // --- Drag Behavior ---
    const drag = d3.drag()
        .on("start", createDragHandlers(simulation).dragstarted)
        .on("drag", createDragHandlers(simulation).dragged)
        .on("end", createDragHandlers(simulation).dragended);

    // Apply drag to node group (will be applied to nodes when they are created/updated)
    // nodeGroup.call(drag); // Drag is applied within updateGraph to the entering nodes

    // --- Zoom/Pan Behavior ---
    const zoomHandler = createZoomHandler(zoomLayer); // Create zoom handler
    zoomBehavior = d3.zoom() // Assign to module-level variable
        .scaleExtent([0.1, 4]) // Min/max zoom levels
        .on("zoom", zoomHandler); // Use the created zoom handler

    svg.call(zoomBehavior); // Apply the behavior
    graphRefs.zoomBehavior = zoomBehavior; // Store in refs

    // --- Initial Render ---
    console.log("Calling updateGraph()...");
    // Initialize the side panel (needs references to nodes and updateGraph)
    // Update graphRefs before passing them
    graphRefs.nodes = nodes;
    graphRefs.links = links;
    graphRefs.graphContainer = graphContainer;

    d3.select('body').on('keydown.graph', (event) => {
        if (event.key === "Escape") cancelLinking(graphRefs); // Pass refs
    });
    graphInitialized = true; // Set flag *before* first updateGraph call
    initializeGraphPanel(graphRefs.nodes, graphRefs.updateGraph); // Pass refs
    updateGraph(); // This will now correctly reference the drag handlers

    console.log("D3 graph view initialization sequence complete.");
    }, 0); // Delay of 0ms pushes execution after current rendering cycle
}

/**
 * Updates the graph visualization based on the current nodes and *grouped* links arrays.
 * Uses D3's data join pattern.
 */
function updateGraph() {
    if (!graphInitialized || !svg || !simulation || !nodeGroup || !linkGroup || !textGroup) {
        console.warn("updateGraph called before graph elements are fully initialized or after destruction.");
        return;
    }
    // Update refs before potential use in event handlers attached below
    graphRefs.isLinkingRef.current = isLinking;
    graphRefs.linkingSourceNodeIdRef.current = linkingSourceNodeId;
    graphRefs.tempLinkLineRef.current = tempLinkLine;

    // Note: links array now contains *grouped* links
    console.log(`updateGraph called. Nodes: ${nodes.length}, Grouped Links: ${links.length}`); // Log counts

    // --- Update Nodes ---
    const nodeSelection = nodeGroup.selectAll("rect")
        .data(nodes, d => d.id);

    console.log(`Node Selection: enter=${nodeSelection.enter().size()}, exit=${nodeSelection.exit().size()}, update=${nodeSelection.size() - nodeSelection.enter().size()}`); // Log D3 selection sizes

    nodeSelection.exit().remove(); // Remove old nodes

    const nodeEnter = nodeSelection.enter().append("rect") // Create new nodes
        .attr("width", NODE_WIDTH)
        .attr("height", NODE_HEIGHT)
        .attr("rx", 5) // Rounded corners
        .attr("ry", 5)
        .attr("fill", "#666")
        .attr("stroke", "#333")
        .attr("stroke-width", 1.5)
        .style("cursor", "pointer")
        .on("click", (event, d) => handleNodeClick(event, d, (targetId) => finishLinking(targetId, graphRefs))) // Pass finishLinking with refs
        .on("contextmenu", (event, d) => handleNodeRightClick(event, d, graphRefs)) // Pass refs
        .call(d3.drag() // Apply drag behavior
            .on("start", createDragHandlers(simulation).dragstarted) // Use factory
            .on("drag", createDragHandlers(simulation).dragged)   // Use factory
            .on("end", createDragHandlers(simulation).dragended))   // Use factory
        .on('dragover', (event) => {
            event.preventDefault(); // Allow dropping
            event.dataTransfer.dropEffect = 'move';
            // Add visual cue to the target node
            d3.select(event.currentTarget).classed('drop-target-active', true);
        })
        .on('dragleave', (event) => {
            // Remove visual cue when dragging leaves
            d3.select(event.currentTarget).classed('drop-target-active', false);
        })
        .on('drop', async (event, d) => {
            event.preventDefault();
            // Remove visual cue
            d3.select(event.currentTarget).classed('drop-target-active', false);

            let entityId, sourceRoomId;
            try {
                const data = JSON.parse(event.dataTransfer.getData('application/json'));
                entityId = data.entityId;
                sourceRoomId = data.sourceRoomId;
                console.log(`[Drop] Received data: Entity ${entityId}, Source Room ${sourceRoomId}, Target Room ${d.id}`);
            } catch (e) {
                console.error("Drop event failed: Could not parse dragged data.", e);
                return; // Stop processing if data is invalid
            }

            const targetRoomId = d.id; // The ID of the room node being dropped onto

            if (entityId && targetRoomId && sourceRoomId !== targetRoomId) {
                // Call the function to handle the API update and UI refresh
                await moveEntityToLocation(entityId, targetRoomId, 'room', sourceRoomId, 'room'); // Pass target type and source type
            } else if (sourceRoomId === targetRoomId) {
                console.log("Entity dropped onto its original room. No action taken.");
            } else {
                console.error(`Drop event failed: Missing entityId (${entityId}) or targetRoomId (${targetRoomId}) or sourceRoomId (${sourceRoomId}).`);
            }
        });

    nodeSelection.merge(nodeEnter) // Update existing nodes
        .classed("selected", d => state.selectedRoom && d.id === state.selectedRoom.id) // Apply selected class
        .attr("fill", d => (state.selectedRoom && d.id === state.selectedRoom.id) ? "#4CAF50" : "#666"); // Update fill color

    // --- Update Node Labels ---
    // Select the group that will contain text elements for each node
    const textGroupSelection = textGroup.selectAll("g.node-text-group")
        .data(nodes, d => d.id);

    console.log(`Text Group Selection: enter=${textGroupSelection.enter().size()}, exit=${textGroupSelection.exit().size()}, update=${textGroupSelection.size() - textGroupSelection.enter().size()}`);

    textGroupSelection.exit().remove();

    // Enter selection: Create the group and the text elements within it
    const textGroupEnter = textGroupSelection.enter().append("g")
        .attr("class", "node-text-group")
        .style("pointer-events", "none"); // Don't interfere with clicks on node rect

    // Append the main title label
    textGroupEnter.append("text")
        .attr("class", "node-label")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .text(d => d.title);

    // Append the "(Start)" indicator label only if it's the start node
    textGroupEnter.filter(d => d.isStart) // Only select groups for start nodes
        .append("text")
        .attr("class", "start-indicator")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("dy", "-1.2em") // Position above the main label
        .text("(Start)");

    // Update selection: Update the text content of the main label
    textGroupSelection.select("text.node-label")
        .text(d => d.title); // Update text if title changes

    // --- Update Link Groups ---
    // Use the generated pairKey ('id' field in the grouped link object) as the data key
    const linkGroupSelection = linkGroup.selectAll("g.link-group")
        .data(links, d => d.id);

    console.log(`Link Group Selection: enter=${linkGroupSelection.enter().size()}, exit=${linkGroupSelection.exit().size()}, update=${linkGroupSelection.size() - linkGroupSelection.enter().size()}`);

    linkGroupSelection.exit().remove();

    const linkGroupEnter = linkGroupSelection.enter().append("g")
        .attr("class", "link-group")
        .attr("id", d => `linkgroup-${d.id}`); // Add ID for easier selection in ticked

    // --- Update Individual Connection Paths within each group ---
    // Select paths within each group (entering or updating)
    const pathSelection = linkGroupSelection.merge(linkGroupEnter).selectAll("path.connection-path")
        .data(d => d.connections.map(conn => ({ ...conn, groupSource: d.source, groupTarget: d.target, groupConnections: d.connections })), conn => conn.id); // Bind individual connection data

    pathSelection.exit().remove();

    pathSelection.enter().append("path")
        .attr("class", "connection-path")
        .attr("fill", "none") // Paths are strokes, not filled
        .attr("stroke", "#999")
        .attr("stroke-width", 1.5)
        .attr("marker-end", "url(#arrow)") // Apply arrow marker
        .style("cursor", "pointer")
        .on("click", (event, connData) => handleLinkClick(event, connData, graphRefs)) // Pass individual connection data
        .on("contextmenu", (event, connData) => handleLinkRightClick(event, connData, graphRefs)); // Pass individual connection data

    // --- Update Link Labels (one per group) ---
    // Use the pairKey ('id' field) as the data key
    // Append labels to the link *group* enter selection
    const linkLabelSelection = linkGroupSelection.merge(linkGroupEnter).selectAll("text.link-label")
        .data(d => [d], d => d.id); // Bind the group data to the label

    console.log(`Link Label Selection: enter=${linkLabelSelection.enter().size()}, exit=${linkLabelSelection.exit().size()}, update=${linkLabelSelection.size() - linkLabelSelection.enter().size()}`);

    linkLabelSelection.exit().remove();

    const linkLabelEnter = linkLabelSelection.enter().append("text") // Declare with const
        .attr("class", "link-label")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .style("fill", "#555")
        .style("font-size", "9px")
        .style("cursor", "pointer") // Add cursor for interaction
        .style("pointer-events", "all") // Ensure label receives clicks
        .text(d => formatLinkDirections(d))
        // Click/contextmenu on label can trigger action on the *first* connection in the group for simplicity, or show a menu to choose
        .on("click", (event, d) => handleLinkClick(event, d.connections[0], graphRefs)) // Example: Click label triggers action on first connection
        .on("contextmenu", (event, d) => handleLinkRightClick(event, d.connections[0], graphRefs)); // Example: Right-click label triggers action on first connection

    linkLabelSelection.merge(linkLabelEnter)
        // Update combined directions text if needed
        .text(d => formatLinkDirections(d));

    // --- Restart Simulation ---
    simulation.nodes(nodes);
    // Update the link force with the new grouped links data
    simulation.force("link").links(links);
    simulation.alpha(0.3).restart(); // Reheat simulation briefly
    console.log("Simulation restarting with grouped links...");
}

/**
 * Formats the directions array for display on the link label.
 * @param {object} linkGroupData - The grouped link data object containing source, target, and connections array.
 * @returns {string} - Formatted string (e.g., "NOORD / ZUID (rev)").
 */
export function formatLinkDirections(linkGroupData) { // Export if needed by interactions
    const directions = linkGroupData.connections.map(conn => {
        // Check if the connection direction is reversed relative to the group's source/target
        // Important: Use group's source/target IDs for comparison
        const isReversed = !(conn.from_room_id === linkGroupData.source?.id && conn.to_room_id === linkGroupData.target?.id);
        const dirText = conn.direction || '?'; // Handle null/empty direction
        return isReversed ? `${dirText} (rev)` : dirText;
    });
    // Filter out empty/null directions and duplicates before joining
    return [...new Set(directions.filter(dir => dir && dir.trim() !== ''))].map(d => d.toUpperCase()).join(' / ');
}

/**
 * Destroys the D3 simulation and removes the SVG element.
 */
export function destroyGraph() {
    if (simulation) {
        console.log("Stopping D3 simulation.");
        simulation.stop();
        simulation = null;
    }
    if (svg) {
        console.log("Removing D3 SVG element.");
        svg.remove();
        svg = null;
    }
    // Clear data arrays and references to SVG groups
    nodes = [];
    links = []; // Clear grouped links
    // Reset linking state variables
    isLinking = false;
    linkingSourceNodeId = null;
    if (tempLinkLine) tempLinkLine.remove();
    tempLinkLine = null;
    linkGroup = null;
    nodeGroup = null;
    textGroup = null;
    markerGroup = null;
    zoomLayer = null;
    // Clear container content just in case
    // Reset graphRefs
    graphRefs.svg = null;
    graphRefs.zoomLayer = null;
    graphRefs.zoomBehavior = null;
    graphRefs.nodes = nodes; // Point back to the empty array
    graphRefs.links = links; // Point back to the empty array
    graphRefs.simulation = null;
    graphRefs.isLinkingRef.current = false;
    graphRefs.linkingSourceNodeIdRef.current = null;
    graphRefs.tempLinkLineRef.current = null;

    graphInitialized = false; // Reset flag
    if (graphContainer) {
        d3.select('body').on('keydown.graph', null);
        graphContainer.innerHTML = '';
    }
}

// --- Export necessary functions ---
// Export functions that need to be called from outside, like initialization and destruction.
// Also export references needed by the action functions.
export {
    nodes, links, simulation, updateGraph, graphContainer, graphInitialized, zoomBehavior // Export zoomBehavior if needed elsewhere, though graphRefs is preferred
}; // Export core graph elements
