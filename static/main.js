// main.js - Application Entry Point
// Bootstraps the application and exposes global functions

import * as data from './data.js';
import * as viewport from './viewport.js';
import * as render from './render.js';
import * as interaction from './interaction.js';

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

// ---------- Application Initialization ----------
function initializeApp() {
  // Initialize viewport
  viewport.init();
  
  // Seed initial data
  const cards = data.seed();
  
  // Setup initial layout
  viewport.setupInitialLayout(cards);
  
  // Render initial plane
  render.renderPlane(null);
  
  // Initialize interactions
  interaction.init();
  
  console.log('Fractal Wrtr initialized successfully');
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}