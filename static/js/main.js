// main.js - Application Entry Point
// Bootstraps the application and exposes global functions

import * as data from './data.js';
import * as viewport from './viewport.js';
import * as render from './render.js';
import * as interaction from './interaction.js';
import * as persistence from './persistence.js';

// Make persistence available globally for data module
window.persistence = persistence;

// ---------- Global API ----------
window.createCard = function(x, y) {
  if (x == null) x = (innerWidth / 2 - viewport.viewX) / viewport.zoom - 160;
  if (y == null) y = (innerHeight / 2 - viewport.viewY) / viewport.zoom - 110;
  
  const card = data.createCard(x, y);
  
  const lay = viewport.ensureLayout(viewport.currentPlane);
  const newCard = {refId: card.id, x, y};
  lay.cards.push(newCard);
  
  // Use pushClone instead of direct push
  viewport.pushClone({refId: card.id, x, y});
  
  render.renderCard(newCard);
  interaction.hydrateCard(card.id);
  viewport.updateHUD();
  
  return card;
};

window.deleteCard = function(id) {
  data.deleteCard(id);
  
  // Clean up layouts
  const layouts = viewport.ensureLayout(viewport.currentPlane);
  layouts.cards = layouts.cards.filter(v => v.refId !== id);
  
  // Clean up DOM
  document.getElementById('card-' + id)?.remove();
  
  viewport.updateHUD();
};

window.deleteSelected = interaction.deleteSelected;

window.resetView = viewport.resetView;

window.toggleSection = render.toggleSection;

// CRITICAL: Expose focusOn and hydrateCard for global access
window.focusOn = viewport.focusOn;
window.hydrateCard = interaction.hydrateCard;

// Expose persistence functions
window.exportData = () => persistence.exportData();
window.importData = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (file) persistence.importData(file);
  };
  input.click();
};
window.clearData = () => persistence.clearLocalData();

// ---------- Application Initialization ----------
async function initializeApp() {
  // Initialize persistence first
  persistence.init();
  
  // Try to load saved state (now async)
  const hasLocalData = await persistence.loadFromLocal();
  
  // Initialize viewport
  viewport.init();
  
  if (!hasLocalData) {
    // No saved data - seed initial data
    const cards = data.seed();
    
    // Setup initial layout
    viewport.setupInitialLayout(cards);
    
    // Save initial state
    persistence.saveToLocal();
  } else {
    // We loaded saved data
    console.log('Loaded saved state from IndexedDB');
    
    // Restore viewport clones from saved layout
    const currentLayout = viewport.ensureLayout(viewport.currentPlane);
    if (currentLayout.cards && currentLayout.cards.length > 0) {
      viewport.setClones(currentLayout.cards);
    }
  }
  
  // Apply saved viewport state
  viewport.updateView();
  viewport.updateHUD();
  
  // Render initial plane (use currentPlane instead of hardcoded null)
  render.renderPlane(viewport.currentPlane);
  
  // Initialize interactions
  interaction.init();
  
  // Start auto-sync
  persistence.startAutoSync();
  
  console.log('Fractal Wrtr initialized successfully');
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}