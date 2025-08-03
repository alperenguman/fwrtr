// Story UI with tree-based node model
// Provides unlimited depth, expand/collapse, and drag-and-drop reordering

let nodeIdCounter = 1;
const nodes = {
    root: { id: 'root', text: 'Story', children: [], parent: null, collapsed: false }
};
let currentNode = 'root';
let showSystemMessages = true;

function getNode(id) {
    return nodes[id];
}

function addNode(parentId = 'root', text = '') {
    const id = 'n' + nodeIdCounter++;
    nodes[id] = { id, text, children: [], parent: parentId, collapsed: false };
    nodes[parentId].children.splice(nodes[parentId].children.length, 0, id);
    renderTree();
    return id;
}

function toggleNode(id) {
    const node = nodes[id];
    if (!node) return;
    node.collapsed = !node.collapsed;
    renderTree();
}

function renderTree() {
    const treeContainer = document.getElementById('storyTree');
    if (!treeContainer) return;
    treeContainer.innerHTML = '';
    nodes['root'].children.forEach(childId => {
        treeContainer.appendChild(renderNode(childId));
    });
    setupDragAndDrop(treeContainer);
}

function renderNode(id) {
    const node = nodes[id];
    const li = document.createElement('li');
    li.className = 'node';
    li.dataset.nodeId = id;

    const content = document.createElement('div');
    content.className = 'node-content';

    const toggle = document.createElement('span');
    toggle.className = 'node-toggle';
    toggle.textContent = node.collapsed ? '+' : '-';
    toggle.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleNode(id);
    });
    content.appendChild(toggle);

    const textSpan = document.createElement('span');
    textSpan.className = 'node-text';
    textSpan.textContent = node.text || '(empty)';
    content.appendChild(textSpan);

    content.addEventListener('click', function() {
        currentNode = id;
        if (window.entityDetails && window.entityDetails.showNodeDetails) {
            window.entityDetails.showNodeDetails(id);
        }
    });

    li.appendChild(content);

    const childrenUl = document.createElement('ul');
    childrenUl.className = 'node-children';
    if (node.collapsed) {
        childrenUl.style.display = 'none';
    }
    node.children.forEach(childId => {
        childrenUl.appendChild(renderNode(childId));
    });
    li.appendChild(childrenUl);

    setupDragAndDrop(childrenUl);
    return li;
}

function setupDragAndDrop(container) {
    if (typeof Sortable === 'undefined' || !container) return;
    Sortable.create(container, {
        group: 'story',
        animation: 150,
        fallbackOnBody: true,
        swapThreshold: 0.65,
        onEnd: function(evt) {
            const itemId = evt.item.dataset.nodeId;
            const oldParentId = nodes[itemId].parent;
            const newParentLi = evt.to.closest('li.node');
            const newParentId = newParentLi ? newParentLi.dataset.nodeId : 'root';

            // Remove from old parent
            const oldChildren = nodes[oldParentId].children;
            oldChildren.splice(oldChildren.indexOf(itemId), 1);

            // Add to new parent
            nodes[itemId].parent = newParentId;
            const newChildren = nodes[newParentId].children;
            newChildren.splice(evt.newIndex, 0, itemId);

            renderTree();
        }
    });
}

// System messages
function addSystemMessage(text, temporary = false) {
    const container = document.getElementById('systemMessages');
    if (!container) return null;
    const div = document.createElement('div');
    div.className = 'message system';
    div.textContent = text;
    if (temporary) {
        div.classList.add('temp-system');
    }
    container.appendChild(div);
    return div;
}

// Input handling: add new node under current selection
function setupInputHandlers() {
    const sendButton = document.getElementById('sendButton');
    const input = document.getElementById('messageInput');
    if (!sendButton || !input) return;
    sendButton.addEventListener('click', function() {
        const text = input.value.trim();
        if (!text) return;
        addNode(currentNode, text);
        input.value = '';
    });
}

function setupClickHandlers() {
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('toggle-btn')) {
            const section = e.target.getAttribute('data-section');
            window.entityDetails.toggleSection(section);
        }
    });
}

function setupMessageToggles() {
    const systemToggle = document.getElementById('toggleSystemMessages');
    if (systemToggle) {
        systemToggle.addEventListener('click', function() {
            showSystemMessages = !showSystemMessages;
            document.getElementById('systemMessages').style.display = showSystemMessages ? '' : 'none';
            systemToggle.classList.toggle('off', !showSystemMessages);
        });
    }
}

// Generation stubs
function initializeSceneObserver() {}
function generateInitialStory() {
    renderTree();
}
function handleGenerationStream(data) {}
function handleGenerationComplete(data) {}
function handleGenerationError(data) {
    if (data && data.error) {
        addSystemMessage('Generation error: ' + data.error);
    }
}
function handleStoryResponse(data) {}
function handleEvaluationResult(data) {}

// Expose API
window.storyUI = {
    addNode,
    toggleNode,
    renderTree,
    getNode,
    addSystemMessage,
    setupInputHandlers,
    setupClickHandlers,
    setupMessageToggles,
    initializeSceneObserver,
    generateInitialStory,
    handleGenerationStream,
    handleGenerationComplete,
    handleGenerationError,
    handleStoryResponse,
    handleEvaluationResult
};
