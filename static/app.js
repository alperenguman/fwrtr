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
            entityData[entity.id] = entity;
        });
        updateEntityList();
        generateInitialStory();
    });

    socket.on('entity_updated', function(entity) {
        entityData[entity.id] = entity;
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
            const regex = new RegExp('\\b' + entity.name + '\\b', 'gi');
            text = text.replace(regex, '<span class="entity ' + entity.type + '" data-id="' + entityId + '">' + entity.name + '</span>');
        }
        return text;
    }

    function updateEntityList() {
        const entityList = document.getElementById('entityList');
        const entityCount = document.getElementById('entityCount');
        
        const entities = Object.values(entityData);
        entityCount.textContent = entities.length + ' entities';
        
        entityList.innerHTML = '';
        entities.forEach(function(entity) {
            const entityDiv = document.createElement('div');
            entityDiv.className = 'entity-item ' + entity.type;
            entityDiv.innerHTML = '<div class="entity-name">' + entity.name + '</div><div class="entity-type">' + entity.type + '</div>';
            entityDiv.addEventListener('click', function() {
                showEntityDetails(entity.id);
            });
            entityList.appendChild(entityDiv);
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
        
        const sarah = entities.find(function(e) { return e.type === 'actor'; });
        const rod = entities.find(function(e) { return e.type === 'object'; });
        const dock = entities.find(function(e) { return e.type === 'location'; });
        const dialogue = entities.find(function(e) { return e.type === 'dialogue'; });
        const time = entities.find(function(e) { return e.type === 'time'; });
        
        console.log('Found entities:', { sarah: sarah, rod: rod, dock: dock, dialogue: dialogue, time: time });
        
        if (sarah && rod && dock && dialogue && time) {
            content += '<p>';
            content += 'As the <span class="entity ' + time.type + '" data-id="' + time.id + '">' + time.name.toLowerCase() + '</span> ';
            content += 'approached, <span class="entity ' + sarah.type + '" data-id="' + sarah.id + '">' + sarah.name + '</span> ';
            content += 'stood on the <span class="entity ' + dock.type + '" data-id="' + dock.id + '">' + dock.name.toLowerCase() + '</span>, ';
            content += 'gripping her <span class="entity ' + rod.type + '" data-id="' + rod.id + '">' + rod.name.toLowerCase() + '</span>. ';
            content += 'She whispered into the mist: <span class="entity ' + dialogue.type + '" data-id="' + dialogue.id + '">"' + dialogue.name + '?"</span>';
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
        
        const savedOrder = sectionOrder[entityId] || ['form', 'function', 'character', 'goal', 'history', 'custom'];
        let content = '';
        
        savedOrder.forEach(function(section) {
            if (section === 'custom') {
                if (entity.custom_attributes) {
                    const customAttrs = JSON.parse(entity.custom_attributes);
                    if (Object.keys(customAttrs).length > 0) {
                        content += '<div class="detail-section" data-section="custom">';
                        content += '<h3>Custom Attributes</h3>';
                        for (const key in customAttrs) {
                            const value = customAttrs[key];
                            const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
                            content += '<div class="custom-attribute"><span class="attr-key">' + key + ':</span> <span class="attr-value">' + displayValue + '</span></div>';
                        }
                        content += '</div>';
                    }
                }
            } else {
                const description = entity[section + '_description'];
                const tags = entity[section + '_tags'];
                
                if (description) {
                    content += '<div class="detail-section" data-section="' + section + '">';
                    content += '<h3>' + section.charAt(0).toUpperCase() + section.slice(1) + '</h3>';
                    content += '<p>' + description + '</p>';
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
        
        initializeDragAndDrop(entityId);
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
                showEntityDetails(entity.id);
                
                setTimeout(function() {
                    const attrElements = document.querySelectorAll('.custom-attribute');
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
                const entityId = e.target.dataset.id;
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