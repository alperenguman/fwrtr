// persistence.js - IndexedDB Storage Management
// Handles all data persistence using IndexedDB for unlimited storage

import * as data from './data.js';
import * as viewport from './viewport.js';

// ---------- Configuration ----------
const DB_NAME = 'fractal_wrtr';
const DB_VERSION = 2;
const SYNC_INTERVAL = 30000; // 30 seconds
const AUTOSAVE_DELAY = 1000; // 1 second debounce

// Object store names
const STORES = {
  CARDS: 'cards',
  RELATIONSHIPS: 'relationships', 
  VIEWPORT: 'viewport',
  METADATA: 'metadata'
};

// ---------- State Management ----------
let db = null;
let isDirty = false;
let lastSyncTime = null;
let syncTimer = null;
let saveTimer = null;
let syncStatus = 'saved'; // 'saved', 'modified', 'syncing', 'error'

// ---------- Database Initialization ----------
function initDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('[Persistence] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      db = request.result;
      console.log('[Persistence] IndexedDB initialized');
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      const oldVersion = event.oldVersion;
      
      console.log(`[Persistence] Upgrading database from version ${oldVersion} to ${DB_VERSION}`);
      
      // Create cards store
      if (!database.objectStoreNames.contains(STORES.CARDS)) {
        const cardsStore = database.createObjectStore(STORES.CARDS, { keyPath: 'id' });
        console.log('[Persistence] Created cards store');
      }
      
      // Recreate relationships store with correct keyPath
      if (database.objectStoreNames.contains(STORES.RELATIONSHIPS)) {
        database.deleteObjectStore(STORES.RELATIONSHIPS);
        console.log('[Persistence] Deleted old relationships store');
      }
      const relsStore = database.createObjectStore(STORES.RELATIONSHIPS, { keyPath: 'key' });
      console.log('[Persistence] Created relationships store');
      
      // Create viewport store
      if (!database.objectStoreNames.contains(STORES.VIEWPORT)) {
        const viewStore = database.createObjectStore(STORES.VIEWPORT, { keyPath: 'key' });
        console.log('[Persistence] Created viewport store');
      }
      
      // Create metadata store
      if (!database.objectStoreNames.contains(STORES.METADATA)) {
        const metaStore = database.createObjectStore(STORES.METADATA, { keyPath: 'key' });
        console.log('[Persistence] Created metadata store');
      }
    };
  });
}

// ---------- Storage Operations ----------
export async function saveToLocal() { // Keep name for API compatibility
  try {
    await initDB();
    
    const transaction = db.transaction([STORES.CARDS, STORES.RELATIONSHIPS, STORES.VIEWPORT, STORES.METADATA], 'readwrite');
    
    // Save cards
    const cardsStore = transaction.objectStore(STORES.CARDS);
    // Clear existing cards
    await new Promise((resolve, reject) => {
      const clearReq = cardsStore.clear();
      clearReq.onsuccess = () => resolve();
      clearReq.onerror = () => reject(clearReq.error);
    });
    
    // Add all cards
    for (const card of data.all) {
      await new Promise((resolve, reject) => {
        const addReq = cardsStore.add(card);
        addReq.onsuccess = () => resolve();
        addReq.onerror = () => reject(addReq.error);
      });
    }
    
    // Save relationships
    const relsStore = transaction.objectStore(STORES.RELATIONSHIPS);
    await saveMapToStore(relsStore, 'parentsOf', data.parentsOf);
    await saveMapToStore(relsStore, 'childrenOf', data.childrenOf);
    await saveMapToStore(relsStore, 'links', data.links);
    
    // Save viewport
    const viewStore = transaction.objectStore(STORES.VIEWPORT);
    console.log('[Persistence] Saving layouts:', viewport.layouts);
    await saveMapToStore(viewStore, 'layouts', viewport.layouts);
    await saveValueToStore(viewStore, 'currentPlane', viewport.currentPlane);
    await saveValueToStore(viewStore, 'viewX', viewport.viewX);
    await saveValueToStore(viewStore, 'viewY', viewport.viewY);
    await saveValueToStore(viewStore, 'zoom', viewport.zoom);
    await saveValueToStore(viewStore, 'stack', viewport.stack);
    await saveValueToStore(viewStore, 'depth', viewport.depth);
    
    // Save metadata
    const metaStore = transaction.objectStore(STORES.METADATA);
    await saveValueToStore(metaStore, 'nextId', data.nextId);
    await saveValueToStore(metaStore, 'lastSync', lastSyncTime);
    await saveValueToStore(metaStore, 'timestamp', Date.now());
    
    updateSyncStatus('saved');
    console.log('[Persistence] Saved to IndexedDB');
    return true;
    
  } catch (e) {
    console.error('[Persistence] Failed to save to IndexedDB:', e);
    return false;
  }
}

export async function loadFromLocal() { // Keep name for API compatibility
  try {
    await initDB();
    
    const transaction = db.transaction([STORES.CARDS, STORES.RELATIONSHIPS, STORES.VIEWPORT, STORES.METADATA], 'readonly');
    
    // Load cards
    const cardsStore = transaction.objectStore(STORES.CARDS);
    const cards = await getAllFromStore(cardsStore);
    if (cards.length === 0) {
      return false; // No data found
    }
    
    data.setAll(cards);
    
    // Load relationships
    const relsStore = transaction.objectStore(STORES.RELATIONSHIPS);
    const parentsData = await getValueFromStore(relsStore, 'parentsOf');
    const childrenData = await getValueFromStore(relsStore, 'childrenOf');
    const linksData = await getValueFromStore(relsStore, 'links');
    
    data.parentsOf.clear();
    data.childrenOf.clear();
    data.links.clear();
    
    if (parentsData) restoreMapFromData(data.parentsOf, parentsData);
    if (childrenData) restoreMapFromData(data.childrenOf, childrenData);
    if (linksData) restoreMapFromData(data.links, linksData);
    
    // Load viewport
    const viewStore = transaction.objectStore(STORES.VIEWPORT);
    const layoutsData = await getValueFromStore(viewStore, 'layouts');
    const currentPlane = await getValueFromStore(viewStore, 'currentPlane');
    const viewX = await getValueFromStore(viewStore, 'viewX');
    const viewY = await getValueFromStore(viewStore, 'viewY');
    const zoom = await getValueFromStore(viewStore, 'zoom');
    const stack = await getValueFromStore(viewStore, 'stack');
    const depth = await getValueFromStore(viewStore, 'depth');
    
    viewport.layouts.clear();
    console.log('[Persistence] Loading layouts data:', layoutsData);
    if (layoutsData) {
      // Special handling for layouts - they're objects, not Sets
      restoreLayoutsFromData(viewport.layouts, layoutsData);
      console.log('[Persistence] Restored layouts:', viewport.layouts);
    }
    
    if (currentPlane !== undefined) viewport.setCurrentPlane(currentPlane);
    if (viewX !== undefined && viewY !== undefined && zoom !== undefined) {
      viewport.setViewport(viewX, viewY, zoom);
    }
    if (stack) viewport.setStack(stack);
    if (depth !== undefined) viewport.setDepth(depth);
    
    // Load metadata
    const metaStore = transaction.objectStore(STORES.METADATA);
    const nextId = await getValueFromStore(metaStore, 'nextId');
    const lastSync = await getValueFromStore(metaStore, 'lastSync');
    
    if (nextId) data.setNextId(nextId);
    lastSyncTime = lastSync;
    
    console.log('[Persistence] Loaded from IndexedDB');
    console.log(`  - ${data.all.length} cards`);
    console.log(`  - Last sync: ${lastSyncTime ? new Date(lastSyncTime).toLocaleString() : 'Never'}`);
    
    return true;
    
  } catch (e) {
    console.error('[Persistence] Failed to load from IndexedDB:', e);
    return false;
  }
}

// ---------- Helper Functions ----------
async function saveMapToStore(store, key, map) {
  const data = [];
  map.forEach((value, mapKey) => {
    console.log(`[Persistence] Saving map entry: key="${mapKey}", value:`, value);
    // For layouts, value is an object; for relationships, value is a Set
    if (value instanceof Set) {
      data.push([mapKey, Array.from(value)]);
    } else {
      // For layouts: save the object directly
      data.push([mapKey, value]);
    }
  });
  
  return new Promise((resolve, reject) => {
    const putReq = store.put({ key, data });
    putReq.onsuccess = () => resolve();
    putReq.onerror = () => reject(putReq.error);
  });
}

async function saveValueToStore(store, key, value) {
  return new Promise((resolve, reject) => {
    const putReq = store.put({ key, value });
    putReq.onsuccess = () => resolve();
    putReq.onerror = () => reject(putReq.error);
  });
}

async function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => resolve(getAllReq.result);
    getAllReq.onerror = () => reject(getAllReq.error);
  });
}

async function getValueFromStore(store, key) {
  return new Promise((resolve, reject) => {
    const getReq = store.get(key);
    getReq.onsuccess = () => resolve(getReq.result ? getReq.result.value || getReq.result.data : undefined);
    getReq.onerror = () => reject(getReq.error);
  });
}

function restoreMapFromData(map, data) {
  if (Array.isArray(data)) {
    data.forEach(([key, values]) => {
      console.log(`[Persistence] Restoring map entry: key="${key}", values:`, values);
      map.set(key, new Set(values));
    });
  }
}

function restoreLayoutsFromData(map, data) {
  if (Array.isArray(data)) {
    data.forEach(([key, layoutObject]) => {
      console.log(`[Persistence] Restoring layout: key="${key}", layout:`, layoutObject);
      map.set(key, layoutObject);
    });
  }
}

// ---------- Backend Sync ----------
export async function syncToBackend() {
  if (syncStatus === 'syncing') return;
  
  updateSyncStatus('syncing');
  
  try {
    // Simulate backend sync for now
    await simulateBackendSync();
    
    lastSyncTime = Date.now();
    isDirty = false;
    updateSyncStatus('saved');
    
    console.log('[Persistence] Synced to backend');
    
    // Save the sync time
    saveToLocal();
    
  } catch (e) {
    console.error('[Persistence] Backend sync failed:', e);
    updateSyncStatus('error');
  }
}

async function simulateBackendSync() {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('[Persistence] Simulated backend sync');
      resolve({ success: true });
    }, 500);
  });
}

// ---------- Change Tracking ----------
export function markDirty() {
  console.log('[Persistence] markDirty called, isDirty was:', isDirty);
  if (!isDirty) {
    isDirty = true;
    updateSyncStatus('modified');
  }
  
  // Always cancel existing save timer and schedule new one
  if (saveTimer) {
    console.log('[Persistence] Cancelling existing save timer');
    clearTimeout(saveTimer);
  }
  
  // Schedule auto-save
  console.log('[Persistence] Scheduling auto-save in', AUTOSAVE_DELAY, 'ms');
  saveTimer = setTimeout(() => {
    console.log('[Persistence] Auto-save timer triggered');
    saveToLocal();
  }, AUTOSAVE_DELAY);
}

// ---------- Status Management ----------
function updateSyncStatus(status) {
  syncStatus = status;
  
  // Update UI indicator
  const indicator = document.getElementById('sync-indicator');
  if (indicator) {
    indicator.className = 'sync-indicator ' + status;
    
    const statusText = {
      'saved': 'Saved',
      'modified': 'Modified',
      'syncing': 'Syncing...',
      'error': 'Sync Error'
    };
    
    indicator.textContent = statusText[status] || status;
  }
  
  // Dispatch event for other modules
  window.dispatchEvent(new CustomEvent('syncStatusChanged', { 
    detail: { status, lastSync: lastSyncTime } 
  }));
}

// ---------- Public API ----------
export function startAutoSync() {
  // Initial sync check
  if (isDirty) {
    syncToBackend();
  }
  
  // Set up periodic sync
  if (syncTimer) clearInterval(syncTimer);
  
  syncTimer = setInterval(() => {
    if (isDirty) {
      syncToBackend();
    }
  }, SYNC_INTERVAL);
  
  console.log('[Persistence] Auto-sync started (every 30s)');
}

export function stopAutoSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  console.log('[Persistence] Auto-sync stopped');
}

export async function clearLocalData() {
  if (confirm('Clear all local data? This cannot be undone.')) {
    try {
      await initDB();
      
      // Clear all object stores
      const transaction = db.transaction([STORES.CARDS, STORES.RELATIONSHIPS, STORES.VIEWPORT, STORES.METADATA], 'readwrite');
      
      await Promise.all([
        new Promise(resolve => { const req = transaction.objectStore(STORES.CARDS).clear(); req.onsuccess = () => resolve(); }),
        new Promise(resolve => { const req = transaction.objectStore(STORES.RELATIONSHIPS).clear(); req.onsuccess = () => resolve(); }),
        new Promise(resolve => { const req = transaction.objectStore(STORES.VIEWPORT).clear(); req.onsuccess = () => resolve(); }),
        new Promise(resolve => { const req = transaction.objectStore(STORES.METADATA).clear(); req.onsuccess = () => resolve(); })
      ]);
      
      console.log('[Persistence] Cleared all IndexedDB data');
      location.reload();
    } catch (e) {
      console.error('[Persistence] Failed to clear data:', e);
    }
  }
}

export async function exportData() {
  try {
    await initDB();
    
    const transaction = db.transaction([STORES.CARDS, STORES.RELATIONSHIPS, STORES.VIEWPORT, STORES.METADATA], 'readonly');
    
    // Get all data
    const cards = await getAllFromStore(transaction.objectStore(STORES.CARDS));
    const parentsData = await getValueFromStore(transaction.objectStore(STORES.RELATIONSHIPS), 'parentsOf');
    const childrenData = await getValueFromStore(transaction.objectStore(STORES.RELATIONSHIPS), 'childrenOf');
    const linksData = await getValueFromStore(transaction.objectStore(STORES.RELATIONSHIPS), 'links');
    
    const state = {
      version: '2.0', // IndexedDB version
      exported: new Date().toISOString(),
      data: {
        cards: cards,
        relationships: {
          parents: parentsData || [],
          children: childrenData || [],
          links: linksData || []
        }
      }
    };
    
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fractal-wrtr-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('[Persistence] Export failed:', e);
    alert('Export failed. Check console for details.');
  }
}

export function importData(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const state = JSON.parse(e.target.result);
      
      if (!state.version || (state.version !== '1.0' && state.version !== '2.0')) {
        alert('Incompatible file version');
        return;
      }
      
      // This would require a more complex import process for IndexedDB
      // For now, just clear and reload
      alert('Import functionality needs to be implemented for IndexedDB. Use Clear Data and start fresh for now.');
      
    } catch (err) {
      alert('Failed to import file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ---------- Initialize ----------
export function init() {
  console.log('[Persistence] Initializing IndexedDB...');
  
  // Add sync indicator to UI
  const toolbar = document.querySelector('.toolbar');
  if (toolbar && !document.getElementById('sync-indicator')) {
    const indicator = document.createElement('div');
    indicator.id = 'sync-indicator';
    indicator.className = 'sync-indicator saved';
    indicator.textContent = 'Saved';
    toolbar.appendChild(indicator);
  }
  
  // Save before unload
  window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
      saveToLocal();
    }
  });
  
  console.log('[Persistence] Initialized');
}