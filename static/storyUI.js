// Story UI Management
// Handles chat messages, story display, scene/beat observers, and generation

// Scroll observer for scene tracking
let sceneObserver;

function initializeSceneObserver() {
    if ('IntersectionObserver' in window) {
        sceneObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.target.dataset.sceneId) {
                    const sceneId = entry.target.dataset.sceneId;
                    if (sceneId !== window.leftPane.getCurrentScene()) {
                        window.leftPane.setCurrentScene(sceneId);
                        window.leftPane.updateSceneInfo(sceneId);
                        window.leftPane.updateEntityListForScene(sceneId);
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
    const entityData = window.leftPane.getEntityData();
    for (const entityId in entityData) {
        const entity = entityData[entityId];
        const regex = new RegExp('\\b' + entity.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
        text = text.replace(regex, '<span class="entity ' + entity.base_type + '" data-id="' + entityId + '">' + entity.name + '</span>');
    }
    return text;
}

function generateInitialStory() {
    console.log('Generating initial story with entities:', Object.keys(window.leftPane.getEntityData()));
    const entities = Object.values(window.leftPane.getEntityData());
    
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
        window.leftPane.updateSceneInfo(window.leftPane.getCurrentScene());
    }, 100);
}

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
        scene_id: window.leftPane.getCurrentScene() || '1:s1',
        beat_id: generateNextBeatId()
    };
    
    console.log('Sending generate_immediate request:', requestData);
    
    // Send generation request
    window.socket.emit('generate_immediate', requestData);
}

function generateNextBeatId() {
    // Simple beat ID generation - in real system this would be more sophisticated
    const timestamp = Date.now().toString(36);
    return `1:b${timestamp}`;
}

// Socket event handlers
function handleGenerationComplete(data) {
    console.log('✓ Generation complete:', data);
    
    // Flash the background
    flashBackground(data.flash_color || 'red');
    
    // Add the generated story to chat
    addGeneratedStory(data.generated_text, data.generation_mode);
    
    // Re-enable input
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendButton').disabled = false;
    document.getElementById('sendButton').textContent = 'Send';
}

function handleGenerationError(data) {
    console.error('✗ Generation error:', data);
    
    // Flash red for error
    flashBackground('red');
    
    // Show error message
    addSystemMessage('❌ Generation failed: ' + data.error);
    
    // Re-enable input
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendButton').disabled = false;
    document.getElementById('sendButton').textContent = 'Send';
}

function handleStoryResponse(data) {
    console.log('Story response received:', data);
    if (data.success !== false) {
        // Successful generation - treat like a generated story
        addGeneratedStory(data.content, data.generation_mode || 'chat');
    } else {
        // Failed generation
        addSystemMessage('❌ Generation failed: ' + (data.error || 'Unknown error'));
    }
}

// Input handling
function setupInputHandlers() {
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
                window.socket.emit('user_message', {
                    content: message,
                    story_id: '1',
                    scene_id: window.leftPane.getCurrentScene() || '1:s1',
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
}

// Click handlers for entities, scenes, and beats
function setupClickHandlers() {
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('toggle-btn')) {
            const sectionName = e.target.getAttribute('data-section');
            window.entityDetails.toggleSection(sectionName);
            return;
        }
        
        if (e.target.classList.contains('entity')) {
            const entityId = parseInt(e.target.dataset.id);
            window.entityDetails.showEntityDetails(entityId);
            e.stopPropagation();
            return;
        }
        
        if (e.target.classList.contains('scene-boundary')) {
            const sceneId = e.target.dataset.sceneId;
            if (sceneId) {
                window.entityDetails.showSceneDetails(sceneId);
            }
            e.stopPropagation();
            return;
        }
        
        if (e.target.classList.contains('beat-boundary')) {
            const beatId = e.target.dataset.beatId;
            if (beatId) {
                window.entityDetails.showBeatDetails(beatId);
            }
            e.stopPropagation();
            return;
        }
    });
}

// Export functions to global scope
window.storyUI = {
    initializeSceneObserver,
    observeSceneBoundaries,
    addSystemMessage,
    addGeneratedStory,
    flashBackground,
    addAIMessage,
    processEntityLinks,
    generateInitialStory,
    handleImmediateGeneration,
    generateNextBeatId,
    handleGenerationComplete,
    handleGenerationError,
    handleStoryResponse,
    setupInputHandlers,
    setupClickHandlers
};