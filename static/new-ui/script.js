// ===== Strywrtr – Fixes v5 =====
// • Fixed: Enter creates new attribute line, backspace removes empty lines
// • Fixed: Drag & drop for containment and linking
// • Fixed: Entity autocomplete limited to linked entities
// • Fixed: Empty attribute row shows when section expanded with no attributes
// • Updated: Left-click on linked entities jumps to them directly (no edit mode)

// ---------- Data ----------
let all = [];              // canonical cards
let nextId = 1;
const byId = id => all.find(c=>c.id===id);

// Relations
const parentsOf = new Map();   // child -> Set(parent)
const childrenOf = new Map();  // parent -> Set(child)
const links = new Map();       // undirected influence graph
const ensure = (map,k)=>{ if(!map.has(k)) map.set(k,new Set()); return map.get(k); };

// ---------- Plane layout ----------
let currentPlane = null;       // null = root
let clones = [];               // [{refId,x,y}]
const layouts = new Map();     // key('ROOT' or id) -> {viewX,viewY,cards:[]}
const keyOf = pid => pid==null? 'ROOT' : String(pid);
function ensureLayout(pid){ const k=keyOf(pid); if(!layouts.has(k)) layouts.set(k,{viewX:0,viewY:0,cards:[]}); return layouts.get(k); }

// ---------- Camera / HUD ----------
let viewX=0, viewY=0, zoom=1, depth=0;
const plane = document.getElementById('plane');
const hud = document.getElementById('hud');
const breadcrumb = document.getElementById('breadcrumb');
const bg = document.getElementById('backgroundText');
const planeLabel = document.getElementById('planeLabel');
const lasso = document.getElementById('lasso');
const setCSS=(k,v)=>document.documentElement.style.setProperty(k,v);
setCSS('--vx','0px'); setCSS('--vy','0px'); setCSS('--z','1');

function updateView(){ setCSS('--vx', viewX+'px'); setCSS('--vy', viewY+'px'); setCSS('--z', zoom); plane.style.backgroundPosition=`${viewX%50}px ${viewY%50}px`; }
function updateHUD(wx=0,wy=0){ hud.textContent=`X: ${Math.round(wx)}, Y: ${Math.round(wy)} | Zoom: ${zoom.toFixed(1)}x | Cards: ${clones.length}`; if(depth){ breadcrumb.style.display='block'; breadcrumb.innerHTML=`<strong>${['Root', ...stack.map(s=>byId(s.entered)?.name||'')].join(' › ')}</strong><br><span style="color:#666;font-size:10px;">Zoom out to go up</span>`; } else { breadcrumb.style.display='none'; breadcrumb.textContent=''; } }
function showBG(){ if(depth===0){ bg.style.display='none'; planeLabel.style.display='none'; return; } const c=byId(currentPlane); bg.textContent=c?.content||''; bg.style.display=c&&c.content? 'block':'none'; bg.classList.add('bg-ambient'); planeLabel.textContent=c?.name||''; planeLabel.style.display=c? 'block':'none'; }

// ---------- Visible model ----------
function roots(){ return all.filter(c=> !(parentsOf.get(c.id)||new Set()).size).map(c=>c.id); }
function visibleIds(){ return currentPlane==null? roots() : Array.from(childrenOf.get(currentPlane)||new Set()); }

// ---------- Attributes ----------
const esc = s => (s||'').replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const escAttr = s => (''+s).replace(/"/g,'&quot;');
const escRe = s => (s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function linearParents(id){ const seen=new Set(), order=[]; (function dfs(x){ if(seen.has(x)) return; (parentsOf.get(x)||new Set()).forEach(p=>{ dfs(p); order.push(p); }); seen.add(x); })(id); return order; }
function effectiveAttrs(id){ const me=byId(id); const out=[]; const ownKeys=new Set((me.attributes||[]).map(a=>a.key)); (me.attributes||[]).forEach(a=> out.push({...a,inherited:false})); linearParents(id).forEach(pid=>{ const p=byId(pid); if(!p) return; (p.attributes||[]).forEach(a=>{ if(!ownKeys.has(a.key)) out.push({...a,inherited:true,source:pid}); }); }); return out; }

// FIX 3: Only search linked entities for attribute values
function resolveEntityByNameFromLinked(name, cardId){ 
  if(!name) return null; 
  const n=name.trim().toLowerCase(); 
  const linkedIds = Array.from(links.get(cardId)||new Set());
  return linkedIds.map(id=>byId(id)).find(e=> e && (e.name||'').trim().toLowerCase()===n) || null; 
}

// ---------- Render plane ----------
function renderPlane(pid){ currentPlane = pid??null; plane.innerHTML=''; clones=[]; const ids = visibleIds(); const lay=ensureLayout(currentPlane); lay.cards = lay.cards.filter(v=> ids.includes(v.refId)); const missing = ids.filter(id=> !lay.cards.find(v=>v.refId===id)); if(missing.length){ const r=240, step=(Math.PI*2)/missing.length; let a=0; missing.forEach(id=>{ lay.cards.push({refId:id,x:Math.cos(a)*r,y:Math.sin(a)*r}); a+=step; }); }
  clones = lay.cards.map(v=>({...v})); viewX=lay.viewX||0; viewY=lay.viewY||0; zoom=1; clones.forEach(v=> renderCard(v)); showBG(); updateView(); updateHUD(); }

function renderCard(v){ const c=byId(v.refId); if(!c) return; const el=document.createElement('div'); el.className='card'; el.id='card-'+c.id; el.style.setProperty('--x', v.x+'px'); el.style.setProperty('--y', v.y+'px'); el.innerHTML=`
  <div class="card-header">
    <span class="card-title">${esc(c.name)}</span>
    <div class="card-actions"><button class="card-action danger" onclick="deleteCard(${c.id})">×</button></div>
  </div>
  <div class="card-content">
    <div class="card-type">${esc(c.type||'entity')}</div>

    <div class="section-header" onclick="toggleSection('attrs',${c.id})">
      <span class="caret down" id="caret-attrs-${c.id}">▶</span> Attributes
    </div>
    <div class="attr-list" id="attrs-${c.id}">${renderAttrRows(c)}</div>

    <div class="card-text" id="txt-${c.id}">${linkify(esc(c.content||''), c.id)}</div>

    <div class="section-header" onclick="toggleSection('links',${c.id})">
      <span class="caret down" id="caret-links-${c.id}">▶</span> Linked Entities
    </div>
    <div class="link-list" id="links-${c.id}">${renderLinks(c.id)}</div>

    <datalist id="dl-${c.id}">${getLinkedEntitiesOptions(c.id)}</datalist>
  </div>`;

  // dragging/select
  el.addEventListener('mousedown', startCardDrag);
  el.addEventListener('click', selectCard);

  // text editing (caret where clicked)
  const t = el.querySelector('#txt-'+c.id);
  t.addEventListener('mousedown', e=>{ e.stopPropagation(); t.contentEditable=true; t.classList.add('editing'); });
  t.addEventListener('blur', ()=>{ c.content=t.innerText.trim(); t.contentEditable=false; t.classList.remove('editing'); t.innerHTML=linkify(esc(c.content||''), c.id); if(currentPlane===c.id) showBG(); });
  t.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); t.blur(); } });

  plane.appendChild(el);
  hydrateCard(c.id);
}

// FIX 3: Get options only from linked entities
function getLinkedEntitiesOptions(cardId){
  const linkedIds = Array.from(links.get(cardId)||new Set());
  return linkedIds.map(id=>byId(id)).filter(Boolean).map(e=>`<option value="${escAttr(e.name)}">`).join('');
}

// FIX 1 & 4: Proper attribute row rendering with empty row when needed
function renderAttrRows(card){
  const attrs = effectiveAttrs(card.id);
  
  // FIX 4: If no attributes at all, show one empty editable row
  if(attrs.length === 0) {
    return `<div class="attr-row" data-idx="0">
      <input class="attr-key" value="" placeholder="key">
      <input class="attr-val" list="dl-${card.id}" value="" placeholder="value">
    </div>`;
  }
  
  // Render existing attributes
  const rows = attrs.map((a,i)=>{
    const inh=a.inherited; 
    const ent=a.kind==='entity';
    return `<div class="attr-row ${inh?'inherited':''}" data-idx="${i}" ${inh? 'data-inh="1"':''}>
      <input class="attr-key" ${inh? 'readonly':''} value="${escAttr(a.key||'')}" placeholder="key">
      <input class="attr-val ${ent?'entity':''}" ${inh? 'readonly':''} ${inh? '':`list="dl-${card.id}"`} value="${escAttr(ent? (byId(a.entityId)?.name || a.value) : (a.value||''))}" placeholder="value">
    </div>`;
  }).join('');
  
  return rows;
}

function renderLinks(cardId){ 
  const set=links.get(cardId)||new Set(); 
  if(!set.size) return '<div class="no-links" style="opacity:.6">No linked entities</div>'; 
  return Array.from(set).map(id=>`<div class="link-item" data-id="${id}">${esc(byId(id)?.name||'')}</div>`).join(''); 
}

// FIX 1: Enhanced attribute handling with Enter/Backspace
function hydrateCard(cardId){
  console.log(`[hydrateCard] Starting hydration for card ${cardId}`);
  const root=document.getElementById('card-'+cardId); 
  if(!root) return; 
  const card=byId(cardId);
  
  // attributes: enhanced handling
  root.querySelectorAll('#attrs-'+cardId+' .attr-row').forEach(row=>{
    const inh=row.dataset.inh==='1'; 
    const k=row.querySelector('.attr-key'); 
    const v=row.querySelector('.attr-val');
    
    function commit(addNewRow=false){ 
      const key=(k.value||'').trim(); 
      const val=(v.value||'').trim(); 
      
      if(inh){ 
        if(!key && !val) return;
        // FIX 3: Use linked entities only
        const match=resolveEntityByNameFromLinked(val, cardId); 
        const newAttr = match? {key,value:match.name,kind:'entity',entityId:match.id} : {key,value:val,kind:'text'}; 
        const ix=(card.attributes||[]).findIndex(a=>a.key===key); 
        if(ix>=0) card.attributes[ix]=newAttr; 
        else { 
          card.attributes=card.attributes||[]; 
          card.attributes.push(newAttr); 
        } 
        updateCardUI(cardId); 
        return; 
      }
      
      // editable row
      const idx=parseInt(row.dataset.idx);
      
      // FIX 1: Handle empty rows properly
      if(!key && !val){ 
        // If it's not the last row or there's only one row, remove it
        const allRows = root.querySelectorAll('#attrs-'+cardId+' .attr-row:not(.inherited)');
        if(allRows.length > 1 || (card.attributes && card.attributes.length > 0)) {
          if(idx < (card.attributes||[]).length){ 
            card.attributes.splice(idx,1); 
            updateCardUI(cardId); 
          }
        }
        return; 
      }
      
      // FIX 3: Use linked entities only
      const match=resolveEntityByNameFromLinked(val, cardId); 
      if(!card.attributes) card.attributes=[]; 
      card.attributes[idx]= match? {key,value:match.name,kind:'entity',entityId:match.id} : {key,value:val,kind:'text'}; 
      
      // FIX 1: Add new row if needed
      if(addNewRow && key && val) {
        // Check if this is the last non-inherited row
        const nonInheritedAttrs = (card.attributes||[]).filter(a => !a.inherited);
        if(idx === nonInheritedAttrs.length - 1) {
          card.attributes.push({key:'',value:'',kind:'text'});
          updateCardUI(cardId, true);
          return;
        }
      }
      
      updateCardUI(cardId); 
    }
    
    // FIX 1: Enhanced keyboard handling
    [k,v].forEach(inp=>{ 
      inp.addEventListener('keydown',e=>{ 
        if(e.key==='Enter'){ 
          e.preventDefault(); 
          commit(true); // Pass true to potentially add new row
        } else if(e.key==='Backspace' && inp.value === '' && !inh) {
          // If backspace on empty field, check if we should remove the row
          const otherInp = (inp === k) ? v : k;
          if(otherInp.value === '') {
            e.preventDefault();
            commit(false);
          }
        }
      }); 
      
      inp.addEventListener('blur', () => commit(false)); 
      
      if(inh){ 
        inp.addEventListener('focus', ()=> inp.removeAttribute('readonly'), {once:true}); 
      }
    });
  });

  // linked entities: Add handlers directly
  const linksContainer = root.querySelector('#links-'+cardId);
  if(!linksContainer) {
    console.log(`[hydrateCard] No links container found for card ${cardId}`);
    return;
  }
  
  // Add handlers to each link item WITHOUT cloning
  const linkItems = linksContainer.querySelectorAll('.link-item');
  console.log(`[hydrateCard] Card ${cardId} has ${linkItems.length} linked items`);
  
  linkItems.forEach((it, idx) => {
    // Skip if this doesn't have a valid data-id
    if(!it.dataset.id || it.dataset.id === 'undefined') {
      console.log(`  Skipping item ${idx} - invalid data-id: "${it.dataset.id}"`);
      return;
    }
    
    const linkId = parseInt(it.dataset.id);
    console.log(`  Adding listeners to item ${idx} with data-id="${linkId}"`);
    
    // Right-click handler - just remove the DOM element, don't re-render everything
    it.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      console.log(`[contextmenu] Card ${cardId} unlinking from ${linkId}`);
      
      // Update the data structure
      unlink(cardId, linkId);
      
      // Just remove this element from DOM instead of re-rendering everything
      this.remove();
      
      // If no more links, show the "No linked entities" message
      const remainingLinks = linksContainer.querySelectorAll('.link-item');
      if(remainingLinks.length === 0) {
        linksContainer.innerHTML = '<div class="no-links" style="opacity:.6">No linked entities</div>';
      }
    });
    
    // Left-click handler - jump to linked entity
    it.addEventListener('click', function(e) { 
      e.preventDefault();
      e.stopPropagation();
      console.log(`[click] Card ${cardId} jumping to linked entity ${linkId}`);
      focusOn(linkId);
    });
  });
  
  console.log(`[hydrateCard] Completed hydration for card ${cardId}`);
}

function updateCardUI(cardId, focusNew=false){ 
  console.log(`[updateCardUI] Starting update for card ${cardId}`);
  const c=byId(cardId); 
  const el=document.getElementById('card-'+cardId); 
  if(!c||!el) {
    console.log(`[updateCardUI] Card ${cardId} not found in data or DOM`);
    return;
  }
  
  console.log(`[updateCardUI] Current links for card ${cardId}:`, Array.from(links.get(cardId)||new Set()));
  
  el.querySelector('.card-title').textContent=c.name; 
  el.querySelector('.card-type').textContent=c.type||'entity'; 
  
  console.log(`[updateCardUI] Updating HTML for card ${cardId}`);
  el.querySelector('#attrs-'+cardId).innerHTML=renderAttrRows(c); 
  el.querySelector('#links-'+cardId).innerHTML=renderLinks(cardId); 
  el.querySelector('#txt-'+cardId).innerHTML=linkify(esc(c.content||''), cardId); 
  
  // FIX 3: Update datalist with linked entities only
  const dl=el.querySelector('#dl-'+cardId); 
  if(dl){ 
    dl.innerHTML=getLinkedEntitiesOptions(cardId); 
  } 
  
  console.log(`[updateCardUI] Calling hydrateCard for card ${cardId}`);
  hydrateCard(cardId); 
  
  if(focusNew){ 
    const rows=el.querySelectorAll('#attrs-'+cardId+' .attr-row'); 
    const last=rows[rows.length-1]; 
    last?.querySelector('.attr-key')?.focus(); 
  }
  
  console.log(`[updateCardUI] Completed update for card ${cardId}`);
}

// ---------- Drag / select ----------
let selecting=false, selStartX=0, selStartY=0; 
let dragging=false, dragStartX=0, dragStartY=0, dragIds=[]; 
let hover=null; 
const LINK_ZONE=40; // FIX 2: Increased link zone height
let selected=new Set();

function selectCard(e){ 
  e.stopPropagation(); 
  const id=parseInt(e.currentTarget.id.split('-')[1]); 
  if(!e.ctrlKey && !e.metaKey){ 
    selected.clear(); 
    document.querySelectorAll('.card.selected').forEach(n=>n.classList.remove('selected')); 
  } 
  if(selected.has(id)){ 
    selected.delete(id); 
    e.currentTarget.classList.remove('selected'); 
  } else { 
    selected.add(id); 
    e.currentTarget.classList.add('selected'); 
  } 
}

function startCardDrag(e){ 
  if(e.button!==0) return; 
  if(e.target.closest('.card-text')||e.target.tagName==='INPUT') return; 
  
  const box=e.currentTarget; 
  const id=parseInt(box.id.split('-')[1]); 
  
  if(!selected.has(id)){ 
    selected.clear(); 
    document.querySelectorAll('.card.selected').forEach(n=>n.classList.remove('selected')); 
    selected.add(id); 
    box.classList.add('selected'); 
  }
  
  dragging=true; 
  dragStartX=(e.clientX - viewX)/zoom; 
  dragStartY=(e.clientY - viewY)/zoom; 
  dragIds=[...selected]; 
  
  dragIds.forEach(cid=>{ 
    const ix=clones.findIndex(v=>v.refId===cid); 
    const el=document.getElementById('card-'+cid); 
    if(ix>=0 && el){ 
      el._ix=clones[ix].x; 
      el._iy=clones[ix].y; 
    } 
  }); 
}

// FIX 2: Enhanced drag & drop for containment and linking
document.addEventListener('mousemove', e=>{ 
  const wx=(e.clientX-viewX)/zoom, wy=(e.clientY-viewY)/zoom; 
  
  if(dragging){ 
    const dx=wx-dragStartX, dy=wy-dragStartY; 
    
    dragIds.forEach(cid=>{ 
      const ix=clones.findIndex(v=>v.refId===cid); 
      const el=document.getElementById('card-'+cid); 
      if(ix>=0&&el){ 
        clones[ix].x=el._ix+dx; 
        clones[ix].y=el._iy+dy; 
        el.style.setProperty('--x', clones[ix].x+'px'); 
        el.style.setProperty('--y', clones[ix].y+'px'); 
      } 
    }); 
    
    // FIX 2: Better hover detection
    const t=document.elementFromPoint(e.clientX,e.clientY)?.closest('.card'); 
    
    if(hover && t!==hover){ 
      hover.classList.remove('drop-target','link-zone'); 
    } 
    
    hover = (t && !dragIds.includes(parseInt(t.id.split('-')[1]))) ? t : null; 
    
    if(hover){ 
      const r=hover.getBoundingClientRect(); 
      // FIX 2: Check if we're in the link zone (bottom portion)
      if(e.clientY > r.bottom - LINK_ZONE) {
        hover.classList.add('drop-target', 'link-zone'); 
      } else {
        hover.classList.add('drop-target'); 
        hover.classList.remove('link-zone'); 
      }
    } 
  } 
  
  updateHUD(wx,wy); 
});

// FIX 2: Proper containment and linking on drop
document.addEventListener('mouseup', e=>{ 
  if(dragging){ 
    const lay=ensureLayout(currentPlane); 
    lay.cards = clones.map(v=>({...v})); 
    
    if(hover && dragIds.length > 0){ 
      const targetId=parseInt(hover.id.split('-')[1]); 
      const sourceId=dragIds[0]; // Use first selected card
      
      if(targetId && sourceId && targetId!==sourceId){ 
        const r=hover.getBoundingClientRect(); 
        
        // FIX 2: Determine action based on drop position
        if(e.clientY > r.bottom - LINK_ZONE) {
          // Link the entities
          link(sourceId, targetId); 
        } else {
          // Contain: make source a child of target
          contain(targetId, sourceId); 
        }
        
        updateCardUI(sourceId); 
        updateCardUI(targetId); 
      } 
      
      hover.classList.remove('drop-target','link-zone'); 
      hover=null; 
    } 
    
    dragging=false; 
    dragIds=[]; 
  }
  
  if(selecting){ 
    selecting=false; 
    lasso.style.display='none'; 
  }
});

plane.addEventListener('mousedown', e=>{ 
  if(e.shiftKey){ 
    if(e.button!==0||e.target.closest('.card')) return; 
    selecting=true; 
    selStartX=e.clientX; 
    selStartY=e.clientY; 
    Object.assign(lasso.style,{left:selStartX+'px',top:selStartY+'px',width:'0px',height:'0px',display:'block'}); 
  } else { 
    if(e.button!==0||e.target.closest('.card')) return; 
    selected.clear(); 
    document.querySelectorAll('.card.selected').forEach(n=>n.classList.remove('selected')); 
    draggingPlane=true; 
    plane.classList.add('dragging'); 
    plane.style.cursor='grabbing'; 
    planeStartX=e.clientX; 
    planeStartY=e.clientY; 
  } 
});

function updateSelection(left,top,w,h){ 
  document.querySelectorAll('.card').forEach(el=>{ 
    const r=el.getBoundingClientRect(); 
    const id=parseInt(el.id.split('-')[1]); 
    const hit=!(r.right<left||r.left>left+w||r.bottom<top||r.top>top+h); 
    if(hit){ 
      selected.add(id); 
      el.classList.add('selected'); 
    } else { 
      selected.delete(id); 
      el.classList.remove('selected'); 
    } 
  }); 
}

// plane panning
let draggingPlane=false, planeStartX=0, planeStartY=0;
document.addEventListener('mousemove', e=>{ 
  if(draggingPlane){ 
    const dx=e.clientX-planeStartX, dy=e.clientY-planeStartY; 
    viewX+=dx; viewY+=dy; 
    planeStartX=e.clientX; 
    planeStartY=e.clientY; 
    updateView(); 
  } 
  if(selecting){ 
    const cx=e.clientX, cy=e.clientY; 
    const l=Math.min(selStartX,cx), t=Math.min(selStartY,cy); 
    const w=Math.abs(cx-selStartX), h=Math.abs(cy-selStartY); 
    Object.assign(lasso.style,{left:l+'px',top:t+'px',width:w+'px',height:h+'px'}); 
    updateSelection(l,t,w,h); 
  } 
});

document.addEventListener('mouseup', ()=>{ 
  if(draggingPlane){ 
    draggingPlane=false; 
    plane.classList.remove('dragging'); 
    plane.style.cursor='grab'; 
    const lay=ensureLayout(currentPlane); 
    lay.viewX=viewX; 
    lay.viewY=viewY; 
  } 
});

// ---------- Linking / containment ----------
function link(a,b){ 
  if(a===b) return; 
  console.log(`[link] Linking ${a} to ${b}`);
  ensure(links,a).add(b); 
  ensure(links,b).add(a); 
  console.log(`[link] After linking - Card ${a} links:`, Array.from(links.get(a)||new Set()));
  console.log(`[link] After linking - Card ${b} links:`, Array.from(links.get(b)||new Set()));
}

function unlink(a,b){ 
  console.log(`[unlink] Unlinking ${a} from ${b}`);
  console.log(`  Before - Card ${a} links:`, Array.from(links.get(a)||new Set()));
  console.log(`  Before - Card ${b} links:`, Array.from(links.get(b)||new Set()));
  
  links.get(a)?.delete(b); 
  links.get(b)?.delete(a); 
  
  console.log(`  After - Card ${a} links:`, Array.from(links.get(a)||new Set()));
  console.log(`  After - Card ${b} links:`, Array.from(links.get(b)||new Set()));
}

// FIX 2: Proper containment that establishes parent-child relationship
function contain(parent,child){ 
  if(parent===child) return; 
  
  // Add to parent's children
  ensure(childrenOf,parent).add(child); 
  
  // Add to child's parents
  ensure(parentsOf,child).add(parent); 
  
  // Remove from current plane if it's visible
  const lay = ensureLayout(currentPlane);
  lay.cards = lay.cards.filter(v => v.refId !== child);
  
  // Re-render to update the view
  renderPlane(currentPlane);
}

// ---------- Sections ----------
function toggleSection(kind, id){ 
  const caret=document.getElementById(`caret-${kind}-${id}`); 
  const body=document.getElementById(`${kind}-${id}`); 
  if(!caret||!body) return; 
  
  const open=getComputedStyle(body).display!=='none'; 
  body.style.display=open?'none':'block'; 
  caret.classList.toggle('down', !open); 
  
  // FIX 4: If opening attributes and it's empty, ensure empty row exists
  if(!open && kind === 'attrs') {
    const card = byId(id);
    if(card) {
      const attrs = effectiveAttrs(id);
      // If no attributes at all (not even inherited), ensure we have an empty one
      if(attrs.length === 0 && (!card.attributes || card.attributes.length === 0)) {
        card.attributes = [{key:'',value:'',kind:'text'}];
        updateCardUI(id);
      }
    }
  }
}

// ---------- Wheel zoom / enter / exit ----------
const stack=[]; // {planeId,entered}
plane.addEventListener('wheel', e=>{ 
  e.preventDefault(); 
  const f=e.deltaY<0?1.1:0.9; 
  const nz=Math.max(.1,Math.min(10,zoom*f)); 
  const hovered=document.elementFromPoint(e.clientX,e.clientY)?.closest('.card'); 
  
  if(nz!==zoom){ 
    const old=zoom; 
    zoom=nz; 
    
    if(hovered && zoom>=3 && old<3 && depth===0){ 
      const id=parseInt(hovered.id.split('-')[1]); 
      zoom=1; 
      enter(id); 
    } else if(depth>0 && zoom<=.5 && old>.5){ 
      zoom=1; 
      exit(); 
    } else { 
      const mx=e.clientX,my=e.clientY; 
      const wxB=(mx-viewX)/old, wyB=(my-viewY)/old; 
      const wxA=(mx-viewX)/zoom, wyA=(my-viewY)/zoom; 
      viewX+=(wxA-wxB)*zoom; 
      viewY+=(wyA-wyB)*zoom; 
      updateView(); 
      updateHUD(); 
    } 
  } 
}, {passive:false});

function enter(id){ 
  const lay=ensureLayout(currentPlane); 
  lay.viewX=viewX; 
  lay.viewY=viewY; 
  stack.push({planeId:currentPlane,entered:id}); 
  depth++; 
  currentPlane=id; 
  renderPlane(currentPlane); 
  center(); 
}

function exit(){ 
  if(!stack.length) return; 
  const prev=stack.pop(); 
  depth--; 
  currentPlane=prev.planeId??null; 
  renderPlane(currentPlane); 
  // center back on the card we exited from
  if(prev.entered!=null) setTimeout(()=> focusOn(prev.entered), 20); 
}

function center(){ 
  if(!clones.length) return; 
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity; 
  clones.forEach(c=>{ 
    minX=Math.min(minX,c.x); 
    minY=Math.min(minY,c.y); 
    maxX=Math.max(maxX,c.x+340); 
    maxY=Math.max(maxY,c.y+220); 
  }); 
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2; 
  viewX=innerWidth/2 - (cx*zoom); 
  viewY=innerHeight/2 - (cy*zoom); 
  updateView(); 
}

function focusOn(id){ 
  const v=clones.find(c=>c.refId===id); 
  if(!v) return; 
  viewX=-v.x*zoom + innerWidth/2 - 170*zoom; 
  viewY=-v.y*zoom + innerHeight/2 - 110*zoom; 
  updateView(); 
  const el=document.getElementById('card-'+id); 
  if(el){ 
    el.style.boxShadow='0 0 30px rgba(0,255,136,.8)'; 
    setTimeout(()=> el.style.boxShadow='', 900); 
  } 
}

// ---------- Text linkify ----------
function linkify(text, selfId){ 
  let out=text; 
  all.forEach(k=>{ 
    if(!k.name||k.id===selfId) return; 
    const re=new RegExp('\\b'+escRe(k.name)+'\\b','gi'); 
    out=out.replace(re, m=>`<span class="entity-link" onclick="focusOn(${k.id})">${m}</span>`); 
  }); 
  return out; 
}

// ---------- CRUD / toolbar ----------
function createCard(x,y){ 
  if(x==null) x=(innerWidth/2 - viewX)/zoom - 160; 
  if(y==null) y=(innerHeight/2 - viewY)/zoom - 110; 
  const c={id:nextId++,name:'Entity '+(nextId-1),type:'entity',content:'',attributes:[]}; 
  all.push(c); 
  const lay=ensureLayout(currentPlane); 
  const newCard = {refId:c.id,x,y};
  lay.cards.push(newCard); 
  // FIX: Also add to clones array so drag works immediately
  clones.push({refId:c.id,x,y});
  renderCard(newCard); 
  updateHUD(); 
  return c; 
}

function deleteCard(id){ 
  links.get(id)?.forEach(o=>links.get(o)?.delete(id)); 
  links.delete(id); 
  parentsOf.get(id)?.forEach(p=>childrenOf.get(p)?.delete(id)); 
  parentsOf.delete(id); 
  childrenOf.get(id)?.forEach(ch=>parentsOf.get(ch)?.delete(id)); 
  childrenOf.delete(id); 
  all=all.filter(c=>c.id!==id); 
  layouts.forEach(l=> l.cards=l.cards.filter(v=>v.refId!==id)); 
  document.getElementById('card-'+id)?.remove(); 
  selected.delete(id); 
  updateHUD(); 
}

function deleteSelected(){ 
  [...selected].forEach(deleteCard); 
}

function resetView(){ 
  viewX=0; 
  viewY=0; 
  zoom=1; 
  updateView(); 
  updateHUD(); 
}

// ---------- Seed + first render ----------
(function seed(){
  const a={id:nextId++,name:'Sarah Chen',type:'Actor',content:'A marine biologist studying deep-sea creatures. She works at The Research Station and is concerned about the Strange Readings.',attributes:[{key:'Role',value:'Lead scientist',kind:'text'}]};
  const b={id:nextId++,name:'The Research Station',type:'Location',content:'A remote underwater facility 200 meters below the Pacific Ocean surface. Sarah Chen conducts her research here.',attributes:[]};
  const d={id:nextId++,name:'Strange Readings',type:'Event',content:'Sonar equipment detects unusual patterns below The Research Station. Sarah Chen is investigating.',attributes:[]};
  all.push(a,b,d);
  ensure(childrenOf,a.id); 
  ensure(childrenOf,b.id); 
  ensure(childrenOf,d.id);
  // links for demo
  ensure(links,a.id).add(b.id); 
  ensure(links,b.id).add(a.id); 
  ensure(links,a.id).add(d.id); 
  ensure(links,d.id).add(a.id); 
  ensure(links,b.id).add(d.id); 
  ensure(links,d.id).add(b.id);
  // root layout
  const L=ensureLayout(null); 
  L.cards=[{refId:a.id,x:120,y:110},{refId:b.id,x:430,y:150},{refId:d.id,x:240,y:320}];
  renderPlane(null);
})();

// Expose minimal API
window.createCard=createCard; 
window.deleteSelected=deleteSelected; 
window.resetView=resetView; 
window.deleteCard=deleteCard;
window.toggleSection=toggleSection;
window.focusOn=focusOn;