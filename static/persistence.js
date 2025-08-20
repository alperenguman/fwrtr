// persistence.js - Local Storage and Backend Sync Management
// Handles browser-side persistence and periodic backend synchronization

import * as data from './data.js';
import * as viewport from './viewport.js';

// ---------- Configuration ----------
const STORAGE_KEY = 'fractal_wrtr_state';
const SYNC_INTERVAL = 30000; // 30 seconds
const AUTOSAVE_DELAY = 1000; // 1 second debounce

// ---------- State Management ----------
let isDirty = false;
let lastSyncTime = null;
let syncTimer = null;
let saveTimer = null;
let syncStatus = 'saved'; // 'saved', 'modified', 'syncing', 'error'

// ---------- Local Storage Operations ----------
export function saveToLocal() {
  try {
    const state = {
      version: '1.0',
      timestamp: Date.now(),
      lastSync: lastSyncTime,
      data: {
        cards: data.all,
        nextId: data.nextId,
        parentsOf: mapToArray(data.parentsOf),
        childrenOf: mapToArray(data.childrenOf),
        links: mapToArray(data.links)
      },
      viewport: {
        layouts: mapToArray(viewport.layouts),
        currentPlane: viewport.currentPlane,
        viewX: viewport.viewX,
        viewY: viewport.viewY,
        zoom: viewport.zoom
      }
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateSyncStatus('saved');
    console.log('[Persistence] Saved to local storage');
    return true;
  } catch (e) {
    console.error('[Persistence] Failed to save to local storage:', e);
    return false;
  }
}

export function loadFromLocal() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;
    
    const state = JSON.parse(stored);
    
    // Validate version
    if (state.version !== '1.0') {
      console.warn('[Persistence] Incompatible state version:', state.version);
      return false;
    }
    
    // Restore data
    data.all = state.data.cards || [];
    data.nextId = state.data.nextId || 1;
    
    // Restore relationships
    data.parentsOf.clear();
    arrayToMap(state.data.parentsOf || [], data.parentsOf);
    
    data.childrenOf.clear();
    arrayToMap(state.data.childrenOf || [], data.childrenOf);
    
    data.links.clear();
    arrayToMap(state.data.links || [], data.links);
    
    // Restore viewport layouts
    if (state.viewport && state.viewport.layouts) {
      viewport.layouts.clear();
      arrayToMap(state.viewport.layouts, viewport.layouts);
    }
    
    lastSyncTime = state.lastSync;
    
    console.log('[Persistence] Loaded from local storage');
    console.log(`  - ${data.all.length} cards`);
    console.log(`  - Last sync: ${lastSyncTime ? new Date(lastSyncTime).toLocaleString() : 'Never'}`);
    
    return true;
  } catch (e) {
    console.error('[Persistence] Failed to load from local storage:', e);
    return false;
  }
}

// ---------- Backend Sync ----------
export async function syncToBackend() {
  if (syncStatus === 'syncing') return;
  
  updateSyncStatus('syncing');
  
  try {
    // Prepare sync data
    const syncData = {
      timestamp: Date.now(),
      cards: data.all,
      relationships: {
        parents: mapToArray(data.parentsOf),
        children: mapToArray(data.childrenOf),
        links: mapToArray(data.links)
      }
    };
    
    // TODO: Replace with actual backend endpoint
    // const response = await fetch('/api/sync', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(syncData)
    // });
    
    // Simulate backend sync for now
    await simulateBackendSync(syncData);
    
    lastSyncTime = Date.now();
    isDirty = false;
    updateSyncStatus('saved');
    
    console.log('[Persistence] Synced to backend');
    
    // Save the sync time to local storage
    saveToLocal();
    
  } catch (e) {
    console.error('[Persistence] Backend sync failed:', e);
    updateSyncStatus('error');
  }
}

// Simulate backend sync (remove when real backend is connected)
async function simulateBackendSync(data) {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('[Persistence] Simulated backend sync:', data);
      resolve({ success: true });
    }, 500);
  });
}

// ---------- Change Tracking ----------
export function markDirty() {
  if (!isDirty) {
    isDirty = true;
    updateSyncStatus('modified');
    
    // Cancel existing save timer
    if (saveTimer) clearTimeout(saveTimer);
    
    // Schedule auto-save
    saveTimer = setTimeout(() => {
      saveToLocal();
    }, AUTOSAVE_DELAY);
  }
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

// ---------- Utility Functions ----------
function mapToArray(map) {
  const result = [];
  map.forEach((value, key) => {
    result.push([key, Array.from(value)]);
  });
  return result;
}

function arrayToMap(array, map) {
  array.forEach(([key, values]) => {
    map.set(key, new Set(values));
  });
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

export function clearLocalData() {
  if (confirm('Clear all local data? This cannot be undone.')) {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
}

export function exportData() {
  const state = {
    version: '1.0',
    exported: new Date().toISOString(),
    data: {
      cards: data.all,
      relationships: {
        parents: mapToArray(data.parentsOf),
        children: mapToArray(data.childrenOf),
        links: mapToArray(data.links)
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
}

export function importData(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const state = JSON.parse(e.target.result);
      
      if (state.version !== '1.0') {
        alert('Incompatible file version');
        return;
      }
      
      // Clear existing data
      data.all = state.data.cards || [];
      data.parentsOf.clear();
      data.childrenOf.clear();
      data.links.clear();
      
      // Load relationships
      if (state.data.relationships) {
        arrayToMap(state.data.relationships.parents || [], data.parentsOf);
        arrayToMap(state.data.relationships.children || [], data.childrenOf);
        arrayToMap(state.data.relationships.links || [], data.links);
      }
      
      // Save and reload
      saveToLocal();
      location.reload();
      
    } catch (err) {
      alert('Failed to import file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ---------- Initialize ----------
export function init() {
  console.log('[Persistence] Initializing...');
  
  // Add sync indicator to UI
  const toolbar = document.querySelector('.toolbar');
  if (toolbar && !document.getElementById('sync-indicator')) {
    const indicator = document.createElement('div');
    indicator.id = 'sync-indicator';
    indicator.className = 'sync-indicator saved';
    indicator.textContent = 'Saved';
    toolbar.appendChild(indicator);
  }
  
  // Listen for storage events (changes from other tabs)
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      console.log('[Persistence] Changes detected from another tab');
      if (confirm('Changes detected from another tab. Reload to sync?')) {
        location.reload();
      }
    }
  });
  
  // Save before unload
  window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
      saveToLocal();
      // Optionally show warning
      // e.preventDefault();
      // e.returnValue = 'You have unsaved changes.';
    }
  });
  
  console.log('[Persistence] Initialized');
}