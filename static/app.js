// Prevent multiple initialization
if (typeof window.storywriterApp === 'undefined') {
    window.storywriterApp = {};
    
    const socket = io();
    let entityData = {};
    let currentScene = '1:s1';
    let sectionOrder = {}; // Store section order per entity

    // Scroll observer for scene tracking
    let sceneObserver;

    function initializeSceneObserver() {
        if ('IntersectionObserver' in window) {
            sceneObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting && entry.target.dataset.sceneId) {
                        const sceneId = entry.target.dataset.sceneId;
                        if (sceneId !== currentScene) {
                            currentScene = sceneId;
                            updateSceneInfo(sceneId);
                            updateEntityListForScene(sceneId);
                        }
                    }
                });
            }, {
                threshold: 0.5,
                rootMargin: '-50px 0px'
            });
        }
    }

    function observeSceneBoundaries() {
        if (sceneObserver) {
            document.querySelectorAll('.scene-boundary').forEach(scene => {
                sceneObserver.observe(scene);
            });
        }
    }

    function updateSceneInfo(sceneId) {
        const sceneInfo = document.getElementById('sceneInfo');
        const sceneNumber = sceneId.split(':')[1] || sceneId;
        sceneInfo.textContent = 'Scene ' + sceneNumber;
    }

    function updateEntityListForScene(sceneId) {
        updateEntityList();
    }

    // Connection management
    socket.on('connect', function() {
        console.log('Connected to server');
        document.getElementById('messageInput').disabled = false;
        document.getElementById('sendButton').disabled = false;
        
        addSystemMessage('Connected to story server');
        socket.emit('load_entities');
    });

    socket.on('disconnect', function() {
        console.log('Disconnected from server');
        document.getElementById('messageInput').disabled = true;
        document.getElementById('sendButton').disabled = true;
        
        addSystemMessage('Disconnected from server');
    });

    // Data loading
    socket.on('entities_loaded', function(entities) {
        console.log('Entities loaded:', entities);
        entityData = {};
        entities.forEach(entity => {
            entityData[entity.entity_id] = entity;
        });
        updateEntityList();
        generateInitialStory();
    });

    socket.on('entity_updated', function(entity) {
        entityData[entity.entity_id] = entity;
        updateEntityInUI(entity);
        addSystemMessage(entity.name + ' has been updated');
    });

    socket.on('generation_complete', function(data) {
        console.log('✓ Generation complete:', data);
        
        // Flash the background
        flashBackground(data.flash_color || 'red');
        
        // Add the generated story to chat
        addGeneratedStory(data.generated_text, data.generation_mode);
        
        // Re-enable input
        document.getElementById('messageInput').disabled = false;
        document.getElementById('sendButton').disabled = false;
        document.getElementById('sendButton').textContent = 'Send';
    });

    socket.on('generation_error', function(data) {
        console.error('✗ Generation error:', data);
        
        // Flash red for error
        flashBackground('red');
        
        // Show error message
        addSystemMessage('❌ Generation failed: ' + data.error);
        
        // Re-enable input
        document.getElementById('messageInput').disabled = false;
        document.getElementById('sendButton').disabled = false;
        document.getElementById('sendButton').textContent = 'Send';
    });

    socket.on('story_response', function(data) {
        console.log('Story response received:', data);
        if (data.success !== false) {
            // Successful generation - treat like a generated story
            addGeneratedStory(data.content, data.generation_mode || 'chat');
        } else {
            // Failed generation
            addSystemMessage('❌ Generation failed: ' + (data.error || 'Unknown error'));
        }
    });

    socket.on('error', function(error) {
        console.error('Socket error:', error);
        addSystemMessage('Error: ' + error.message);
    });

    // Handle attribute system responses for editor
    socket.on('class_attributes_loaded', function(data) {
        const { entity_id, available_attributes, current_attributes } = data;
        
        // Check if we're in editor mode
        if (currentEditingEntity === entity_id) {
            updateAttributesEditorDisplay(entity_id, current_attributes, available_attributes);
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
    });
    
    // Handle attribute updates in editor
    socket.on('attribute_updated', function(data) {
        const { entity_id, attributes } = data;
        
        // Check if we're in editor mode for this entity
        if (currentEditingEntity === entity_id) {
            // Update the editor display
            updateAttributesEditorDisplay(entity_id, attributes, []);
        } else {
            // Regular detail view
            updateAttributesDisplay(entity_id, attributes);
            
            // Update available attributes for input field
            const inputField = document.querySelector('.attribute-filter[data-entity-id="' + entity_id + '"]');
            if (inputField) {
                inputField._currentAttributes = attributes;
            }
        }
    });

    // UI Functions
    function addSystemMessage(text) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system';
        messageDiv.innerHTML = text + ' <span style="color: #555; font-size: 11px;">' + new Date().toLocaleTimeString() + '</span>';
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function addGeneratedStory(content, generationMode) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message generated ${generationMode}`;
        
        // Add generation mode indicator
        const modeIndicator = generationMode === 'immediate' ? '⚡ Immediate' : '🔄 Simulation';
        const timestamp = new Date().toLocaleTimeString();
        
        messageDiv.innerHTML = `
            <div class="generation-header">
                <span class="generation-mode">${modeIndicator}</span>
                <span class="generation-time">${timestamp}</span>
            </div>
            <div class="generation-content">${processEntityLinks(content)}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        setTimeout(function() {
            observeSceneBoundaries();
        }, 100);
    }

    function flashBackground(color) {
        const body = document.body;
        const originalClass = body.className;
        
        // Add flash class
        body.classList.add(`flash-${color}`);
        
        // Remove after animation
        setTimeout(() => {
            body.classList.remove(`flash-${color}`);
        }, 1000);
    }

    function addAIMessage(content) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ai';
        messageDiv.innerHTML = processEntityLinks(content);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        setTimeout(function() {
            observeSceneBoundaries();
        }, 100);
    }

    function processEntityLinks(text) {
        for (const entityId in entityData) {
            const entity = entityData[entityId];
            const regex = new RegExp('\\b' + entity.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
            text = text.replace(regex, '<span class="entity ' + entity.base_type + '" data-id="' + entityId + '">' + entity.name + '</span>');
        }
        return text;
    }

    function updateEntityList() {
        const entityList = document.getElementById('entityList');
        const entityCount = document.getElementById('entityCount');
        
        const entities = Object.values(entityData);
        entityCount.textContent = entities.length + ' entities';
        
        entityList.innerHTML = '';
        
        // Group entities by base type
        const groupedEntities = {};
        entities.forEach(function(entity) {
            if (!groupedEntities[entity.base_type]) {
                groupedEntities[entity.base_type] = [];
            }
            groupedEntities[entity.base_type].push(entity);
        });
        
        // Display entities grouped by type
        Object.keys(groupedEntities).sort().forEach(function(baseType) {
            groupedEntities[baseType].forEach(function(entity) {
                const entityDiv = document.createElement('div');
                entityDiv.className = 'entity-item ' + entity.base_type;
                entityDiv.innerHTML = '<div class="entity-name">' + entity.name + '</div><div class="entity-type">' + entity.base_type + (entity.type !== entity.base_type ? ' (' + entity.type + ')' : '') + '</div>';
                entityDiv.addEventListener('click', function() {
                    showEntityDetails(entity.entity_id);
                });
                entityList.appendChild(entityDiv);
            });
        });
    }

    function generateInitialStory() {
        console.log('Generating initial story with entities:', Object.keys(entityData));
        const entities = Object.values(entityData);
        
        if (entities.length === 0) {
            console.log('No entities found');
            return;
        }
        
        let content = '<div class="scene-boundary" data-scene-id="1:s1">';
        content += '<div class="beat-boundary" data-beat-id="1:b1">';
        content += '<p><strong>Welcome to your story!</strong> The scene is set with:</p><br>';
        
        const sarah = entities.find(function(e) { return e.base_type === 'actor' && e.name.includes('Sarah'); });
        const rod = entities.find(function(e) { return e.base_type === 'object' && e.name.includes('Rod'); });
        const dock = entities.find(function(e) { return e.base_type === 'location'; });
        const time = entities.find(function(e) { return e.base_type === 'time'; });
        const thought = entities.find(function(e) { return e.base_type === 'thought'; });
        
        console.log('Found entities:', { sarah: sarah, rod: rod, dock: dock, time: time, thought: thought });
        
        if (sarah && rod && dock && time && thought) {
            content += '<p>';
            content += 'As the <span class="entity ' + time.base_type + '" data-id="' + time.entity_id + '">' + time.name.toLowerCase() + '</span> ';
            content += 'approached, <span class="entity ' + sarah.base_type + '" data-id="' + sarah.entity_id + '">' + sarah.name + '</span> ';
            content += 'stood on the <span class="entity ' + dock.base_type + '" data-id="' + dock.entity_id + '">' + dock.name.toLowerCase() + '</span>, ';
            content += 'gripping her <span class="entity ' + rod.base_type + '" data-id="' + rod.entity_id + '">' + rod.name.toLowerCase() + '</span>. ';
            content += 'Her mind raced with the <span class="entity ' + thought.base_type + '" data-id="' + thought.entity_id + '">' + thought.name.toLowerCase() + '</span>.';
            content += '</p>';
        } else {
            content += '<p>Loading story entities...</p>';
        }
        
        content += '</div></div><br>';
        content += '<p><em>Type story directions and press <strong>Ctrl+Enter</strong> for immediate generation (red flash), or <strong>Enter</strong> for chat!</em></p>';
        
        document.getElementById('chatMessages').innerHTML = '<div class="message ai">' + content + '</div>';
        
        setTimeout(function() {
            observeSceneBoundaries();
            updateSceneInfo(currentScene);
        }, 100);
    }

    function showEntityDetails(entityId) {
        const entity = entityData[entityId];
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

    function loadEntityAttributes(entityId) {
        const entity = entityData[entityId];
        if (!entity) return;
        
        // Get available attributes for this entity's class hierarchy
        socket.emit('get_class_attributes', {
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
        socket.emit('add_entity_attribute', {
            entity_id: entityId,
            attribute_key: attributeKey,
            attribute_value: attributeValue
        });
    }
    
    function updateAttributeValue(entityId, attributeKey, attributeValue) {
        socket.emit('update_entity_attribute', {
            entity_id: entityId,
            attribute_key: attributeKey,
            attribute_value: attributeValue
        });
    }
    
    function removeAttributeFromEntity(entityId, attributeKey) {
        socket.emit('remove_entity_attribute', {
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

    function showSceneDetails(sceneId) {
        document.getElementById('detailTitle').textContent = 'Scene Details';
        document.getElementById('detailContent').innerHTML = '<div class="detail-section"><h3>Scene ID</h3><p>' + sceneId + '</p><p>This is the scene context. In a full implementation, this would show scene-specific information like setting, mood, participants, and narrative goals.</p></div>';
        document.getElementById('detailPane').classList.add('active');
    }

    function showBeatDetails(beatId) {
        document.getElementById('detailTitle').textContent = 'Beat Details';
        document.getElementById('detailContent').innerHTML = '<div class="detail-section"><h3>Beat ID</h3><p>' + beatId + '</p><p>This is the beat context. In a full implementation, this would show beat-specific information like dramatic purpose, emotional arc, and story progression.</p></div>';
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

    function openEntityEditor() {
        const currentEntityName = document.getElementById('detailTitle').textContent;
        const entity = Object.values(entityData).find(e => e.name === currentEntityName);
        
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
                        addAttributeToEntity(currentEditingEntity, value, '');
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
        socket.emit('ai_fill_attributes', {
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
        socket.emit('ai_rewrite_section', {
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
                    updateAttributeValue(currentEditingEntity, key, value);
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
                updateAttributeValue(currentEditingEntity, key, value);
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
                    removeAttributeFromEntity(currentEditingEntity, attrKey);
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
        socket.emit('ai_suggest_attribute', {
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
        socket.emit('get_class_attributes', {
            class_id: editingEntityData.class_id,
            entity_id: entityId
        });
    }
    
    function saveEntityChanges() {
        if (!currentEditingEntity) return;
        
        // Send updates to server
        socket.emit('update_entity', {
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

    function updateEntityInUI(entity) {
        updateEntityList();
        
        if (document.getElementById('detailPane').classList.contains('active')) {
            const currentEntityName = document.getElementById('detailTitle').textContent;
            if (entity.name === currentEntityName) {
                showEntityDetails(entity.entity_id);
                
                setTimeout(function() {
                    const attrElements = document.querySelectorAll('.detail-section');
                    attrElements.forEach(function(el) {
                        el.classList.add('updated');
                    });
                    setTimeout(function() {
                        attrElements.forEach(function(el) {
                            el.classList.remove('updated');
                        });
                    }, 1000);
                }, 100);
            }
        }
    }

    let currentEditingEntity = null;
    let editingEntityData = {};

    function handleImmediateGeneration(userInput) {
        console.log('🔥 Starting immediate generation with input:', userInput);
        
        // Disable input during generation
        document.getElementById('messageInput').disabled = true;
        document.getElementById('sendButton').disabled = true;
        document.getElementById('sendButton').textContent = 'Generating...';
        
        // Add generation indicator
        addSystemMessage('🔥 Starting immediate generation...');
        
        const requestData = {
            content: userInput,
            story_id: '1',
            scene_id: currentScene || '1:s1',
            beat_id: generateNextBeatId()
        };
        
        console.log('Sending generate_immediate request:', requestData);
        
        // Send generation request
        socket.emit('generate_immediate', requestData);
    }
    
    function generateNextBeatId() {
        // Simple beat ID generation - in real system this would be more sophisticated
        const timestamp = Date.now().toString(36);
        return `1:b${timestamp}`;
    }

    // Add this to the DOMContentLoaded event listener
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded, setting up event listeners');
        
        initializeSceneObserver();
        
        document.getElementById('closeDetailButton').addEventListener('click', closeDetailPane);
        
        // Check if edit button exists before adding listener
        const editBtn = document.getElementById('editEntityBtn');
        if (editBtn) {
            editBtn.addEventListener('click', openEntityEditor);
        }
        
        const saveBtn = document.getElementById('saveEntityBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveEntityChanges);
        }
        
        const cancelBtn = document.getElementById('cancelEntityBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', cancelEntityEdit);
        }
        
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('toggle-btn')) {
                const sectionName = e.target.getAttribute('data-section');
                toggleSection(sectionName);
                return;
            }
            
            if (e.target.classList.contains('entity')) {
                const entityId = parseInt(e.target.dataset.id);
                showEntityDetails(entityId);
                e.stopPropagation();
                return;
            }
            
            if (e.target.classList.contains('scene-boundary')) {
                const sceneId = e.target.dataset.sceneId;
                if (sceneId) {
                    showSceneDetails(sceneId);
                }
                e.stopPropagation();
                return;
            }
            
            if (e.target.classList.contains('beat-boundary')) {
                const beatId = e.target.dataset.beatId;
                if (beatId) {
                    showBeatDetails(beatId);
                }
                e.stopPropagation();
                return;
            }
        });
        
        document.getElementById('sendButton').addEventListener('click', function(e) {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();
            
            if (message) {
                const chatMessages = document.getElementById('chatMessages');
                const userMessage = document.createElement('div');
                userMessage.className = 'message user';
                userMessage.textContent = message;
                chatMessages.appendChild(userMessage);
                
                // Check for generation mode (ctrl+enter for immediate generation)
                const isImmediate = e && (e.ctrlKey || e.metaKey || window.lastKeyEvent && (window.lastKeyEvent.ctrlKey || window.lastKeyEvent.metaKey));
                
                if (isImmediate) {
                    // Ctrl+Enter: Immediate generation (red flash) with full context
                    handleImmediateGeneration(message);
                } else {
                    // Regular Enter: Simple chat-style generation
                    socket.emit('user_message', {
                        content: message,
                        story_id: '1',
                        scene_id: currentScene || '1:s1',
                        beat_id: generateNextBeatId()
                    });
                }
                
                input.value = '';
                chatMessages.scrollTop = chatMessages.scrollHeight;
                
                // Clear the stored event
                window.lastKeyEvent = null;
            }
        });
        
        document.getElementById('messageInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                // Store the event for the send button handler
                window.lastKeyEvent = e;
                
                if (e.ctrlKey || e.metaKey) {
                    // Ctrl+Enter for immediate generation
                    document.getElementById('sendButton').click();
                } else {
                    // Regular enter for chat
                    document.getElementById('sendButton').click();
                }
            }
        });
    });

    // Expose functions globally for debugging
    window.storywriterApp = {
        socket: socket,
        entityData: entityData,
        currentScene: currentScene,
        sectionOrder: sectionOrder,
        showEntityDetails: showEntityDetails,
        addSystemMessage: addSystemMessage,
        addAIMessage: addAIMessage,
        handleImmediateGeneration: handleImmediateGeneration
    };
}