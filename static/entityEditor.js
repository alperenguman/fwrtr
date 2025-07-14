// Entity Editor Management
// Handles the full-screen entity editing mode with AI integration

let currentEditingEntity = null;
let editingEntityData = {};

function openEntityEditor() {
    const currentEntityName = document.getElementById('detailTitle').textContent;
    const entity = Object.values(window.leftPane.getEntityData()).find(e => e.name === currentEntityName);
    
    if (!entity) return;
    
    currentEditingEntity = entity.entity_id;
    editingEntityData = JSON.parse(JSON.stringify(entity)); // Deep copy
    
    // Hide chat messages and show editor
    document.getElementById('chatMessages').style.display = 'none';
    document.getElementById('entityEditor').style.display = 'flex';
    
    // Update editor header
    document.getElementById('editorEntityName').textContent = entity.name;
    document.getElementById('editorEntityType').textContent = entity.type + '/' + entity.base_type;
    
    // Generate editor cards
    generateEditorCards(entity);
    
    // Load current attributes for editing
    loadEntityAttributesForEditor(entity.entity_id);
}

function generateEditorCards(entity) {
    const content = document.getElementById('editorContent');
    let html = '';
    
    // Attributes Card FIRST (at the top)
    html += '<div class="editor-card attributes-editor">';
    html += '<div class="editor-card-header">';
    html += '<div class="editor-card-title">Attributes</div>';
    html += '<div class="editor-card-actions">';
    html += '<button class="card-action-btn ai-btn" data-action="ai-fill">AI Fill</button>';
    html += '<button class="card-action-btn" data-action="add-new">Add New</button>';
    html += '</div>';
    html += '</div>';
    html += '<div class="class-type-display">';
    html += '<span class="specific-class">' + entity.type + '</span>';
    html += '<span class="class-separator">/</span>';
    html += '<span class="base-class">' + entity.base_type + '</span>';
    html += '</div>';
    
    // Add attribute input for new attributes
    html += '<div class="attribute-input-container">';
    html += '<input type="text" class="attribute-filter-editor" placeholder="Add new attribute..." id="attributeFilterEditor">';
    html += '<div class="attribute-suggestions" id="attributeSuggestionsEditor" style="display: none;"></div>';
    html += '</div>';
    
    html += '<div class="attributes-editor-container" id="attributesEditorContainer">';
    html += '<div class="loading-attributes">Loading attributes...</div>';
    html += '</div>';
    html += '</div>';
    
    // Form Card
    html += generateEditorCard('form', 'Form', entity, [
        { key: 'form_description', label: 'Description', type: 'textarea' },
        { key: 'form_description_detail', label: 'Detailed Description', type: 'textarea', class: 'detail' }
    ]);
    
    // Function Card
    html += generateEditorCard('function', 'Function', entity, [
        { key: 'function_description', label: 'Description', type: 'textarea' },
        { key: 'function_description_detail', label: 'Detailed Description', type: 'textarea', class: 'detail' }
    ]);
    
    // Character Card
    html += generateEditorCard('character', 'Character', entity, [
        { key: 'character_description', label: 'Description', type: 'textarea' },
        { key: 'character_description_detail', label: 'Detailed Description', type: 'textarea', class: 'detail' }
    ]);
    
    // Goal Card
    html += generateEditorCard('goal', 'Goal', entity, [
        { key: 'goal_description', label: 'Description', type: 'textarea' },
        { key: 'goal_description_detail', label: 'Detailed Description', type: 'textarea', class: 'detail' }
    ]);
    
    // History Card
    html += generateEditorCard('history', 'History', entity, [
        { key: 'history_description', label: 'Description', type: 'textarea' },
        { key: 'history_description_detail', label: 'Detailed Description', type: 'textarea', class: 'detail' }
    ]);
    
    content.innerHTML = html;
    
    // Add event listeners for textareas
    content.querySelectorAll('.editor-textarea').forEach(textarea => {
        textarea.addEventListener('input', handleFieldChange);
        textarea.addEventListener('input', updateCharCount);
    });
    
    // Add event listeners for AI buttons on section cards
    content.querySelectorAll('.card-action-btn.ai-btn[data-section]').forEach(btn => {
        btn.addEventListener('click', handleAIAction);
    });
    
    // Add event listeners for attribute action buttons
    setupAttributeEditorListeners();
}

function generateEditorCard(section, title, entity, fields) {
    let html = '<div class="editor-card">';
    html += '<div class="editor-card-header">';
    html += '<div class="editor-card-title">' + title + '</div>';
    html += '<div class="editor-card-actions">';
    html += '<button class="card-action-btn ai-btn" data-section="' + section + '">AI Rewrite</button>';
    html += '<button class="card-action-btn" data-section="' + section + '">Expand</button>';
    html += '<button class="card-action-btn" data-section="' + section + '">Condense</button>';
    html += '</div>';
    html += '</div>';
    
    fields.forEach(field => {
        const value = entity[field.key] || '';
        const fieldClass = field.class ? ' ' + field.class : '';
        
        html += '<div class="editor-field">';
        html += '<div class="editor-field-label">' + field.label + '</div>';
        html += '<textarea class="editor-textarea' + fieldClass + '" ';
        html += 'data-field="' + field.key + '" ';
        html += 'placeholder="Enter ' + field.label.toLowerCase() + '...">';
        html += value + '</textarea>';
        html += '<div class="field-meta">';
        html += '<span class="char-count">0 characters</span>';
        html += '</div>';
        html += '</div>';
    });
    
    html += '</div>';
    return html;
}

function setupAttributeEditorListeners() {
    // AI Fill button
    const aiFillBtn = document.querySelector('.card-action-btn[data-action="ai-fill"]');
    if (aiFillBtn) {
        aiFillBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('AI Fill button clicked');
            handleAttributeAIFill();
        });
    }
    
    // Add New button  
    const addNewBtn = document.querySelector('.card-action-btn[data-action="add-new"]');
    if (addNewBtn) {
        addNewBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Add New button clicked');
            const input = document.getElementById('attributeFilterEditor');
            if (input) {
                input.focus();
                input.placeholder = 'Type attribute name and press Enter...';
            }
        });
    }
    
    // New attribute input
    const attributeInput = document.getElementById('attributeFilterEditor');
    if (attributeInput) {
        attributeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const value = e.target.value.trim();
                if (value && currentEditingEntity) {
                    console.log('Adding new attribute:', value);
                    window.entityDetails.addAttributeToEntity(currentEditingEntity, value, '');
                    e.target.value = '';
                    e.target.placeholder = 'Add new attribute...';
                }
            }
        });
        
        attributeInput.addEventListener('focus', function() {
            this.placeholder = 'Type attribute name and press Enter...';
        });
        
        attributeInput.addEventListener('blur', function() {
            if (!this.value) {
                this.placeholder = 'Add new attribute...';
            }
        });
    }
}

function handleAttributeAIFill() {
    // Create AI prompt for filling attributes
    const modal = document.createElement('div');
    modal.className = 'ai-prompt-modal';
    modal.innerHTML = `
        <div class="ai-prompt-content">
            <div class="ai-prompt-header">
                <h3>AI Fill Attributes</h3>
                <button class="ai-prompt-close">&times;</button>
            </div>
            <div class="ai-prompt-body">
                <label for="aiAttributeInstruction">Tell the AI how to fill empty attributes:</label>
                <textarea id="aiAttributeInstruction" placeholder="e.g., Fill with appropriate values based on the character description, make it realistic and consistent with the story setting"></textarea>
                <div class="ai-prompt-examples">
                    <strong>Examples:</strong>
                    <div class="example-chips">
                        <span class="example-chip">Based on character description</span>
                        <span class="example-chip">Realistic modern values</span>
                        <span class="example-chip">Fantasy/supernatural themed</span>
                        <span class="example-chip">Consistent with story setting</span>
                    </div>
                </div>
            </div>
            <div class="ai-prompt-actions">
                <button class="ai-prompt-btn cancel-ai">Cancel</button>
                <button class="ai-prompt-btn execute-ai">Fill Attributes</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const textarea = modal.querySelector('#aiAttributeInstruction');
    textarea.focus();
    
    // Example chip clicks
    modal.querySelectorAll('.example-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            textarea.value = this.textContent;
            textarea.focus();
        });
    });
    
    // Modal actions
    modal.querySelector('.ai-prompt-close').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('.cancel-ai').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('.execute-ai').addEventListener('click', () => {
        const instruction = textarea.value.trim();
        if (instruction) {
            executeAttributeAIFill(instruction);
        }
        document.body.removeChild(modal);
    });
}

function executeAttributeAIFill(instruction) {
    window.socket.emit('ai_fill_attributes', {
        entity_id: currentEditingEntity,
        instruction: instruction,
        entity_context: editingEntityData
    });
    
    // Show loading state
    const container = document.getElementById('attributesEditorContainer');
    if (container) {
        container.classList.add('loading-ai');
    }
}

function handleAIAction(e) {
    const section = e.target.dataset.section;
    const action = e.target.textContent.trim();
    
    // Create AI prompt modal
    showAIPromptModal(section, action);
}

function showAIPromptModal(section, action) {
    const modal = document.createElement('div');
    modal.className = 'ai-prompt-modal';
    modal.innerHTML = `
        <div class="ai-prompt-content">
            <div class="ai-prompt-header">
                <h3>AI ${action} - ${section.charAt(0).toUpperCase() + section.slice(1)}</h3>
                <button class="ai-prompt-close">&times;</button>
            </div>
            <div class="ai-prompt-body">
                <label for="aiInstruction">Tell the AI what to do:</label>
                <textarea id="aiInstruction" placeholder="e.g., Make this more mysterious and gothic, add supernatural elements, make it sound like Lovecraft, etc."></textarea>
                <div class="ai-prompt-examples">
                    <strong>Examples:</strong>
                    <div class="example-chips">
                        <span class="example-chip">Make more mysterious</span>
                        <span class="example-chip">Add supernatural elements</span>
                        <span class="example-chip">More emotional depth</span>
                        <span class="example-chip">Shorter and punchier</span>
                        <span class="example-chip">Gothic horror style</span>
                    </div>
                </div>
            </div>
            <div class="ai-prompt-actions">
                <button class="ai-prompt-btn cancel-ai">Cancel</button>
                <button class="ai-prompt-btn execute-ai">Execute AI ${action}</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus the textarea
    const textarea = modal.querySelector('#aiInstruction');
    textarea.focus();
    
    // Example chip clicks
    modal.querySelectorAll('.example-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            textarea.value = this.textContent;
            textarea.focus();
        });
    });
    
    // Modal actions
    modal.querySelector('.ai-prompt-close').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('.cancel-ai').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('.execute-ai').addEventListener('click', () => {
        const instruction = textarea.value.trim();
        if (instruction) {
            executeAIRewrite(section, action, instruction);
        }
        document.body.removeChild(modal);
    });
    
    // ESC key to close
    modal.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.body.removeChild(modal);
        }
    });
}

function executeAIRewrite(section, action, instruction) {
    // Get current field values
    const descField = document.querySelector(`[data-field="${section}_description"]`);
    const detailField = document.querySelector(`[data-field="${section}_description_detail"]`);
    
    const currentDesc = descField ? descField.value : '';
    const currentDetail = detailField ? detailField.value : '';
    
    // Send to AI
    window.socket.emit('ai_rewrite_section', {
        entity_id: currentEditingEntity,
        section: section,
        action: action.toLowerCase(),
        instruction: instruction,
        current_description: currentDesc,
        current_description_detail: currentDetail
    });
    
    // Show loading state
    if (descField) descField.classList.add('loading-ai');
    if (detailField) detailField.classList.add('loading-ai');
}

function updateAttributesEditorDisplay(entityId, attributes, availableAttributes) {
    const container = document.getElementById('attributesEditorContainer');
    if (!container) return;
    
    container.classList.remove('loading-ai'); // Remove loading state
    
    if (Object.keys(attributes).length === 0) {
        container.innerHTML = '<div class="no-attributes" style="grid-column: 1 / -1; text-align: center; padding: 20px;">No attributes set</div>';
        return;
    }
    
    let html = '';
    Object.keys(attributes).forEach(key => {
        const value = attributes[key];
        html += '<div class="attribute-editor-item" data-key="' + key + '">';
        html += '<div class="attribute-editor-key">' + key + '</div>';
        html += '<input type="text" class="attribute-editor-value" value="' + value + '" data-key="' + key + '" placeholder="Enter value...">';
        html += '<div class="attribute-editor-actions">';
        html += '<button class="card-action-btn ai-btn" data-attr="' + key + '" title="AI suggest value">AI</button>';
        html += '<button class="card-action-btn remove-attr" data-attr="' + key + '" title="Remove attribute">×</button>';
        html += '</div>';
        html += '</div>';
    });
    
    container.innerHTML = html;
    
    // Re-setup all event listeners after updating the display
    setupAttributeEditorInteractions();
}

function setupAttributeEditorInteractions() {
    const container = document.getElementById('attributesEditorContainer');
    if (!container) return;
    
    // Add event listeners for attribute value changes - use debouncing to prevent rapid updates
    container.querySelectorAll('.attribute-editor-value').forEach(input => {
        let timeout;
        
        input.addEventListener('input', function() {
            // Clear existing timeout
            if (timeout) {
                clearTimeout(timeout);
            }
            
            // Set new timeout to debounce the updates
            const key = this.dataset.key;
            const value = this.value;
            
            timeout = setTimeout(() => {
                console.log('Debounced update for attribute:', key, 'to:', value);
                window.entityDetails.updateAttributeValue(currentEditingEntity, key, value);
            }, 500); // Wait 500ms after user stops typing
        });
        
        // Also update on blur for immediate save when user moves away
        input.addEventListener('blur', function() {
            if (timeout) {
                clearTimeout(timeout);
            }
            const key = this.dataset.key;
            const value = this.value;
            console.log('Blur update for attribute:', key, 'to:', value);
            window.entityDetails.updateAttributeValue(currentEditingEntity, key, value);
        });
    });
    
    // Add event listeners for AI buttons on individual attributes
    container.querySelectorAll('.card-action-btn.ai-btn[data-attr]').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const attrKey = this.dataset.attr;
            console.log('AI button clicked for attribute:', attrKey);
            handleAttributeAI(attrKey);
        });
    });
    
    // Add event listeners for remove buttons with confirmation
    container.querySelectorAll('.remove-attr').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const attrKey = this.dataset.attr;
            
            // Add confirmation to prevent accidental deletion
            if (confirm(`Remove attribute "${attrKey}"? This will affect all entities of this class.`)) {
                console.log('Confirmed removal of attribute:', attrKey);
                window.entityDetails.removeAttributeFromEntity(currentEditingEntity, attrKey);
            }
        });
    });
}

function handleAttributeAI(attributeKey) {
    // Create AI prompt for individual attribute
    const modal = document.createElement('div');
    modal.className = 'ai-prompt-modal';
    modal.innerHTML = `
        <div class="ai-prompt-content">
            <div class="ai-prompt-header">
                <h3>AI Suggest: ${attributeKey}</h3>
                <button class="ai-prompt-close">&times;</button>
            </div>
            <div class="ai-prompt-body">
                <label for="aiAttrInstruction">Tell the AI how to set this attribute:</label>
                <textarea id="aiAttrInstruction" placeholder="e.g., Set a realistic value based on the character, make it fit the story setting, suggest something creative"></textarea>
                <div class="ai-prompt-examples">
                    <strong>Examples:</strong>
                    <div class="example-chips">
                        <span class="example-chip">Realistic for character</span>
                        <span class="example-chip">Story-appropriate</span>
                        <span class="example-chip">Creative and interesting</span>
                        <span class="example-chip">Consistent with description</span>
                    </div>
                </div>
            </div>
            <div class="ai-prompt-actions">
                <button class="ai-prompt-btn cancel-ai">Cancel</button>
                <button class="ai-prompt-btn execute-ai">Set Value</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const textarea = modal.querySelector('#aiAttrInstruction');
    textarea.focus();
    
    // Example chip clicks
    modal.querySelectorAll('.example-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            textarea.value = this.textContent;
            textarea.focus();
        });
    });
    
    // Modal actions
    modal.querySelector('.ai-prompt-close').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('.cancel-ai').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('.execute-ai').addEventListener('click', () => {
        const instruction = textarea.value.trim();
        if (instruction) {
            executeAttributeAI(attributeKey, instruction);
        }
        document.body.removeChild(modal);
    });
}

function executeAttributeAI(attributeKey, instruction) {
    window.socket.emit('ai_suggest_attribute', {
        entity_id: currentEditingEntity,
        attribute_key: attributeKey,
        instruction: instruction,
        entity_context: editingEntityData
    });
    
    // Show loading state on specific attribute
    const attrItem = document.querySelector(`.attribute-editor-item[data-key="${attributeKey}"]`);
    if (attrItem) {
        attrItem.classList.add('loading-ai');
    }
}

function handleFieldChange(e) {
    const field = e.target.dataset.field;
    const value = e.target.value;
    editingEntityData[field] = value;
}

function updateCharCount(e) {
    const meta = e.target.parentNode.querySelector('.char-count');
    if (meta) {
        meta.textContent = e.target.value.length + ' characters';
    }
}

function loadEntityAttributesForEditor(entityId) {
    window.socket.emit('get_class_attributes', {
        class_id: editingEntityData.class_id,
        entity_id: entityId
    });
}

function saveEntityChanges() {
    if (!currentEditingEntity) return;
    
    // Send updates to server
    window.socket.emit('update_entity', {
        entity_id: currentEditingEntity,
        updates: editingEntityData
    });
    
    // Close editor
    cancelEntityEdit();
}

function cancelEntityEdit() {
    // Reset editing state
    currentEditingEntity = null;
    editingEntityData = {};
    
    // Show chat messages and hide editor
    document.getElementById('entityEditor').style.display = 'none';
    document.getElementById('chatMessages').style.display = 'block';
}

// Export functions to global scope
window.entityEditor = {
    getCurrentEditingEntity: () => currentEditingEntity,
    getEditingEntityData: () => editingEntityData,
    openEntityEditor,
    generateEditorCards,
    generateEditorCard,
    setupAttributeEditorListeners,
    handleAttributeAIFill,
    executeAttributeAIFill,
    handleAIAction,
    showAIPromptModal,
    executeAIRewrite,
    updateAttributesEditorDisplay,
    setupAttributeEditorInteractions,
    handleAttributeAI,
    executeAttributeAI,
    handleFieldChange,
    updateCharCount,
    loadEntityAttributesForEditor,
    saveEntityChanges,
    cancelEntityEdit
};