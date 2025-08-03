// Entity Details Pane Management
// Handles entity detail view, attributes system, and detail pane functionality

let sectionOrder = {}; // Store section order per entity

function showEntityDetails(entityId) {
    const entity = window.leftPane.getEntityData()[entityId];
    if (!entity) return;

    document.getElementById('detailTitle').textContent = entity.name;
    
    const savedOrder = sectionOrder[entityId] || ['form', 'function', 'character', 'goal', 'history', 'attributes'];
    let content = '';
    
    savedOrder.forEach(function(section) {
        if (section === 'attributes') {
            // Show attributes system
            content += '<div class="detail-section" data-section="attributes">';
            content += '<h3>Attributes</h3>';
            content += '<div class="class-type-display">';
            content += '<span class="specific-class">' + (entity.type || 'Unknown') + '</span>';
            content += '<span class="class-separator">/</span>';
            content += '<span class="base-class">' + (entity.base_type || 'Unknown') + '</span>';
            content += '</div>';
            
            // Attribute input and filtering
            content += '<div class="attribute-input-container">';
            content += '<input type="text" class="attribute-filter" placeholder="Search or add attribute..." data-entity-id="' + entityId + '">';
            content += '<div class="attribute-suggestions" style="display: none;"></div>';
            content += '</div>';
            
            // Current attributes display
            content += '<div class="current-attributes" data-entity-id="' + entityId + '">';
            content += '<div class="loading-attributes">Loading attributes...</div>';
            content += '</div>';
            
            content += '</div>';
        } else {
            const description = entity[section + '_description'];
            const descriptionDetail = entity[section + '_description_detail'];
            const tags = entity[section + '_tags'];
            
            if (description) {
                content += '<div class="detail-section" data-section="' + section + '">';
                content += '<h3>' + section.charAt(0).toUpperCase() + section.slice(1) + '</h3>';
                content += '<p>' + description + '</p>';
                if (descriptionDetail) {
                    content += '<div class="detail-section-detail">';
                    content += '<p><em>' + descriptionDetail + '</em></p>';
                    content += '</div>';
                }
                if (tags) {
                    const tagArray = JSON.parse(tags);
                    content += '<div class="tags">';
                    tagArray.forEach(function(tag) {
                        content += '<span class="tag">' + tag + '</span>';
                    });
                    content += '</div>';
                }
                content += '</div>';
            }
        }
    });

    document.getElementById('detailContent').innerHTML = content;
    document.getElementById('detailPane').classList.add('active');
    
    // Load attributes after content is inserted
    if (savedOrder.includes('attributes')) {
        loadEntityAttributes(entityId);
        setupAttributeInput(entityId);
    }
    
    initializeDragAndDrop(entityId);
}

function showNodeDetails(nodeId) {
    const node = window.storyUI.getNode(nodeId);
    document.getElementById('detailTitle').textContent = 'Node Details';
    const text = node ? node.text : 'Unknown node';
    document.getElementById('detailContent').innerHTML = '<div class="detail-section"><h3>Node ID</h3><p>' + nodeId + '</p><p>' + text + '</p></div>';
    document.getElementById('detailPane').classList.add('active');
}

function closeDetailPane() {
    document.getElementById('detailPane').classList.remove('active');
}

function toggleSection(sectionName) {
    const button = document.querySelector('[data-section="' + sectionName + '"]');
    const section = document.querySelector('.detail-section[data-section="' + sectionName + '"]');
    
    if (button && section) {
        button.classList.toggle('active');
        section.classList.toggle('hidden');
    }
}

function initializeDragAndDrop(entityId) {
    const detailContent = document.getElementById('detailContent');
    if (detailContent && typeof Sortable !== 'undefined') {
        new Sortable(detailContent, {
            animation: 150,
            ghostClass: 'dragging',
            onStart: function(evt) {
                evt.item.classList.add('dragging');
            },
            onEnd: function(evt) {
                evt.item.classList.remove('dragging');
                
                const newOrder = Array.from(detailContent.children).map(function(child) {
                    return child.getAttribute('data-section');
                });
                sectionOrder[entityId] = newOrder;
                console.log('Saved section order for', entityId, ':', newOrder);
            }
        });
    }
}

// Attributes System Functions
function loadEntityAttributes(entityId) {
    const entity = window.leftPane.getEntityData()[entityId];
    if (!entity) return;
    
    // Get available attributes for this entity's class hierarchy
    window.socket.emit('get_class_attributes', {
        class_id: entity.class_id,
        entity_id: entityId
    });
}

function setupAttributeInput(entityId) {
    const inputField = document.querySelector('.attribute-filter[data-entity-id="' + entityId + '"]');
    const suggestionsDiv = document.querySelector('.attribute-suggestions');
    
    if (!inputField || !suggestionsDiv) return;
    
    let availableAttributes = [];
    let currentAttributes = {};
    
    // Handle input for filtering and new attribute creation
    inputField.addEventListener('input', function(e) {
        const value = e.target.value.toLowerCase();
        
        if (value.length === 0) {
            suggestionsDiv.style.display = 'none';
            return;
        }
        
        // Filter available attributes
        const filtered = availableAttributes.filter(attr => 
            attr.toLowerCase().includes(value) && !currentAttributes.hasOwnProperty(attr)
        );
        
        // Show suggestions
        if (filtered.length > 0) {
            suggestionsDiv.innerHTML = filtered.map(attr => 
                '<div class="attribute-suggestion" data-attribute="' + attr + '">' + attr + '</div>'
            ).join('');
            suggestionsDiv.style.display = 'block';
        } else {
            suggestionsDiv.innerHTML = '<div class="attribute-suggestion new-attribute" data-attribute="' + e.target.value + '">Create new: ' + e.target.value + '</div>';
            suggestionsDiv.style.display = 'block';
        }
    });
    
    // Handle enter key for new attributes
    inputField.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const value = e.target.value.trim();
            if (value && !currentAttributes.hasOwnProperty(value)) {
                addAttributeToEntity(entityId, value, '');
                e.target.value = '';
                suggestionsDiv.style.display = 'none';
            }
        }
    });
    
    // Handle suggestion clicks
    suggestionsDiv.addEventListener('click', function(e) {
        if (e.target.classList.contains('attribute-suggestion')) {
            const attribute = e.target.dataset.attribute;
            addAttributeToEntity(entityId, attribute, '');
            inputField.value = '';
            suggestionsDiv.style.display = 'none';
        }
    });
    
    // Store references for socket response
    inputField._availableAttributes = availableAttributes;
    inputField._currentAttributes = currentAttributes;
}

function addAttributeToEntity(entityId, attributeKey, attributeValue) {
    window.socket.emit('add_entity_attribute', {
        entity_id: entityId,
        attribute_key: attributeKey,
        attribute_value: attributeValue
    });
}

function updateAttributeValue(entityId, attributeKey, attributeValue) {
    window.socket.emit('update_entity_attribute', {
        entity_id: entityId,
        attribute_key: attributeKey,
        attribute_value: attributeValue
    });
}

function removeAttributeFromEntity(entityId, attributeKey) {
    window.socket.emit('remove_entity_attribute', {
        entity_id: entityId,
        attribute_key: attributeKey
    });
}

function updateAttributesDisplay(entityId, attributes) {
    const container = document.querySelector('.current-attributes[data-entity-id="' + entityId + '"]');
    if (!container) return;
    
    if (Object.keys(attributes).length === 0) {
        container.innerHTML = '<div class="no-attributes">No attributes set</div>';
        return;
    }
    
    let html = '';
    Object.keys(attributes).forEach(key => {
        const value = attributes[key];
        html += '<div class="attribute-item" data-key="' + key + '">';
        html += '<div class="attribute-key">' + key + '</div>';
        html += '<input type="text" class="attribute-value" value="' + value + '" data-entity-id="' + entityId + '" data-key="' + key + '">';
        html += '<button class="remove-attribute" data-entity-id="' + entityId + '" data-key="' + key + '">×</button>';
        html += '</div>';
    });
    
    container.innerHTML = html;
    
    // Add event listeners for value changes and removal
    container.querySelectorAll('.attribute-value').forEach(input => {
        input.addEventListener('blur', function() {
            updateAttributeValue(this.dataset.entityId, this.dataset.key, this.value);
        });
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                this.blur();
            }
        });
    });
    
    container.querySelectorAll('.remove-attribute').forEach(button => {
        button.addEventListener('click', function() {
            removeAttributeFromEntity(this.dataset.entityId, this.dataset.key);
        });
    });
}

// Socket event handlers for attributes
function handleClassAttributesLoaded(data) {
    const { entity_id, available_attributes, current_attributes } = data;
    
    // Check if we're in editor mode
    if (window.entityEditor && window.entityEditor.getCurrentEditingEntity() === entity_id) {
        window.entityEditor.updateAttributesEditorDisplay(entity_id, current_attributes, available_attributes);
    } else {
        // Regular detail view
        const inputField = document.querySelector('.attribute-filter[data-entity-id="' + entity_id + '"]');
        const attributesContainer = document.querySelector('.current-attributes[data-entity-id="' + entity_id + '"]');
        
        if (inputField) {
            inputField._availableAttributes = available_attributes;
            inputField._currentAttributes = current_attributes;
        }
        
        if (attributesContainer) {
            updateAttributesDisplay(entity_id, current_attributes);
        }
    }
}

function handleAttributeUpdated(data) {
    const { entity_id, attributes } = data;
    
    // Check if we're in editor mode for this entity
    if (window.entityEditor && window.entityEditor.getCurrentEditingEntity() === entity_id) {
        // Update the editor display
        window.entityEditor.updateAttributesEditorDisplay(entity_id, attributes, []);
    } else {
        // Regular detail view
        updateAttributesDisplay(entity_id, attributes);
        
        // Update available attributes for input field
        const inputField = document.querySelector('.attribute-filter[data-entity-id="' + entity_id + '"]');
        if (inputField) {
            inputField._currentAttributes = attributes;
        }
    }
}

// Export functions to global scope
window.entityDetails = {
    sectionOrder,
    showEntityDetails,
    showNodeDetails,
    closeDetailPane,
    toggleSection,
    initializeDragAndDrop,
    loadEntityAttributes,
    setupAttributeInput,
    addAttributeToEntity,
    updateAttributeValue,
    removeAttributeFromEntity,
    updateAttributesDisplay,
    handleClassAttributesLoaded,
    handleAttributeUpdated
};