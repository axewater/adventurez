// /client/js/conversationGraphActions.js
// This file can contain more complex actions related to the conversation graph,
// such as adding/removing nodes/links via the graph interface (if implemented later).

// For now, it might remain empty or contain simple selection logic if separated from conversationGraph.js

/**
 * Selects a node in the graph visually.
 * (Currently handled within conversationGraph.js's handleNodeClick)
 * @param {string} nodeId - The ID of the node to select.
 */
export function selectNodeInConversationGraph(nodeId) {
    // Requires access to the D3 node selection (nodeGroup) from conversationGraph.js
    // This might be better kept within conversationGraph.js unless complexity grows significantly.
    console.log(`Action: Select conversation node ${nodeId}`);
    // Example (if nodeGroup were accessible):
    // nodeGroup.selectAll("rect.conv-node").classed("selected", n => n.id === nodeId);
}

/**
 * Unselects any currently selected node in the graph.
 */
export function unselectNodeInConversationGraph() {
    console.log("Action: Unselect conversation node");
    // Example (if nodeGroup were accessible):
    // nodeGroup.selectAll("rect.conv-node").classed("selected", false);
}

// Add other actions like addNode, addLink, deleteNode, deleteLink later if graph editing is implemented.
