// Global state
let cards = [];
let selectedCards = new Set();
let nextCardId = 1;
let linkedEntities = new Map();

// Viewport state
let viewX = 0;
let viewY = 0;
let zoom = 1.0;

// Interaction state
let isDraggingPlane = false;
let isDraggingCard = false;
let isSelecting = false;
let dragStartX = 0;
let dragStartY = 0;
let cardDragStartX = 0;
let cardDragStartY = 0;
let draggedCard = null;
let selectionStartX = 0;
let selectionStartY = 0;
let dragOverCard = null;

// DOM references
const planeContainer = document.getElementById('planeContainer');
const coordinates = document.getElementById('coordinates');
const selectionBox = document.getElementById('selectionBox');
const contextMenu = document.getElementById('contextMenu');

// Linked Entities Helper Functions
function generateLinkedEntitiesHtml(cardId) {
    const linkedSet = linkedEntities.get(cardId);
    const linkedCount = linkedSet ? linkedSet.size : 0;
    
    if (linkedCount === 0) {
        return '<div class="linked-entities"><div class="linked-entities-header" onclick="toggleLinkedEntities(' + cardId + ')"><span class="linked-entities-toggle">▶</span><span>Linked Entities</span><span class="linked-entities-count">0</span></div><div class="linked-entities-list" id="linked-list-' + cardId + '"><div style="color: #666; font-style: italic; padding: 4px 8px;">No linked entities</div></div></div>';
    }
    
    let linkedItemsHtml = '';
    linkedSet.forEach(linkedCardId => {
        const linkedCard = cards.find(c => c.id === linkedCardId);
        if (linkedCard) {
            linkedItemsHtml += '<div class="linked-entity-item" onclick="focusOnCard(' + linkedCardId + ')"><span class="linked-entity-name">' + linkedCard.name + '</span><span class="linked-entity-type">' + linkedCard.type + '</span></div>';
        }
    });
    
    return '<div class="linked-entities"><div class="linked-entities-header" onclick="toggleLinkedEntities(' + cardId + ')"><span class="linked-entities-toggle">▶</span><span>Linked Entities</span><span class="linked-entities-count">' + linkedCount + '</span></div><div class="linked-entities-list" id="linked-list-' + cardId + '">' + linkedItemsHtml + '</div></div>';
}

function toggleLinkedEntities(cardId) {
    const listElement = document.getElementById('linked-list-' + cardId);
    const toggleElement = document.querySelector('#card-' + cardId + ' .linked-entities-toggle');
    
    if (listElement && toggleElement) {
        if (listElement.classList.contains('expanded')) {
            listElement.classList.remove('expanded');
            toggleElement.classList.remove('expanded');
        } else {
            listElement.classList.add('expanded');
            toggleElement.classList.add('expanded');
        }
    }
}

function focusOnCard(cardId) {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    
    viewX = -card.x + window.innerWidth / 2 - 140;
    viewY = -card.y + window.innerHeight / 2 - 100;
    
    updateViewport();
    updateCoordinates();
    
    const cardElement = document.getElementById('card-' + cardId);
    if (cardElement) {
        cardElement.style.boxShadow = '0 0 30px rgba(0, 255, 136, 0.8)';
        setTimeout(() => {
            cardElement.style.boxShadow = '';
        }, 1000);
    }
}

function processTextForLinks(text, currentCardId) {
    let processedText = text;
    
    cards.forEach(card => {
        if (card.id === currentCardId) return;
        
        const regex = new RegExp('\\b' + card.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
        processedText = processedText.replace(regex, (match) => {
            return '<span class="entity-link" onclick="focusOnCard(' + card.id + ')">' + match + '</span>';
        });
    });
    
    return processedText;
}

function linkEntities(cardId1, cardId2) {
    if (!linkedEntities.has(cardId1)) {
        linkedEntities.set(cardId1, new Set());
    }
    if (!linkedEntities.has(cardId2)) {
        linkedEntities.set(cardId2, new Set());
    }
    
    linkedEntities.get(cardId1).add(cardId2);
    linkedEntities.get(cardId2).add(cardId1);
}

// Drag and Drop Functions
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (draggedCard && e.currentTarget !== draggedCard) {
        e.currentTarget.classList.add('drop-target');
        dragOverCard = e.currentTarget;
    }
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drop-target');
        if (dragOverCard === e.currentTarget) {
            dragOverCard = null;
        }
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (draggedCard && e.currentTarget !== draggedCard) {
        const draggedCardId = parseInt(draggedCard.id.split('-')[1]);
        const targetCardId = parseInt(e.currentTarget.id.split('-')[1]);
        
        linkEntities(draggedCardId, targetCardId);
        
        updateCardDisplay(cards.find(c => c.id === draggedCardId));
        updateCardDisplay(cards.find(c => c.id === targetCardId));
        
        console.log('Linked entity ' + draggedCardId + ' to ' + targetCardId);
    }
    
    e.currentTarget.classList.remove('drop-target');
    dragOverCard = null;
}

// Card Functions
function createCard(x, y) {
    x = x !== null && x !== undefined ? x : -viewX + window.innerWidth / 2 - 140;
    y = y !== null && y !== undefined ? y : -viewY + window.innerHeight / 2 - 100;
    
    const card = {
        id: nextCardId++,
        x: x,
        y: y,
        name: 'Entity ' + (nextCardId - 1),
        type: 'entity',
        content: 'Click here to edit content...'
    };
    
    cards.push(card);
    renderCard(card);
    updateCoordinates();
}

function updateCardDisplay(card) {
    const cardElement = document.getElementById('card-' + card.id);
    if (cardElement) {
        cardElement.querySelector('.card-title').textContent = card.name;
        const cardTextElement = cardElement.querySelector('.card-text');
        cardTextElement.innerHTML = processTextForLinks(card.content, card.id);
        
        const linkedEntitiesSection = cardElement.querySelector('.linked-entities');
        if (linkedEntitiesSection) {
            linkedEntitiesSection.outerHTML = generateLinkedEntitiesHtml(card.id);
        }
    }
}

function renderCard(card) {
    const cardElement = document.createElement('div');
    cardElement.className = 'card';
    cardElement.id = 'card-' + card.id;
    cardElement.style.left = card.x + 'px';
    cardElement.style.top = card.y + 'px';
    
    cardElement.innerHTML = '<div class="card-header"><span class="card-title">' + card.name + '</span><div class="card-actions"><button class="card-action" onclick="editCard(' + card.id + ')">Edit</button><button class="card-action danger" onclick="deleteCard(' + card.id + ')">×</button></div></div><div class="card-content"><div class="card-type">' + card.type + '</div><div class="card-text" onclick="editCardContent(' + card.id + ', event)">' + card.content + '</div><div class="linked-entities"><div class="linked-entities-header" onclick="toggleLinkedEntities(' + card.id + ')"><span class="linked-entities-toggle">▶</span><span>Linked Entities</span><span class="linked-entities-count">0</span></div><div class="linked-entities-list" id="linked-list-' + card.id + '"><div style="color: #666; font-style: italic; padding: 4px 8px;">No linked entities</div></div></div></div>';

    cardElement.addEventListener('mousedown', startCardDrag);
    cardElement.addEventListener('click', selectCard);
    cardElement.addEventListener('dblclick', editCard);
    cardElement.addEventListener('dragover', handleDragOver);
    cardElement.addEventListener('drop', handleDrop);
    cardElement.addEventListener('dragenter', handleDragEnter);
    cardElement.addEventListener('dragleave', handleDragLeave);
    
    planeContainer.appendChild(cardElement);
}

// Card interaction
function selectCard(e) {
    e.stopPropagation();
    const cardId = parseInt(e.currentTarget.id.split('-')[1]);
    
    if (!e.ctrlKey && !e.metaKey) {
        selectedCards.clear();
        document.querySelectorAll('.card.selected').forEach(el => {
            el.classList.remove('selected');
        });
    }
    
    if (selectedCards.has(cardId)) {
        selectedCards.delete(cardId);
        e.currentTarget.classList.remove('selected');
    } else {
        selectedCards.add(cardId);
        e.currentTarget.classList.add('selected');
    }
}

function startCardDrag(e) {
    if (e.button !== 0) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    isDraggingCard = true;
    draggedCard = e.currentTarget;
    
    // Simple approach: calculate offset in screen coordinates, then convert during drag
    const cardScreenRect = draggedCard.getBoundingClientRect();
    cardDragStartX = e.clientX - cardScreenRect.left;
    cardDragStartY = e.clientY - cardScreenRect.top;
    
    draggedCard.classList.add('dragging');
    draggedCard.draggable = true;
    
    const cardId = parseInt(draggedCard.id.split('-')[1]);
    if (!selectedCards.has(cardId)) {
        selectedCards.clear();
        document.querySelectorAll('.card.selected').forEach(el => {
            el.classList.remove('selected');
        });
        selectedCards.add(cardId);
        draggedCard.classList.add('selected');
    }
}

function editCard(cardIdOrEvent) {
    let cardId;
    if (typeof cardIdOrEvent === 'number') {
        cardId = cardIdOrEvent;
    } else {
        cardId = parseInt(cardIdOrEvent.currentTarget.id.split('-')[1]);
    }
    
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    
    const newName = prompt('Entity Name:', card.name);
    if (newName !== null && newName.trim() !== '') {
        card.name = newName.trim();
        updateCardDisplay(card);
    }
}

function editCardContent(cardId, event) {
    event.stopPropagation();
    
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    
    const cardTextElement = event.target;
    const originalContent = card.content;
    
    const originalHeight = cardTextElement.offsetHeight;
    const originalWidth = cardTextElement.offsetWidth;
    
    cardTextElement.contentEditable = true;
    cardTextElement.classList.add('editing');
    
    cardTextElement.style.height = originalHeight + 'px';
    cardTextElement.style.width = originalWidth + 'px';
    cardTextElement.style.maxHeight = originalHeight + 'px';
    cardTextElement.style.minHeight = originalHeight + 'px';
    
    cardTextElement.focus();
    
    const range = document.createRange();
    const selection = window.getSelection();
    
    selection.removeAllRanges();
    
    const textNode = cardTextElement.firstChild || cardTextElement;
    if (textNode.nodeType === Node.TEXT_NODE) {
        const rect = cardTextElement.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        
        const charWidth = 7;
        const charPosition = Math.min(Math.max(0, Math.round(clickX / charWidth)), textNode.textContent.length);
        
        range.setStart(textNode, charPosition);
        range.setEnd(textNode, charPosition);
    } else {
        range.setStart(cardTextElement, 0);
        range.setEnd(cardTextElement, 0);
    }
    
    selection.addRange(range);
    
    function saveContent() {
        cardTextElement.contentEditable = false;
        cardTextElement.classList.remove('editing');
        
        cardTextElement.style.height = '';
        cardTextElement.style.width = '';
        cardTextElement.style.maxHeight = '';
        cardTextElement.style.minHeight = '';
        
        const newContent = cardTextElement.textContent.trim();
        if (newContent !== '') {
            card.content = newContent;
        } else {
            card.content = originalContent;
            cardTextElement.textContent = originalContent;
        }
        
        cardTextElement.removeEventListener('blur', saveContent);
        cardTextElement.removeEventListener('keydown', handleKeydown);
    }
    
    function handleKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            cardTextElement.blur();
        } else if (e.key === 'Escape') {
            cardTextElement.textContent = originalContent;
            cardTextElement.blur();
        }
    }
    
    cardTextElement.addEventListener('blur', saveContent);
    cardTextElement.addEventListener('keydown', handleKeydown);
}

function deleteCard(cardId) {
    const cardIndex = cards.findIndex(c => c.id === cardId);
    if (cardIndex !== -1) {
        if (linkedEntities.has(cardId)) {
            const linkedSet = linkedEntities.get(cardId);
            linkedSet.forEach(linkedCardId => {
                linkedEntities.get(linkedCardId).delete(cardId);
                updateCardDisplay(cards.find(c => c.id === linkedCardId));
            });
            linkedEntities.delete(cardId);
        }
        
        cards.splice(cardIndex, 1);
        const cardElement = document.getElementById('card-' + cardId);
        if (cardElement) {
            cardElement.remove();
        }
        selectedCards.delete(cardId);
        updateCoordinates();
    }
}

function deleteSelected() {
    Array.from(selectedCards).forEach(cardId => {
        deleteCard(cardId);
    });
}

function duplicateCard() {
    if (selectedCards.size === 1) {
        const cardId = Array.from(selectedCards)[0];
        const originalCard = cards.find(c => c.id === cardId);
        if (originalCard) {
            createCard(originalCard.x + 20, originalCard.y + 20);
        }
    }
}

// Plane interaction
function startPlaneDrag(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.card')) return;
    
    selectedCards.clear();
    document.querySelectorAll('.card.selected').forEach(el => {
        el.classList.remove('selected');
    });
    
    isDraggingPlane = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    
    planeContainer.classList.add('dragging');
    planeContainer.style.cursor = 'grabbing';
}

function startSelection(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.card')) return;
    
    selectedCards.clear();
    document.querySelectorAll('.card.selected').forEach(el => {
        el.classList.remove('selected');
    });
    
    isSelecting = true;
    selectionStartX = e.clientX;
    selectionStartY = e.clientY;
    
    selectionBox.style.left = selectionStartX + 'px';
    selectionBox.style.top = selectionStartY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    selectionBox.style.display = 'block';
}

// Mouse event handlers
planeContainer.addEventListener('mousedown', (e) => {
    hideContextMenu();
    
    if (e.shiftKey) {
        startSelection(e);
    } else {
        startPlaneDrag(e);
    }
});

document.addEventListener('mousemove', (e) => {
    const worldX = e.clientX - viewX;
    const worldY = e.clientY - viewY;
    
    if (isDraggingPlane) {
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        
        viewX += deltaX;
        viewY += deltaY;
        
        updateViewport();
        
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        
    } else if (isDraggingCard && draggedCard) {
        // Convert mouse position to world coordinates accounting for zoom and pan
        const newWorldX = (e.clientX - cardDragStartX - viewX) / zoom;
        const newWorldY = (e.clientY - cardDragStartY - viewY) / zoom;
        
        const currentWorldX = parseFloat(draggedCard.style.left);
        const currentWorldY = parseFloat(draggedCard.style.top);
        
        const deltaX = newWorldX - currentWorldX;
        const deltaY = newWorldY - currentWorldY;
        
        selectedCards.forEach(cardId => {
            const card = cards.find(c => c.id === cardId);
            const cardElement = document.getElementById('card-' + cardId);
            if (card && cardElement) {
                card.x += deltaX;
                card.y += deltaY;
                cardElement.style.left = card.x + 'px';
                cardElement.style.top = card.y + 'px';
            }
        })
        
    } else if (isSelecting) {
        const currentX = e.clientX;
        const currentY = e.clientY;
        
        const left = Math.min(selectionStartX, currentX);
        const top = Math.min(selectionStartY, currentY);
        const width = Math.abs(currentX - selectionStartX);
        const height = Math.abs(currentY - selectionStartY);
        
        selectionBox.style.left = left + 'px';
        selectionBox.style.top = top + 'px';
        selectionBox.style.width = width + 'px';
        selectionBox.style.height = height + 'px';
        
        updateSelection(left, top, width, height);
    }
    
    updateCoordinates(worldX, worldY);
});

document.addEventListener('mouseup', (e) => {
    if (isDraggingPlane) {
        isDraggingPlane = false;
        planeContainer.classList.remove('dragging');
        planeContainer.style.cursor = 'grab';
    }
    
    if (isDraggingCard) {
        isDraggingCard = false;
        if (draggedCard) {
            draggedCard.classList.remove('dragging');
            draggedCard.draggable = false;
            draggedCard = null;
        }
    }
    
    if (isSelecting) {
        isSelecting = false;
        selectionBox.style.display = 'none';
    }
    
    document.querySelectorAll('.card.drop-target').forEach(el => {
        el.classList.remove('drop-target');
    });
    dragOverCard = null;
});

// Selection logic
function updateSelection(left, top, width, height) {
    document.querySelectorAll('.card').forEach(cardElement => {
        const rect = cardElement.getBoundingClientRect();
        const cardId = parseInt(cardElement.id.split('-')[1]);
        
        const isIntersecting = !(
            rect.right < left ||
            rect.left > left + width ||
            rect.bottom < top ||
            rect.top > top + height
        );
        
        if (isIntersecting) {
            selectedCards.add(cardId);
            cardElement.classList.add('selected');
        } else {
            selectedCards.delete(cardId);
            cardElement.classList.remove('selected');
        }
    });
}

// Context menu
planeContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    
    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';
    contextMenu.style.display = 'block';
});

function hideContextMenu() {
    contextMenu.style.display = 'none';
}

document.addEventListener('click', hideContextMenu);

// Viewport management
function updateViewport() {
    planeContainer.style.setProperty('--bg-x', viewX + 'px');
    planeContainer.style.setProperty('--bg-y', viewY + 'px');
    planeContainer.style.setProperty('--view-x', viewX + 'px');
    planeContainer.style.setProperty('--view-y', viewY + 'px');
    planeContainer.style.setProperty('--zoom', zoom);
}

function updateCoordinates(worldX, worldY) {
    worldX = worldX || 0;
    worldY = worldY || 0;
    coordinates.textContent = 'X: ' + Math.round(worldX) + ', Y: ' + Math.round(worldY) + ' | Zoom: ' + zoom.toFixed(1) + 'x | Cards: ' + cards.length;
}

// Toolbar functions
function resetView() {
    viewX = 0;
    viewY = 0;
    zoom = 1.0;
    updateViewport();
    updateCoordinates();
}

function toggleGrid() {
    console.log('Grid toggle not implemented yet');
}

function fractalTest() {
    // Create a card that demonstrates fractal zoom
    const centerX = -viewX + window.innerWidth / 2 - 140;
    const centerY = -viewY + window.innerHeight / 2 - 100;
    
    const fractalCard = {
        id: nextCardId++,
        x: centerX,
        y: centerY,
        name: 'Fractal Test Card',
        type: 'test',
        content: 'This card should work with zoom interactions. Try zooming into it!'
    };
    
    cards.push(fractalCard);
    renderCard(fractalCard);
    updateCoordinates();
    
    // Focus on this card
    setTimeout(() => {
        focusOnCard(fractalCard.id);
    }, 100);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (document.activeElement.contentEditable === 'true') {
        return;
    }
    
    switch(e.key) {
        case 'n':
        case 'N':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                createCard();
            }
            break;
        case 'Delete':
        case 'Backspace':
            if (selectedCards.size > 0) {
                deleteSelected();
            }
            break;
        case 'd':
        case 'D':
            if ((e.ctrlKey || e.metaKey) && selectedCards.size > 0) {
                e.preventDefault();
                duplicateCard();
            }
            break;
        case 'Escape':
            selectedCards.clear();
            document.querySelectorAll('.card.selected').forEach(el => {
                el.classList.remove('selected');
            });
            break;
        case 'ArrowLeft':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                viewX += 50;
                updateViewport();
            }
            break;
        case 'ArrowRight':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                viewX -= 50;
                updateViewport();
            }
            break;
        case 'ArrowUp':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                viewY += 50;
                updateViewport();
            }
            break;
        case 'ArrowDown':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                viewY -= 50;
                updateViewport();
            }
            break;
    }
});

// Zoom with mouse wheel (zoom to pointer)
planeContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.1, Math.min(5.0, zoom * zoomFactor));
    
    if (newZoom !== zoom) {
        // Get mouse position relative to viewport
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        // Calculate world position before zoom
        const worldBeforeX = (mouseX - viewX) / zoom;
        const worldBeforeY = (mouseY - viewY) / zoom;
        
        // Update zoom
        zoom = newZoom;
        
        // Calculate world position after zoom
        const worldAfterX = (mouseX - viewX) / zoom;
        const worldAfterY = (mouseY - viewY) / zoom;
        
        // Adjust view to keep same world point under mouse
        viewX += (worldAfterX - worldBeforeX) * zoom;
        viewY += (worldAfterY - worldBeforeY) * zoom;
        
        updateViewport();
        updateCoordinates();
    }
});

// Initialize with some sample cards
function initializePlane() {
    createCard(100, 100);
    createCard(400, 150);
    createCard(200, 300);
    
    setTimeout(() => {
        if (cards.length >= 3) {
            cards[0].name = 'Sarah Chen';
            cards[0].type = 'Actor';
            cards[0].content = 'A marine biologist studying deep-sea creatures. She works at The Research Station and is concerned about the Strange Readings.';
            
            cards[1].name = 'The Research Station';
            cards[1].type = 'Location';
            cards[1].content = 'A remote underwater facility 200 meters below the Pacific Ocean surface. Sarah Chen conducts her research here.';
            
            cards[2].name = 'Strange Readings';
            cards[2].type = 'Event';
            cards[2].content = 'Sonar equipment detects unusual patterns from the abyssal depths below The Research Station. Sarah Chen is investigating this phenomenon.';
            
            linkEntities(1, 2);
            linkEntities(1, 3);
            linkEntities(2, 3);
            
            cards.forEach(updateCardDisplay);
        }
    }, 100);
    
    updateCoordinates();
}

// Start the application
initializePlane();