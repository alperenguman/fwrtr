// Main App.js - Simplified with module coordination
// Handles socket initialization, main event coordination, and module bootstrapping

// Prevent multiple initialization
if (typeof window.storywriterApp === 'undefined') {
    window.storywriterApp = {};
    
    const socket = io();
    
    // Make socket available globally for all modules
    window.socket = socket;

    // Connection management
    socket.on('connect', function() {
        console.log('Connected to server');
        document.getElementById('messageInput').disabled = false;
        document.getElementById('sendButton').disabled = false;
        
        window.storyUI.addSystemMessage('Connected to story server');
        socket.emit('load_entities');
    });

    socket.on('disconnect', function() {
        console.log('Disconnected from server');
        document.getElementById('messageInput').disabled = true;
        document.getElementById('sendButton').disabled = true;
        
        window.storyUI.addSystemMessage('Disconnected from server');
    });

    // Data loading
    socket.on('entities_loaded', function(entities) {
        console.log('Entities loaded:', entities);
        const entityData = {};
        entities.forEach(entity => {
            entityData[entity.entity_id] = entity;
        });
        
        // Update the leftPane module with entity data
        window.leftPane.setEntityData(entityData);
        window.leftPane.updateEntityList();
        window.storyUI.generateInitialStory();
    });

    socket.on('entity_updated', function(entity) {
        const entityData = window.leftPane.getEntityData();
        entityData[entity.entity_id] = entity;
        window.leftPane.updateEntityInUI(entity);
        window.storyUI.addSystemMessage(entity.name + ' has been updated');
    });

    // Generation events
    socket.on('generation_stream', function(data) {
        window.storyUI.handleGenerationStream(data);
    });

    socket.on('generation_complete', function(data) {
        window.storyUI.handleGenerationComplete(data);
    });

    socket.on('generation_error', function(data) {
        window.storyUI.handleGenerationError(data);
    });

    socket.on('story_response', function(data) {
        window.storyUI.handleStoryResponse(data);
    });

    socket.on('evaluation_result', function(data) {
        window.storyUI.handleEvaluationResult(data);
    });

    socket.on('error', function(error) {
        console.error('Socket error:', error);
        window.storyUI.addSystemMessage('Error: ' + error.message);
    });

    // Handle attribute system responses
    socket.on('class_attributes_loaded', function(data) {
        window.entityDetails.handleClassAttributesLoaded(data);
    });
    
    socket.on('attribute_updated', function(data) {
        window.entityDetails.handleAttributeUpdated(data);
    });

    // Main initialization when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded, setting up event listeners');
        
        // Initialize modules
        window.storyUI.initializeSceneObserver();
        window.storyUI.setupInputHandlers();
        window.storyUI.setupClickHandlers();
        window.storyUI.setupMessageToggles();
        
        // Detail pane controls
        document.getElementById('closeDetailButton').addEventListener('click', window.entityDetails.closeDetailPane);
        
        // Entity editor controls
        const editBtn = document.getElementById('editEntityBtn');
        if (editBtn) {
            editBtn.addEventListener('click', window.entityEditor.openEntityEditor);
        }
        
        const saveBtn = document.getElementById('saveEntityBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', window.entityEditor.saveEntityChanges);
        }
        
        const cancelBtn = document.getElementById('cancelEntityBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', window.entityEditor.cancelEntityEdit);
        }
    });

    // Expose main app functions globally for debugging
    window.storywriterApp = {
        socket: socket,
        // Access to all modules through their exposed interfaces
        leftPane: () => window.leftPane,
        entityDetails: () => window.entityDetails,
        entityEditor: () => window.entityEditor,
        storyUI: () => window.storyUI
    };
}