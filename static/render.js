// render.js - Rendering & DOM Generation
// Handles all HTML generation, text processing, and card rendering

import * as data from './data.js';
import * as viewport from './viewport.js';

// ---------- Text Processing ----------
export const esc = s => (s || '').replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]));
export const escAttr = s => ('' + s).replace(/"/g, '&quot;');
export const escRe = s => (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- Text Linkify ----------
export function linkify(text, selfId) { 
  let out = text; 
  data.all.forEach(k => { 
    if (!k.name || k.id === selfId) return; 
    const re = new RegExp('\\b' + escRe(k.name) + '\\b', 'gi'); 
    // Use window.focusOn for global access
    out = out.replace(re, m => `<span class="entity-link" onclick="window.focusOn(${k.id})">${m}</span>`); 
  }); 
  return out; 
}

// ---------- Plane Rendering ----------
export function renderPlane(pid) { 
  viewport.setCurrentPlane(pid ?? null); 
  const plane = document.getElementById('plane');
  plane.innerHTML = ''; 
  viewport.setClones([]); 
  
  const ids = data.visibleIds(viewport.currentPlane); 
  const lay = viewport.ensureLayout(viewport.currentPlane); 
  
  // Filter out cards that are no longer visible
  lay.cards = lay.cards.filter(v => ids.includes(v.refId)); 
  
  // Add missing cards in a circle
  const missing = ids.filter(id => !lay.cards.find(v => v.refId === id)); 
  if (missing.length) { 
    const r = 240, step = (Math.PI * 2) / missing.length; 
    let a = 0; 
    missing.forEach(id => { 
      lay.cards.push({refId: id, x: Math.cos(a) * r, y: Math.sin(a) * r}); 
      a += step; 
    }); 
  }
  
  viewport.setClones(lay.cards.map(v => ({...v}))); 
  viewport.setViewport(lay.viewX || 0, lay.viewY || 0, 1); 
  
  viewport.clones.forEach(v => renderCard(v)); 
  
  // Hydrate all cards after rendering
  setTimeout(() => {
    viewport.clones.forEach(v => {
      if (typeof window.hydrateCard === 'function') {
        window.hydrateCard(v.refId);
      }
    });
  }, 0);
  
  viewport.showBG(); 
  viewport.updateView(); 
  viewport.updateHUD(); 
}

// ---------- Card Rendering ----------
export function renderCard(v) { 
  const c = data.byId(v.refId); 
  if (!c) return; 
  
  const el = document.createElement('div'); 
  el.className = 'card'; 
  el.id = 'card-' + c.id; 
  el.style.setProperty('--x', v.x + 'px'); 
  el.style.setProperty('--y', v.y + 'px'); 
  
  el.innerHTML = `
    <div class="card-header">
      <span class="card-title">${esc(c.name)}</span>
      <div class="card-actions"><button class="card-action danger" onclick="deleteCard(${c.id})">×</button></div>
    </div>
    <div class="card-content">
      <div class="card-type">${esc(c.type || 'entity')}</div>

      <div class="section-header" onclick="toggleSection('attrs',${c.id})">
        <span class="caret down" id="caret-attrs-${c.id}">▶</span> Attributes
      </div>
      <div class="attr-list" id="attrs-${c.id}">${renderAttrRows(c)}</div>

      <div class="card-text" id="txt-${c.id}">${linkify(esc(c.content || ''), c.id)}</div>

      <div class="section-header" onclick="toggleSection('links',${c.id})">
        <span class="caret down" id="caret-links-${c.id}">▶</span> Linked Entities
      </div>
      <div class="link-list" id="links-${c.id}">${renderLinks(c.id)}</div>
    </div>`;
  
  const plane = document.getElementById('plane');
  plane.appendChild(el);
  
  // Note: Event handlers will be attached by interaction.js
}

// Get options only from linked entities - NO LONGER NEEDED
export function getLinkedEntitiesOptions(cardId) {
  const linkedIds = Array.from(data.links.get(cardId) || new Set());
  return linkedIds.map(id => data.byId(id)).filter(Boolean).map(e => `<option value="${escAttr(e.name)}">`).join('');
}

// Proper attribute row rendering with custom dropdown
export function renderAttrRows(card) {
  const attrs = data.effectiveAttrs(card.id);
  
  // If no attributes at all, show one empty editable row
  if (attrs.length === 0) {
    return `<div class="attr-row" data-idx="0">
      <input class="attr-key" value="" placeholder="key">
      <div class="attr-dropdown-wrapper">
        <input class="attr-val" value="" placeholder="value" autocomplete="off">
        <div class="attr-dropdown" id="dropdown-${card.id}-0"></div>
      </div>
    </div>`;
  }
  
  // Render existing attributes
  const rows = attrs.map((a, i) => {
    const inh = a.inherited; 
    const ent = a.kind === 'entity';
    return `<div class="attr-row ${inh ? 'inherited' : ''}" data-idx="${i}" ${inh ? 'data-inh="1"' : ''}>
      <input class="attr-key" ${inh ? 'readonly' : ''} value="${escAttr(a.key || '')}" placeholder="key">
      <div class="attr-dropdown-wrapper">
        <input class="attr-val ${ent ? 'entity' : ''}" ${inh ? 'readonly' : ''} value="${escAttr(ent ? (data.byId(a.entityId)?.name || a.value) : (a.value || ''))}" placeholder="value" autocomplete="off">
        ${!inh ? `<div class="attr-dropdown" id="dropdown-${card.id}-${i}"></div>` : ''}
      </div>
    </div>`;
  }).join('');
  
  return rows;
}

export function renderLinks(cardId) { 
  const set = data.links.get(cardId) || new Set(); 
  if (!set.size) return '<div class="no-links" style="opacity:.6">No linked entities</div>'; 
  return Array.from(set).map(id => `<div class="link-item" data-id="${id}">${esc(data.byId(id)?.name || '')}</div>`).join(''); 
}

// ---------- UI Updates ----------
export function updateCardUI(cardId, focusNew = false) { 
  console.log(`[updateCardUI] Starting update for card ${cardId}, focusNew: ${focusNew}`);
  const c = data.byId(cardId); 
  const el = document.getElementById('card-' + cardId); 
  if (!c || !el) {
    console.log(`[updateCardUI] Card ${cardId} not found in data or DOM`);
    return;
  }
  
  console.log(`[updateCardUI] Card data:`, {
    id: c.id,
    name: c.name,
    type: c.type,
    attributes: c.attributes
  });
  console.log(`[updateCardUI] Current links for card ${cardId}:`, Array.from(data.links.get(cardId) || new Set()));
  
  el.querySelector('.card-title').textContent = c.name; 
  el.querySelector('.card-type').textContent = c.type || 'entity'; 
  
  console.log(`[updateCardUI] Updating HTML for card ${cardId}`);
  console.log(`[updateCardUI] About to render attributes:`, c.attributes);
  
  const oldAttrsHTML = el.querySelector('#attrs-' + cardId).innerHTML;
  const newAttrsHTML = renderAttrRows(c);
  
  if (oldAttrsHTML !== newAttrsHTML) {
    console.log(`[updateCardUI] Attributes HTML changed, updating`);
    el.querySelector('#attrs-' + cardId).innerHTML = newAttrsHTML;
  } else {
    console.log(`[updateCardUI] Attributes HTML unchanged`);
  }
  
  el.querySelector('#links-' + cardId).innerHTML = renderLinks(cardId); 
  el.querySelector('#txt-' + cardId).innerHTML = linkify(esc(c.content || ''), cardId); 
  
  // Re-hydrate the card
  console.log(`[updateCardUI] Re-hydrating card ${cardId}`);
  if (typeof window.hydrateCard === 'function') {
    window.hydrateCard(cardId);
  }
  
  if (focusNew) { 
    console.log(`[updateCardUI] Focusing new row`);
    const rows = el.querySelectorAll('#attrs-' + cardId + ' .attr-row'); 
    const last = rows[rows.length - 1]; 
    last?.querySelector('.attr-key')?.focus(); 
  }
  
  console.log(`[updateCardUI] Completed update for card ${cardId}`);
}

// ---------- Section Toggle ----------
export function toggleSection(kind, id) { 
  const caret = document.getElementById(`caret-${kind}-${id}`); 
  const body = document.getElementById(`${kind}-${id}`); 
  if (!caret || !body) return; 
  
  const open = getComputedStyle(body).display !== 'none'; 
  body.style.display = open ? 'none' : 'block'; 
  caret.classList.toggle('down', !open); 
  
  // If opening attributes and it's empty, ensure empty row exists
  if (!open && kind === 'attrs') {
    const card = data.byId(id);
    if (card) {
      const attrs = data.effectiveAttrs(id);
      // If no attributes at all (not even inherited), ensure we have an empty one
      if (attrs.length === 0 && (!card.attributes || card.attributes.length === 0)) {
        card.attributes = [{key: '', value: '', kind: 'text'}];
        updateCardUI(id);
      }
    }
  }
}