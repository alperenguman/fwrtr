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
const LINK_ZONE = 40;

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
      } 
    }); 
    
    // Better hover detection
    const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card'); 
    
    if (hover && t !== hover) { 
      hover.classList.remove('drop-target', 'link-zone'); 
    } 
    
    hover = (t && !dragIds.includes(parseInt(t.id.split('-')[1]))) ? t : null; 
    
    if (hover) { 
      const r = hover.getBoundingClientRect(); 
      // Check if we're in the link zone (bottom portion)
      if (e.clientY > r.bottom - LINK_ZONE) {
        hover.classList.add('drop-target', 'link-zone'); 
      } else {
        hover.classList.add('drop-target'); 
        hover.classList.remove('link-zone'); 
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
    
    if (hover && dragIds.length > 0) { 
      const targetId = parseInt(hover.id.split('-')[1]); 
      const sourceId = dragIds[0]; // Use first selected card
      
      if (targetId && sourceId && targetId !== sourceId) { 
        const r = hover.getBoundingClientRect(); 
        
        // Determine action based on drop position
        if (e.clientY > r.bottom - LINK_ZONE) {
          // Link the entities
          data.link(sourceId, targetId); 
        } else {
          // Contain: make source a child of target
          data.contain(targetId, sourceId); 
          // Remove from current plane and re-render
          const lay = viewport.ensureLayout(viewport.currentPlane);
          lay.cards = lay.cards.filter(v => v.refId !== sourceId);
          render.renderPlane(viewport.currentPlane);
        }
        
        render.updateCardUI(sourceId); 
        render.updateCardUI(targetId); 
      } 
      
      hover.classList.remove('drop-target', 'link-zone'); 
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
  console.log(`[hydrateCard] Starting hydration for card ${cardId}`);
  const root = document.getElementById('card-' + cardId); 
  if (!root) return; 
  const card = data.byId(cardId);
  
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
  
  // Attributes handling
  root.querySelectorAll('#attrs-' + cardId + ' .attr-row').forEach(row => {
    const inh = row.dataset.inh === '1'; 
    const k = row.querySelector('.attr-key'); 
    const v = row.querySelector('.attr-val');
    
    // Skip if already bound
    if (k._eventsBound) return;
    
    function commit(addNewRow = false) { 
      const key = (k.value || '').trim(); 
      const val = (v.value || '').trim(); 
      
      if (inh) { 
        if (!key && !val) return;
        const match = data.resolveEntityByNameFromLinked(val, cardId); 
        const newAttr = match ? {key, value: match.name, kind: 'entity', entityId: match.id} : {key, value: val, kind: 'text'}; 
        const ix = (card.attributes || []).findIndex(a => a.key === key); 
        if (ix >= 0) {
          card.attributes[ix] = newAttr; 
        } else { 
          card.attributes = card.attributes || []; 
          card.attributes.push(newAttr); 
        } 
        render.updateCardUI(cardId); 
        return; 
      }
      
      const idx = parseInt(row.dataset.idx);
      
      // Handle empty rows
      if (!key && !val) { 
        const allRows = root.querySelectorAll('#attrs-' + cardId + ' .attr-row:not(.inherited)');
        if (allRows.length > 1 || (card.attributes && card.attributes.length > 0)) {
          if (idx < (card.attributes || []).length) { 
            card.attributes.splice(idx, 1); 
            render.updateCardUI(cardId); 
          }
        }
        return; 
      }
      
      const match = data.resolveEntityByNameFromLinked(val, cardId); 
      if (!card.attributes) card.attributes = []; 
      card.attributes[idx] = match ? {key, value: match.name, kind: 'entity', entityId: match.id} : {key, value: val, kind: 'text'}; 
      
      // Add new row on Enter with content
      if (addNewRow && key && val) {
        const nonInheritedAttrs = (card.attributes || []).filter(a => !a.inherited);
        if (idx === nonInheritedAttrs.length - 1) {
          card.attributes.push({key: '', value: '', kind: 'text'});
          render.updateCardUI(cardId, true);
          return;
        }
      }
      
      render.updateCardUI(cardId); 
    }
    
    [k, v].forEach(inp => { 
      inp.addEventListener('keydown', e => { 
        if (e.key === 'Enter') { 
          e.preventDefault(); 
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
      
      console.log(`[contextmenu] Card ${cardId} unlinking from ${linkId}`);
      
      data.unlink(cardId, linkId);
      this.remove();
      
      const remainingLinks = linksContainer.querySelectorAll('.link-item');
      if (remainingLinks.length === 0) {
        linksContainer.innerHTML = '<div class="no-links" style="opacity:.6">No linked entities</div>';
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