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
  
  // If we're in a subplane, make the new card inherit from the current plane entity
  if (viewport.currentPlane !== null) {
    const parentCard = data.byId(viewport.currentPlane);
    if (parentCard) {
      // Set up parent-child relationship
      data.contain(viewport.currentPlane, card.id);
      
      console.log(`[createCard] Created entity ${card.id} (${card.name}) inheriting from ${viewport.currentPlane} (${parentCard.name}) in subplane`);
    }
  }
  
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

// Store original layout before timeline mode
let originalLayout = null;

// Timeline mode toggle
window.togglePlaneMode = function() {
  const indicator = document.getElementById('planeIndicator');
  const toggle = document.getElementById('timelineToggle');
  
  if (toggle && toggle.textContent === 'Timeline') {
    // Switch to timeline mode
    if (indicator) indicator.textContent = 'Timeline Plane';
    toggle.textContent = 'Ideal';
    toggle.classList.add('active');
    
    // Save current layout before switching
    const currentLayout = viewport.ensureLayout(viewport.currentPlane);
    originalLayout = {
      cards: currentLayout.cards.map(card => ({...card})), // Deep copy
      viewX: viewport.viewX,
      viewY: viewport.viewY,
      clones: viewport.clones.map(clone => ({...clone})) // Deep copy current clones
    };
    
    // Set timeline mode and center viewport on timeline (X=0)
    viewport.setTimelineMode(true);
    viewport.setViewport(window.innerWidth / 2, viewport.viewY, viewport.zoom); // Center X on timeline
    renderTimelineView();
    showTimelineLine();
    
    console.log('[Timeline] Switched to Timeline Plane');
  } else if (toggle) {
    // Switch back to ideal mode  
    if (indicator) indicator.textContent = 'Ideal Plane';
    toggle.textContent = 'Timeline';
    toggle.classList.remove('active');
    
    // Restore original layout if it exists
    if (originalLayout) {
      const currentLayout = viewport.ensureLayout(viewport.currentPlane);
      currentLayout.cards = originalLayout.cards;
      viewport.setClones(originalLayout.clones);
      // Set a much more zoomed out view when exiting timeline
      viewport.setViewport(originalLayout.viewX, originalLayout.viewY, 0.05);
      originalLayout = null; // Clear saved layout
    }
    
    // Set ideal mode and re-render
    viewport.setTimelineMode(false);
    render.renderPlane(viewport.currentPlane);
    hideTimelineLine();
    
    console.log('[Timeline] Switched to Ideal Plane');
  }
};

// Simple timeline view - show cards on the sides, leave center open
function renderTimelineView() {
  console.log('[Timeline] Rendering timeline view with cards on sides');
  
  // Get all visible cards for current plane
  const ids = data.visibleIds(viewport.currentPlane);
  const lay = viewport.ensureLayout(viewport.currentPlane);
  
  // Clear the plane first
  const plane = document.getElementById('plane');
  plane.innerHTML = '';
  
  // Position cards on the sides with screen-fixed positioning
  const cardsOnSides = [];
  
  ids.forEach((id, index) => {
    const isLeftSide = index % 2 === 0;
    // Use world coordinates relative to timeline center (0,0)
    // Cards are 340px wide, so their centers should be equidistant from timeline
    const cardCenterDistance = 400; // Distance from timeline to card center (increased)
    const xOffset = isLeftSide ? 
      -cardCenterDistance - 170 : // Left: center at -400, so left edge at -570
      cardCenterDistance - 170;   // Right: center at +400, so left edge at +230
    const yPos = 100 + Math.floor(index / 2) * 300; // Stack vertically
    
    const cardData = {refId: id, x: xOffset, y: yPos};
    cardsOnSides.push(cardData);
    
    // Render card with proper coordinates
    render.renderCard(cardData);
  });
  
  // Update viewport state (temporarily, don't modify saved layout)
  viewport.setClones(cardsOnSides);
  
  // Hydrate cards
  setTimeout(() => {
    cardsOnSides.forEach(cardData => {
      if (typeof window.hydrateCard === 'function') {
        window.hydrateCard(cardData.refId);
      }
    });
  }, 0);
  
  viewport.updateView();
  viewport.updateHUD();
}

// Show timeline line
function showTimelineLine() {
  // Remove existing line if any
  hideTimelineLine();
  
  // Create new timeline line with animated glow
  const line = document.createElement('div');
  line.id = 'timelineLine';
  line.style.cssText = `
    position: fixed;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 4px;
    background: linear-gradient(to bottom, #007acc 0%, #00ff88 50%, #007acc 100%);
    z-index: 5;
    pointer-events: none;
    transform: translateX(-50%);
    box-shadow: 0 0 20px rgba(0,255,136,0.5);
    animation: timelineSweep 6s ease-in-out infinite;
  `;
  
  // Add CSS animation for the glowing effect
  const style = document.createElement('style');
  style.textContent = `
    @keyframes timelineSweep {
      0%, 100% { 
        box-shadow: 0 0 20px rgba(0,255,136,0.3), 0 0 40px rgba(0,122,204,0.2);
        background: linear-gradient(to bottom, #007acc 0%, #00ff88 50%, #007acc 100%);
      }
      50% { 
        box-shadow: 0 0 30px rgba(0,255,136,0.8), 0 0 60px rgba(0,122,204,0.4);
        background: linear-gradient(to bottom, #00a3ff 0%, #00ffaa 50%, #00a3ff 100%);
      }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(line);
  
  // Add timeline labels (Past, Now, Future)
  showTimelineLabels();
  
  console.log('[Timeline] Timeline line added');
}

// Timeline time offset (changes with drag, not zoom)
let timelineOffset = 0;
// Make it globally accessible with getter/setter
Object.defineProperty(window, 'timelineOffset', {
  get: function() { return timelineOffset; },
  set: function(value) { timelineOffset = value; }
});
window.updateTimelineLabels = function() { if (viewport.isTimelineMode) updateTimelineLabels(); };

// Get time resolution and format based on zoom level
function getTimeResolution(zoom) {
  if (zoom >= 2.0) return { unit: 'minutes', step: 30, format: 'minutes' };
  if (zoom >= 1.0) return { unit: 'hours', step: 2, format: 'hours' };
  if (zoom >= 0.5) return { unit: 'hours', step: 12, format: 'hours' };
  if (zoom >= 0.3) return { unit: 'days', step: 2, format: 'days' };
  if (zoom >= 0.1) return { unit: 'days', step: 7, format: 'days' };
  return { unit: 'months', step: 2, format: 'months' };
}

// Generate time notation (t+5.1.12.12...)
function generateTimeNotation(offsetValue, unit) {
  const baseTime = Math.abs(offsetValue);
  const sign = offsetValue >= 0 ? '+' : '-';
  
  // Generate semi-random but consistent decimal places
  const hash = Math.abs(Math.floor(baseTime * 7.13) % 100);
  const decimal1 = Math.floor(hash / 10);
  const decimal2 = hash % 10;
  const decimal3 = Math.floor((baseTime * 3.17) % 10);
  const decimal4 = Math.floor((baseTime * 11.23) % 10);
  
  return `t${sign}${Math.floor(baseTime)}.${decimal1}.${decimal2}.${decimal3}.${decimal4}`;
}

function getPastTimeLabel() {
  const resolution = getTimeResolution(viewport.zoom);
  const offset = Math.round((-resolution.step - timelineOffset) * 10) / 10; // Round to 1 decimal
  return `${offset} ${resolution.format}`;
}

function getNowTimeLabel() {
  return generateTimeNotation(timelineOffset, 'now');
}

function getFutureTimeLabel() {
  const resolution = getTimeResolution(viewport.zoom);
  const offset = Math.round((resolution.step - timelineOffset) * 10) / 10; // Round to 1 decimal
  return `+${offset} ${resolution.format}`;
}

// Update existing timeline labels with current values
function updateTimelineLabels() {
  const pastTimeLabel = document.getElementById('timelineLabelPastTime');
  const nowTimeLabel = document.getElementById('timelineLabelNowTime');
  const futureTimeLabel = document.getElementById('timelineLabelFutureTime');
  
  if (pastTimeLabel) pastTimeLabel.textContent = getPastTimeLabel();
  if (nowTimeLabel) nowTimeLabel.textContent = getNowTimeLabel();
  if (futureTimeLabel) futureTimeLabel.textContent = getFutureTimeLabel();
}

// Show timeline labels (Past/Now/Future)
function showTimelineLabels() {
  // Remove existing labels if any
  hideTimelineLabels();
  
  // Create Past label (top left of timeline)
  const pastLabel = document.createElement('div');
  pastLabel.id = 'timelineLabelPast';
  pastLabel.textContent = 'Past';
  pastLabel.style.cssText = `
    position: fixed;
    left: calc(50% - 20px);
    top: 20px;
    transform: translateX(-100%);
    color: rgba(255, 255, 255, 0.15);
    font-size: 12px;
    font-weight: normal;
    z-index: 1;
    pointer-events: none;
    text-shadow: none;
  `;
  
  // Create Past time label (top right of timeline)
  const pastTimeLabel = document.createElement('div');
  pastTimeLabel.id = 'timelineLabelPastTime';
  pastTimeLabel.textContent = getPastTimeLabel();
  pastTimeLabel.style.cssText = `
    position: fixed;
    left: calc(50% + 20px);
    top: 20px;
    color: rgba(255, 255, 255, 0.15);
    font-size: 12px;
    font-weight: normal;
    font-family: monospace;
    z-index: 1;
    pointer-events: none;
    text-shadow: none;
  `;
  
  // Create Now label (center left of timeline)
  const nowLabel = document.createElement('div');
  nowLabel.id = 'timelineLabelNow';
  nowLabel.textContent = 'Now';
  nowLabel.style.cssText = `
    position: fixed;
    left: calc(50% - 20px);
    top: 50%;
    transform: translate(-100%, -50%);
    color: rgba(255, 255, 255, 0.2);
    font-size: 12px;
    font-weight: normal;
    z-index: 1;
    pointer-events: none;
    text-shadow: none;
  `;
  
  // Create Now time label (center right of timeline)
  const nowTimeLabel = document.createElement('div');
  nowTimeLabel.id = 'timelineLabelNowTime';
  nowTimeLabel.textContent = getNowTimeLabel();
  nowTimeLabel.style.cssText = `
    position: fixed;
    left: calc(50% + 20px);
    top: 50%;
    transform: translateY(-50%);
    color: rgba(255, 255, 255, 0.2);
    font-size: 12px;
    font-weight: normal;
    font-family: monospace;
    z-index: 1;
    pointer-events: none;
    text-shadow: none;
  `;
  
  // Create Future label (bottom left of timeline)
  const futureLabel = document.createElement('div');
  futureLabel.id = 'timelineLabelFuture';
  futureLabel.textContent = 'Future';
  futureLabel.style.cssText = `
    position: fixed;
    left: calc(50% - 20px);
    bottom: 20px;
    transform: translateX(-100%);
    color: rgba(255, 255, 255, 0.15);
    font-size: 12px;
    font-weight: normal;
    z-index: 1;
    pointer-events: none;
    text-shadow: none;
  `;
  
  // Create Future time label (bottom right of timeline)
  const futureTimeLabel = document.createElement('div');
  futureTimeLabel.id = 'timelineLabelFutureTime';
  futureTimeLabel.textContent = getFutureTimeLabel();
  futureTimeLabel.style.cssText = `
    position: fixed;
    left: calc(50% + 20px);
    bottom: 20px;
    color: rgba(255, 255, 255, 0.15);
    font-size: 12px;
    font-weight: normal;
    font-family: monospace;
    z-index: 1;
    pointer-events: none;
    text-shadow: none;
  `;
  
  document.body.appendChild(pastLabel);
  document.body.appendChild(pastTimeLabel);
  document.body.appendChild(nowLabel);
  document.body.appendChild(nowTimeLabel);
  document.body.appendChild(futureLabel);
  document.body.appendChild(futureTimeLabel);
}

// Hide timeline labels
function hideTimelineLabels() {
  const labels = [
    'timelineLabelPast', 'timelineLabelPastTime',
    'timelineLabelNow', 'timelineLabelNowTime', 
    'timelineLabelFuture', 'timelineLabelFutureTime'
  ];
  labels.forEach(id => {
    const label = document.getElementById(id);
    if (label) label.remove();
  });
}

// Hide timeline line and labels
function hideTimelineLine() {
  const existingLine = document.getElementById('timelineLine');
  if (existingLine) {
    existingLine.remove();
    console.log('[Timeline] Timeline line removed');
  }
  
  // Also hide labels
  hideTimelineLabels();
}

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