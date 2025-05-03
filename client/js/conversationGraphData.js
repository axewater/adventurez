// /client/js/conversationGraphData.js
// Handles transforming conversation data into a format suitable for D3 force-directed graphs.

/**
 * Transforms the conversation structure into D3 nodes and links.
 * @param {object} conversationStructure - The 'structure' object from the conversation.
 * @returns {object} - An object containing { nodes: Array<object>, links: Array<object> }.
 */
export function transformConversationToGraphData(conversationStructure) {
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
                // Use question_text if available, otherwise npc_text
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
                    // Handle options leading nowhere (null next_node) - no link created
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
            // Check if this node has a direct 'next_node' AND it's not an options/question node
            // (to avoid duplicate links if an options node also has a fallback next_node)
            if (nodeData.next_node && nodeMap.has(nodeData.next_node) && !['options', 'question'].includes(nodeType)) {
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
