// data.js - Core Data Model & State Management
// Handles all data structures, relationships, and CRUD operations

// ---------- Core Data ----------
export let all = [];
export let nextId = 1;
export const byId = id => all.find(c => c.id === id);

// ---------- Relationships ----------
export const parentsOf = new Map();   // child -> Set(parent)
export const childrenOf = new Map();  // parent -> Set(child) - EXPORTED for cascade updates
export const links = new Map();       // undirected influence graph

// Helper to ensure Set exists in Map
export const ensure = (map, k) => { 
  if (!map.has(k)) map.set(k, new Set()); 
  return map.get(k); 
};

// ---------- Linking / Containment Operations ----------
export function link(a, b) { 
  if (a === b) return; 
  console.log(`[link] Creating one-way link from ${a} to ${b}`);
  ensure(links, a).add(b); 
  // Removed bidirectional linking - only a links to b now
  console.log(`[link] After linking - Card ${a} links:`, Array.from(links.get(a) || new Set()));
  console.log(`[link] Card ${b} is not updated (one-way link)`);
}

export function unlink(a, b) { 
  console.log(`[unlink] Removing one-way link from ${a} to ${b}`);
  console.log(`  Before - Card ${a} links:`, Array.from(links.get(a) || new Set()));
  
  links.get(a)?.delete(b); 
  
  console.log(`  After - Card ${a} links:`, Array.from(links.get(a) || new Set()));
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
  console.log(`[linearParents] Getting parent chain for card ${id}`);
  const seen = new Set(), order = []; 
  
  (function dfs(x) { 
    if (seen.has(x)) return; 
    const parents = parentsOf.get(x) || new Set();
    console.log(`  Card ${x} has parents:`, Array.from(parents));
    
    parents.forEach(p => { 
      if (!seen.has(p)) {
        dfs(p); 
        order.push(p);
        console.log(`  Added parent ${p} to chain`);
      }
    }); 
    seen.add(x); 
  })(id); 
  
  console.log(`Final parent chain for ${id}:`, order);
  return order; 
}

export function effectiveAttrs(id) { 
  console.log(`\n[effectiveAttrs] ====== Getting attributes for card ${id} ======`);
  const me = byId(id); 
  if (!me) return [];
  
  const out = []; 
  
  console.log(`[effectiveAttrs] Card name: ${me.name}`);
  console.log(`[effectiveAttrs] Card's own stored attributes:`, me.attributes);
  
  // First, collect what we inherit from parents
  const inheritedAttrs = [];
  const inheritedKeys = new Set();
  
  // Get ONLY DIRECT PARENTS
  const directParents = Array.from(parentsOf.get(id) || new Set());
  console.log(`[effectiveAttrs] Direct parents:`, directParents);
  
  directParents.forEach(pid => { 
    const p = byId(pid); 
    if (!p) {
      console.log(`[effectiveAttrs] Parent ${pid} not found`);
      return;
    }
    
    console.log(`[effectiveAttrs] Processing parent ${pid} (${p.name})`);
    
    // Get parent's EFFECTIVE attributes (including what they inherited)
    const parentEffective = effectiveAttrs(pid);
    console.log(`[effectiveAttrs] Parent's effective attributes:`, parentEffective);
    
    // Inherit ALL of parent's effective attributes IN THE SAME ORDER
    parentEffective.forEach(parentAttr => {
      // Skip if we already inherited this key from another parent
      if (inheritedKeys.has(parentAttr.key)) {
        console.log(`[effectiveAttrs]   Key "${parentAttr.key}" already inherited`);
        return;
      }
      
      console.log(`[effectiveAttrs]   INHERITING key="${parentAttr.key}" from ${p.name}`);
      
      // Check if we have a value for this inherited key
      const myOverride = (me.attributes || []).find(a => a.key === parentAttr.key);
      
      inheritedAttrs.push({
        key: parentAttr.key,
        value: myOverride ? myOverride.value : '', // Use our override value if we have one
        kind: myOverride ? myOverride.kind : 'text',
        entityId: myOverride ? myOverride.entityId : undefined,
        inherited: true,
        source: pid,
        sourceCardName: p.name
      });
      inheritedKeys.add(parentAttr.key);
    });
  });
  
  // Add all inherited attributes first
  out.push(...inheritedAttrs);
  
  // Then add our OWN attributes that aren't overrides
  (me.attributes || []).forEach((a) => {
    if (!inheritedKeys.has(a.key)) {
      // This is our own attribute, not an override
      console.log(`[effectiveAttrs] Adding own attribute: key="${a.key}", value="${a.value}"`);
      out.push({...a, inherited: false});
    }
  });
  
  console.log(`[effectiveAttrs] Final effective attributes (${out.length} total):`);
  out.forEach((attr, idx) => {
    const source = attr.inherited ? ` [INHERITED from ${attr.sourceCardName}]` : ' [OWN]';
    console.log(`[effectiveAttrs]   ${idx}: key="${attr.key}", value="${attr.value}"${source}`);
  });
  console.log(`[effectiveAttrs] ====== End attributes for card ${id} ======\n`);
  
  return out; 
}

// Only search linked entities for attribute values
export function resolveEntityByNameFromLinked(name, cardId) { 
  console.log(`[ResolveEntity] Looking for "${name}" in linked entities of card ${cardId}`);
  if (!name) {
    console.log(`[ResolveEntity] Empty name, returning null`);
    return null; 
  }
  const n = name.trim().toLowerCase(); 
  const linkedIds = Array.from(links.get(cardId) || new Set());
  console.log(`[ResolveEntity] Linked IDs for card ${cardId}:`, linkedIds);
  
  const linkedEntities = linkedIds.map(id => byId(id)).filter(Boolean);
  console.log(`[ResolveEntity] Linked entities:`, linkedEntities.map(e => ({id: e.id, name: e.name})));
  
  const match = linkedEntities.find(e => e && (e.name || '').trim().toLowerCase() === n);
  console.log(`[ResolveEntity] Match result:`, match ? {id: match.id, name: match.name} : 'no match');
  
  return match || null; 
}

// ---------- Query Functions ----------
export function roots() { 
  // Return ALL cards when on root plane - including those with parents (for mirroring)
  return all.map(c => c.id); 
}

export function visibleIds(currentPlane) { 
  // On root plane: show ALL cards (including contained ones for mirroring)
  // On sub-plane: show only direct children
  return currentPlane == null ? roots() : Array.from(childrenOf.get(currentPlane) || new Set()); 
}

// ---------- Initialization ----------
export function seed() {
  const a = {
    id: nextId++,
    name: 'Sarah Chen',
    type: 'Actor',
    content: 'A marine biologist studying deep-sea creatures. She works at The Research Station and is concerned about the Strange Readings.',
    attributes: []
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
  
  // Create demo one-way links
  // Sarah links to Research Station and Strange Readings
  ensure(links, a.id).add(b.id); 
  ensure(links, a.id).add(d.id); 
  
  // Research Station links to Strange Readings
  ensure(links, b.id).add(d.id); 
  
  // Strange Readings links to Sarah and Research Station
  ensure(links, d.id).add(a.id);
  ensure(links, d.id).add(b.id);
  
  return {a, b, d};
}