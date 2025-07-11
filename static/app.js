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

    socket.on('story_response', function(data) {
        addAIMessage(data.content);
    });

    socket.on('error', function(error) {
        console.error('Socket error:', error);
        addSystemMessage('Error: ' + error.message);
    });

    // Handle attribute system responses
    socket.on('class_attributes_loaded', function(data) {
        const { entity_id, available_attributes, current_attributes } = data;
        const inputField = document.querySelector('.attribute-filter[data-entity-id="' + entity_id + '"]');
        const attributesContainer = document.querySelector('.current-attributes[data-entity-id="' + entity_id + '"]');
        
        if (inputField) {
            inputField._availableAttributes = available_attributes;
            inputField._currentAttributes = current_attributes;
        }
        
        if (attributesContainer) {
            updateAttributesDisplay(entity_id, current_attributes);
        }
    });
    
    socket.on('attribute_updated', function(data) {
        const { entity_id, attributes } = data;
        updateAttributesDisplay(entity_id, attributes);
        
        // Update available attributes for input field
        const inputField = document.querySelector('.attribute-filter[data-entity-id="' + entity_id + '"]');
        if (inputField) {
            inputField._currentAttributes = attributes;
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
        content += '<p><em>Click on any highlighted entity to explore its details, scene/beat boundaries for context, or continue the story below!</em></p>';
        
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

    // Event listeners
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded, setting up event listeners');
        
        initializeSceneObserver();
        
        document.getElementById('closeDetailButton').addEventListener('click', closeDetailPane);
        
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
        
        document.getElementById('sendButton').addEventListener('click', function() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();
            
            if (message) {
                const chatMessages = document.getElementById('chatMessages');
                const userMessage = document.createElement('div');
                userMessage.className = 'message user';
                userMessage.textContent = message;
                chatMessages.appendChild(userMessage);
                
                socket.emit('user_message', {content: message});
                
                input.value = '';
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        });
        
        document.getElementById('messageInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('sendButton').click();
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
        addAIMessage: addAIMessage
    };
}