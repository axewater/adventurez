/* global d3 */ // Inform linters about global variables

import * as state from './state.js';
import * as uiUtils from './uiUtils.js';
// Import interaction handlers if needed later
// import { createDragHandlers, createTickHandler, createZoomHandler } from './d3GraphHandlers.js';

// --- DOM Element Caching ---
const graphContainer = document.getElementById('conversation-graph-container');

// --- D3 Simulation State ---
let simulation;
let svg;
let linkGroup, nodeGroup, textGroup, markerGroup; // SVG groups
let nodes = []; // D3 data {id, type, text, x, y, fx, fy}
let links = []; // D3 data {source: {id,...}, target: {id,...}, label}
let graphInitialized = false; // Flag to track if SVG/simulation exists
let zoomLayer; // Group for zoom/pan
let zoomBehavior; // Store the zoom behavior instance

// --- Constants ---
const NODE_WIDTH = 120;
const NODE_HEIGHT = 50;
const NODE_RADIUS = 30; // For potential circular nodes

/**
 * Transforms the conversation structure into D3 nodes and links.
 * @param {object} conversationStructure - The 'structure' object from the conversation.
 * @returns {object} - An object containing { nodes: Array<object>, links: Array<object> }.
 */
function transformConversationToGraphData(conversationStructure) {
    const graphNodes = [];
    const graphLinks = [];
    const nodeMap = new Map(); // To quickly find node objects by ID

    if (!conversationStructure || !conversationStructure.nodes) {
        console.warn("Conversation structure is missing or invalid.");
        return { nodes: [], links: [] };
    }

    const convNodes = conversationStructure.nodes;
    const startNodeId = conversationStructure.start_node;

    // 1. Create Nodes
    for (const nodeId in convNodes) {
        if (convNodes.hasOwnProperty(nodeId)) {
            const nodeData = convNodes[nodeId];
            const nodeType = nodeData.type || 'options'; // Default to options node
            let nodeText = nodeData.npc_text || `Node: ${nodeId}`; // Default text
            if (nodeType === 'question') {
                nodeText = `[Q] ${nodeData.question_text || nodeText}`;
            } else if (nodeType === 'options') {
                // Limit text length for display
                nodeText = nodeText.length > 50 ? nodeText.substring(0, 47) + '...' : nodeText;
            }

            const graphNode = {
                id: nodeId,
                type: nodeType,
                text: nodeText,
                isStart: nodeId === startNodeId,
                data: nodeData // Store original data if needed
                // x, y, fx, fy will be added by D3 or loaded if saved
            };
            graphNodes.push(graphNode);
            nodeMap.set(nodeId, graphNode);
        }
    }

    // 2. Create Links
    for (const nodeId in convNodes) {
        if (convNodes.hasOwnProperty(nodeId)) {
            const nodeData = convNodes[nodeId];
            const sourceNode = nodeMap.get(nodeId);
            if (!sourceNode) continue;

            const nodeType = nodeData.type || 'options';

            if (nodeType === 'options' && nodeData.options) {
                nodeData.options.forEach((option, index) => {
                    const targetNodeId = option.next_node;
                    if (targetNodeId && nodeMap.has(targetNodeId)) {
                        const targetNode = nodeMap.get(targetNodeId);
                        graphLinks.push({
                            id: `${nodeId}-opt${index}-${targetNodeId}`, // Unique link ID
                            source: sourceNode,
                            target: targetNode,
                            label: option.text.length > 20 ? option.text.substring(0, 17) + '...' : option.text // Player choice text as label
                        });
                    }
                });
            } else if (nodeType === 'question') {
                // Link for correct answer
                const correctTargetId = nodeData.next_node_correct;
                if (correctTargetId && nodeMap.has(correctTargetId)) {
                    graphLinks.push({
                        id: `${nodeId}-correct-${correctTargetId}`,
                        source: sourceNode,
                        target: nodeMap.get(correctTargetId),
                        label: "Correct"
                    });
                }
                // Link for incorrect answer
                const incorrectTargetId = nodeData.next_node_incorrect;
                if (incorrectTargetId && nodeMap.has(incorrectTargetId)) {
                     graphLinks.push({
                        id: `${nodeId}-incorrect-${incorrectTargetId}`,
                        source: sourceNode,
                        target: nodeMap.get(incorrectTargetId),
                        label: "Incorrect"
                    });
                }
            }
            // Handle other node types or direct 'next_node' links if they exist
            if (nodeData.next_node && nodeMap.has(nodeData.next_node)) {
                 graphLinks.push({
                    id: `${nodeId}-next-${nodeData.next_node}`,
                    source: sourceNode,
                    target: nodeMap.get(nodeData.next_node),
                    label: "Next" // Generic label
                });
            }
        }
    }

    console.log("Transformed Graph Data:", { nodes: graphNodes, links: graphLinks });
    return { nodes: graphNodes, links: graphLinks };
}


/**
 * Initializes or re-initializes the D3 conversation graph view.
 */
export function initializeConversationGraph() {
    if (!state.selectedConversation || !state.selectedConversation.structure) {
        console.warn("Cannot initialize conversation graph: No conversation selected or structure missing.");
        if (graphContainer) graphContainer.innerHTML = '<p style="text-align: center; padding: 20px;">Select a conversation with structure to see the graph.</p>';
        return;
    }
    if (!graphContainer) {
        console.error("Conversation graph container not found.");
        return;
    }
     if (typeof d3 === 'undefined') {
        console.error("D3 library not loaded.");
        if (graphContainer) graphContainer.innerHTML = '<p style="text-align: center; padding: 20px; color: red;">Error: D3 library failed to load.</p>';
        return;
    }

    console.log("Initializing D3 conversation graph view...");

    // Destroy previous instance if exists
    destroyConversationGraph();
    graphContainer.innerHTML = ''; // Clear container
    graphInitialized = false; // Reset flag

    // --- Prepare D3 Data ---
    const graphData = transformConversationToGraphData(state.selectedConversation.structure);
    nodes = graphData.nodes;
    links = graphData.links;

    if (nodes.length === 0) {
        console.warn("No nodes to display in the conversation graph.");
        if (graphContainer) graphContainer.innerHTML = '<p style="text-align: center; padding: 20px;">Conversation structure has no nodes.</p>';
        return; // Stop if no nodes
    }

    // --- Setup SVG ---
    // Use setTimeout to ensure the container is rendered and has dimensions
    setTimeout(() => {
        if (!graphContainer || !graphContainer.isConnected) {
            console.error("Graph container disappeared before setTimeout callback.");
            return;
        }
        const width = graphContainer.clientWidth;
        const height = graphContainer.clientHeight;
        console.log(`Conversation Graph Container Dimensions: width=${width}, height=${height}`);

        if (width === 0 || height === 0) {
            if (graphContainer) graphContainer.innerHTML = '<p style="text-align: center; padding: 20px; color: red;">Error: Graph container size is zero.</p>';
            return; // Stop if container has no size
        }

        svg = d3.select(graphContainer).append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [0, 0, width, height])
            .attr("style", "max-width: 100%; height: auto;");

        // Define arrow markers
        markerGroup = svg.append("defs");
        markerGroup.append("marker")
            .attr("id", "conv-arrow")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 8) // Adjust based on node size/shape
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto-start-reverse")
          .append("path")
            .attr("fill", "#999")
            .attr("d", "M0,-5L10,0L0,5");

        // Create groups for links, nodes, text
        zoomLayer = svg.append("g");
        linkGroup = zoomLayer.append("g").attr("class", "conv-links");
        nodeGroup = zoomLayer.append("g").attr("class", "conv-nodes");
        textGroup = zoomLayer.append("g").attr("class", "conv-texts");

        // --- Setup Force Simulation ---
        simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(180).strength(0.6))
            .force("charge", d3.forceManyBody().strength(-500))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collision", d3.forceCollide().radius(NODE_WIDTH / 2 + 30))
            .on("tick", ticked);

        // --- Drag Behavior (Optional for now) ---
        // const drag = d3.drag()...

        // --- Zoom/Pan Behavior ---
        zoomBehavior = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", zoomed);
        svg.call(zoomBehavior);

        // --- Initial Render ---
        graphInitialized = true;
        updateConversationGraph();
        console.log("D3 conversation graph view initialization complete.");

    }, 0); // Delay execution
}

/**
 * Updates the graph visualization based on the current nodes and links arrays.
 */
function updateConversationGraph() {
    if (!graphInitialized || !svg || !simulation || !nodeGroup || !linkGroup || !textGroup) {
        console.warn("updateConversationGraph called before graph elements are fully initialized or after destruction.");
        return;
    }
    console.log(`updateConversationGraph called. Nodes: ${nodes.length}, Links: ${links.length}`);

    // --- Update Links ---
    const linkSelection = linkGroup.selectAll("path.conv-link")
        .data(links, d => d.id); // Use generated link ID

    linkSelection.exit().remove();

    const linkEnter = linkSelection.enter().append("path")
        .attr("class", "conv-link")
        .attr("stroke", "#999")
        .attr("stroke-width", 1.5)
        .attr("marker-end", "url(#conv-arrow)");

    // Add link labels (optional, can get cluttered)
    const linkLabelSelection = linkGroup.selectAll("text.conv-link-label")
        .data(links, d => d.id);

    linkLabelSelection.exit().remove();

    const linkLabelEnter = linkLabelSelection.enter().append("text")
        .attr("class", "conv-link-label")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .style("fill", "#555")
        .style("font-size", "9px")
        .text(d => d.label || ""); // Display link label (e.g., player choice)

    // --- Update Nodes ---
    const nodeSelection = nodeGroup.selectAll("rect.conv-node") // Use rect for now
        .data(nodes, d => d.id);

    nodeSelection.exit().remove();

    const nodeEnter = nodeSelection.enter().append("rect")
        .attr("class", d => `conv-node type-${d.type}`) // Add type class
        .attr("width", NODE_WIDTH)
        .attr("height", NODE_HEIGHT)
        .attr("rx", 5).attr("ry", 5) // Rounded corners
        .attr("fill", d => d.isStart ? "#ffc107" : (d.type === 'question' ? "#87CEEB" : "#bbb")) // Color by type/start
        .attr("stroke", "#555")
        .attr("stroke-width", 1.5)
        .style("cursor", "pointer")
        // .call(drag) // Add drag later if needed
        .on("click", handleNodeClick); // Add click handler

    nodeSelection.merge(nodeEnter); // Apply updates to existing nodes if needed

    // --- Update Node Labels ---
    const textSelection = textGroup.selectAll("text.conv-node-label")
        .data(nodes, d => d.id);

    textSelection.exit().remove();

    textSelection.enter().append("text")
        .attr("class", "conv-node-label")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .style("fill", "#111")
        .style("font-size", "10px")
        .style("pointer-events", "none") // Don't block clicks on node
        .text(d => d.text); // Display node text

    // --- Restart Simulation ---
    simulation.nodes(nodes);
    simulation.force("link").links(links);
    simulation.alpha(0.3).restart();
}

/**
 * Tick function to update positions.
 */
function ticked() {
    // Update link positions
    linkGroup.selectAll("path.conv-link")
        .attr("d", d => {
            // Basic straight line for now, adjust for node shape later
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const dr = 0; // Change for curved paths if needed
            return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
        });

    // Update link label positions
    linkGroup.selectAll("text.conv-link-label")
        .attr("x", d => (d.source.x + d.target.x) / 2)
        .attr("y", d => (d.source.y + d.target.y) / 2);

    // Update node positions (adjust for rect anchor point)
    nodeGroup.selectAll("rect.conv-node")
        .attr("x", d => d.x - NODE_WIDTH / 2)
        .attr("y", d => d.y - NODE_HEIGHT / 2);

    // Update node label positions
    textGroup.selectAll("text.conv-node-label")
        .attr("x", d => d.x)
        .attr("y", d => d.y);
}

/**
 * Zoom handler function.
 */
function zoomed(event) {
    if (zoomLayer) {
        zoomLayer.attr("transform", event.transform);
    }
}

/**
 * Handles clicking on a node.
 * @param {Event} event - The click event.
 * @param {object} d - The data object for the clicked node.
 */
function handleNodeClick(event, d) {
    event.stopPropagation(); // Prevent triggering SVG click
    console.log("Clicked conversation node:", d);
    // Highlight the selected node (add CSS class)
    nodeGroup.selectAll("rect.conv-node").classed("selected", n => n.id === d.id);
    // TODO: Potentially show node details in a side panel or focus the JSON editor?
    // For now, just log and highlight.
}

/**
 * Destroys the D3 simulation and removes the SVG element.
 */
export function destroyConversationGraph() {
    if (simulation) {
        console.log("Stopping D3 conversation simulation.");
        simulation.stop();
        simulation = null;
    }
    if (svg) {
        console.log("Removing D3 conversation SVG element.");
        svg.remove();
        svg = null;
    }
    nodes = [];
    links = [];
    linkGroup = null;
    nodeGroup = null;
    textGroup = null;
    markerGroup = null;
    zoomLayer = null;
    graphInitialized = false;
    if (graphContainer) {
        graphContainer.innerHTML = ''; // Clear container explicitly
    }
}
