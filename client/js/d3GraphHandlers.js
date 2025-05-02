/* global d3 */ // Inform linters about global variables

import * as api from './api.js';
import { updateSaveStatusIndicator } from './uiUtils.js'; // Import save status updater
import * as state from './state.js'; // May not be needed directly if data passed in

/**
 * Saves the node's position to the backend.
 * @param {string} nodeId - The ID of the node.
 * @param {number} x - The new x-coordinate.
 * @param {number} y - The new y-coordinate.
 */
export async function saveNodePosition(nodeId, x, y) { // Export the function
    console.log(`Attempting to save position for node ${nodeId}: (${x}, ${y})`);
    try {
        const response = await fetch(`/api/rooms/${nodeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pos_x: x, pos_y: y })
        });
        await api.handleApiResponse(response); // Check for success or throw error
        console.log(`Position saved successfully for node ${nodeId}`);

        // Update position in the main room cache (state.js)
        const roomIndex = state.currentRooms.findIndex(r => r.id === nodeId);
        if (roomIndex !== -1) {
            state.currentRooms[roomIndex].pos_x = x;
            state.currentRooms[roomIndex].pos_y = y;
        }
        state.setUnsavedChanges(false); // Mark as saved after successful API call
        updateSaveStatusIndicator(); // Update UI
    } catch (error) {
        console.error(`Failed to save position for node ${nodeId}:`, error);
        alert(`Error saving node position: ${error.message}`);
        // Optionally revert position visually? Or rely on next full load.
    }
}


// --- Factory Functions for Handlers ---

/**
 * Creates the drag event handlers, closing over the simulation reference.
 * @param {d3.Simulation} simulation - The D3 force simulation instance.
 * @returns {object} - An object containing dragstarted, dragged, and dragended handlers.
 */
export function createDragHandlers(simulation) {
    function dragstarted(event, d) {
        if (!event.active && simulation) simulation.alphaTarget(0.3).restart(); // Heat up simulation
        d.fx = d.x; // Fix position x
        d.fy = d.y; // Fix position y
    }

    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    async function dragended(event, d) {
        if (!event.active && simulation) simulation.alphaTarget(0); // Cool down simulation
        // Keep fx/fy set to fix the node position after drag

        // Save the new position if it changed significantly
        const roundedX = Math.round(d.fx);
        const roundedY = Math.round(d.fy);

        if (roundedX !== d.orig_x || roundedY !== d.orig_y) {
            console.log(`Node ${d.id} dragged to x: ${roundedX}, y: ${roundedY}. Saving...`);
            d.orig_x = roundedX; // Update original position cache *before* saving
            d.orig_y = roundedY;
            await saveNodePosition(d.id, roundedX, roundedY);
        } else {
             console.log(`Node ${d.id} drag ended, position unchanged.`);
             // Ensure fx/fy are still set even if position didn't change,
             // otherwise the node might drift if alphaTarget was non-zero.
             d.fx = d.x;
             d.fy = d.y;
        }
    }

    return { dragstarted, dragged, dragended };
}

/**
 * Calculates the path 'd' attribute for a link, potentially curved.
 * @param {object} connData - The individual connection data, including groupSource, groupTarget, groupConnections.
 * @param {number} index - The index of this connection within its group.
 * @param {number} NODE_WIDTH - Width of node rect.
 * @param {number} NODE_HEIGHT - Height of node rect.
 * @returns {string} - The SVG path 'd' attribute string.
 */
function calculatePath(connData, index, NODE_WIDTH, NODE_HEIGHT) {
    const source = connData.groupSource;
    const target = connData.groupTarget;
    const totalLinks = connData.groupConnections.length;

    // Ensure source and target have valid coordinates
    if (isNaN(source.x) || isNaN(source.y) || isNaN(target.x) || isNaN(target.y)) {
        return ""; // Return empty path if coordinates are invalid
    }

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return ""; // Avoid division by zero

    // Normalize the direction vector
    const nx = dx / distance;
    const ny = dy / distance;

    // Calculate perpendicular offset direction
    const offsetX = -ny;
    const offsetY = nx;

    // Calculate offset magnitude - spread links out
    const linkSpacing = 6; // Pixels between parallel links
    const totalSpread = (totalLinks - 1) * linkSpacing;
    const offsetMagnitude = -totalSpread / 2 + index * linkSpacing;

    // Calculate control point for curve (slightly offset perpendicular to the midpoint)
    const midX = (source.x + target.x) / 2 + offsetX * offsetMagnitude * 1.5; // Increase curve factor
    const midY = (source.y + target.y) / 2 + offsetY * offsetMagnitude * 1.5; // Increase curve factor

    // Use Quadratic Bezier curve: M = moveto, Q = quadratic curve to
    return `M ${source.x} ${source.y} Q ${midX} ${midY} ${target.x} ${target.y}`;
}


/**
 * Creates the tick handler, closing over the necessary D3 group selections and constants.
 * @param {d3.Selection} linkGroup - D3 selection for the link group.
 * @param {d3.Selection} nodeGroup - D3 selection for the node rect group.
 * @param {d3.Selection} textGroup - D3 selection for the text group.
 * @param {number} NODE_WIDTH - Width of the node rectangles.
 * @param {number} NODE_HEIGHT - Height of the node rectangles.
 * @returns {Function} - The tick handler function.
 */
export function createTickHandler(linkGroup, nodeGroup, textGroup, NODE_WIDTH, NODE_HEIGHT) {
    return function ticked() {
        // Update individual connection paths within each group
        if (linkGroup) {
            linkGroup.selectAll("g.link-group").each(function(groupData) {
                d3.select(this).selectAll("path.connection-path")
                    .attr("d", (connData, i) => calculatePath(connData, i, NODE_WIDTH, NODE_HEIGHT));
            });

            // Update link labels (position based on group source/target)
            linkGroup.selectAll("text.link-label")
                .attr("x", d => (d.source.x + d.target.x) / 2)
                .attr("y", d => (d.source.y + d.target.y) / 2);
        }

        if (nodeGroup) {
            nodeGroup.selectAll("rect")
                .attr("x", d => d.x - NODE_WIDTH / 2)
                .attr("y", d => d.y - NODE_HEIGHT / 2);
        }

        if (textGroup) {
            // Move the entire text group (label + indicator) to the node's position
            textGroup.selectAll("g.node-text-group")
                .attr("transform", d => `translate(${d.x},${d.y})`);
        }
    };
}

/**
 * Creates the zoom handler, closing over the zoom layer selection.
 * @param {d3.Selection} zoomLayer - D3 selection for the main zoomable group.
 * @returns {Function} - The zoom handler function.
 */
export function createZoomHandler(zoomLayer) {
    return function zoomed(event) {
        if (zoomLayer) {
            zoomLayer.attr("transform", event.transform);
        }
    };
}
