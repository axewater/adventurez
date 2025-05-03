// /client/js/conversationGraphRenderer.js
// Handles the D3 rendering logic for the conversation graph.

/* global d3 */ // Inform linters about global variables

// --- Constants ---
const NODE_WIDTH = 120;
const NODE_HEIGHT = 50;
// const NODE_RADIUS = 30; // For potential circular nodes

/**
 * Updates the graph visualization based on the current nodes and links arrays.
 * @param {object} params - Parameters object.
 * @param {d3.Selection} params.svg - The main SVG selection.
 * @param {d3.Selection} params.linkGroup - The SVG group for links.
 * @param {d3.Selection} params.nodeGroup - The SVG group for nodes.
 * @param {d3.Selection} params.textGroup - The SVG group for text labels.
 * @param {d3.Simulation} params.simulation - The D3 force simulation instance.
 * @param {Array<object>} params.nodes - The array of node data objects.
 * @param {Array<object>} params.links - The array of link data objects.
 * @param {function} params.handleNodeClick - Callback function for node clicks.
 * @param {boolean} params.graphInitialized - Flag indicating if the graph is initialized.
 */
export function updateConversationGraph({ svg, linkGroup, nodeGroup, textGroup, simulation, nodes, links, handleNodeClick, graphInitialized }) {
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
        .attr("marker-end", "url(#conv-arrow)"); // Reference marker defined in conversationGraph.js

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
        .on("click", handleNodeClick); // Use the passed-in click handler

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
 * Tick function to update positions during simulation.
 * @param {object} params - Parameters object.
 * @param {d3.Selection} params.linkGroup - The SVG group for links.
 * @param {d3.Selection} params.nodeGroup - The SVG group for nodes.
 * @param {d3.Selection} params.textGroup - The SVG group for text labels.
 */
export function ticked({ linkGroup, nodeGroup, textGroup }) {
     if (!linkGroup || !nodeGroup || !textGroup) {
        // Avoid errors if elements are not ready or destroyed
        return;
    }
    // Update link positions
    linkGroup.selectAll("path.conv-link")
        .attr("d", d => {
            // Basic straight line for now, adjust for node shape later
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const dr = 0; // Change for curved paths if needed
            // Offset start/end points slightly to avoid marker overlap with node stroke
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length === 0) return `M${d.source.x},${d.source.y}L${d.target.x},${d.target.y}`; // Handle zero length

            const offsetX = (dx / length) * (NODE_WIDTH / 2 + 2); // Adjust offset based on node size
            const offsetY = (dy / length) * (NODE_HEIGHT / 2 + 2);

            const targetX = d.target.x - offsetX;
            const targetY = d.target.y - offsetY;

            return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${targetX},${targetY}`;
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
 * @param {d3.ZoomEvent} event - The D3 zoom event.
 * @param {d3.Selection} zoomLayer - The SVG group to apply the transform to.
 */
export function zoomed(event, zoomLayer) {
    if (zoomLayer) {
        zoomLayer.attr("transform", event.transform);
    }
}
