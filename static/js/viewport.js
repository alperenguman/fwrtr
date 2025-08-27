// viewport.js - Camera, Navigation & Layout Management
// Handles viewport state, plane navigation, and layout persistence

import * as data from './data.js';

// ---------- Viewport State ----------
export let viewX = 0, viewY = 0, zoom = 1, depth = 0;
export let currentPlane = null; // null = root
export let clones = []; // [{refId,x,y}] - visible card positions

// ---------- Layout Management ----------
export const layouts = new Map(); // key('ROOT' or id) -> {viewX,viewY,cards:[]}
const keyOf = pid => pid == null ? 'ROOT' : String(pid);

export function ensureLayout(pid) { 
  const k = keyOf(pid); 
  if (!layouts.has(k)) {
    layouts.set(k, {viewX: 0, viewY: 0, cards: []}); 
  }
  const layout = layouts.get(k);
  // Ensure cards array exists (for backwards compatibility with saved data)
  if (!layout.cards) {
    layout.cards = [];
  }
  return layout; 
}

// ---------- DOM Elements ----------
const plane = document.getElementById('plane');
const hud = document.getElementById('hud');
const breadcrumb = document.getElementById('breadcrumb');
const bg = document.getElementById('backgroundText');
const planeLabel = document.getElementById('planeLabel');

// ---------- View Updates ----------
const setCSS = (k, v) => document.documentElement.style.setProperty(k, v);

export function updateView() { 
  setCSS('--vx', viewX + 'px'); 
  setCSS('--vy', viewY + 'px'); 
  setCSS('--z', zoom); 
  plane.style.backgroundPosition = `${viewX % 50}px ${viewY % 50}px`; 
}

export function updateHUD(wx = 0, wy = 0) { 
  hud.textContent = `X: ${Math.round(wx)}, Y: ${Math.round(wy)} | Zoom: ${zoom.toFixed(1)}x | Cards: ${clones.length}`; 
  
  if (depth) { 
    breadcrumb.style.display = 'block'; 
    breadcrumb.innerHTML = `<strong>${['Root', ...stack.map(s => data.byId(s.entered)?.name || '')].join(' › ')}</strong><br><span style="color:#666;font-size:10px;">Zoom out to go up</span>`; 
  } else { 
    breadcrumb.style.display = 'none'; 
    breadcrumb.textContent = ''; 
  } 
}

export function showBG() { 
  if (depth === 0) { 
    bg.style.display = 'none'; 
    planeLabel.style.display = 'none'; 
    return; 
  } 
  
  const c = data.byId(currentPlane); 
  bg.textContent = c?.content || ''; 
  bg.style.display = c && c.content ? 'block' : 'none'; 
  bg.classList.add('bg-ambient'); 
  planeLabel.textContent = c?.name || ''; 
  planeLabel.style.display = c ? 'block' : 'none'; 
}

// ---------- Setters for mutable state ----------
export function setCurrentPlane(pid) {
  currentPlane = pid;
  
  // Trigger persistence when current plane changes
  if (window.persistence && window.persistence.markDirty) {
    window.persistence.markDirty();
  }
}

export function setClones(newClones) {
  clones = newClones;
}

export function setViewport(x, y, z) {
  if (x !== undefined) viewX = x;
  if (y !== undefined) viewY = y;
  if (z !== undefined) zoom = z;
  
  // Trigger persistence when viewport changes
  if (window.persistence && window.persistence.markDirty) {
    window.persistence.markDirty();
  }
}

export function setDepth(d) {
  depth = d;
}

export function setStack(newStack) {
  stack.length = 0; // Clear existing
  stack.push(...newStack); // Restore saved stack
}

export function modifyClone(index, x, y) {
  if (index >= 0 && index < clones.length) {
    if (x !== undefined) clones[index].x = x;
    if (y !== undefined) clones[index].y = y;
  }
}

export function setClonePosition(cardId, x, y) {
  const ix = clones.findIndex(v => v.refId === cardId);
  if (ix >= 0) {
    clones[ix].x = x;
    clones[ix].y = y;
    
    // Also update the layout for persistence
    const layout = ensureLayout(currentPlane);
    const layoutIx = layout.cards.findIndex(v => v.refId === cardId);
    if (layoutIx >= 0) {
      layout.cards[layoutIx].x = x;
      layout.cards[layoutIx].y = y;
      
      // Trigger persistence
      if (window.persistence && window.persistence.markDirty) {
        window.persistence.markDirty();
      }
    }
  }
}

export function pushClone(clone) {
  clones.push(clone);
}

// ---------- Navigation Stack ----------
export const stack = []; // {planeId,entered}

export function enter(id) { 
  const lay = ensureLayout(currentPlane); 
  lay.viewX = viewX; 
  lay.viewY = viewY; 
  
  stack.push({planeId: currentPlane, entered: id}); 
  setDepth(depth + 1); 
  setCurrentPlane(id);
  
  // Trigger persistence for navigation changes
  if (window.persistence && window.persistence.markDirty) {
    window.persistence.markDirty();
  }
  
  // Note: Caller must trigger renderPlane
  return true;
}

export function exit() { 
  if (!stack.length) return false; 
  
  const prev = stack.pop(); 
  setDepth(depth - 1); 
  setCurrentPlane(prev.planeId ?? null);
  
  // Trigger persistence for navigation changes
  if (window.persistence && window.persistence.markDirty) {
    window.persistence.markDirty();
  }
  
  // Note: Caller must trigger renderPlane and focusOn
  return prev;
}

// ---------- Focus & Centering ----------
export function center() { 
  if (!clones.length) return; 
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; 
  clones.forEach(c => { 
    minX = Math.min(minX, c.x); 
    minY = Math.min(minY, c.y); 
    maxX = Math.max(maxX, c.x + 340); 
    maxY = Math.max(maxY, c.y + 220); 
  }); 
  
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2; 
  setViewport(innerWidth / 2 - (cx * zoom), innerHeight / 2 - (cy * zoom)); 
  updateView(); 
}

export function focusOn(id) { 
  const v = clones.find(c => c.refId === id); 
  if (!v) return; 
  
  setViewport(
    -v.x * zoom + innerWidth / 2 - 170 * zoom,
    -v.y * zoom + innerHeight / 2 - 110 * zoom
  ); 
  updateView();
  
  const el = document.getElementById('card-' + id); 
  if (el) { 
    el.style.boxShadow = '0 0 30px rgba(0,255,136,.8)'; 
    setTimeout(() => el.style.boxShadow = '', 900); 
  } 
}

// ---------- Layout Operations ----------
export function updateClonePosition(cardId, dx, dy) {
  const ix = clones.findIndex(v => v.refId === cardId);
  if (ix >= 0) {
    clones[ix].x += dx;
    clones[ix].y += dy;
  }
}

export function saveCurrentLayout() {
  const lay = ensureLayout(currentPlane);
  lay.cards = clones.map(v => ({...v}));
  lay.viewX = viewX;
  lay.viewY = viewY;
}

export function getWorldCoords(clientX, clientY) {
  return {
    wx: (clientX - viewX) / zoom,
    wy: (clientY - viewY) / zoom
  };
}

// ---------- Reset ----------
export function resetView() { 
  setViewport(0, 0, 1); 
  updateView(); 
  updateHUD(); 
}

// ---------- Initial Layout Setup ----------
export function setupInitialLayout(cards) {
  const L = ensureLayout(null); 
  L.cards = [
    {refId: cards.a.id, x: 120, y: 110},
    {refId: cards.b.id, x: 430, y: 150},
    {refId: cards.d.id, x: 240, y: 320}
  ];
}

// ---------- Initialization ----------
export function init() {
  setCSS('--vx', '0px'); 
  setCSS('--vy', '0px'); 
  setCSS('--z', '1');
}