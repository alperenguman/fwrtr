document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.node-list').forEach(initSortable);
});

function initSortable(el) {
    if (el.dataset.sortableInitialized) return;
    new Sortable(el, {
        group: 'story-nodes',
        animation: 150,
        fallbackOnBody: true,
        swapThreshold: 0.65,
        onAdd: (evt) => ensureChildList(evt.item),
        onEnd: (evt) => ensureChildList(evt.item)
    });
    el.dataset.sortableInitialized = 'true';
}

function ensureChildList(item) {
    if (!item.querySelector(':scope > ul.node-list')) {
        const childList = document.createElement('ul');
        childList.className = 'node-list';
        item.appendChild(childList);
        initSortable(childList);
    }
}
