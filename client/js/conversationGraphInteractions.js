// /client/js/conversationGraphInteractions.js
// Handles user interactions with the conversation graph nodes and links.

/**
 * Handles clicking on a node.
 * @param {Event} event - The click event.
 * @param {object} d - The data object for the clicked node.
 * @param {d3.Selection} nodeGroup - The D3 selection for the node group.
 */
export function handleNodeClick(event, d, nodeGroup) {
    event.stopPropagation(); // Prevent triggering SVG click
    console.log("Clicked conversation node:", d);

    if (!nodeGroup) {
        console.warn("Node group selection not available in handleNodeClick.");
        return;
    }

    // Highlight the selected node (add CSS class)
    nodeGroup.selectAll("rect.conv-node").classed("selected", n => n.id === d.id);

    // TODO: Potentially show node details in a side panel or focus the JSON editor?
    // For now, just log and highlight.

    // Example: Focus the JSON editor textarea if it exists
    const textarea = document.getElementById('conversation-structure-textarea');
    if (textarea) {
        // Find the approximate location of the node definition in the JSON text
        const searchString = `"${d.id}":`;
        const index = textarea.value.indexOf(searchString);
        if (index !== -1) {
            textarea.focus();
            textarea.setSelectionRange(index, index + searchString.length);
            // Scroll the textarea to the selection
             const lines = textarea.value.substring(0, index).split('\n').length;
             const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight, 10) || 16; // Estimate line height
             textarea.scrollTop = (lines - 5) * lineHeight; // Scroll slightly above
        }
    }
}

// Add other interaction handlers like drag handlers if needed later
// export function createDragHandler(...) { ... }
