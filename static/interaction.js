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
  
  console.log(`[startCardDrag] Starting drag for card ${id}`);
  console.log(`[startCardDrag] Currently selected cards:`, Array.from(selected));
  
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
  
  console.log(`[startCardDrag] Dragging cards:`, dragIds);
  console.log(`[startCardDrag] Start position:`, {x: dragStartX, y: dragStartY});
  
  dragIds.forEach(cid => { 
    const ix = viewport.clones.findIndex(v => v.refId === cid); 
    const el = document.getElementById('card-' + cid); 
    if (ix >= 0 && el) { 
      el._ix = viewport.clones[ix].x; 
      el._iy = viewport.clones[ix].y; 
      console.log(`[startCardDrag] Card ${cid} initial position:`, {x: el._ix, y: el._iy});
    } 
  }); 
}

// ---------- Mouse Movement Handler ----------
document.addEventListener('mousemove', e => { 
  const coords = viewport.getWorldCoords(e.clientX, e.clientY);
  const wx = coords.wx, wy = coords.wy; 
  
  if (dragging) { 
    const dx = wx - dragStartX, dy = wy - dragStartY; 
    
    // Only log every 10th mousemove to avoid spam
    if (Math.random() < 0.1) {
      console.log(`[mousemove] Dragging active, delta:`, {dx, dy});
      console.log(`[mousemove] dragIds:`, dragIds);
    }
    
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
          console.log(`[mousemove] Added dragging class to card ${cid}`);
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
      console.log(`[mousemove] Clearing hover state from card ${hover.id}`);
      hover.classList.remove('drop-target', 'link-zone', 'contain-zone'); 
    } 
    
    // Check if hovering over a valid target (not one of the dragged cards)
    const newHoverId = t ? parseInt(t.id.split('-')[1]) : null;
    const isValidTarget = t && !dragIds.includes(newHoverId);
    
    if (t && !isValidTarget) {
      console.log(`[mousemove] Hovering over dragged card ${newHoverId}, ignoring`);
    }
    
    hover = isValidTarget ? t : null; 
    
    if (hover) { 
      const r = hover.getBoundingClientRect(); 
      const hoverCardId = parseInt(hover.id.split('-')[1]);
      
      // Check if we're in the link zone (bottom portion)
      const inLinkZone = e.clientY > r.bottom - LINK_ZONE_HEIGHT;
      
      console.log(`[mousemove] Hovering over card ${hoverCardId}`);
      console.log(`[mousemove] Mouse Y: ${e.clientY}, Card bottom: ${r.bottom}, Link zone start: ${r.bottom - LINK_ZONE_HEIGHT}`);
      console.log(`[mousemove] In link zone: ${inLinkZone}, LINK_ZONE_HEIGHT: ${LINK_ZONE_HEIGHT}`);
      
      // Visual feedback based on zone
      if (inLinkZone) {
        hover.classList.remove('contain-zone');
        hover.classList.add('drop-target', 'link-zone');
        console.log(`[mousemove] Applied link-zone classes to card ${hoverCardId}`);
      } else {
        // Contain zone (rest of the card)
        hover.classList.remove('link-zone');
        hover.classList.add('drop-target', 'contain-zone');
        console.log(`[mousemove] Applied contain-zone classes to card ${hoverCardId}`);
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
  console.log(`[mouseup] Mouse up event, dragging: ${dragging}, hover: ${hover ? hover.id : 'none'}`);
  
  if (dragging) { 
    console.log(`[mouseup] Ending drag, dragIds:`, dragIds);
    viewport.saveCurrentLayout(); 
    
    // Remove dragging class from all dragged cards
    dragIds.forEach(cid => {
      const el = document.getElementById('card-' + cid);
      if (el) {
        el.classList.remove('dragging');
        console.log(`[mouseup] Removed dragging class from card ${cid}`);
      }
    });
    
    if (hover && dragIds.length > 0) { 
      const targetId = parseInt(hover.id.split('-')[1]); 
      const sourceId = dragIds[0]; // Use first selected card
      
      console.log(`[mouseup] Drop detected!`);
      console.log(`[mouseup] Source card: ${sourceId}, Target card: ${targetId}`);
      console.log(`[mouseup] Hover element classes:`, hover.className);
      
      if (targetId && sourceId && targetId !== sourceId) { 
        const r = hover.getBoundingClientRect(); 
        const inLinkZone = e.clientY > r.bottom - LINK_ZONE_HEIGHT;
        
        console.log(`[mouseup] Drop position analysis:`);
        console.log(`  Mouse Y: ${e.clientY}`);
        console.log(`  Card bottom: ${r.bottom}`);
        console.log(`  Link zone starts at: ${r.bottom - LINK_ZONE_HEIGHT}`);
        console.log(`  LINK_ZONE_HEIGHT: ${LINK_ZONE_HEIGHT}`);
        console.log(`  In link zone: ${inLinkZone}`);
        
        // Determine action based on drop position
        if (inLinkZone) {
          // Link the entities - TARGET gets link to SOURCE (dragged card appears in target's links)
          console.log(`[mouseup] LINKING: card ${targetId} will show card ${sourceId} in its links`);
          
          // Check current links before
          console.log(`[mouseup] Before link - Target ${targetId} links:`, Array.from(data.links.get(targetId) || new Set()));
          
          data.link(targetId, sourceId); // REVERSED - target links to source
          
          // Check current links after
          console.log(`[mouseup] After link - Target ${targetId} now links to:`, Array.from(data.links.get(targetId) || new Set()));
          
          // Visual feedback - flash both cards
          const sourceEl = document.getElementById('card-' + sourceId);
          const targetEl = document.getElementById('card-' + targetId);
          
          if (sourceEl) {
            sourceEl.style.boxShadow = '0 0 30px rgba(0,255,136,.8)';
            setTimeout(() => sourceEl.style.boxShadow = '', 400);
            console.log(`[mouseup] Applied link flash to source card ${sourceId}`);
          }
          if (targetEl) {
            targetEl.style.boxShadow = '0 0 30px rgba(0,255,136,.8)';
            setTimeout(() => targetEl.style.boxShadow = '', 400);
            console.log(`[mouseup] Applied link flash to target card ${targetId}`);
          }
        } else {
          // Contain: make source a child of target (but keep it visible on current plane too)
          console.log(`[mouseup] CONTAINING card ${sourceId} inside card ${targetId}`);
          console.log(`[mouseup] Card will be mirrored (visible on both planes)`);
          
          data.contain(targetId, sourceId); 
          
          // DON'T remove from current plane - keep it visible here
          // Just update the containment relationship
          console.log(`[mouseup] Card ${sourceId} is now child of ${targetId} but remains visible on current plane`);
          
          // Visual feedback - flash container
          const targetEl = document.getElementById('card-' + targetId);
          if (targetEl) {
            targetEl.style.boxShadow = '0 0 30px rgba(255,90,90,.8)';
            setTimeout(() => targetEl.style.boxShadow = '', 400);
            console.log(`[mouseup] Applied contain flash to target card ${targetId}`);
          }
          
          // Visual feedback - also flash the contained card with a different color
          const sourceEl = document.getElementById('card-' + sourceId);
          if (sourceEl) {
            sourceEl.style.boxShadow = '0 0 20px rgba(255,90,90,.5)';
            setTimeout(() => sourceEl.style.boxShadow = '', 400);
            console.log(`[mouseup] Applied contained flash to source card ${sourceId}`);
          }
          
          // Don't re-render the plane - card stays visible
        }
        
        // Update both cards' UI to show the new relationship
        console.log(`[mouseup] Updating UI for both cards`);
        render.updateCardUI(sourceId); 
        render.updateCardUI(targetId); 
      } else {
        console.log(`[mouseup] Invalid drop - same card or missing IDs`);
      }
      
      console.log(`[mouseup] Clearing hover classes from card ${hover.id}`);
      hover.classList.remove('drop-target', 'link-zone', 'contain-zone'); 
      hover = null; 
    } else {
      console.log(`[mouseup] No valid drop target`);
    }
    
    dragging = false; 
    dragIds = []; 
    console.log(`[mouseup] Drag state reset`);
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
  console.log(`[hydrateCard] Starting hydration for card ${cardId}`);
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
      console.log(`[hydrateCard] Row ${rowIndex} already bound with ID ${rowId}, skipping`);
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
      
      console.log(`[Dropdown] Initializing dropdown for card ${cardId}, row idx: ${row.dataset.idx}`);
      
      function updateDropdown() {
        const filter = v.value.toLowerCase();
        const linkedIds = Array.from(data.links.get(cardId) || new Set());
        const linkedEntities = linkedIds.map(id => data.byId(id)).filter(Boolean);
        
        console.log(`[Dropdown] UpdateDropdown - Card ${cardId}, Filter: "${filter}"`);
        console.log(`[Dropdown] Linked IDs:`, linkedIds);
        console.log(`[Dropdown] Linked Entities:`, linkedEntities.map(e => ({id: e.id, name: e.name})));
        
        // Filter matches
        const matches = linkedEntities.filter(e => 
          e.name.toLowerCase().includes(filter)
        );
        
        console.log(`[Dropdown] Matches found:`, matches.map(e => ({id: e.id, name: e.name})));
        
        if (matches.length === 0 && filter) {
          console.log(`[Dropdown] No matches for filter "${filter}"`);
          dropdown.innerHTML = '<div class="attr-dropdown-empty">No matches</div>';
          dropdown.classList.remove('show');
          return;
        } else if (matches.length === 0) {
          console.log(`[Dropdown] No linked entities to show`);
          dropdown.classList.remove('show');
          return;
        }
        
        // Build dropdown HTML
        dropdown.innerHTML = matches.map(e => 
          `<div class="attr-dropdown-item entity-match" data-value="${render.escAttr(e.name)}" data-entity-id="${e.id}" tabindex="-1">${render.esc(e.name)}</div>`
        ).join('');
        
        dropdown.classList.add('show');
        console.log(`[Dropdown] Showing dropdown with ${matches.length} items`);
        
        // Bind click handlers to dropdown items
        dropdownItems = dropdown.querySelectorAll('.attr-dropdown-item');
        dropdownItems.forEach((item, idx) => {
          // Use mousedown instead of click to fire before blur
          item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent focus change
            e.stopPropagation();
            console.log(`[Dropdown] Mousedown on item ${idx}: "${item.dataset.value}", entity ID: ${item.dataset.entityId}`);
            v.value = item.dataset.value;
            dropdown.classList.remove('show');
            currentIndex = -1;
            console.log(`[Dropdown] About to commit after selection`);
            // Small delay to ensure value is set
            setTimeout(() => commit(false), 10);
          });
        });
      }
      
      // Show dropdown on focus
      v.addEventListener('focus', () => {
        console.log(`[Dropdown] Focus event on value input for card ${cardId}`);
        if (!inh) {
          console.log(`[Dropdown] Not inherited, updating dropdown`);
          updateDropdown();
        } else {
          console.log(`[Dropdown] Inherited attribute, skipping dropdown`);
        }
      });
      
      // Update dropdown on input
      v.addEventListener('input', () => {
        console.log(`[Dropdown] Input event on value input for card ${cardId}, value: "${v.value}"`);
        if (!inh) updateDropdown();
      });
      
      // Hide dropdown on blur (with delay for clicks)
      v.addEventListener('blur', (e) => {
        console.log(`[Dropdown] Blur event on value input for card ${cardId}`);
        // Check if we're clicking on a dropdown item
        const relatedTarget = e.relatedTarget;
        if (relatedTarget && relatedTarget.closest('.attr-dropdown')) {
          console.log(`[Dropdown] Blur but clicking dropdown, not hiding`);
          return;
        }
        
        setTimeout(() => {
          console.log(`[Dropdown] Hiding dropdown after blur delay`);
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
        if (!key && !val) {
          console.log(`[Commit] Empty inherited attribute, returning`);
          return;
        }
        const match = data.resolveEntityByNameFromLinked(val, cardId); 
        console.log(`[Commit] Entity match for "${val}":`, match);
        const newAttr = match ? {key, value: match.name, kind: 'entity', entityId: match.id} : {key, value: val, kind: 'text'}; 
        const ix = (card.attributes || []).findIndex(a => a.key === key); 
        if (ix >= 0) {
          console.log(`[Commit] Updating existing attribute at index ${ix}`);
          card.attributes[ix] = newAttr; 
        } else { 
          console.log(`[Commit] Adding new attribute`);
          card.attributes = card.attributes || []; 
          card.attributes.push(newAttr); 
        } 
        console.log(`[Commit] About to update UI for inherited attribute`);
        render.updateCardUI(cardId); 
        return; 
      }
      
      const idx = parseInt(row.dataset.idx);
      console.log(`[Commit] Processing non-inherited attribute at index ${idx}`);
      
      // Handle empty rows
      if (!key && !val) { 
        console.log(`[Commit] Empty row detected`);
        const allRows = root.querySelectorAll('#attrs-' + cardId + ' .attr-row:not(.inherited)');
        console.log(`[Commit] Total non-inherited rows: ${allRows.length}`);
        console.log(`[Commit] Current attributes length: ${(card.attributes || []).length}`);
        
        // Only remove if there are multiple rows OR this is an existing attribute
        if (allRows.length > 1 && idx < (card.attributes || []).length) {
          console.log(`[Commit] Removing attribute at index ${idx}`);
          card.attributes.splice(idx, 1); 
          render.updateCardUI(cardId); 
        } else if (allRows.length === 1 && (card.attributes || []).length === 0) {
          // This is the empty row, ensure we have an empty attribute
          console.log(`[Commit] Ensuring empty attribute for empty row`);
          card.attributes = [{key: '', value: '', kind: 'text'}];
        } else if (allRows.length === 1 && idx === 0 && (card.attributes || []).length === 1) {
          // Single row being cleared - keep it but make it empty
          console.log(`[Commit] Keeping single empty row`);
          card.attributes[0] = {key: '', value: '', kind: 'text'};
          // Don't update UI to avoid re-render loop
        }
        return; 
      }
      
      const match = data.resolveEntityByNameFromLinked(val, cardId); 
      console.log(`[Commit] Entity match for "${val}":`, match);
      
      if (!card.attributes) card.attributes = []; 
      const newAttr = match ? {key, value: match.name, kind: 'entity', entityId: match.id} : {key, value: val, kind: 'text'};
      console.log(`[Commit] Setting attribute at index ${idx}:`, newAttr);
      card.attributes[idx] = newAttr; 
      
      // Add new row on Enter with content
      if (addNewRow && key && val) {
        console.log(`[Commit] Checking if should add new row`);
        const nonInheritedAttrs = (card.attributes || []).filter(a => !a.inherited);
        console.log(`[Commit] Non-inherited attrs count: ${nonInheritedAttrs.length}, current idx: ${idx}`);
        if (idx === nonInheritedAttrs.length - 1) {
          console.log(`[Commit] Adding new empty row`);
          card.attributes.push({key: '', value: '', kind: 'text'});
          render.updateCardUI(cardId, true);
          return;
        }
      }
      
      console.log(`[Commit] Final attributes before UI update:`, card.attributes);
      console.log(`[Commit] About to update UI`);
      render.updateCardUI(cardId); 
    }
    
    [k, v].forEach(inp => { 
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
          commit(true); // Create new row on Enter
        } else if (e.key === 'Backspace' && inp.value === '' && !inh) {
          const otherInp = (inp === k) ? v : k;
          if (otherInp.value === '') {
            e.preventDefault();
            commit(false);
          }
        }
      }); 
      
      inp.addEventListener('blur', () => commit(false)); 
      
      if (inh) { 
        inp.addEventListener('focus', () => inp.removeAttribute('readonly'), {once: true}); 
      }
      
      inp._eventsBound = true;
    });
    
    k._eventsBound = true;
  });

  // Linked entities handlers
  const linksContainer = root.querySelector('#links-' + cardId);
  if (!linksContainer) {
    console.log(`[hydrateCard] No links container found for card ${cardId}`);
    return;
  }
  
  const linkItems = linksContainer.querySelectorAll('.link-item');
  console.log(`[hydrateCard] Card ${cardId} has ${linkItems.length} linked items`);
  
  linkItems.forEach((it, idx) => {
    // Skip if already bound or invalid
    if (it._eventsBound) return;
    if (!it.dataset.id || it.dataset.id === 'undefined') {
      console.log(`  Skipping item ${idx} - invalid data-id: "${it.dataset.id}"`);
      return;
    }
    
    const linkId = parseInt(it.dataset.id);
    console.log(`  Adding listeners to item ${idx} with data-id="${linkId}"`);
    
    // Right-click handler - unlink
    it.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      console.log(`[contextmenu] Card ${cardId} removing link to ${linkId}`);
      
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
      console.log(`[click] Card ${cardId} jumping to linked entity ${linkId}`);
      viewport.focusOn(linkId);
    });
    
    it._eventsBound = true;
  });
  
  // Mark card as fully hydrated
  root._fullyHydrated = true;
  console.log(`[hydrateCard] Completed hydration for card ${cardId}`);
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