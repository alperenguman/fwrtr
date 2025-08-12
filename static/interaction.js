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

// ---------- Plane Dragging ----------
let draggingPlane = false, planeStartX = 0, planeStartY = 0;

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
  if (e.button !== 0) return; 
  if (e.target.closest('.card-text') || e.target.tagName === 'INPUT') return; 
  
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

// ---------- Mouse Movement Handler ----------
document.addEventListener('mousemove', e => { 
  const coords = viewport.getWorldCoords(e.clientX, e.clientY);
  const wx = coords.wx, wy = coords.wy; 
  
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
    viewport.setViewport(viewport.viewX + dx, viewport.viewY + dy); 
    planeStartX = e.clientX; 
    planeStartY = e.clientY; 
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
      
      hover.classList.remove('drop-target', 'link-zone', 'contain-zone'); 
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

// ---------- Wheel Zoom ----------
plane.addEventListener('wheel', e => { 
  e.preventDefault(); 
  const f = e.deltaY < 0 ? 1.1 : 0.9; 
  const nz = Math.max(.1, Math.min(10, viewport.zoom * f)); 
  const hovered = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card'); 
  
  if (nz !== viewport.zoom) { 
    const old = viewport.zoom; 
    viewport.setViewport(undefined, undefined, nz); 
    
    if (hovered && viewport.zoom >= 3 && old < 3 && viewport.depth === 0) { 
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
      const mx = e.clientX, my = e.clientY; 
      const wxB = (mx - viewport.viewX) / old, wyB = (my - viewport.viewY) / old; 
      const wxA = (mx - viewport.viewX) / viewport.zoom, wyA = (my - viewport.viewY) / viewport.zoom; 
      viewport.setViewport(
        viewport.viewX + (wxA - wxB) * viewport.zoom,
        viewport.viewY + (wyA - wyB) * viewport.zoom
      ); 
      viewport.updateView(); 
      viewport.updateHUD(); 
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
    });
    
    t.addEventListener('keydown', e => { 
      if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        t.blur(); 
      } 
    });
    t._eventsBound = true;
  }
  
  // Attributes handling with custom dropdown
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
        if (!inh) {
          updateDropdown();
        }
      });
      
      // Update dropdown on input
      v.addEventListener('input', () => {
        if (!inh) updateDropdown();
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
      
      // Setting or updating an attribute
      const match = data.resolveEntityByNameFromLinked(val, cardId); 
      console.log(`[Commit] Entity match for "${val}":`, match);
      
      const newAttr = match ? {key, value: match.name, kind: 'entity', entityId: match.id} : {key, value: val, kind: 'text'};
      
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
          card.attributes[fullIdx] = newAttr;
        } else {
          // Shouldn't happen, but add as fallback
          card.attributes.push(newAttr);
        }
      }
      
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

  // Linked entities handlers
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
    
    // Right-click handler - unlink
    it.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      data.unlink(cardId, linkId);
      this.remove();
      
      const remainingLinks = linksContainer.querySelectorAll('.link-item');
      if (remainingLinks.length === 0) {
        linksContainer.innerHTML = '<div class="no-links" style="opacity:.6;font-size:11px">No linked entities<br><span style="opacity:.5;font-size:10px">Drag to bottom of another card to create link</span></div>';
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