/* global d3 */ // Inform linters about global variables

import * as state from './state.js';
import { transformConversationToGraphData } from './conversationGraphData.js';
import { updateConversationGraph, ticked, zoomed } from './conversationGraphRenderer.js';
import { handleNodeClick as handleNodeClickInteraction } from './conversationGraphInteractions.js';

// --- DOM Element Caching ---
const graphContainer = document.getElementById('conversation-graph-container');
// CSS class for selected node (defined in convo.css)
const SELECTED_NODE_CLASS = 'conv-node-selected';

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
            .on("tick", () => {
                // Call the imported ticked function, passing necessary selections
                ticked({ linkGroup, nodeGroup, textGroup });
            });

        // --- Node Click Handler ---
        const handleNodeClick = (event, d) => handleNodeClickInteraction(event, d, nodeGroup);

        // --- Drag Behavior (Optional for now) ---
        // const drag = d3.drag()...

        // --- Zoom/Pan Behavior ---
        zoomBehavior = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => zoomed(event, zoomLayer)); // Pass zoomLayer to the handler
        svg.call(zoomBehavior);

        // --- Initial Render ---
        graphInitialized = true;
        // Call the imported update function
        updateConversationGraph({ svg, linkGroup, nodeGroup, textGroup, simulation, nodes, links, handleNodeClick, graphInitialized });
        console.log("D3 conversation graph view initialization complete.");

    }, 0); // Delay execution
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
