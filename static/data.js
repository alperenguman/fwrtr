// data.js - Core Data Model & State Management
// Handles all data structures, relationships, and CRUD operations

// ---------- Core Data ----------
export let all = [];
export let nextId = 1;
export const byId = id => all.find(c => c.id === id);

// ---------- Relationships ----------
export const parentsOf = new Map();   // child -> Set(parent)
export const childrenOf = new Map();  // parent -> Set(child)
export const links = new Map();       // undirected influence graph

// Helper to ensure Set exists in Map
export const ensure = (map, k) => { 
  if (!map.has(k)) map.set(k, new Set()); 
  return map.get(k); 
};

// ---------- Linking / Containment Operations ----------
export function link(a, b) { 
  if (a === b) return; 
  console.log(`[link] Linking ${a} to ${b}`);
  ensure(links, a).add(b); 
  ensure(links, b).add(a); 
  console.log(`[link] After linking - Card ${a} links:`, Array.from(links.get(a) || new Set()));
  console.log(`[link] After linking - Card ${b} links:`, Array.from(links.get(b) || new Set()));
}

export function unlink(a, b) { 
  console.log(`[unlink] Unlinking ${a} from ${b}`);
  console.log(`  Before - Card ${a} links:`, Array.from(links.get(a) || new Set()));
  console.log(`  Before - Card ${b} links:`, Array.from(links.get(b) || new Set()));
  
  links.get(a)?.delete(b); 
  links.get(b)?.delete(a); 
  
  console.log(`  After - Card ${a} links:`, Array.from(links.get(a) || new Set()));
  console.log(`  After - Card ${b} links:`, Array.from(links.get(b) || new Set()));
}

export function contain(parent, child) { 
  if (parent === child) return; 
  
  // Add to parent's children
  ensure(childrenOf, parent).add(child); 
  
  // Add to child's parents
  ensure(parentsOf, child).add(parent); 
  
  // Note: Caller must handle re-rendering
  return true;
}

// ---------- CRUD Operations ----------
export function createCard(x, y) { 
  if (x == null) x = (innerWidth/2) / 1 - 160;  // Will be adjusted by viewport
  if (y == null) y = (innerHeight/2) / 1 - 110; // Will be adjusted by viewport
  
  const c = {
    id: nextId++,
    name: 'Entity ' + (nextId - 1),
    type: 'entity',
    content: '',
    attributes: []
  }; 
  
  all.push(c); 
  return c; 
}

export function deleteCard(id) { 
  // Clean up all relationships
  links.get(id)?.forEach(o => links.get(o)?.delete(id)); 
  links.delete(id); 
  
  parentsOf.get(id)?.forEach(p => childrenOf.get(p)?.delete(id)); 
  parentsOf.delete(id); 
  
  childrenOf.get(id)?.forEach(ch => parentsOf.get(ch)?.delete(id)); 
  childrenOf.delete(id); 
  
  // Remove from data array
  all = all.filter(c => c.id !== id); 
  
  // Note: Caller must handle DOM cleanup and re-rendering
  return true;
}

// ---------- Attribute System ----------
export function linearParents(id) { 
  const seen = new Set(), order = []; 
  (function dfs(x) { 
    if (seen.has(x)) return; 
    (parentsOf.get(x) || new Set()).forEach(p => { 
      dfs(p); 
      order.push(p); 
    }); 
    seen.add(x); 
  })(id); 
  return order; 
}

export function effectiveAttrs(id) { 
  const me = byId(id); 
  const out = []; 
  const ownKeys = new Set((me.attributes || []).map(a => a.key)); 
  
  // Add own attributes
  (me.attributes || []).forEach(a => out.push({...a, inherited: false})); 
  
  // Add inherited attributes
  linearParents(id).forEach(pid => { 
    const p = byId(pid); 
    if (!p) return; 
    (p.attributes || []).forEach(a => { 
      if (!ownKeys.has(a.key)) {
        out.push({...a, inherited: true, source: pid}); 
      }
    }); 
  }); 
  
  return out; 
}

// Only search linked entities for attribute values
export function resolveEntityByNameFromLinked(name, cardId) { 
  if (!name) return null; 
  const n = name.trim().toLowerCase(); 
  const linkedIds = Array.from(links.get(cardId) || new Set());
  return linkedIds.map(id => byId(id)).find(e => e && (e.name || '').trim().toLowerCase() === n) || null; 
}

// ---------- Query Functions ----------
export function roots() { 
  return all.filter(c => !(parentsOf.get(c.id) || new Set()).size).map(c => c.id); 
}

export function visibleIds(currentPlane) { 
  return currentPlane == null ? roots() : Array.from(childrenOf.get(currentPlane) || new Set()); 
}

// ---------- Initialization ----------
export function seed() {
  const a = {
    id: nextId++,
    name: 'Sarah Chen',
    type: 'Actor',
    content: 'A marine biologist studying deep-sea creatures. She works at The Research Station and is concerned about the Strange Readings.',
    attributes: [{key: 'Role', value: 'Lead scientist', kind: 'text'}]
  };
  
  const b = {
    id: nextId++,
    name: 'The Research Station',
    type: 'Location',
    content: 'A remote underwater facility 200 meters below the Pacific Ocean surface. Sarah Chen conducts her research here.',
    attributes: []
  };
  
  const d = {
    id: nextId++,
    name: 'Strange Readings',
    type: 'Event',
    content: 'Sonar equipment detects unusual patterns below The Research Station. Sarah Chen is investigating.',
    attributes: []
  };
  
  all.push(a, b, d);
  
  // Initialize children sets
  ensure(childrenOf, a.id); 
  ensure(childrenOf, b.id); 
  ensure(childrenOf, d.id);
  
  // Create demo links
  ensure(links, a.id).add(b.id); 
  ensure(links, b.id).add(a.id); 
  ensure(links, a.id).add(d.id); 
  ensure(links, d.id).add(a.id); 
  ensure(links, b.id).add(d.id); 
  ensure(links, d.id).add(b.id);
  
  return {a, b, d};
}