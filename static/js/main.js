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
  
  if (toggle && toggle.textContent === 'Temporal') {
    // Switch to temporal mode
    if (indicator) indicator.textContent = 'Temporal Flow';
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
    
    // Set temporal mode - full freedom of movement
    viewport.setTimelineMode(true);
    
    // Clear the plane - no cards until instantiation feature is implemented
    const plane = document.getElementById('plane');
    plane.innerHTML = '';
    viewport.setClones([]);
    
    // Show simple temporal indicator
    showTemporalIndicator();
    
    // Show temporal timeline
    showTemporalTimeline();
    
    console.log('[Temporal] Switched to Temporal Flow');
  } else if (toggle) {
    // Switch back to ideal mode  
    if (indicator) indicator.textContent = 'Ideal Plane';
    toggle.textContent = 'Temporal';
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
    
    // Hide temporal indicator
    hideTemporalIndicator();
    
    // Hide temporal timeline
    hideTemporalTimeline();
    
    console.log('[Temporal] Switched to Ideal Plane');
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

// Timeline time system
let timelineOffset = 0; // Time offset from baseline in milliseconds
let baselineDateTime = new Date('2025-08-26T23:52:00'); // User-settable baseline
let isDateTimeEditing = false;

// Make it globally accessible with getter/setter
Object.defineProperty(window, 'timelineOffset', {
  get: function() { return timelineOffset; },
  set: function(value) { timelineOffset = value; }
});
window.updateTimelineLabels = function() { if (viewport.isTimelineMode) updateTimelineLabels(); };
window.getTimeResolution = getTimeResolution;

// Get time resolution and format based on zoom level (returns milliseconds)
function getTimeResolution(zoom) {
  if (zoom >= 2.0) return { unit: 'minutes', step: 30 * 60 * 1000, format: 'minutes' }; // 30 minutes
  if (zoom >= 1.0) return { unit: 'hours', step: 2 * 60 * 60 * 1000, format: 'hours' }; // 2 hours
  if (zoom >= 0.5) return { unit: 'hours', step: 12 * 60 * 60 * 1000, format: 'hours' }; // 12 hours
  if (zoom >= 0.3) return { unit: 'days', step: 2 * 24 * 60 * 60 * 1000, format: 'days' }; // 2 days
  if (zoom >= 0.15) return { unit: 'days', step: 7 * 24 * 60 * 60 * 1000, format: 'days' }; // 7 days
  if (zoom >= 0.08) return { unit: 'days', step: 30 * 24 * 60 * 60 * 1000, format: 'days' }; // 30 days
  if (zoom >= 0.04) return { unit: 'months', step: 3 * 30 * 24 * 60 * 60 * 1000, format: 'months' }; // 3 months
  if (zoom >= 0.02) return { unit: 'months', step: 12 * 30 * 24 * 60 * 60 * 1000, format: 'months' }; // 12 months
  return { unit: 'years', step: 5 * 365 * 24 * 60 * 60 * 1000, format: 'years' }; // 5 years
}

// Format date/time for display
function formatDateTime(date) {
  const month = (date.getMonth() + 1).toString();
  const day = date.getDate().toString();
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  
  return `${month}/${day}/${year} ${hours}:${minutes}${ampm}`;
}

// Convert milliseconds to human readable format
function formatTimeDelta(milliseconds, unit) {
  const absMs = Math.abs(milliseconds);
  const sign = milliseconds < 0 ? '-' : '+';
  
  let value, unitName;
  
  switch (unit) {
    case 'minutes':
      value = Math.round(absMs / (60 * 1000));
      unitName = value === 1 ? 'minute' : 'minutes';
      break;
    case 'hours':
      value = Math.round(absMs / (60 * 60 * 1000));
      unitName = value === 1 ? 'hour' : 'hours';
      break;
    case 'days':
      value = Math.round(absMs / (24 * 60 * 60 * 1000));
      unitName = value === 1 ? 'day' : 'days';
      break;
    case 'months':
      value = Math.round(absMs / (30 * 24 * 60 * 60 * 1000));
      unitName = value === 1 ? 'month' : 'months';
      break;
    case 'years':
      value = Math.round(absMs / (365 * 24 * 60 * 60 * 1000));
      unitName = value === 1 ? 'year' : 'years';
      break;
    default:
      value = Math.round(absMs / (60 * 60 * 1000));
      unitName = value === 1 ? 'hour' : 'hours';
  }
  
  return `${sign}${value} ${unitName}`;
}

function getPastTimeLabel() {
  const resolution = getTimeResolution(viewport.zoom);
  return formatTimeDelta(-resolution.step, resolution.unit);
}

function getNowTimeLabel() {
  const currentTime = new Date(baselineDateTime.getTime() + timelineOffset);
  return formatDateTime(currentTime);
}

function getFutureTimeLabel() {
  const resolution = getTimeResolution(viewport.zoom);
  return formatTimeDelta(resolution.step, resolution.unit);
}

// Start editing the baseline date/time
function startDateTimeEdit(labelElement) {
  if (isDateTimeEditing) return;
  
  isDateTimeEditing = true;
  const currentDateTime = formatDateTime(new Date(baselineDateTime.getTime() + timelineOffset));
  
  // Create input field
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentDateTime;
  input.style.cssText = `
    position: fixed;
    left: calc(50% + 20px);
    top: 50%;
    transform: translateY(-50%);
    background: #1a1a1a;
    border: 1px solid #00ff88;
    color: #fff;
    font-family: monospace;
    font-size: 12px;
    padding: 2px 4px;
    width: 140px;
    z-index: 1000;
  `;
  
  // Hide original label
  labelElement.style.display = 'none';
  
  // Add input to document
  document.body.appendChild(input);
  input.focus();
  input.select();
  
  // Save function
  const saveDateTime = () => {
    const inputValue = input.value.trim();
    if (inputValue) {
      // Try to parse the input
      const parsedDate = parseDateTime(inputValue);
      if (parsedDate) {
        // Update baseline to make the current timeline position match the entered time
        const currentTime = new Date(baselineDateTime.getTime() + timelineOffset);
        const timeDiff = parsedDate.getTime() - currentTime.getTime();
        baselineDateTime = new Date(baselineDateTime.getTime() + timeDiff);
        
        console.log('[Timeline] Updated baseline date/time to:', formatDateTime(baselineDateTime));
        
        // Update all timeline labels
        updateTimelineLabels();
      } else {
        console.warn('[Timeline] Failed to parse date/time:', inputValue);
      }
    }
    
    // Cleanup
    input.remove();
    labelElement.style.display = '';
    isDateTimeEditing = false;
  };
  
  // Handle input events
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveDateTime();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.remove();
      labelElement.style.display = '';
      isDateTimeEditing = false;
    }
  });
  
  input.addEventListener('blur', () => {
    saveDateTime();
  });
}

// Parse date/time string (supports various formats)
function parseDateTime(dateTimeStr) {
  // Try common formats
  const formats = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(AM|PM)$/i,
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/,
  ];
  
  for (const format of formats) {
    const match = dateTimeStr.match(format);
    if (match) {
      const [, month, day, year, hours, minutes, ampm] = match;
      let hour24 = parseInt(hours);
      
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hour24 !== 12) hour24 += 12;
        if (ampm.toUpperCase() === 'AM' && hour24 === 12) hour24 = 0;
      }
      
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), hour24, parseInt(minutes));
    }
  }
  
  // Try built-in Date parsing as fallback
  const fallbackDate = new Date(dateTimeStr);
  return isNaN(fallbackDate.getTime()) ? null : fallbackDate;
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
    pointer-events: auto;
    cursor: pointer;
    text-shadow: none;
  `;
  
  // Add double-click editing functionality
  let clickCount = 0;
  let clickTimer = null;
  
  nowTimeLabel.addEventListener('click', (e) => {
    e.stopPropagation();
    clickCount++;
    
    if (clickCount === 1) {
      clickTimer = setTimeout(() => {
        clickCount = 0;
      }, 300);
    } else if (clickCount === 2) {
      clearTimeout(clickTimer);
      clickCount = 0;
      startDateTimeEdit(nowTimeLabel);
    }
  });
  
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

// ---------- Simple Temporal Flow System ----------
let currentTime = 0; // Current time in seconds
let timeResolution = 2; // Index into time resolutions array
let isPlaying = false; // Auto-advance state
let playInterval = null; // Interval for auto-advance

// Time resolution levels
const TIME_RESOLUTIONS = [
  { name: 'Second', step: 1, format: 's' },
  { name: 'Minute', step: 60, format: 'm' },
  { name: 'Hour', step: 3600, format: 'h' },
  { name: 'Day', step: 86400, format: 'd' },
  { name: 'Week', step: 604800, format: 'w' },
  { name: 'Month', step: 2629746, format: 'M' },
  { name: 'Year', step: 31556952, format: 'Y' }
];

// Show simple temporal indicator
function showTemporalIndicator() {
  hideTemporalIndicator();
  
  const indicator = document.createElement('div');
  indicator.id = 'temporalIndicator';
  indicator.style.cssText = `
    position: fixed;
    top: 35px;
    left: 50%;
    transform: translateX(-50%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 20px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    z-index: 10000;
    pointer-events: none;
    text-align: center;
    letter-spacing: 0.3px;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  document.body.appendChild(indicator);
  updateTemporalDisplay();
}

// Hide temporal indicator
function hideTemporalIndicator() {
  const indicator = document.getElementById('temporalIndicator');
  if (indicator) indicator.remove();
}

// Format time for display
function formatTime(seconds) {
  const absSeconds = Math.abs(seconds);
  const sign = seconds < 0 ? '-' : seconds > 0 ? '+' : '';
  
  if (absSeconds < 60) {
    return seconds === 0 ? 'NOW' : `${sign}${absSeconds}s`;
  } else if (absSeconds < 3600) {
    const minutes = Math.floor(absSeconds / 60);
    const remainingSeconds = absSeconds % 60;
    return remainingSeconds === 0 ? `${sign}${minutes}m` : `${sign}${minutes}m ${remainingSeconds}s`;
  } else if (absSeconds < 86400) {
    const hours = Math.floor(absSeconds / 3600);
    const remainingMinutes = Math.floor((absSeconds % 3600) / 60);
    return remainingMinutes === 0 ? `${sign}${hours}h` : `${sign}${hours}h ${remainingMinutes}m`;
  } else if (absSeconds < 604800) {
    const days = Math.floor(absSeconds / 86400);
    const remainingHours = Math.floor((absSeconds % 86400) / 3600);
    return remainingHours === 0 ? `${sign}${days}d` : `${sign}${days}d ${remainingHours}h`;
  } else if (absSeconds < 2629746) {
    const weeks = Math.floor(absSeconds / 604800);
    const remainingDays = Math.floor((absSeconds % 604800) / 86400);
    return remainingDays === 0 ? `${sign}${weeks}w` : `${sign}${weeks}w ${remainingDays}d`;
  } else if (absSeconds < 31556952) {
    const months = Math.floor(absSeconds / 2629746);
    const remainingWeeks = Math.floor((absSeconds % 2629746) / 604800);
    return remainingWeeks === 0 ? `${sign}${months}M` : `${sign}${months}M ${remainingWeeks}w`;
  } else {
    const years = Math.floor(absSeconds / 31556952);
    const remainingMonths = Math.floor((absSeconds % 31556952) / 2629746);
    return remainingMonths === 0 ? `${sign}${years}Y` : `${sign}${years}Y ${remainingMonths}M`;
  }
}

// Update temporal display with accent pulse
function updateTemporalDisplay() {
  const indicator = document.getElementById('temporalIndicator');
  if (!indicator) return;
  
  const resolution = TIME_RESOLUTIONS[timeResolution];
  const timeText = formatTime(currentTime);
  
  // Format resolution step for display
  const stepText = resolution.step === 1 ? '1 sec' :
                  resolution.step === 60 ? '1 min' :
                  resolution.step === 3600 ? '1 hour' :
                  resolution.step === 86400 ? '1 day' :
                  resolution.step === 604800 ? '1 week' :
                  resolution.step === 2629746 ? '1 month' :
                  resolution.step === 31556952 ? '1 year' : `${resolution.step}s`;
  
  indicator.innerHTML = `
    <div id="temporalAccent" style="
      width: 4px; 
      height: 20px; 
      background: #00ff88; 
      transition: all 0.15s ease;
      opacity: 0.8;
    "></div>
    <div style="display: flex; flex-direction: column; gap: 2px;">
      <div style="line-height: 1;">${timeText}</div>
      <div style="opacity: 0.5; font-size: 14px; font-weight: 400; line-height: 1;">${stepText}</div>
    </div>
    <div id="temporalPlayButton" style="
      margin-left: 12px;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
      pointer-events: auto;
    ">
      <div style="
        width: 0; 
        height: 0; 
        border-left: 14px solid #666; 
        border-top: 8px solid transparent; 
        border-bottom: 8px solid transparent;
        margin-left: 2px;
      "></div>
    </div>
  `;
  
  // Accent pulse effect on change
  const accent = indicator.querySelector('#temporalAccent');
  if (accent) {
    accent.style.background = '#00ffaa';
    accent.style.boxShadow = '0 0 8px rgba(0, 255, 136, 0.6)';
    accent.style.opacity = '1';
    
    setTimeout(() => {
      accent.style.background = '#00ff88';
      accent.style.boxShadow = 'none';
      accent.style.opacity = '0.8';
    }, 150);
  }
  
  // Update play button state and bind click event
  const playButton = indicator.querySelector('#temporalPlayButton');
  const triangle = playButton?.querySelector('div');
  if (playButton && triangle) {
    triangle.style.borderLeftColor = isPlaying ? '#00ff88' : '#666';
    
    // Remove existing listener to prevent duplicates
    playButton.onclick = null;
    playButton.onclick = toggleTimePlayback;
  }
}

// Navigate time
function navigateTime(direction) {
  if (!viewport.isTimelineMode) return;
  
  const resolution = TIME_RESOLUTIONS[timeResolution];
  if (direction === 'forward') {
    currentTime += resolution.step;
  } else {
    currentTime -= resolution.step;
  }
  
  updateTemporalDisplay();
  updateTemporalTimeline();
}

// Change time resolution
function changeTimeResolution(direction) {
  if (!viewport.isTimelineMode) return;
  
  if (direction === 'up' && timeResolution < TIME_RESOLUTIONS.length - 1) {
    timeResolution++;
  } else if (direction === 'down' && timeResolution > 0) {
    timeResolution--;
  }
  
  updateTemporalDisplay();
  updateTemporalTimeline();
}

// Show temporal timeline on right edge
function showTemporalTimeline() {
  hideTemporalTimeline();
  
  const timeline = document.createElement('div');
  timeline.id = 'temporalTimeline';
  timeline.style.cssText = `
    position: fixed;
    right: 20px;
    top: 90px;
    bottom: 90px;
    width: 4px;
    background: rgba(255, 255, 255, 0.1);
    z-index: 9999;
    pointer-events: none;
    transition: all 0.15s ease;
  `;
  
  // Current position indicator
  const currentMarker = document.createElement('div');
  currentMarker.id = 'temporalCurrentMarker';
  currentMarker.style.cssText = `
    position: absolute;
    left: -3px;
    width: 10px;
    height: 4px;
    background: #00ff88;
    transition: all 0.15s ease;
    box-shadow: 0 0 4px rgba(0, 255, 136, 0.5);
    cursor: grab;
    z-index: 10000;
    pointer-events: auto;
    transform: translateX(-0.5px);
  `;
  
  // Create larger invisible hit area for easier grabbing
  const hitArea = document.createElement('div');
  hitArea.style.cssText = `
    position: absolute;
    left: -8px;
    top: -4px;
    width: 20px;
    height: 12px;
    cursor: grab;
    z-index: 10001;
    pointer-events: auto;
  `;
  
  currentMarker.appendChild(hitArea);
  
  // Add drag interaction
  let isDragging = false;
  
  // Bind mousedown to both marker and hit area
  const startDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    currentMarker.style.cursor = 'grabbing';
    hitArea.style.cursor = 'grabbing';
    currentMarker.style.transition = 'none'; // Disable transition during drag
    console.log('[Temporal] Drag started');
  };
  
  currentMarker.addEventListener('mousedown', startDrag);
  hitArea.addEventListener('mousedown', startDrag);
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    console.log('[Temporal] Dragging, y:', e.clientY);
    
    const rect = timeline.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const percentage = Math.max(0, Math.min(1, y / rect.height));
    
    // Get dynamic time range based on cards (default ±1 hour if no cards)
    const timeRange = getTimelineRange();
    const totalRange = timeRange.max - timeRange.min;
    currentTime = Math.round(timeRange.max - (percentage * totalRange)); // Fix direction: top=future
    
    // Clamp to min/max range
    currentTime = Math.max(timeRange.min, Math.min(timeRange.max, currentTime));
    
    updateTemporalDisplay();
    
    // Update marker position directly during drag (no pulse)
    const timelineHeight = timeline.offsetHeight;
    const clampedTime = Math.max(timeRange.min, Math.min(timeRange.max, currentTime));
    const relativePosition = (timeRange.max - clampedTime) / totalRange;
    const markerPosition = timelineHeight * relativePosition;
    currentMarker.style.top = markerPosition + 'px';
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      currentMarker.style.cursor = 'grab';
      hitArea.style.cursor = 'grab';
      currentMarker.style.transition = 'all 0.15s ease'; // Re-enable transition
    }
  });
  
  
  timeline.appendChild(currentMarker);
  document.body.appendChild(timeline);
  updateTemporalTimeline();
}

// Hide temporal timeline
function hideTemporalTimeline() {
  const timeline = document.getElementById('temporalTimeline');
  if (timeline) timeline.remove();
}

// Update timeline with card positions and current marker
function updateTemporalTimeline() {
  const timeline = document.getElementById('temporalTimeline');
  const currentMarker = document.getElementById('temporalCurrentMarker');
  if (!timeline || !currentMarker) return;
  
  // For now, just show current position as percentage
  // In a real implementation, you'd calculate this based on card time ranges
  const timelineHeight = timeline.offsetHeight;
  const centerPosition = timelineHeight / 2;
  
  // Position current marker at center (representing "now")
  // Offset based on currentTime relative to some time range
  let markerPosition = centerPosition;
  
  // Position based on dynamic time range
  const timeRange = getTimelineRange();
  const totalRange = timeRange.max - timeRange.min;
  
  // Clamp currentTime to ensure it's within range
  const clampedTime = Math.max(timeRange.min, Math.min(timeRange.max, currentTime));
  
  const relativePosition = (timeRange.max - clampedTime) / totalRange; // 0 to 1, inverted
  markerPosition = timelineHeight * relativePosition; // top=future, bottom=past
  
  currentMarker.style.top = `${markerPosition}px`;
  
  // Pulse effect
  currentMarker.style.background = '#00ffaa';
  currentMarker.style.boxShadow = '0 0 8px rgba(0, 255, 136, 0.8)';
  
  setTimeout(() => {
    currentMarker.style.background = '#00ff88';
    currentMarker.style.boxShadow = '0 0 4px rgba(0, 255, 136, 0.5)';
  }, 150);
  
  // TODO: Add card dots along timeline based on their temporal positions
  // This would require cards to have temporal metadata (start/end times)
}

// Get dynamic time range based on card positions
function getTimelineRange() {
  // TODO: In the future, scan all cards for their temporal positions
  // For now, default to ±1 hour when no cards exist
  
  // Default range: -1 hour to +1 hour (in seconds)
  return {
    min: -3600, // -1 hour
    max: 3600   // +1 hour
  };
  
  // Future implementation would look like:
  // let minTime = -3600, maxTime = 3600; // default ±1 hour
  // data.all.forEach(card => {
  //   if (card.temporalStart) minTime = Math.min(minTime, card.temporalStart);
  //   if (card.temporalEnd) maxTime = Math.max(maxTime, card.temporalEnd);
  // });
  // return { min: minTime, max: maxTime };
}

// Toggle time playback
function toggleTimePlayback() {
  if (!viewport.isTimelineMode) return;
  
  isPlaying = !isPlaying;
  
  if (isPlaying) {
    // Start auto-advance
    const resolution = TIME_RESOLUTIONS[timeResolution];
    playInterval = setInterval(() => {
      // Advance time by current resolution step (continue indefinitely)
      currentTime += resolution.step;
      
      updateTemporalDisplay();
      updateTemporalTimeline();
    }, 1000); // Every second
    
    console.log('[Temporal] Started playback at', resolution.name, 'per second');
  } else {
    // Stop auto-advance
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
    }
    console.log('[Temporal] Stopped playback');
  }
  
  // Update button appearance
  updateTemporalDisplay();
}

// Make functions globally accessible
window.navigateTime = navigateTime;
window.changeTimeResolution = changeTimeResolution;
window.toggleTimePlayback = toggleTimePlayback;

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}