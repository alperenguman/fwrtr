// data.js - Core Data Model & State Management
// Handles all data structures, relationships, and CRUD operations

// ---------- Core Data ----------
export let all = [];
export let nextId = 1;
export const byId = id => all.find(c => c.id === id);

// Set function for restoring data
export function setAll(newAll) { all = newAll; }
export function setNextId(newId) { nextId = newId; }

// ---------- Relationships ----------
export const parentsOf = new Map();   // child -> Set(parent)
export const childrenOf = new Map();  // parent -> Set(child) - EXPORTED for cascade updates
export const links = new Map();       // undirected influence graph

// ---------- Change Notification ----------
function notifyChange() {
  // Notify persistence layer of changes
  if (window.persistence && window.persistence.markDirty) {
    window.persistence.markDirty();
  }
}

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
  notifyChange();
}

export function unlink(a, b) { 
  console.log(`[unlink] Removing one-way link from ${a} to ${b}`);
  console.log(`  Before - Card ${a} links:`, Array.from(links.get(a) || new Set()));
  
  links.get(a)?.delete(b); 
  
  console.log(`  After - Card ${a} links:`, Array.from(links.get(a) || new Set()));
  notifyChange();
}

export function contain(parent, child) { 
  if (parent === child) return; 
  
  // Add to parent's children
  ensure(childrenOf, parent).add(child); 
  
  // Add to child's parents
  ensure(parentsOf, child).add(parent); 
  
  // Note: Caller must handle re-rendering
  notifyChange();
  return true;
}

// ---------- Variant Naming System ----------
function generateVariantName(baseName) {
  // Get all existing cards with names starting with baseName - var
  const variantPrefix = `${baseName} - var `;
  const existingVariants = all.filter(card => {
    return card.name.startsWith(variantPrefix) && /^[A-Z]+$/.test(card.name.substring(variantPrefix.length));
  });
  
  // Extract existing suffixes
  const existingSuffixes = existingVariants.map(card => {
    return card.name.substring(variantPrefix.length);
  });
  
  // Generate next variant name using A, B, ..., Z, AA, AB, etc.
  const generateSuffix = (index) => {
    let suffix = '';
    let temp = index;
    do {
      suffix = String.fromCharCode(65 + (temp % 26)) + suffix;
      temp = Math.floor(temp / 26) - 1;
    } while (temp >= 0);
    return suffix;
  };
  
  // Find the next available suffix
  let index = 0;
  let suffix = generateSuffix(index);
  while (existingSuffixes.includes(suffix)) {
    index++;
    suffix = generateSuffix(index);
  }
  
  return `${baseName} - var ${suffix}`;
}

export function createVariant(originalId, x, y) {
  const original = byId(originalId);
  if (!original) return null;
  
  // Generate variant name
  const variantName = generateVariantName(original.name);
  
  // Create new card with variant name
  const variant = {
    id: nextId++,
    name: variantName,
    type: original.type,
    content: original.content,
    attributes: original.attributes.map(attr => ({
      key: attr.key,
      value: attr.value,  // Copy both key AND value
      kind: attr.kind,
      entityId: attr.entityId,
      entityIds: attr.entityIds ? [...attr.entityIds] : undefined
    })), // Deep copy attributes with values
    representations: [...original.representations] // Copy representations
  };
  
  all.push(variant);
  
  // Set up sibling relationship - variant inherits from the same parent as original
  const originalParents = parentsOf.get(originalId);
  if (originalParents && originalParents.size > 0) {
    // Make variant inherit from all the same parents as the original (sibling relationship)
    originalParents.forEach(parentId => {
      contain(parentId, variant.id);
    });
  }
  // If original has no parents, variant also has no parents (both are root-level)
  
  // Copy linked entities - variants should have the same links as the original
  const originalLinks = links.get(originalId);
  if (originalLinks && originalLinks.size > 0) {
    const variantLinks = new Set(originalLinks);
    links.set(variant.id, variantLinks);
    
    // Also add the variant to the linked entities' back-references
    originalLinks.forEach(linkedId => {
      const backLinks = links.get(linkedId);
      if (backLinks) {
        backLinks.add(variant.id);
      } else {
        links.set(linkedId, new Set([variant.id]));
      }
    });
  }
  
  notifyChange();
  return variant;
}

// ---------- CRUD Operations ----------
export function createCard(x, y) { 
  if (x == null) x = (innerWidth/2) / 1 - 160;  // Will be adjusted by viewport
  if (y == null) y = (innerHeight/2) / 1 - 110; // Will be adjusted by viewport
  
  const c = {
    id: nextId++,
    name: 'Entity ' + (nextId - 1),
    type: null, // Type determined by inheritance
    content: '',
    attributes: [],
    representations: [] // Array of media URLs/data
  }; 
  
  all.push(c); 
  notifyChange();
  return c; 
}

// Add media representation to a card
export function addRepresentation(cardId, mediaUrl) {
  const card = byId(cardId);
  if (!card) return false;
  
  if (!card.representations) {
    card.representations = [];
  }
  
  // Avoid duplicates
  console.log(`[addRepresentation] Checking for duplicate: ${mediaUrl.substring(0, 50)}...`);
  console.log(`[addRepresentation] Current representations:`, card.representations.length);
  if (!card.representations.includes(mediaUrl)) {
    card.representations.push(mediaUrl);
    console.log(`[addRepresentation] Added media to card ${cardId}, total representations: ${card.representations.length}`);
    notifyChange();
    return true;
  }
  console.log(`[addRepresentation] Duplicate media URL rejected for card ${cardId}`);
  return false;
}

// Remove media representation from a card
export function removeRepresentation(cardId, index) {
  const card = byId(cardId);
  if (!card || !card.representations) return false;
  
  if (index >= 0 && index < card.representations.length) {
    card.representations.splice(index, 1);
    console.log(`[removeRepresentation] Removed media from card ${cardId}`);
    notifyChange();
    return true;
  }
  return false;
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
  
  notifyChange();
  // Note: Caller must handle DOM cleanup and re-rendering
  return true;
}

// ---------- Type System ----------
export function getEffectiveTypes(cardId) {
  const card = byId(cardId);
  if (!card) return [];
  
  // Check if this card has any parents
  const parents = parentsOf.get(cardId);
  if (!parents || parents.size === 0) {
    // No parents - this is a base entity
    return [{ type: 'Base Entity', parentId: null }];
  }
  
  // Has parents - collect all parent types
  const types = [];
  parents.forEach(parentId => {
    const parentCard = byId(parentId);
    if (parentCard) {
      types.push({
        type: parentCard.name || 'entity',
        parentId: parentId
      });
    }
  });
  
  return types.length > 0 ? types : [{ type: 'entity', parentId: null }];
}

// Generate a consistent color for a type string
export function getTypeColor(type) {
  if (type === 'Base Entity') {
    return '#666'; // Gray for base entities
  }
  
  // Generate consistent color from type string
  let hash = 0;
  for (let i = 0; i < type.length; i++) {
    hash = type.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate hue from hash (0-360)
  const hue = Math.abs(hash) % 360;
  // Use consistent saturation and lightness for readability
  return `hsl(${hue}, 65%, 55%)`;
}

// Remove a specific parent relationship
export function removeParent(childId, parentId) {
  const parents = parentsOf.get(childId);
  if (parents) {
    parents.delete(parentId);
    if (parents.size === 0) {
      parentsOf.delete(childId);
    }
  }
  
  const children = childrenOf.get(parentId);
  if (children) {
    children.delete(childId);
    if (children.size === 0) {
      childrenOf.delete(parentId);
    }
  }
  
  console.log(`[removeParent] Removed inheritance: ${parentId} -> ${childId}`);
  notifyChange();
}
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
  
  // First, collect what we inherit from ALL parents
  const inheritedAttrs = [];
  const inheritedKeys = new Set();
  
  // Get ALL DIRECT PARENTS
  const directParents = Array.from(parentsOf.get(id) || new Set());
  console.log(`[effectiveAttrs] Direct parents:`, directParents);
  
  // Process each parent
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
      // For multiple inheritance, if key already inherited from another parent, skip
      if (inheritedKeys.has(parentAttr.key)) {
        console.log(`[effectiveAttrs]   Key "${parentAttr.key}" already inherited from another parent`);
        return;
      }
      
      console.log(`[effectiveAttrs]   INHERITING key="${parentAttr.key}" from ${p.name}`);
      
      // Check if we have a value for this inherited key
      const myOverride = (me.attributes || []).find(a => a.key === parentAttr.key);
      
      if (myOverride) {
        // We have an override - use our value with proper kind/entityId preservation
        inheritedAttrs.push({
          key: parentAttr.key,
          value: myOverride.value,
          kind: myOverride.kind || 'text',
          entityId: myOverride.entityId,
          entityIds: myOverride.entityIds,
          values: myOverride.values,
          inherited: true,
          source: pid,
          sourceCardName: p.name
        });
      } else {
        // No override - just inherit the key with empty value
        // Values are NOT inherited, only keys
        inheritedAttrs.push({
          key: parentAttr.key,
          value: '', // Always empty - we don't inherit values
          kind: 'text',
          inherited: true,
          source: pid,
          sourceCardName: p.name
        });
      }
      
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
    console.log(`[effectiveAttrs]   ${idx}: key="${attr.key}", value="${attr.value}", kind="${attr.kind}"${source}`);
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
    type: null, // Type will be determined by inheritance
    content: 'A marine biologist studying deep-sea creatures. She works at The Research Station and is concerned about the Strange Readings.',
    attributes: [],
    representations: [] // Empty media array
  };
  
  const b = {
    id: nextId++,
    name: 'The Research Station',
    type: null, // Type will be determined by inheritance
    content: 'A remote underwater facility 200 meters below the Pacific Ocean surface. Sarah Chen conducts her research here.',
    attributes: [],
    representations: [] // Empty media array
  };
  
  const d = {
    id: nextId++,
    name: 'Strange Readings',
    type: null, // Type will be determined by inheritance
    content: 'Sonar equipment detects unusual patterns below The Research Station. Sarah Chen is investigating.',
    attributes: [],
    representations: [] // Empty media array
  };
  
  all.push(a, b, d);
  
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