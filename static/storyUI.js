// Story UI Management
// Handles chat messages, story display, scene/node observers, and generation with streaming

// Scroll observer for scene tracking
let sceneObserver;
let currentStreamingMessage = null;
let currentGenSystemMessage = null;
let showSystemMessages = true;
let showUserMessages = true;
let autoEval = true;
let sceneCounter = 1;
const nodeCounters = { '1:s1': 1 };

function generateNextSceneId() {
    sceneCounter += 1;
    const id = '1:s' + sceneCounter;
    nodeCounters[id] = 0;
    return id;
}

function generateNextNodeId(sceneId = window.leftPane.getCurrentScene() || '1:s1') {
    if (!nodeCounters[sceneId]) {
        nodeCounters[sceneId] = 0;
    }
    nodeCounters[sceneId] += 1;
    return '1:n' + nodeCounters[sceneId];
}

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
function addSystemMessage(text, temporary = false) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system';
    messageDiv.innerHTML = text + ' <span style="color: #555; font-size: 11px;">' + new Date().toLocaleTimeString() + '</span>';
    if (temporary) {
        messageDiv.classList.add('temp-system');
    }
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return messageDiv;
}

function formatTextIntoParagraphs(text) {
    // Split text into paragraphs based on double line breaks, single line breaks, or sentence patterns
    let paragraphs = text
        // First split on double line breaks
        .split(/\n\s*\n/)
        // Then split on single line breaks if paragraphs are too long
        .flatMap(para => {
            if (para.length > 300) {
                // Split long paragraphs on sentence boundaries
                return para.split(/(?<=[.!?])\s+(?=[A-Z])/).reduce((acc, sentence) => {
                    if (acc.length === 0) {
                        acc.push(sentence);
                    } else {
                        const lastPara = acc[acc.length - 1];
                        if (lastPara.length + sentence.length < 300) {
                            acc[acc.length - 1] = lastPara + ' ' + sentence;
                        } else {
                            acc.push(sentence);
                        }
                    }
                    return acc;
                }, []);
            }
            return [para];
        })
        // Clean up and filter empty paragraphs
        .map(para => para.trim())
        .filter(para => para.length > 0);

    // If no natural breaks found, create artificial breaks every ~200 characters at sentence boundaries
    if (paragraphs.length === 1 && paragraphs[0].length > 200) {
        const sentences = paragraphs[0].split(/(?<=[.!?])\s+/);
        paragraphs = [];
        let currentPara = '';
        
        for (const sentence of sentences) {
            if (currentPara.length + sentence.length > 200 && currentPara.length > 0) {
                paragraphs.push(currentPara.trim());
                currentPara = sentence;
            } else {
                currentPara += (currentPara ? ' ' : '') + sentence;
            }
        }
        
        if (currentPara) {
            paragraphs.push(currentPara.trim());
        }
    }

    return paragraphs.map(para => '<p>' + processEntityLinks(para) + '</p>').join('');
}

function startStreamingMessage(generationMode, sceneId, nodeId) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai streaming raw-output';

    const sceneDiv = document.createElement('div');
    sceneDiv.className = 'scene-boundary';
    sceneDiv.dataset.sceneId = sceneId;

    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'node-boundary';
    nodeDiv.dataset.nodeId = nodeId;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'generation-content streaming-content';
    contentDiv.innerHTML = '<div class="streaming-cursor">▊</div>';

    nodeDiv.appendChild(contentDiv);
    sceneDiv.appendChild(nodeDiv);
    messageDiv.appendChild(sceneDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    currentStreamingMessage = {
        element: messageDiv,
        content: '',
        contentElement: contentDiv,
        rawText: ''
    };

    return currentStreamingMessage;
}

function appendToStreamingMessage(text) {
    if (!currentStreamingMessage) return;

    currentStreamingMessage.content += text;
    currentStreamingMessage.rawText += text;
    
    // Update the display with formatted paragraphs
    const formattedContent = formatTextIntoParagraphs(currentStreamingMessage.content);
    currentStreamingMessage.contentElement.innerHTML = formattedContent + '<div class="streaming-cursor">▊</div>';
    
    // Auto-scroll to keep up with streaming
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function finishStreamingMessage() {
    if (!currentStreamingMessage) return;

    // Remove streaming class and cursor
    currentStreamingMessage.element.classList.remove('streaming');

    // Store raw text for undo
    currentStreamingMessage.element.dataset.rawText = currentStreamingMessage.rawText;

    // Final format of the content
    const formattedContent = formatTextIntoParagraphs(currentStreamingMessage.content);
    currentStreamingMessage.contentElement.innerHTML = formattedContent;
    currentStreamingMessage.contentElement.classList.remove('streaming-content');

    const targetElement = currentStreamingMessage.element;

    // Add undo button
    const undoBtn = document.createElement('span');
    undoBtn.className = 'undo-btn';
    undoBtn.textContent = 'Undo';
    undoBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        revertToRaw(targetElement);
    });
    targetElement.appendChild(undoBtn);

    if (!autoEval) {
        const evalBtn = document.createElement('span');
        evalBtn.className = 'eval-btn';
        evalBtn.textContent = 'Eval';
        evalBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            requestEvaluation(targetElement);
        });
        targetElement.appendChild(evalBtn);
    }

    currentStreamingMessage = null;
    
    setTimeout(function() {
        observeSceneBoundaries();
    }, 100);
}

function addGeneratedStory(content, generationMode, sceneId, nodeId, rawText, storyEntryId) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai';

    sceneId = sceneId || window.leftPane.getCurrentScene() || '1:s1';
    nodeId = nodeId || generateNextNodeId(sceneId);

    const sceneDiv = document.createElement('div');
    sceneDiv.className = 'scene-boundary';
    sceneDiv.dataset.sceneId = sceneId;

    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'node-boundary';
    nodeDiv.dataset.nodeId = nodeId;

    const formattedContent = formatTextIntoParagraphs(content);
    const contentDiv = document.createElement('div');
    contentDiv.className = 'generation-content';
    contentDiv.innerHTML = formattedContent;

    nodeDiv.appendChild(contentDiv);
    sceneDiv.appendChild(nodeDiv);
    messageDiv.appendChild(sceneDiv);
    if (storyEntryId) {
        messageDiv.dataset.storyEntryId = storyEntryId;
    }
    if (rawText) {
        messageDiv.dataset.rawText = rawText;
        const undoBtn = document.createElement('span');
        undoBtn.className = 'undo-btn';
        undoBtn.textContent = 'Undo';
        undoBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            revertToRaw(messageDiv);
        });
        messageDiv.appendChild(undoBtn);
    }
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    setTimeout(function() {
        observeSceneBoundaries();
    }, 100);
}

function flashBackground(color) {
    const body = document.body;
    
    // Add flash class
    body.classList.add('flash-' + color);
    
    // Remove after animation
    setTimeout(function() {
        body.classList.remove('flash-' + color);
    }, 1000);
}

function revertToRaw(messageEl) {
    if (!messageEl || !messageEl.dataset.rawText) return;
    const raw = messageEl.dataset.rawText;
    const contentDiv = messageEl.querySelector('.generation-content');
    if (contentDiv) {
        contentDiv.innerHTML = formatTextIntoParagraphs(raw);
    }
    messageEl.classList.remove('processed');
}

function requestEvaluation(messageEl) {
    if (!messageEl || !messageEl.dataset.storyEntryId) return;
    messageEl.classList.add('processing');
    window.socket.emit('evaluate_entry', { story_entry_id: messageEl.dataset.storyEntryId });
}

function applyEvaluationResult(messageEl, data) {
    if (!messageEl) return;
    messageEl.classList.remove('processing');
    messageEl.classList.add('processed');
    messageEl.classList.remove('raw-output');
    if (data.raw_text) {
        messageEl.dataset.rawText = data.raw_text;
    }
    if (data.processed_text) {
        const segments = data.segments || [{ text: data.processed_text, new_scene: data.new_scene, new_node: data.new_node }];

        let sceneDiv = messageEl.querySelector('.scene-boundary');
        let nodeDiv = sceneDiv.querySelector('.node-boundary');
        const contentDiv = nodeDiv.querySelector('.generation-content');

        let startIndex = 0;

        if (!data.new_scene && !data.new_node) {
            const prevMessage = messageEl.previousElementSibling;
            if (prevMessage && prevMessage.classList.contains('message')) {
                const prevNodes = prevMessage.querySelectorAll('.node-boundary');
                const lastNode = prevNodes[prevNodes.length - 1];
                if (lastNode) {
                    const prevContent = lastNode.querySelector('.generation-content');
                    prevContent.innerHTML += formatTextIntoParagraphs(segments[0].text);
                    startIndex = 1;
                }
            }
        }

        if (startIndex >= segments.length) {
            messageEl.remove();
            setTimeout(observeSceneBoundaries, 100);
            return;
        }

        const firstSeg = segments[startIndex];
        contentDiv.innerHTML = formatTextIntoParagraphs(firstSeg.text);

        for (let i = startIndex + 1; i < segments.length; i++) {
            const seg = segments[i];
            if (seg.new_scene) {
                const newSceneId = generateNextSceneId();
                const newScene = document.createElement('div');
                newScene.className = 'scene-boundary';
                newScene.dataset.sceneId = newSceneId;
                const newNodeId = generateNextNodeId(newSceneId);
                const newNode = document.createElement('div');
                newNode.className = 'node-boundary';
                newNode.dataset.nodeId = newNodeId;
                const c = document.createElement('div');
                c.className = 'generation-content';
                c.innerHTML = formatTextIntoParagraphs(seg.text);
                newNode.appendChild(c);
                newScene.appendChild(newNode);
                sceneDiv.parentNode.insertBefore(newScene, sceneDiv.nextSibling);
                sceneDiv = newScene;
            } else {
                const newNode = document.createElement('div');
                newNode.className = 'node-boundary';
                const newNodeId = generateNextNodeId(sceneDiv.dataset.sceneId);
                newNode.dataset.nodeId = newNodeId;
                const c = document.createElement('div');
                c.className = 'generation-content';
                c.innerHTML = formatTextIntoParagraphs(seg.text);
                newNode.appendChild(c);
                sceneDiv.appendChild(newNode);
            }
        }
    }
}

function addAIMessage(content) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai';
    
    const formattedContent = formatTextIntoParagraphs(content);
    messageDiv.innerHTML = formattedContent;
    
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
    content += '<div class="node-boundary" data-node-id="1:n1">';
    content += '<p><strong>Welcome to your story!</strong> The scene is set with:</p>';
    
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
    
    content += '</div></div>';

    document.getElementById('chatMessages').innerHTML = '<div class="message ai">' + content + '</div>';

    setTimeout(function() {
        observeSceneBoundaries();
        window.leftPane.updateSceneInfo(window.leftPane.getCurrentScene());
        sceneCounter = 1;
        nodeCounters['1:s1'] = 1;
    }, 100);
}

function handleImmediateGeneration(userInput) {
    console.log('🔥 Starting immediate generation with input:', userInput);
    
    // Disable input during generation
    document.getElementById('messageInput').disabled = true;
    document.getElementById('sendButton').disabled = true;
    document.getElementById('sendButton').textContent = 'Generating...';
    
    // Add generation indicator
    if (currentGenSystemMessage) {
        currentGenSystemMessage.remove();
    }
    currentGenSystemMessage = addSystemMessage('🔥 Starting immediate generation...', true);
    
    const requestData = {
        content: userInput,
        story_id: '1',
        scene_id: window.leftPane.getCurrentScene() || '1:s1',
        node_id: generateNextNodeId(window.leftPane.getCurrentScene() || '1:s1'),
        skip_eval: !autoEval
    };

    // Start streaming message
    startStreamingMessage('immediate', requestData.scene_id, requestData.node_id);
    
    console.log('Sending generate_immediate request:', requestData);
    
    // Send generation request
    window.socket.emit('generate_immediate', requestData);
}

function handleChatGeneration(userInput) {
    console.log('💬 Starting chat generation with input:', userInput);

    document.getElementById('messageInput').disabled = true;
    document.getElementById('sendButton').disabled = true;
    document.getElementById('sendButton').textContent = 'Generating...';

    if (currentGenSystemMessage) {
        currentGenSystemMessage.remove();
    }
    currentGenSystemMessage = addSystemMessage('💬 Generating response...', true);

    const requestData = {
        content: userInput,
        story_id: '1',
        scene_id: window.leftPane.getCurrentScene() || '1:s1',
        node_id: generateNextNodeId(window.leftPane.getCurrentScene() || '1:s1'),
        skip_eval: !autoEval
    };

    startStreamingMessage('chat', requestData.scene_id, requestData.node_id);

    console.log('Sending user_message request:', requestData);
    window.socket.emit('user_message', requestData);
}


// Socket event handlers for streaming
function handleGenerationStream(data) {
    console.log('📡 Streaming chunk received:', data.chunk);
    
    if (data.chunk) {
        appendToStreamingMessage(data.chunk);
    }
}

function handleGenerationComplete(data) {
    console.log('✓ Generation complete:', data);

    if (currentGenSystemMessage) {
        currentGenSystemMessage.remove();
        currentGenSystemMessage = null;
    }
    
    // Finish streaming if in progress
    if (currentStreamingMessage) {
        finishStreamingMessage();
        if (data.segments) {
            applyEvaluationResult(currentStreamingMessage.element, data);
            currentStreamingMessage.element.dataset.storyEntryId = data.story_entry_id || '';
        } else if (data.generated_text) {
            const formatted = formatTextIntoParagraphs(data.generated_text);
            currentStreamingMessage.contentElement.innerHTML = formatted;
            currentStreamingMessage.element.classList.add('processed');
            currentStreamingMessage.element.dataset.storyEntryId = data.story_entry_id || '';
            if (data.raw_text) {
                currentStreamingMessage.element.dataset.rawText = data.raw_text;
            }
        }
    } else {
        // Fallback for non-streaming response
        addGeneratedStory(
            data.generated_text || data.content,
            data.generation_mode || 'immediate',
            null,
            null,
            data.raw_text || data.content,
            data.story_entry_id || ''
        );
        if (data.segments) {
            const messageEl = document.querySelector('.message.ai[data-story-entry-id="' + data.story_entry_id + '"]');
            if (messageEl) {
                applyEvaluationResult(messageEl, data);
            }
        }
    }
    
    // Flash the background
    flashBackground(data.flash_color || 'red');
    
    // Re-enable input
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendButton').disabled = false;
    document.getElementById('sendButton').textContent = 'Send';
}

function handleGenerationError(data) {
    console.error('✗ Generation error:', data);

    if (currentGenSystemMessage) {
        currentGenSystemMessage.remove();
        currentGenSystemMessage = null;
    }
    
    // Finish streaming if in progress
    if (currentStreamingMessage) {
        finishStreamingMessage();
    }
    
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
    if (currentGenSystemMessage) {
        currentGenSystemMessage.remove();
        currentGenSystemMessage = null;
    }
    const wasStreaming = !!currentStreamingMessage;

    if (data.success !== false) {
        if (!wasStreaming) {
            addGeneratedStory(
                data.content,
                data.generation_mode || 'chat',
                null,
                null,
                data.raw_text || data.content,
                data.story_entry_id || ''
            );
            if (data.segments) {
                const messageEl = document.querySelector('.message.ai[data-story-entry-id="' + data.story_entry_id + '"]');
                if (messageEl) {
                    applyEvaluationResult(messageEl, data);
                }
            }
        } else {
            if (currentStreamingMessage && data.content) {
                const formatted = formatTextIntoParagraphs(data.content);
                currentStreamingMessage.contentElement.innerHTML = formatted;
                currentStreamingMessage.element.classList.add('processed');
                if (data.raw_text) {
                    currentStreamingMessage.element.dataset.rawText = data.raw_text;
                }
            }
        }
    } else {
        addSystemMessage('❌ Generation failed: ' + (data.error || 'Unknown error'));
    }

    if (wasStreaming) {
        finishStreamingMessage();
    }

    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendButton').disabled = false;
    document.getElementById('sendButton').textContent = 'Send';
}

function handleEvaluationResult(data) {
    console.log('Evaluation result:', data);
    if (data.success === false) {
        addSystemMessage('❌ Eval failed: ' + (data.error || 'Unknown'));
        return;
    }
    const messageEl = document.querySelector('.message.ai[data-story-entry-id="' + data.story_entry_id + '"]');
    if (messageEl) {
        applyEvaluationResult(messageEl, data);
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
            const toggle = document.createElement('span');
            toggle.className = 'user-toggle';
            toggle.textContent = '\u25BE';
            const contentSpan = document.createElement('span');
            contentSpan.className = 'user-content';
            contentSpan.textContent = message;
            toggle.addEventListener('click', function() {
                contentSpan.classList.toggle('hidden');
                userMessage.classList.toggle('collapsed');
                toggle.textContent = contentSpan.classList.contains('hidden') ? '\u25B8' : '\u25BE';
            });
            userMessage.appendChild(toggle);
            userMessage.appendChild(contentSpan);
            chatMessages.appendChild(userMessage);
            
            // Check for generation mode (ctrl+enter for immediate generation)
            const isImmediate = e && (e.ctrlKey || e.metaKey || window.lastKeyEvent && (window.lastKeyEvent.ctrlKey || window.lastKeyEvent.metaKey));
            
            if (isImmediate) {
                handleImmediateGeneration(message);
            } else {
                handleChatGeneration(message);
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

// Click handlers for entities, scenes, and nodes
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
        
        if (e.target.classList.contains('node-boundary')) {
            const nodeId = e.target.dataset.nodeId;
            if (nodeId) {
                window.entityDetails.showNodeDetails(nodeId);
            }
            e.stopPropagation();
            return;
        }
    });
}

function setupMessageToggles() {
    const systemToggle = document.getElementById('toggleSystemMessages');
    const userToggle = document.getElementById('toggleUserMessages');
    const evalToggle = document.getElementById('toggleAutoEval');

    if (systemToggle) {
        systemToggle.addEventListener('click', function() {
            showSystemMessages = !showSystemMessages;
            document.querySelectorAll('.message.system').forEach(el => {
                el.style.display = showSystemMessages ? '' : 'none';
            });
            systemToggle.classList.toggle('off', !showSystemMessages);
        });
    }

    if (userToggle) {
        userToggle.addEventListener('click', function() {
            showUserMessages = !showUserMessages;
            document.querySelectorAll('.message.user').forEach(el => {
                el.style.display = showUserMessages ? '' : 'none';
            });
            userToggle.classList.toggle('off', !showUserMessages);
        });
    }

    if (evalToggle) {
        evalToggle.addEventListener('click', function() {
            autoEval = !autoEval;
            evalToggle.classList.toggle('off', !autoEval);
            if (autoEval) {
                document.querySelectorAll('.message.ai.raw-output').forEach(function(el) {
                    if (!el.classList.contains('processing') && !el.classList.contains('processed')) {
                        requestEvaluation(el);
                    }
                });
            }
        });
    }
}

// Export functions to global scope
window.storyUI = {
    initializeSceneObserver: initializeSceneObserver,
    observeSceneBoundaries: observeSceneBoundaries,
    addSystemMessage: addSystemMessage,
    formatTextIntoParagraphs: formatTextIntoParagraphs,
    startStreamingMessage: startStreamingMessage,
    appendToStreamingMessage: appendToStreamingMessage,
    finishStreamingMessage: finishStreamingMessage,
    addGeneratedStory: addGeneratedStory,
    flashBackground: flashBackground,
    addAIMessage: addAIMessage,
    processEntityLinks: processEntityLinks,
    generateInitialStory: generateInitialStory,
    handleImmediateGeneration: handleImmediateGeneration,
    handleChatGeneration: handleChatGeneration,
    generateNextNodeId: generateNextNodeId,
    generateNextSceneId: generateNextSceneId,
    handleGenerationStream: handleGenerationStream,
    handleGenerationComplete: handleGenerationComplete,
    handleGenerationError: handleGenerationError,
    handleStoryResponse: handleStoryResponse,
    handleEvaluationResult: handleEvaluationResult,
    setupInputHandlers: setupInputHandlers,
    setupClickHandlers: setupClickHandlers,
    setupMessageToggles: setupMessageToggles,
    revertToRaw: revertToRaw,
    toggleAutoEval: function() {
        autoEval = !autoEval;
        if (autoEval) {
            document.querySelectorAll('.message.ai.raw-output').forEach(function(el) {
                if (!el.classList.contains('processing') && !el.classList.contains('processed')) {
                    requestEvaluation(el);
                }
            });
        }
    }
};
