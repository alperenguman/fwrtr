// Left Pane (Sidebar) Management
// Handles entity list, scene info, and sidebar functionality

let entityData = {};
let currentScene = '1:s1';

function updateSceneInfo(sceneId) {
    const sceneInfo = document.getElementById('sceneInfo');
    const sceneNumber = sceneId.split(':')[1] || sceneId;
    sceneInfo.textContent = 'Scene ' + sceneNumber;
}

function updateEntityListForScene(sceneId) {
    updateEntityList();
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

// Export functions to global scope for other modules
window.leftPane = {
    entityData,
    currentScene,
    updateSceneInfo,
    updateEntityListForScene,
    updateEntityList,
    updateEntityInUI,
    setEntityData: (data) => { entityData = data; },
    setCurrentScene: (scene) => { currentScene = scene; },
    getEntityData: () => entityData,
    getCurrentScene: () => currentScene
};