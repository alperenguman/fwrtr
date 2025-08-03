// Demo node tree structure with hierarchical drag-and-drop using SortableJS

document.addEventListener('DOMContentLoaded', function () {
    const demoData = [
        {
            content: 'Story Node 1',
            children: [
                { content: 'Sub Node 1.1', children: [] },
                {
                    content: 'Sub Node 1.2',
                    children: [
                        { content: 'Sub Node 1.2.1', children: [] }
                    ]
                }
            ]
        },
        { content: 'Story Node 2', children: [] },
        {
            content: 'Story Node 3',
            children: [
                { content: 'Sub Node 3.1', children: [] }
            ]
        }
    ];

    const container = document.getElementById('nodeTree');
    if (!container) return;

    // Build and render the tree
    container.appendChild(buildNodeList(demoData));

    // Initialize sortable behaviour on all node lists
    initializeSortables(container);

    function buildNodeList(nodes) {
        const ul = document.createElement('ul');
        ul.className = 'node-list';

        nodes.forEach(node => {
            const li = document.createElement('li');
            li.className = 'node-item';

            const contentDiv = document.createElement('div');
            contentDiv.className = 'node-content';
            contentDiv.textContent = node.content;
            li.appendChild(contentDiv);

            // Recursively build children
            const childrenUl = buildNodeList(node.children || []);
            li.appendChild(childrenUl);

            ul.appendChild(li);
        });

        return ul;
    }

    function initializeSortables(root) {
        root.querySelectorAll('.node-list').forEach(function (el) {
            new Sortable(el, {
                group: 'nodes',
                animation: 150,
                fallbackOnBody: true,
                swapThreshold: 0.65
            });
        });
    }
});

