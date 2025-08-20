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
  
  // Get effective types (multiple for multiple inheritance)
  const effectiveTypes = data.getEffectiveTypes(c.id);
  const typePillsHTML = effectiveTypes.map(t => {
    const color = data.getTypeColor(t.type);
    const dataParent = t.parentId ? `data-parent="${t.parentId}"` : '';
    return `<div class="card-type-pill" ${dataParent} style="border-color: ${color}; color: ${color}" title="${t.parentId ? 'Right-click to remove inheritance' : ''}">${esc(t.type)}</div>`;
  }).join('');
  
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
      <div class="card-types" data-card-id="${c.id}">${typePillsHTML}</div>

      <div class="section-header" onclick="toggleSection('reps',${c.id})">
        <span class="caret down" id="caret-reps-${c.id}">▶</span> Representations
      </div>
      <div class="representations-section" id="reps-${c.id}" data-card-id="${c.id}">${renderRepresentations(c)}</div>

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

// Render representations gallery
export function renderRepresentations(card) {
  const reps = card.representations || [];
  
  if (reps.length === 0) {
    return '<div class="no-representations">No media<br><span style="opacity:.5;font-size:10px">Drag images/videos here</span></div>';
  }
  
  const multiple = reps.length > 1;
  let html = '<div class="media-gallery">';
  
  if (multiple) {
    html += '<button class="gallery-nav gallery-prev" data-card-id="' + card.id + '">‹</button>';
    html += '<button class="gallery-nav gallery-next" data-card-id="' + card.id + '">›</button>';
  }
  
  html += '<div class="media-viewport" data-current-group="0">';
  html += '<div class="media-container">';
  
  reps.forEach((mediaUrl, index) => {
    // Better media type detection
    const isDataUrl = mediaUrl.startsWith('data:');
    const isImage = isDataUrl ? mediaUrl.startsWith('data:image/') : 
                    (/\.(jpg|jpeg|png|gif|webp|svg)/i.test(mediaUrl) || 
                     /\/(image|img|photo|picture)\//i.test(mediaUrl));
    const isVideo = isDataUrl ? mediaUrl.startsWith('data:video/') : 
                    (/\.(mp4|webm|ogg)/i.test(mediaUrl) || 
                     /\/(video|vid|movie|clip)\//i.test(mediaUrl));
    
    // Always try to display as image first if not clearly video
    if (!isVideo) {
      html += `<div class="media-item" data-index="${index}">
        <img src="${escAttr(mediaUrl)}" alt="Representation ${index + 1}" 
             loading="lazy"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
        <div class="media-placeholder" style="display:none;">Media ${index + 1}<br><span style="opacity:0.5;font-size:10px">${escAttr(mediaUrl.substring(0, 50))}</span></div>
      </div>`;
    } else {
      html += `<div class="media-item media-video" data-index="${index}">
        <video controls>
          <source src="${escAttr(mediaUrl)}" />
          Your browser does not support the video tag.
        </video>
      </div>`;
    }
  });
  
  html += '</div>';
  html += '</div>';
  
  if (multiple) {
    // Indicators will be updated dynamically based on groups
    html += '<div class="gallery-indicators" data-total="' + reps.length + '"></div>';
  }
  
  html += '</div>';
  
  return html;
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
    const valuePlaceholder = 'value'; // Changed from 'set value' to 'value' for consistency
    
    console.log(`[renderAttrRows] Rendering inherited[${i}]: key="${a.key}" from ${a.sourceCardName}, kind="${a.kind}", value="${a.value}"`);
    
    // Check if the value is an entity or entity list
    let cssClass = '';
    let displayValue = a.value || '';
    
    if (a.kind === 'entityList' && a.entityIds && a.entityIds.length > 0) {
      cssClass = 'entity';
      displayValue = a.value || '';
    } else if (a.kind === 'entity' && a.entityId) {
      cssClass = 'entity';
      displayValue = data.byId(a.entityId)?.name || a.value || '';
    }
    
    html += `<div class="attr-row inherited" data-idx="${i}" data-inh="1">
      <input class="attr-key" readonly value="${escAttr(a.key || '')}" placeholder="${keyPlaceholder}" title="Inherited from ${a.sourceCardName || 'parent'}">
      <div class="attr-dropdown-wrapper">
        <input class="attr-val ${cssClass}" value="${escAttr(displayValue)}" placeholder="${valuePlaceholder}" autocomplete="off">
        <div class="attr-dropdown" id="dropdown-${card.id}-inh-${i}"></div>
      </div>
    </div>`;
  });
  
  // Render owned attributes with their actual indices
  owned.forEach((a, i) => {
    const isEntity = a.kind === 'entity';
    const isEntityList = a.kind === 'entityList';
    let displayValue = '';
    let cssClass = '';
    
    if (isEntityList && a.entityIds && a.entityIds.length > 0) {
      // For entity lists, show the names properly with same styling as single entities
      displayValue = a.value || '';
      cssClass = 'entity';  // Use same class as single entity
    } else if (isEntity) {
      displayValue = data.byId(a.entityId)?.name || a.value || '';
      cssClass = 'entity';
    } else {
      displayValue = a.value || '';
    }
    
    console.log(`[renderAttrRows] Rendering own[${i}]: key="${a.key}", value="${displayValue}", kind=${a.kind}`);
    
    html += `<div class="attr-row" data-idx="${i}">
      <input class="attr-key" value="${escAttr(a.key || '')}" placeholder="key">
      <div class="attr-dropdown-wrapper">
        <input class="attr-val ${cssClass}" value="${escAttr(displayValue)}" placeholder="value" autocomplete="off">
        <div class="attr-dropdown" id="dropdown-${card.id}-${i}"></div>
      </div>
    </div>`;
  });
  
  // Add empty row for new entries (ALWAYS show this for adding own attributes)
  const emptyIdx = owned.length;
  console.log(`[renderAttrRows] Adding empty row at index ${emptyIdx}`);
  html += `<div class="attr-row" data-idx="${emptyIdx}">
    <input class="attr-key" value="" placeholder="key">
    <div class="attr-dropdown-wrapper">
      <input class="attr-val" value="" placeholder="value" autocomplete="off">
      <div class="attr-dropdown" id="dropdown-${card.id}-${emptyIdx}"></div>
    </div>
  </div>`;
  
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
  
  // Update title
  el.querySelector('.card-title').textContent = c.name; 
  
  // Update types with inherited types and colors (multiple)
  const effectiveTypes = data.getEffectiveTypes(cardId);
  const typesContainer = el.querySelector('.card-types');
  if (typesContainer) {
    const typePillsHTML = effectiveTypes.map(t => {
      const color = data.getTypeColor(t.type);
      const dataParent = t.parentId ? `data-parent="${t.parentId}"` : '';
      return `<div class="card-type-pill" ${dataParent} style="border-color: ${color}; color: ${color}" title="${t.parentId ? 'Right-click to remove inheritance' : ''}">${esc(t.type)}</div>`;
    }).join('');
    typesContainer.innerHTML = typePillsHTML;
    typesContainer.dataset.cardId = cardId;
  } else {
    // Fallback for old single type element
    const typeEl = el.querySelector('.card-type-pill');
    if (typeEl && effectiveTypes.length > 0) {
      const firstType = effectiveTypes[0];
      const color = data.getTypeColor(firstType.type);
      typeEl.textContent = firstType.type;
      typeEl.style.borderColor = color;
      typeEl.style.color = color;
      typeEl.style.backgroundColor = 'transparent';
    }
  }
  
  // Update representations
  const repsSection = el.querySelector('#reps-' + cardId);
  if (repsSection) {
    repsSection.innerHTML = renderRepresentations(c);
  }
  
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
  
  // Re-hydrate gallery navigation if opening representations
  if (!open && kind === 'reps' && typeof window.hydrateCard === 'function') {
    setTimeout(() => window.hydrateCard(id), 0);
  }
}