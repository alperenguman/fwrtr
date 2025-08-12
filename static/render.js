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
  console.log(`\n[renderAttrRows] ====== Rendering attributes for card ${card.id} (${card.name}) ======`);
  
  const attrs = data.effectiveAttrs(card.id);
  console.log(`[renderAttrRows] Got ${attrs.length} effective attributes`);
  
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
  
  // Separate inherited and owned attributes - DON'T SORT, keep their original order
  const inherited = attrs.filter(a => a.inherited);
  const owned = attrs.filter(a => !a.inherited);
  
  console.log(`[renderAttrRows] Own attributes: ${owned.length}, Inherited: ${inherited.length}`);
  
  let html = '';
  let displayIdx = 0;
  
  // Render inherited attributes first (they use special indices)
  inherited.forEach((a, i) => {
    const keyPlaceholder = `${a.key} (from ${a.sourceCardName || 'parent'})`;
    const valuePlaceholder = 'set value';
    
    console.log(`[renderAttrRows] Rendering inherited[${i}]: key="${a.key}" from ${a.sourceCardName}`);
    
    html += `<div class="attr-row inherited" data-idx="${i}" data-inh="1">
      <input class="attr-key" readonly value="${escAttr(a.key || '')}" placeholder="${keyPlaceholder}" title="Inherited from ${a.sourceCardName || 'parent'}">
      <div class="attr-dropdown-wrapper">
        <input class="attr-val" value="${escAttr(a.value || '')}" placeholder="${valuePlaceholder}" autocomplete="off">
      </div>
    </div>`;
  });
  
  // Render owned attributes with their actual indices
  owned.forEach((a, i) => {
    const ent = a.kind === 'entity';
    console.log(`[renderAttrRows] Rendering own[${i}]: key="${a.key}", value="${a.value}", entity=${ent}`);
    
    html += `<div class="attr-row" data-idx="${i}">
      <input class="attr-key" value="${escAttr(a.key || '')}" placeholder="key">
      <div class="attr-dropdown-wrapper">
        <input class="attr-val ${ent ? 'entity' : ''}" value="${escAttr(ent ? (data.byId(a.entityId)?.name || a.value) : (a.value || ''))}" placeholder="value" autocomplete="off">
        <div class="attr-dropdown" id="dropdown-${card.id}-${i}"></div>
      </div>
    </div>`;
  });
  
  // Add empty row for new entries (only if we have owned attributes or no inherited)
  const needsEmptyRow = owned.length > 0 || inherited.length === 0;
  if (needsEmptyRow) {
    const emptyIdx = owned.length;
    console.log(`[renderAttrRows] Adding empty row at index ${emptyIdx}`);
    html += `<div class="attr-row" data-idx="${emptyIdx}">
      <input class="attr-key" value="" placeholder="key">
      <div class="attr-dropdown-wrapper">
        <input class="attr-val" value="" placeholder="value" autocomplete="off">
        <div class="attr-dropdown" id="dropdown-${card.id}-${emptyIdx}"></div>
      </div>
    </div>`;
  }
  
  console.log(`[renderAttrRows] ====== End rendering for card ${card.id} ======\n`);
  return html;
}

export function renderLinks(cardId) { 
  const set = data.links.get(cardId) || new Set(); 
  if (!set.size) return '<div class="no-links" style="opacity:.6;font-size:11px">No linked entities<br><span style="opacity:.5;font-size:10px">Drag to bottom of another card to create link</span></div>'; 
  return Array.from(set).map(id => `<div class="link-item" data-id="${id}" title="This card links to ${esc(data.byId(id)?.name || '')}">${esc(data.byId(id)?.name || '')}</div>`).join(''); 
}

// ---------- UI Updates ----------
export function updateCardUI(cardId, focusNew = false) { 
  console.log(`\n[updateCardUI] ====== Updating UI for card ${cardId} ======`);
  const c = data.byId(cardId); 
  const el = document.getElementById('card-' + cardId); 
  if (!c || !el) {
    console.log(`[updateCardUI] Card ${cardId} not found in data or DOM`);
    return;
  }
  
  console.log(`[updateCardUI] Card name: ${c.name}`);
  console.log(`[updateCardUI] Card stored attributes:`, c.attributes);
  console.log(`[updateCardUI] Current links:`, Array.from(data.links.get(cardId) || new Set()));
  
  el.querySelector('.card-title').textContent = c.name; 
  el.querySelector('.card-type').textContent = c.type || 'entity'; 
  
  const oldAttrsHTML = el.querySelector('#attrs-' + cardId).innerHTML;
  const newAttrsHTML = renderAttrRows(c);
  
  if (oldAttrsHTML !== newAttrsHTML) {
    console.log(`[updateCardUI] Attributes HTML changed, updating DOM`);
    el.querySelector('#attrs-' + cardId).innerHTML = newAttrsHTML;
  } else {
    console.log(`[updateCardUI] Attributes HTML unchanged, skipping DOM update`);
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
  
  // CASCADE UPDATE TO ALL DESCENDANTS
  console.log(`[updateCardUI] Checking for children to cascade update`);
  const children = data.childrenOf.get(cardId);
  if (children && children.size > 0) {
    console.log(`[updateCardUI] Cascading update to ${children.size} children:`, Array.from(children));
    
    children.forEach(childId => {
      // Simply update the child's UI - the effectiveAttrs function will handle inheritance correctly
      updateCardUI(childId, false);
    });
  } else {
    console.log(`[updateCardUI] No children to cascade to`);
  }
  
  console.log(`[updateCardUI] ====== Completed update for card ${cardId} ======\n`);
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