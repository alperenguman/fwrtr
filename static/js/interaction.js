// interaction.js - User Input & Event Handling
// Handles all user interactions, drag & drop, selection, and event binding

import * as data from './data.js';
import * as viewport from './viewport.js';
import * as render from './render.js';

// ---------- Selection State ----------
let selected = new Set();
let selecting = false, selStartX = 0, selStartY = 0;

// ---------- Drag State ----------
let dragging = false, dragStartX = 0, dragStartY = 0, dragIds = [];
let hover = null;
const LINK_ZONE_HEIGHT = 60; // Increased from 40 for better usability
const LINK_ZONE_VISUAL_FEEDBACK = true;

// ---------- Variant Drag State ----------
let variantDragging = false;
let variantGhost = null;
let variantOriginalId = null;
let variantData = null;

// Create ghost element for variant dragging
function createVariantGhost(originalCard, clientX, clientY) {
  // Remove existing ghost
  if (variantGhost) {
    variantGhost.remove();
  }
  
  // Clone the original card element
  variantGhost = originalCard.cloneNode(true);
  variantGhost.id = 'variant-ghost';
  variantGhost.className = 'card variant-ghost';
  variantGhost.style.cssText = `
    position: fixed;
    left: ${clientX - 170}px;
    top: ${clientY - 110}px;
    z-index: 10000;
    opacity: 0.8;
    pointer-events: none;
    transform: scale(0.9);
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    border: 2px dashed #007acc;
  `;
  
  // Update the ghost's title to show variant name
  const titleEl = variantGhost.querySelector('.card-title');
  if (titleEl && variantData) {
    titleEl.textContent = variantData.name;
  }
  
  document.body.appendChild(variantGhost);
}

// ---------- Link Entity Drag State ----------
let draggingLinkEntity = false;
let draggedLinkEntityData = null; // {name, id, sourceCardId}
let dragGhost = null;

// ---------- Plane Dragging ----------
let draggingPlane = false, planeStartX = 0, planeStartY = 0;

// ---------- Momentum Dragging ----------
let momentum = { vx: 0, vy: 0, lastTime: 0, lastX: 0, lastY: 0 };
let momentumAnimation = null;


// Momentum animation with heavy resistance and smooth decay
function startMomentumAnimation() {
  if (momentumAnimation) {
    cancelAnimationFrame(momentumAnimation);
  }
  
  const friction = 0.92; // Heavy resistance (lower = more resistance)
  const minVelocity = 0.1; // Stop when velocity gets too small
  
  function animate() {
    // Apply friction to velocities
    momentum.vx *= friction;
    momentum.vy *= friction;
    
    // Calculate total velocity to check if we should stop
    const totalVel = Math.sqrt(momentum.vx * momentum.vx + momentum.vy * momentum.vy);
    
    if (totalVel < minVelocity) {
      // Stop animation and reset momentum
      momentum.vx = momentum.vy = 0;
      momentumAnimation = null;
      return;
    }
    
    // Apply momentum to viewport
    if (viewport.isTimelineMode) {
      // In temporal mode, allow full XY momentum
      viewport.setViewport(viewport.viewX + momentum.vx, viewport.viewY + momentum.vy);
      
      // Continue updating timeline offset during momentum
      if (window.timelineOffset !== undefined && Math.abs(momentum.vy) > 0.1) {
        window.timelineOffset -= momentum.vy * 60000; // Same scaling as drag
        if (window.updateTimelineLabels) {
          window.updateTimelineLabels();
        }
      }
    } else {
      // Normal mode - apply both X and Y momentum
      viewport.setViewport(viewport.viewX + momentum.vx, viewport.viewY + momentum.vy);
    }
    
    viewport.updateView();
    
    // Continue animation
    momentumAnimation = requestAnimationFrame(animate);
  }
  
  animate();
}

// ---------- Gallery Initialization Queue ----------
let galleryInitQueue = new Set();
let galleryInitTimer = null;

// Process gallery initialization queue
function processGalleryQueue() {
  if (galleryInitQueue.size === 0) return;
  
  // Process all pending galleries
  const cardsToInit = Array.from(galleryInitQueue);
  galleryInitQueue.clear();
  
  cardsToInit.forEach(cardId => {
    initializeGallery(cardId);
  });
}

// Defer gallery initialization
function queueGalleryInit(cardId) {
  galleryInitQueue.add(cardId);
  
  // Clear existing timer
  if (galleryInitTimer) {
    clearTimeout(galleryInitTimer);
  }
  
  // Process queue after a short delay to batch initializations
  galleryInitTimer = setTimeout(() => {
    processGalleryQueue();
  }, 100);
}

// Initialize a single gallery
function initializeGallery(cardId) {
  const root = document.getElementById('card-' + cardId);
  if (!root) return;
  
  const repsSection = root.querySelector('#reps-' + cardId);
  if (!repsSection || repsSection._galleryInitialized) return;
  
  const mediaViewport = repsSection.querySelector('.media-viewport');
  const mediaContainer = repsSection.querySelector('.media-container');
  const prevBtn = repsSection.querySelector('.gallery-prev');
  const nextBtn = repsSection.querySelector('.gallery-next');
  const indicatorsContainer = repsSection.querySelector('.gallery-indicators');
  
  if (!mediaContainer || !mediaViewport) return;
  
  let currentPosition = 0;
  
  // Calculate scroll limits
  function getScrollInfo() {
    const containerWidth = mediaContainer.scrollWidth;
    const viewportWidth = mediaViewport.offsetWidth;
    const maxScroll = Math.max(0, containerWidth - viewportWidth);
    const scrollStep = viewportWidth * 0.8; // Scroll 80% of viewport
    const totalSteps = Math.ceil(maxScroll / scrollStep);
    return { containerWidth, viewportWidth, maxScroll, scrollStep, totalSteps };
  }
  
  // Update scroll position
  function scrollToPosition(position) {
    const { maxScroll, scrollStep } = getScrollInfo();
    const targetScroll = Math.min(position * scrollStep, maxScroll);
    
    mediaContainer.style.transition = 'transform 0.3s ease';
    mediaContainer.style.transform = `translateX(${-targetScroll}px)`;
    
    currentPosition = position;
    updateIndicators();
  }
  
  // Update indicators
  function updateIndicators() {
    if (!indicatorsContainer) return;
    
    const indicators = indicatorsContainer.querySelectorAll('.indicator');
    indicators.forEach((ind, i) => {
      ind.classList.toggle('active', i === currentPosition);
    });
  }
  
  // Create indicators
  function createIndicators() {
    if (!indicatorsContainer) return;
    
    const { containerWidth, viewportWidth, totalSteps } = getScrollInfo();
    
    if (containerWidth <= viewportWidth) {
      // Content fits, hide navigation
      indicatorsContainer.innerHTML = '';
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
      return;
    }
    
    // Show navigation
    if (prevBtn) prevBtn.style.display = '';
    if (nextBtn) nextBtn.style.display = '';
    
    // Create indicators for each step
    indicatorsContainer.innerHTML = '';
    for (let i = 0; i <= totalSteps; i++) {
      const indicator = document.createElement('span');
      indicator.className = 'indicator' + (i === 0 ? ' active' : '');
      indicator.dataset.position = i;
      indicator.addEventListener('click', function(e) {
        e.stopPropagation();
        scrollToPosition(parseInt(this.dataset.position));
      });
      indicatorsContainer.appendChild(indicator);
    }
  }
  
  // Navigation button handlers
  if (prevBtn && !prevBtn._galleryBound) {
    prevBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const { totalSteps } = getScrollInfo();
      
      if (currentPosition > 0) {
        scrollToPosition(currentPosition - 1);
      } else {
        scrollToPosition(totalSteps);
      }
    });
    prevBtn._galleryBound = true;
  }
  
  if (nextBtn && !nextBtn._galleryBound) {
    nextBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const { totalSteps } = getScrollInfo();
      
      if (currentPosition < totalSteps) {
        scrollToPosition(currentPosition + 1);
      } else {
        scrollToPosition(0);
      }
    });
    nextBtn._galleryBound = true;
  }
  
  // Setup gallery immediately
  createIndicators();
  scrollToPosition(0);
  
  // Mark as initialized
  repsSection._galleryInitialized = true;
  
  // Handle window resize
  if (!window._galleryResizeHandler) {
    window._galleryResizeHandler = true;
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // Re-initialize all visible galleries on resize
        document.querySelectorAll('.representations-section').forEach(section => {
          if (section._galleryInitialized) {
            const cardId = parseInt(section.dataset.cardId);
            if (cardId) {
              initializeGallery(cardId);
            }
          }
        });
      }, 250);
    });
  }
}

// ---------- Card Selection ----------
export function selectCard(e) { 
  e.stopPropagation(); 
  const id = parseInt(e.currentTarget.id.split('-')[1]); 
  
  if (!e.ctrlKey && !e.metaKey) { 
    selected.clear(); 
    document.querySelectorAll('.card.selected').forEach(n => n.classList.remove('selected')); 
  } 
  
  if (selected.has(id)) { 
    selected.delete(id); 
    e.currentTarget.classList.remove('selected'); 
  } else { 
    selected.add(id); 
    e.currentTarget.classList.add('selected'); 
  } 
}

// ---------- Card Dragging ----------
export function startCardDrag(e) { 
  // Handle variant creation with Alt + middle mouse button
  if (e.altKey && e.button === 1) {
    e.preventDefault();
    e.stopPropagation();
    
    const box = e.currentTarget; 
    const originalId = parseInt(box.id.split('-')[1]); 
    
    // Start variant dragging
    variantDragging = true;
    variantOriginalId = originalId;
    
    const coords = viewport.getWorldCoords(e.clientX, e.clientY);
    dragStartX = coords.wx;
    dragStartY = coords.wy;
    
    // Create variant data but don't add to world yet
    const original = data.byId(originalId);
    
    const generateVariantName = (baseName) => {
      const variantPrefix = `${baseName} - var `;
      const existingVariants = data.all.filter(card => {
        return card.name.startsWith(variantPrefix) && /^[A-Z]+$/.test(card.name.substring(variantPrefix.length));
      });
      
      const existingSuffixes = existingVariants.map(card => {
        return card.name.substring(variantPrefix.length);
      });
      
      const generateSuffix = (index) => {
        let suffix = '';
        let temp = index;
        do {
          suffix = String.fromCharCode(65 + (temp % 26)) + suffix;
          temp = Math.floor(temp / 26) - 1;
        } while (temp >= 0);
        return suffix;
      };
      
      let index = 0;
      let suffix = generateSuffix(index);
      while (existingSuffixes.includes(suffix)) {
        index++;
        suffix = generateSuffix(index);
      }
      
      return `${baseName} - var ${suffix}`;
    };
    
    variantData = {
      name: generateVariantName(original.name),
      type: original.type,
      content: original.content,
      attributes: original.attributes.map(attr => ({
        key: attr.key,
        value: attr.value,
        kind: attr.kind,
        entityId: attr.entityId,
        entityIds: attr.entityIds ? [...attr.entityIds] : undefined
      })),
      representations: [...original.representations]
    };
    
    // Create visual ghost element
    createVariantGhost(box, e.clientX, e.clientY);
    
    console.log(`[Variant] Starting drag for variant "${variantData.name}" from "${original.name}"`);
    return;
  }
  
  if (e.button !== 0) return; 
  if (e.target.closest('.card-text') || e.target.tagName === 'INPUT') return; 
  // Prevent card drag when clicking on link items
  if (e.target.closest('.link-item')) return;
  
  const box = e.currentTarget; 
  const id = parseInt(box.id.split('-')[1]); 
  
  if (!selected.has(id)) { 
    selected.clear(); 
    document.querySelectorAll('.card.selected').forEach(n => n.classList.remove('selected')); 
    selected.add(id); 
    box.classList.add('selected'); 
  }
  
  dragging = true; 
  const coords = viewport.getWorldCoords(e.clientX, e.clientY);
  dragStartX = coords.wx; 
  dragStartY = coords.wy; 
  dragIds = [...selected]; 
  
  dragIds.forEach(cid => { 
    const ix = viewport.clones.findIndex(v => v.refId === cid); 
    const el = document.getElementById('card-' + cid); 
    if (ix >= 0 && el) { 
      el._ix = viewport.clones[ix].x; 
      el._iy = viewport.clones[ix].y; 
    } 
  }); 
}

// ---------- Link Entity Dragging ----------
function startLinkEntityDrag(e, linkName, linkId, sourceCardId) {
  e.preventDefault();
  e.stopPropagation();
  
  draggingLinkEntity = true;
  draggedLinkEntityData = { name: linkName, id: linkId, sourceCardId: sourceCardId };
  
  // Create ghost element
  dragGhost = document.createElement('div');
  dragGhost.className = 'link-entity-ghost';
  dragGhost.textContent = linkName;
  dragGhost.style.position = 'fixed';
  dragGhost.style.left = e.clientX + 'px';
  dragGhost.style.top = e.clientY + 'px';
  dragGhost.style.pointerEvents = 'none';
  dragGhost.style.zIndex = '10000';
  document.body.appendChild(dragGhost);
  
  // Prevent text selection and default drag
  return false;
}

// ---------- Mouse Movement Handler ----------
document.addEventListener('mousemove', e => { 
  const coords = viewport.getWorldCoords(e.clientX, e.clientY);
  const wx = coords.wx, wy = coords.wy; 
  
  // Handle link entity dragging
  if (draggingLinkEntity && dragGhost) {
    dragGhost.style.left = (e.clientX + 10) + 'px';
    dragGhost.style.top = (e.clientY - 10) + 'px';
    
    // Find what we're hovering over
    dragGhost.style.display = 'none'; // Temporarily hide to get element below
    const target = document.elementFromPoint(e.clientX, e.clientY);
    dragGhost.style.display = '';
    
    // Clear previous drop zone highlights
    document.querySelectorAll('.attr-drop-zone').forEach(el => el.classList.remove('attr-drop-zone'));
    document.querySelectorAll('.attr-row-drop-zone').forEach(el => el.classList.remove('attr-row-drop-zone'));
    
    // Check if we're over an attribute section
    const attrSection = target?.closest('.attr-list');
    if (attrSection) {
      attrSection.classList.add('attr-drop-zone');
      
      // Check if we're over a specific attribute row
      const attrRow = target?.closest('.attr-row');
      if (attrRow) {
        attrRow.classList.add('attr-row-drop-zone');
      }
    }
    
    return; // Don't process other drag operations
  }
  
  // Handle variant dragging
  if (variantDragging && variantGhost) {
    variantGhost.style.left = (e.clientX - 170) + 'px';
    variantGhost.style.top = (e.clientY - 110) + 'px';
    return; // Don't process other drag operations
  }
  
  if (dragging) { 
    const dx = wx - dragStartX, dy = wy - dragStartY; 
    
    dragIds.forEach(cid => { 
      const ix = viewport.clones.findIndex(v => v.refId === cid); 
      const el = document.getElementById('card-' + cid); 
      if (ix >= 0 && el) { 
        const newX = el._ix + dx;
        const newY = el._iy + dy;
        viewport.setClonePosition(cid, newX, newY);
        el.style.setProperty('--x', newX + 'px'); 
        el.style.setProperty('--y', newY + 'px'); 
        
        // Add dragging class for visual feedback
        if (!el.classList.contains('dragging')) {
          el.classList.add('dragging');
        }
      } 
    }); 
    
    
    // Better hover detection with link zone
    // Temporarily hide dragged cards to detect what's underneath
    const draggedElements = dragIds.map(id => document.getElementById('card-' + id)).filter(Boolean);
    draggedElements.forEach(el => el.style.pointerEvents = 'none');
    
    const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card'); 
    
    // Restore pointer events
    draggedElements.forEach(el => el.style.pointerEvents = '');
    
    // Clear previous hover state
    if (hover && t !== hover) { 
      hover.classList.remove('drop-target', 'link-zone', 'contain-zone'); 
    } 
    
    // Check if hovering over a valid target (not one of the dragged cards)
    const newHoverId = t ? parseInt(t.id.split('-')[1]) : null;
    const isValidTarget = t && !dragIds.includes(newHoverId);
    
    hover = isValidTarget ? t : null; 
    
    // Timeline logic will be added step by step
    
    if (hover) { 
      const r = hover.getBoundingClientRect(); 
      const hoverCardId = parseInt(hover.id.split('-')[1]);
      
      // Check if we're in the link zone (bottom portion)
      const inLinkZone = e.clientY > r.bottom - LINK_ZONE_HEIGHT;
      
      // Visual feedback based on zone
      if (inLinkZone) {
        hover.classList.remove('contain-zone');
        hover.classList.add('drop-target', 'link-zone');
      } else {
        // Contain zone (rest of the card)
        hover.classList.remove('link-zone');
        hover.classList.add('drop-target', 'contain-zone');
      }
    } 
  } 
  
  if (draggingPlane) { 
    const dx = e.clientX - planeStartX, dy = e.clientY - planeStartY; 
    
    // Track momentum for inertia physics
    const currentTime = performance.now();
    if (momentum.lastTime > 0) {
      const dt = currentTime - momentum.lastTime;
      if (dt > 0) {
        momentum.vx = (e.clientX - momentum.lastX) / dt * 16.67; // Convert to pixels per frame (60fps)
        momentum.vy = (e.clientY - momentum.lastY) / dt * 16.67;
      }
    }
    momentum.lastTime = currentTime;
    momentum.lastX = e.clientX;
    momentum.lastY = e.clientY;
    
    // In temporal mode, allow full XY movement
    if (viewport.isTimelineMode) {
      viewport.setViewport(viewport.viewX + dx, viewport.viewY + dy); 
      planeStartX = e.clientX; 
      planeStartY = e.clientY;
      
      // Update timeline offset based on Y movement (for time labels)
      // Up = more negative (past), Down = more positive (future)
      if (window.timelineOffset !== undefined) {
        // Scale factor: 1 pixel = 1 minute (60000 milliseconds)
        window.timelineOffset -= dy * 60000; // Invert direction: up is past, down is future
        // Update the labels with new time values
        if (window.updateTimelineLabels) {
          window.updateTimelineLabels();
        }
      }
    } else {
      // Normal mode - allow both X and Y movement
      viewport.setViewport(viewport.viewX + dx, viewport.viewY + dy); 
      planeStartX = e.clientX; 
      planeStartY = e.clientY; 
    }
    
    viewport.updateView(); 
  } 
  
  if (selecting) { 
    const cx = e.clientX, cy = e.clientY; 
    const l = Math.min(selStartX, cx), t = Math.min(selStartY, cy); 
    const w = Math.abs(cx - selStartX), h = Math.abs(cy - selStartY); 
    const lasso = document.getElementById('lasso');
    Object.assign(lasso.style, {left: l + 'px', top: t + 'px', width: w + 'px', height: h + 'px'}); 
    updateSelection(l, t, w, h); 
  } 
  
  viewport.updateHUD(wx, wy); 
});

// ---------- Mouse Up Handler ----------
document.addEventListener('mouseup', e => { 
  // Handle link entity drop
  if (draggingLinkEntity) {
    if (dragGhost) {
      dragGhost.style.display = 'none';
      const target = document.elementFromPoint(e.clientX, e.clientY);
      dragGhost.remove();
      dragGhost = null;
      
      // Check if we dropped on an attribute row
      const attrRow = target?.closest('.attr-row');
      const attrSection = target?.closest('.attr-list');
      
      if (attrRow) {
        // Works for both inherited and regular rows
        // Get the value input of this row
        const valInput = attrRow.querySelector('.attr-val');
        const keyInput = attrRow.querySelector('.attr-key');
        
        if (valInput) {
          const currentVal = valInput.value.trim();
          
          // If the value already contains entities (comma-separated), add to the list
          if (currentVal && currentVal.includes(',')) {
            // Already a list, append
            valInput.value = currentVal + ', ' + draggedLinkEntityData.name;
          } else if (currentVal && currentVal !== draggedLinkEntityData.name) {
            // Single value exists, convert to list
            valInput.value = currentVal + ', ' + draggedLinkEntityData.name;
          } else {
            // Empty or replace
            valInput.value = draggedLinkEntityData.name;
          }
          
          // If key is empty and not inherited, auto-fill with a sensible default
          if (!keyInput.value.trim() && !keyInput.hasAttribute('readonly')) {
            keyInput.value = 'entities';
          }
          
          // Trigger change event to save
          valInput.dispatchEvent(new Event('blur'));
        }
      } else if (attrSection) {
        // Dropped on attribute section but not on a specific row
        // Find the card ID from the attribute section
        const cardId = parseInt(attrSection.id.split('-')[1]);
        const card = data.byId(cardId);
        
        if (card) {
          // Find the last non-inherited empty row or create new
          const rows = attrSection.querySelectorAll('.attr-row:not(.inherited)');
          let targetRow = null;
          
          // Look for an empty row
          for (let row of rows) {
            const keyInput = row.querySelector('.attr-key');
            const valInput = row.querySelector('.attr-val');
            if (!keyInput.value.trim() && !valInput.value.trim()) {
              targetRow = row;
              break;
            }
          }
          
          if (targetRow) {
            const keyInput = targetRow.querySelector('.attr-key');
            const valInput = targetRow.querySelector('.attr-val');
            keyInput.value = 'entity';
            valInput.value = draggedLinkEntityData.name;
            valInput.dispatchEvent(new Event('blur'));
          }
        }
      }
      
      // Clean up drop zone highlights
      document.querySelectorAll('.attr-drop-zone').forEach(el => el.classList.remove('attr-drop-zone'));
      document.querySelectorAll('.attr-row-drop-zone').forEach(el => el.classList.remove('attr-row-drop-zone'));
    }
    
    draggingLinkEntity = false;
    draggedLinkEntityData = null;
    return;
  }
  
  // Handle variant placement
  if (variantDragging) {
    if (variantGhost) {
      const coords = viewport.getWorldCoords(e.clientX, e.clientY);
      
      // Create the actual variant
      const variant = data.createVariant(variantOriginalId, coords.wx, coords.wy);
      
      if (variant) {
        console.log(`[Variant] Placed variant "${variant.name}" from "${data.byId(variantOriginalId).name}" at (${Math.round(coords.wx)}, ${Math.round(coords.wy)})`);
        
        // Add to current layout
        const lay = viewport.ensureLayout(viewport.currentPlane);
        const newCard = {refId: variant.id, x: coords.wx, y: coords.wy};
        lay.cards.push(newCard);
        
        // Add to clones for immediate visibility
        viewport.pushClone({refId: variant.id, x: coords.wx, y: coords.wy});
        
        // Render and hydrate the new variant 
        render.renderCard(newCard);
        hydrateCard(variant.id);
        
        // Simple highlight effect without position changes
        const variantEl = document.getElementById('card-' + variant.id);
        if (variantEl) {
          // Brief highlight to show it was created
          variantEl.style.boxShadow = '0 0 30px rgba(0,255,136,0.8)';
          variantEl.style.zIndex = '1000';
          
          setTimeout(() => {
            variantEl.style.boxShadow = '';
            variantEl.style.zIndex = '';
          }, 600);
        }
        
        viewport.updateHUD();
      }
      
      // Clean up ghost
      variantGhost.remove();
      variantGhost = null;
    }
    
    // Reset variant dragging state
    variantDragging = false;
    variantOriginalId = null;
    variantData = null;
    return;
  }
  
  if (dragging) { 
    viewport.saveCurrentLayout(); 
    
    // Remove dragging class from all dragged cards
    dragIds.forEach(cid => {
      const el = document.getElementById('card-' + cid);
      if (el) {
        el.classList.remove('dragging');
      }
    });
    
    
    if (hover && dragIds.length > 0) { 
      const targetId = parseInt(hover.id.split('-')[1]); 
      const sourceId = dragIds[0]; // Use first selected card
      
      if (targetId && sourceId && targetId !== sourceId) { 
        const r = hover.getBoundingClientRect(); 
        const inLinkZone = e.clientY > r.bottom - LINK_ZONE_HEIGHT;
        
        // Determine action based on drop position
        if (inLinkZone) {
          // Link the entities - TARGET gets link to SOURCE (dragged card appears in target's links)
          data.link(targetId, sourceId); // REVERSED - target links to source
          
          // Visual feedback - flash both cards
          const sourceEl = document.getElementById('card-' + sourceId);
          const targetEl = document.getElementById('card-' + targetId);
          
          if (sourceEl) {
            sourceEl.style.boxShadow = '0 0 30px rgba(0,255,136,.8)';
            setTimeout(() => sourceEl.style.boxShadow = '', 400);
          }
          if (targetEl) {
            targetEl.style.boxShadow = '0 0 30px rgba(0,255,136,.8)';
            setTimeout(() => targetEl.style.boxShadow = '', 400);
          }
        } else {
          // Contain: make source a child of target (but keep it visible on current plane too)
          data.contain(targetId, sourceId); 
          
          // Visual feedback - flash container
          const targetEl = document.getElementById('card-' + targetId);
          if (targetEl) {
            targetEl.style.boxShadow = '0 0 30px rgba(255,90,90,.8)';
            setTimeout(() => targetEl.style.boxShadow = '', 400);
          }
          
          // Visual feedback - also flash the contained card with a different color
          const sourceEl = document.getElementById('card-' + sourceId);
          if (sourceEl) {
            sourceEl.style.boxShadow = '0 0 20px rgba(255,90,90,.5)';
            setTimeout(() => sourceEl.style.boxShadow = '', 400);
          }
        }
        
        // Update both cards' UI to show the new relationship
        render.updateCardUI(sourceId); 
        render.updateCardUI(targetId); 
      }
      
      if (hover && hover.classList) {
        hover.classList.remove('drop-target', 'link-zone', 'contain-zone');
      }
      hover = null; 
    }
    
    dragging = false; 
    dragIds = []; 
  }
  
  if (selecting) { 
    selecting = false; 
    document.getElementById('lasso').style.display = 'none'; 
  }
  
  if (draggingPlane) { 
    draggingPlane = false; 
    const plane = document.getElementById('plane');
    plane.classList.remove('dragging'); 
    plane.style.cursor = 'grab'; 
    viewport.saveCurrentLayout();
    
    // Start momentum animation if there's enough velocity
    const minVelocity = 0.5; // Minimum velocity to trigger momentum
    const totalVel = Math.sqrt(momentum.vx * momentum.vx + momentum.vy * momentum.vy);
    
    if (totalVel > minVelocity) {
      startMomentumAnimation();
    } else {
      // Reset momentum
      momentum.vx = momentum.vy = 0;
    }
  } 
});

// ---------- Plane Mouse Down ----------
const plane = document.getElementById('plane');
plane.addEventListener('mousedown', e => { 
  if (e.shiftKey) { 
    if (e.button !== 0 || e.target.closest('.card')) return; 
    selecting = true; 
    selStartX = e.clientX; 
    selStartY = e.clientY; 
    const lasso = document.getElementById('lasso');
    Object.assign(lasso.style, {left: selStartX + 'px', top: selStartY + 'px', width: '0px', height: '0px', display: 'block'}); 
  } else { 
    if (e.button !== 0 || e.target.closest('.card')) return; 
    selected.clear(); 
    document.querySelectorAll('.card.selected').forEach(n => n.classList.remove('selected')); 
    draggingPlane = true; 
    plane.classList.add('dragging'); 
    plane.style.cursor = 'grabbing'; 
    planeStartX = e.clientX; 
    planeStartY = e.clientY;
    
    // Stop any existing momentum animation and reset momentum tracking
    if (momentumAnimation) {
      cancelAnimationFrame(momentumAnimation);
      momentumAnimation = null;
    }
    momentum.vx = momentum.vy = 0;
    momentum.lastTime = performance.now();
    momentum.lastX = e.clientX;
    momentum.lastY = e.clientY; 
  } 
});

// ---------- Selection Update ----------
function updateSelection(left, top, w, h) { 
  document.querySelectorAll('.card').forEach(el => { 
    const r = el.getBoundingClientRect(); 
    const id = parseInt(el.id.split('-')[1]); 
    const hit = !(r.right < left || r.left > left + w || r.bottom < top || r.top > top + h); 
    if (hit) { 
      selected.add(id); 
      el.classList.add('selected'); 
    } else { 
      selected.delete(id); 
      el.classList.remove('selected'); 
    } 
  }); 
}

// ---------- Wheel Zoom / Temporal Navigation ----------
plane.addEventListener('wheel', e => { 
  e.preventDefault(); 
  
  // TEMPORAL MODE: Handle time navigation
  if (viewport.isTimelineMode) {
    if (e.shiftKey) {
      // Shift+scroll changes time resolution
      const direction = e.deltaY < 0 ? 'up' : 'down';
      window.changeTimeResolution(direction);
    } else {
      // Regular scroll navigates time (up=forward, down=backward)
      const direction = e.deltaY < 0 ? 'forward' : 'backward';
      window.navigateTime(direction);
    }
    return;
  }
  
  // NORMAL MODE: Handle zoom
  const f = e.deltaY < 0 ? 1.1 : 0.9; 
  const nz = Math.max(.01, Math.min(10, viewport.zoom * f)); 
  const hovered = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card'); 
  
  if (nz !== viewport.zoom) { 
    const old = viewport.zoom; 
    viewport.setViewport(undefined, undefined, nz); 
    
    // Check for zoom-out exit from timeline mode
    if (viewport.isTimelineMode && viewport.zoom <= 0.05 && old > 0.05) {
      // Exit timeline mode and return to ideal plane
      window.togglePlaneMode(); // This will handle switching back to ideal mode
      console.log('[Timeline] Exited timeline mode via zoom out');
      return;
    }
    
    if (hovered && viewport.zoom >= 3 && old < 3 && !viewport.isTimelineMode) { 
      const id = parseInt(hovered.id.split('-')[1]); 
      viewport.setViewport(undefined, undefined, 1); 
      viewport.enter(id); 
      render.renderPlane(viewport.currentPlane); 
      viewport.center(); 
    } else if (viewport.depth > 0 && viewport.zoom <= .5 && old > .5) { 
      viewport.setViewport(undefined, undefined, 1); 
      const prev = viewport.exit(); 
      render.renderPlane(viewport.currentPlane); 
      if (prev && prev.entered != null) {
        setTimeout(() => viewport.focusOn(prev.entered), 20); 
      }
    } else { 
      if (viewport.isTimelineMode) {
        // In temporal mode, allow normal zoom behavior
        const mx = e.clientX;
        const my = e.clientY; 
        
        const wxB = (mx - viewport.viewX) / old;
        const wyB = (my - viewport.viewY) / old;
        const wxA = (mx - viewport.viewX) / viewport.zoom;
        const wyA = (my - viewport.viewY) / viewport.zoom;
        
        viewport.setViewport(
          viewport.viewX + (wxA - wxB) * viewport.zoom, // Keep timeline centered
          viewport.viewY + (wyA - wyB) * viewport.zoom  // Zoom focus on Y-axis
        ); 
      } else {
        // Normal mode - zoom to both X and Y pointer position
        const mx = e.clientX, my = e.clientY; 
        const wxB = (mx - viewport.viewX) / old, wyB = (my - viewport.viewY) / old; 
        const wxA = (mx - viewport.viewX) / viewport.zoom, wyA = (my - viewport.viewY) / viewport.zoom; 
        viewport.setViewport(
          viewport.viewX + (wxA - wxB) * viewport.zoom,
          viewport.viewY + (wyA - wyB) * viewport.zoom
        ); 
      }
      
      viewport.updateView(); 
      viewport.updateHUD();
      
      // Update timeline labels when zoom changes in timeline mode
      if (viewport.isTimelineMode && window.updateTimelineLabels) {
        window.updateTimelineLabels();
      } 
    } 
  } 
}, {passive: false});

// ---------- Card Hydration ----------
export function hydrateCard(cardId) {
  const root = document.getElementById('card-' + cardId); 
  if (!root) return; 
  const card = data.byId(cardId);
  
  // Track if this card has been fully hydrated before
  const wasHydrated = root._fullyHydrated;
  
  // Setup dragging and selection - check if already bound
  if (!root._eventsBound) {
    root.addEventListener('mousedown', startCardDrag);
    root.addEventListener('click', selectCard);
    root._eventsBound = true;
  }
  
  // Text editing
  const t = root.querySelector('#txt-' + cardId);
  if (t && !t._eventsBound) {
    t.addEventListener('mousedown', e => { 
      e.stopPropagation(); 
      t.contentEditable = true; 
      t.classList.add('editing'); 
    });
    
    t.addEventListener('blur', () => { 
      card.content = t.innerText.trim(); 
      t.contentEditable = false; 
      t.classList.remove('editing'); 
      t.innerHTML = render.linkify(render.esc(card.content || ''), cardId); 
      if (viewport.currentPlane === cardId) viewport.showBG(); 
      // Notify persistence of change
      if (window.persistence) window.persistence.markDirty();
    });
    
    t.addEventListener('keydown', e => { 
      if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        t.blur(); 
      } 
    });
    t._eventsBound = true;
  }
  
  // Title editing with double-click
  const titleElement = root.querySelector('.card-title');
  if (titleElement && !titleElement._titleEventsBound) {
    let clickCount = 0;
    let clickTimer = null;
    
    titleElement.addEventListener('click', (e) => {
      e.stopPropagation();
      clickCount++;
      
      if (clickCount === 1) {
        clickTimer = setTimeout(() => {
          clickCount = 0;
        }, 300); // Reset after 300ms if no second click
      } else if (clickCount === 2) {
        clearTimeout(clickTimer);
        clickCount = 0;
        
        // Start editing
        const currentName = card.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'card-title-edit';
        
        // Get computed styles from the original title
        const titleStyles = getComputedStyle(titleElement);
        input.style.cssText = `
          background: transparent;
          border: none;
          outline: none;
          padding: 0;
          margin: 0;
          font-size: ${titleStyles.fontSize};
          font-weight: ${titleStyles.fontWeight};
          font-family: ${titleStyles.fontFamily};
          color: ${titleStyles.color};
          width: 100%;
          box-sizing: border-box;
        `;
        
        // Replace title with input
        titleElement.style.display = 'none';
        titleElement.parentNode.insertBefore(input, titleElement);
        
        // Focus and position cursor at end
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        
        // Save function
        const saveTitle = () => {
          const newName = input.value.trim();
          if (newName && newName !== currentName) {
            card.name = newName;
            titleElement.textContent = newName;
            
            // Trigger persistence
            if (window.persistence) window.persistence.markDirty();
            
            // Update all cards that reference this entity
            data.all.forEach(otherCard => {
              let needsUpdate = false;
              
              // Check if this card is linked to the renamed entity
              const links = data.links.get(otherCard.id);
              if (links && links.has(cardId)) {
                needsUpdate = true;
              }
              
              // Check if any attributes reference this entity
              if (otherCard.attributes) {
                otherCard.attributes.forEach(attr => {
                  if (attr.kind === 'entity' && attr.entityId === cardId) {
                    // Update the display value for entity attributes
                    attr.value = newName;
                    needsUpdate = true;
                  } else if (attr.kind === 'entityList' && attr.entityIds && attr.entityIds.includes(cardId)) {
                    // Update entity list display value
                    const entityNames = attr.entityIds.map(id => data.byId(id)?.name || '').filter(Boolean);
                    attr.value = entityNames.join(', ');
                    needsUpdate = true;
                  }
                });
              }
              
              // Check if content contains references to this entity (linkified text)
              if (otherCard.content && otherCard.content.includes(currentName)) {
                needsUpdate = true;
              }
              
              // Update the card's UI if it references the renamed entity
              if (needsUpdate) {
                render.updateCardUI(otherCard.id);
              }
            });
            
            // Also update this card's own UI in case it has self-references
            render.updateCardUI(cardId);
          }
          
          // Restore title display
          input.remove();
          titleElement.style.display = '';
        };
        
        // Handle input events
        input.addEventListener('blur', saveTitle);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            saveTitle();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            // Cancel editing
            input.remove();
            titleElement.style.display = '';
          }
        });
      }
    });
    
    titleElement._titleEventsBound = true;
  }
  
  // Attributes handling with custom dropdown
  const attrList = root.querySelector('#attrs-' + cardId);
  
  // Add focus/blur handling for the entire attribute section with better state management
  if (attrList && !attrList._focusHandlerBound) {
    // Function to check if all non-empty rows have keys
    const checkCanAddRow = () => {
      const rows = attrList.querySelectorAll('.attr-row:not(.empty-row):not(.inherited)');
      const allHaveKeys = Array.from(rows).every(row => {
        const keyInput = row.querySelector('.attr-key');
        return keyInput && keyInput.value.trim() !== '';
      });
      
      if (allHaveKeys) {
        attrList.classList.add('can-add-row');
      } else {
        attrList.classList.remove('can-add-row');
      }
      return allHaveKeys;
    };
    
    // Function to update focus state
    const updateAttrFocusState = () => {
      const activeEl = document.activeElement;
      const isAttrFocused = attrList.contains(activeEl) && 
                           (activeEl.classList.contains('attr-key') || 
                            activeEl.classList.contains('attr-val'));
      
      if (isAttrFocused) {
        attrList.classList.add('focused');
        checkCanAddRow(); // Check if we should show empty row
      } else {
        attrList.classList.remove('focused');
      }
    };
    
    // Initial check
    checkCanAddRow();
    
    // Track focus entering attributes
    attrList.addEventListener('focusin', function(e) {
      if (e.target.matches('.attr-key, .attr-val')) {
        this.classList.add('focused');
        checkCanAddRow();
      }
    });
    
    // Track focus leaving attributes
    attrList.addEventListener('focusout', function(e) {
      // Small delay to let focus settle
      setTimeout(() => {
        updateAttrFocusState();
      }, 10);
    });
    
    // Monitor key input changes to update can-add-row state
    attrList.addEventListener('input', function(e) {
      if (e.target.classList.contains('attr-key')) {
        checkCanAddRow();
      }
    });
    
    // Click handler for the card itself to handle clicks on other sections
    root.addEventListener('mousedown', function(e) {
      // If clicking outside attributes section but within the card
      if (!attrList.contains(e.target)) {
        // Remove focus from attributes
        attrList.classList.remove('focused');
        
        // Also blur any active attribute input
        const activeAttrInput = attrList.querySelector('.attr-key:focus, .attr-val:focus');
        if (activeAttrInput) {
          activeAttrInput.blur();
        }
      }
    }, true); // Use capture phase to handle before other handlers
    
    // Global click handler for clicks outside the card
    const globalClickHandler = function(e) {
      // If click is outside this card entirely, remove focus
      if (!root.contains(e.target)) {
        attrList.classList.remove('focused');
      }
    };
    
    // Add global click listener (removed when card is destroyed)
    document.addEventListener('click', globalClickHandler);
    attrList._globalClickHandler = globalClickHandler;
    
    attrList._focusHandlerBound = true;
  }
  
  root.querySelectorAll('#attrs-' + cardId + ' .attr-row').forEach((row, rowIndex) => {
    const inh = row.dataset.inh === '1'; 
    const k = row.querySelector('.attr-key'); 
    const v = row.querySelector('.attr-val');
    const dropdown = row.querySelector('.attr-dropdown');
    
    // Create unique ID for this row to track binding
    const rowId = `${cardId}-${rowIndex}-${inh}`;
    
    // Skip if already bound WITH THE SAME ID (prevents re-binding after updates)
    if (k._boundId === rowId) {
      return;
    }
    
    console.log(`[hydrateCard] Binding events for card ${cardId}, row ${rowIndex}, inherited: ${inh}, ID: ${rowId}`);
    
    // Add debug logging for input interactions
    k.addEventListener('focus', () => {
      console.log(`[INPUT_DEBUG] Key input focused - Card ${cardId}, Row ${rowIndex}, ID: ${rowId}`);
    });
    
    k.addEventListener('blur', () => {
      console.log(`[INPUT_DEBUG] Key input blurred - Card ${cardId}, Row ${rowIndex}, ID: ${rowId}`);
    });
    
    v.addEventListener('focus', () => {
      console.log(`[INPUT_DEBUG] Value input focused - Card ${cardId}, Row ${rowIndex}, ID: ${rowId}`);
    });
    
    v.addEventListener('blur', () => {
      console.log(`[INPUT_DEBUG] Value input blurred - Card ${cardId}, Row ${rowIndex}, ID: ${rowId}`);
    });
    
    // Mark with unique ID to prevent re-binding
    k._boundId = rowId;
    v._boundId = rowId;
    
    // Custom dropdown functionality for value input
    if (dropdown && v) {
      let currentIndex = -1;
      let dropdownItems = [];
      
      function updateDropdown() {
        const filter = v.value.toLowerCase();
        const linkedIds = Array.from(data.links.get(cardId) || new Set());
        const linkedEntities = linkedIds.map(id => data.byId(id)).filter(Boolean);
        
        // Filter matches
        const matches = linkedEntities.filter(e => 
          e.name.toLowerCase().includes(filter)
        );
        
        if (matches.length === 0 && filter) {
          dropdown.innerHTML = '<div class="attr-dropdown-empty">No matches</div>';
          dropdown.classList.remove('show');
          return;
        } else if (matches.length === 0) {
          dropdown.classList.remove('show');
          return;
        }
        
        // Build dropdown HTML
        dropdown.innerHTML = matches.map(e => 
          `<div class="attr-dropdown-item entity-match" data-value="${render.escAttr(e.name)}" data-entity-id="${e.id}" tabindex="-1">${render.esc(e.name)}</div>`
        ).join('');
        
        dropdown.classList.add('show');
        
        // Bind click handlers to dropdown items
        dropdownItems = dropdown.querySelectorAll('.attr-dropdown-item');
        dropdownItems.forEach((item, idx) => {
          // Use mousedown instead of click to fire before blur
          item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent focus change
            e.stopPropagation();
            v.value = item.dataset.value;
            dropdown.classList.remove('show');
            currentIndex = -1;
            // Small delay to ensure value is set
            setTimeout(() => commit(false), 10);
          });
        });
      }
      
      // Show dropdown on focus
      v.addEventListener('focus', () => {
        // Allow dropdown for inherited attributes too
        updateDropdown();
      });
      
      // Update dropdown on input
      v.addEventListener('input', () => {
        updateDropdown();
      });
      
      // Hide dropdown on blur (with delay for clicks)
      v.addEventListener('blur', (e) => {
        // Check if we're clicking on a dropdown item
        const relatedTarget = e.relatedTarget;
        if (relatedTarget && relatedTarget.closest('.attr-dropdown')) {
          return;
        }
        
        setTimeout(() => {
          if (dropdown) {
            dropdown.classList.remove('show');
            currentIndex = -1;
          }
        }, 200);
      });
      
      // Keyboard navigation for dropdown
      v.addEventListener('keydown', e => {
        const visibleItems = dropdown?.querySelectorAll('.attr-dropdown-item');
        if (dropdown?.classList.contains('show') && visibleItems && visibleItems.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentIndex = Math.min(currentIndex + 1, visibleItems.length - 1);
            updateActiveItem(visibleItems);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentIndex = Math.max(currentIndex - 1, -1);
            updateActiveItem(visibleItems);
          } else if (e.key === 'Escape') {
            dropdown.classList.remove('show');
            currentIndex = -1;
          }
        }
      });
      
      function updateActiveItem(items) {
        items.forEach((item, idx) => {
          item.classList.toggle('active', idx === currentIndex);
        });
        if (currentIndex >= 0 && items[currentIndex]) {
          items[currentIndex].scrollIntoView({ block: 'nearest' });
        }
      }
    }
    
    function commit(addNewRow = false) { 
      const key = (k.value || '').trim(); 
      const val = (v.value || '').trim(); 
      
      console.log(`[Commit] Starting commit for card ${cardId}, row idx: ${row.dataset.idx}`);
      console.log(`[Commit] Key: "${key}", Value: "${val}", AddNewRow: ${addNewRow}, Inherited: ${inh}`);
      console.log(`[Commit] Current card.attributes:`, card.attributes);
      
      if (inh) { 
        console.log(`[Commit] Processing inherited attribute`);
        // For inherited attributes, we ONLY store the override value
        if (!key) {
          console.log(`[Commit] Empty inherited key, returning`);
          return;
        }
        
        // Find if we already have an override for this key
        const existingIdx = (card.attributes || []).findIndex(a => a.key === key);
        
        // Handle list values (comma-separated)
        if (val && val.includes(',')) {
          // Split and clean up the list
          const values = val.split(',').map(v => v.trim()).filter(v => v);
          // Try to resolve each value as an entity
          const resolvedEntities = [];
          const entityIds = [];
          
          values.forEach(v => {
            const match = data.resolveEntityByNameFromLinked(v, cardId);
            if (match) {
              resolvedEntities.push(match.name);
              entityIds.push(match.id);
            } else {
              resolvedEntities.push(v);
              entityIds.push(null);
            }
          });
          
          const newAttr = {
            key, 
            value: resolvedEntities.join(', '), 
            kind: 'entityList', 
            entityIds: entityIds.filter(id => id !== null),
            values: resolvedEntities
          };
          
          if (existingIdx >= 0) {
            card.attributes[existingIdx] = newAttr;
          } else {
            card.attributes = card.attributes || [];
            card.attributes.push(newAttr);
          }
        } else {
          const match = data.resolveEntityByNameFromLinked(val, cardId); 
          console.log(`[Commit] Entity match for "${val}":`, match);
          
          if (!val) {
            // Empty value - remove the override if it exists
            if (existingIdx >= 0) {
              console.log(`[Commit] Removing override for inherited key "${key}"`);
              card.attributes.splice(existingIdx, 1);
            }
          } else {
            // Non-empty value - store as override
            const newAttr = match ? {key, value: match.name, kind: 'entity', entityId: match.id} : {key, value: val, kind: 'text'}; 
            
            if (existingIdx >= 0) {
              console.log(`[Commit] Updating existing override at index ${existingIdx}`);
              card.attributes[existingIdx] = newAttr; 
            } else { 
              console.log(`[Commit] Adding new override for inherited key`);
              card.attributes = card.attributes || []; 
              card.attributes.push(newAttr); 
            }
          }
        }
        
        console.log(`[Commit] About to update UI for inherited attribute`);
        render.updateCardUI(cardId); 
        return; 
      }
      
      // NON-INHERITED ATTRIBUTE HANDLING
      // The dataset.idx is for display purposes, but we need the actual data index
      const displayIdx = parseInt(row.dataset.idx);
      console.log(`[Commit] Processing non-inherited attribute at display index ${displayIdx}`);
      
      // Filter out any attributes that are actually overrides for inherited keys
      const effectiveAttrs = data.effectiveAttrs(cardId);
      const inheritedKeys = new Set(effectiveAttrs.filter(a => a.inherited).map(a => a.key));
      
      // Get only the TRUE own attributes (not overrides)
      const trueOwnAttributes = (card.attributes || []).filter(a => !inheritedKeys.has(a.key));
      
      console.log(`[Commit] Inherited keys:`, Array.from(inheritedKeys));
      console.log(`[Commit] True own attributes:`, trueOwnAttributes);
      
      // The actual index in the true own attributes array
      const actualIdx = displayIdx;
      
      // Handle empty rows (deletion)
      if (!key && !val) { 
        console.log(`[Commit] Empty row detected at display index ${displayIdx}`);
        console.log(`[Commit] True own attributes array length: ${trueOwnAttributes.length}`);
        
        // Check if this index exists in the true own attributes
        if (actualIdx < trueOwnAttributes.length) {
          // Find the key to remove from the full attributes array
          const keyToRemove = trueOwnAttributes[actualIdx].key;
          console.log(`[Commit] Removing attribute with key "${keyToRemove}"`);
          
          // Find and remove from the full attributes array
          const fullIdx = card.attributes.findIndex(a => a.key === keyToRemove && !inheritedKeys.has(a.key));
          if (fullIdx >= 0) {
            card.attributes.splice(fullIdx, 1);
          }
          
          // CASCADE DELETE: Also remove overrides of this key from all children
          const children = data.childrenOf.get(cardId);
          if (children && children.size > 0) {
            console.log(`[Commit] Cascading key deletion "${keyToRemove}" to ${children.size} children`);
            
            children.forEach(childId => {
              const childCard = data.byId(childId);
              if (childCard && childCard.attributes) {
                // Remove any override for this key in the child
                const childAttrIdx = childCard.attributes.findIndex(a => a.key === keyToRemove);
                if (childAttrIdx >= 0) {
                  console.log(`[Commit] Removing override for key "${keyToRemove}" from child ${childId}`);
                  childCard.attributes.splice(childAttrIdx, 1);
                }
              }
            });
          }
          
          // Update this card's UI (which will cascade to children automatically)
          render.updateCardUI(cardId);
          return;
        }
        
        // If it's the only empty row and no attributes exist, keep it as placeholder
        const allOwnRows = root.querySelectorAll('#attrs-' + cardId + ' .attr-row:not(.inherited)');
        if (allOwnRows.length === 1 && trueOwnAttributes.length === 0) {
          console.log(`[Commit] Keeping single empty row as placeholder`);
          return;
        }
        
        return; 
      }
      
      // Handle list values (comma-separated)
      let newAttr;
      if (val && val.includes(',')) {
        // Split and clean up the list
        const values = val.split(',').map(v => v.trim()).filter(v => v);
        // Try to resolve each value as an entity
        const resolvedEntities = [];
        const entityIds = [];
        
        values.forEach(v => {
          const match = data.resolveEntityByNameFromLinked(v, cardId);
          if (match) {
            resolvedEntities.push(match.name);
            entityIds.push(match.id);
          } else {
            resolvedEntities.push(v);
            entityIds.push(null);
          }
        });
        
        newAttr = {
          key, 
          value: resolvedEntities.join(', '), 
          kind: 'entityList', 
          entityIds: entityIds.filter(id => id !== null),
          values: resolvedEntities
        };
      } else {
        // Setting or updating a single attribute
        const match = data.resolveEntityByNameFromLinked(val, cardId); 
        console.log(`[Commit] Entity match for "${val}":`, match);
        
        newAttr = match ? {key, value: match.name, kind: 'entity', entityId: match.id} : {key, value: val, kind: 'text'};
      }
      
      // Ensure card.attributes exists
      if (!card.attributes) card.attributes = [];
      
      // If actualIdx is beyond the true own attributes, we're adding a new one
      if (actualIdx >= trueOwnAttributes.length) {
        console.log(`[Commit] Adding new attribute at end`);
        card.attributes.push(newAttr);
      } else {
        // Update existing - find the actual position in the full array
        const oldKey = trueOwnAttributes[actualIdx].key;
        const fullIdx = card.attributes.findIndex(a => a.key === oldKey && !inheritedKeys.has(a.key));
        if (fullIdx >= 0) {
          console.log(`[Commit] Updating attribute at full index ${fullIdx}`);
          
          // Check if the key is being renamed
          if (oldKey !== key) {
            console.log(`[Commit] Key renamed from "${oldKey}" to "${key}"`);
            
            // CASCADE RENAME: Update children's overrides to use new key name
            const children = data.childrenOf.get(cardId);
            if (children && children.size > 0) {
              console.log(`[Commit] Cascading key rename to ${children.size} children`);
              
              children.forEach(childId => {
                const childCard = data.byId(childId);
                if (childCard && childCard.attributes) {
                  // Find override with old key name
                  const childAttr = childCard.attributes.find(a => a.key === oldKey);
                  if (childAttr) {
                    console.log(`[Commit] Renaming key in child ${childId} from "${oldKey}" to "${key}"`);
                    childAttr.key = key;
                  }
                }
              });
            }
          }
          
          card.attributes[fullIdx] = newAttr;
        } else {
          // Shouldn't happen, but add as fallback
          card.attributes.push(newAttr);
        }
      }
      
      // Notify persistence of change
      if (window.persistence) window.persistence.markDirty();
      
      // Add new row on Enter with content
      if (addNewRow && key && val) {
        console.log(`[Commit] Checking if should add new row`);
        const updatedTrueOwn = card.attributes.filter(a => !inheritedKeys.has(a.key));
        console.log(`[Commit] Current true own attributes count: ${updatedTrueOwn.length}, display idx: ${displayIdx}`);
        
        // If we just edited the last row, add a new empty one
        if (displayIdx === updatedTrueOwn.length - 1) {
          console.log(`[Commit] Would add new empty row, triggering UI update`);
          render.updateCardUI(cardId, true);
          return;
        }
      }
      
      console.log(`[Commit] Final attributes:`, card.attributes);
      console.log(`[Commit] About to update UI`);
      render.updateCardUI(cardId); 
    }
    
    [k, v].forEach(inp => { 
      let isCommitting = false; // Prevent double commits
      
      inp.addEventListener('keydown', e => { 
        if (e.key === 'Enter') { 
          e.preventDefault(); 
          // If dropdown is open and item selected, use it
          const visibleItems = dropdown?.querySelectorAll('.attr-dropdown-item');
          if (dropdown?.classList.contains('show') && currentIndex >= 0 && visibleItems && visibleItems[currentIndex]) {
            v.value = visibleItems[currentIndex].dataset.value;
            dropdown.classList.remove('show');
            currentIndex = -1;
          }
          isCommitting = true;
          commit(true); // Create new row on Enter
          isCommitting = false;
        } else if (e.key === 'Backspace' && inp.value === '' && !inh) {
          const otherInp = (inp === k) ? v : k;
          if (otherInp.value === '') {
            e.preventDefault();
            isCommitting = true;
            commit(false);
            isCommitting = false;
          }
        }
      }); 
      
      inp.addEventListener('blur', () => {
        if (!isCommitting) {
          commit(false);
        }
      }); 
      
      // Note: inherited keys are readonly but values are editable
      if (inh && inp === k) { 
        inp.addEventListener('focus', () => inp.removeAttribute('readonly'), {once: true}); 
      }
      
      inp._eventsBound = true;
    });
    
    k._eventsBound = true;
  });

  // Representations section handlers
  const repsSection = root.querySelector('#reps-' + cardId);
  if (repsSection && !repsSection._eventsBound) {
    // Drag over handler
    repsSection.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.add('drag-over');
    });
    
    // Drag leave handler
    repsSection.addEventListener('dragleave', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.remove('drag-over');
    });
    
    // Drop handler for media files
    repsSection.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.remove('drag-over');
      
      const files = e.dataTransfer.files;
      const urls = e.dataTransfer.getData('text/uri-list');
      const url = e.dataTransfer.getData('text/plain');
      
      // Handle file drops
      if (files && files.length > 0) {
        Array.from(files).forEach(file => {
          if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
            // Read file as data URL instead of object URL for better persistence
            const reader = new FileReader();
            reader.onload = function(event) {
              const mediaUrl = event.target.result;
              if (data.addRepresentation(cardId, mediaUrl)) {
                render.updateCardUI(cardId);
                // Re-hydrate the card to bind new event handlers
                hydrateCard(cardId);
              }
            };
            reader.readAsDataURL(file);
          }
        });
      }
      // Handle URL drops
      else if (urls || url) {
        const mediaUrl = (urls || url).trim();
        // More permissive URL validation - accept any URL that might be an image/video
        if (mediaUrl.startsWith('http://') || 
            mediaUrl.startsWith('https://') || 
            mediaUrl.startsWith('data:')) {
          if (data.addRepresentation(cardId, mediaUrl)) {
            render.updateCardUI(cardId);
            // Re-hydrate the card to bind new event handlers
            hydrateCard(cardId);
          }
        }
      }
    });
    
    // Right-click to remove media
    repsSection.addEventListener('contextmenu', function(e) {
      const mediaItem = e.target.closest('.media-item');
      if (mediaItem) {
        e.preventDefault();
        e.stopPropagation();
        
        const index = parseInt(mediaItem.dataset.index);
        if (data.removeRepresentation(cardId, index)) {
          // Visual feedback
          mediaItem.style.opacity = '0.3';
          setTimeout(() => {
            render.updateCardUI(cardId);
          }, 200);
        }
      }
    });
    
    repsSection._eventsBound = true;
  }
  
  // Queue gallery initialization to be done asynchronously
  if (repsSection && !repsSection._galleryInitialized) {
    queueGalleryInit(cardId);
  }
  
  // Type pill handlers for breaking inheritance
  const typesContainer = root.querySelector('.card-types');
  if (typesContainer && !typesContainer._eventsBound) {
    typesContainer.addEventListener('contextmenu', function(e) {
      const pill = e.target.closest('.card-type-pill');
      if (pill && pill.dataset.parent) {
        e.preventDefault();
        e.stopPropagation();
        
        const parentId = parseInt(pill.dataset.parent);
        const childId = parseInt(typesContainer.dataset.cardId);
        
        // Remove the inheritance relationship
        data.removeParent(childId, parentId);
        
        // Visual feedback
        pill.style.opacity = '0.5';
        setTimeout(() => {
          // Update the card UI to reflect the change
          render.updateCardUI(childId);
        }, 200);
        
        console.log(`[hydrateCard] Removed inheritance from ${parentId} to ${childId}`);
      }
    });
    
    typesContainer._eventsBound = true;
  }
  
  // Linked entities handlers with drag support
  const linksContainer = root.querySelector('#links-' + cardId);
  if (!linksContainer) {
    return;
  }
  
  const linkItems = linksContainer.querySelectorAll('.link-item');
  
  linkItems.forEach((it, idx) => {
    // Skip if already bound or invalid
    if (it._eventsBound) return;
    if (!it.dataset.id || it.dataset.id === 'undefined') {
      return;
    }
    
    const linkId = parseInt(it.dataset.id);
    const linkName = it.textContent.trim();
    
    // Make link item draggable
    it.draggable = true;
    
    // Prevent default drag behavior and use our custom implementation
    it.addEventListener('mousedown', function(e) {
      e.stopPropagation(); // Prevent card from being dragged
      if (e.button === 0) { // Left click only
        startLinkEntityDrag(e, linkName, linkId, cardId);
      }
    });
    
    // Prevent browser's default drag
    it.addEventListener('dragstart', function(e) {
      e.preventDefault();
      e.stopPropagation();
    });
    
    // Right-click handler - unlink
    it.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      data.unlink(cardId, linkId);
      this.remove();
      
      const remainingLinks = linksContainer.querySelectorAll('.link-item');
      if (remainingLinks.length === 0) {
        linksContainer.innerHTML = '<div class="no-links">No linked entities<br><span style="opacity:.5;font-size:10px">Drag to bottom of another card to create link</span></div>';
      }
    });
    
    // Left-click handler - jump to linked entity
    it.addEventListener('click', function(e) { 
      e.preventDefault();
      e.stopPropagation();
      viewport.focusOn(linkId);
    });
    
    it._eventsBound = true;
  });
  
  // Bind pagination events if not already bound
  if (!wasHydrated && typeof window.AttrPagination === 'object' && window.AttrPagination.bindEvents) {
    window.AttrPagination.bindEvents(cardId);
  }
  
  // Mark card as fully hydrated
  root._fullyHydrated = true;
}

// ---------- Delete Selected ----------
export function deleteSelected() { 
  [...selected].forEach(id => {
    data.deleteCard(id);
    document.getElementById('card-' + id)?.remove(); 
    selected.delete(id); 
  });
  viewport.updateHUD(); 
}

// ---------- Initialize ----------
export function init() {
  // Hydrate all cards after initial render
  viewport.clones.forEach(v => hydrateCard(v.refId));
}