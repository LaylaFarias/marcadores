// ── DATA ──────────────────────────────────────────────────────────────────────
const TAG_COLORS = [
  '#7c6af7','#38d5e0','#3ddb7a','#f0b429','#f05c5c','#e06bdb','#ff8c42','#5bb4ff'
];
function tagColor(tag) {
  let h = 0; for (let c of tag) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return TAG_COLORS[Math.abs(h) % TAG_COLORS.length];
}

let bookmarks = JSON.parse(localStorage.getItem('vault_bm') || '[]');
let activeFilters = [];
let currentView = 'all';
let editingId = null;
let modalTags = [];
let searchQuery = '';
let debounceTimer;

// seed demo data
if (!bookmarks.length) {
  const now = Date.now();
  bookmarks = [
    { id:1, url:'https://github.com', title:'GitHub', desc:'Plataforma de hospedagem de código com controle de versão Git.', tags:['dev','git','ferramentas'], pinned:true, archived:false, views:42, lastVisit: now - 3600000, added: now - 86400000*5 },
    { id:2, url:'https://developer.mozilla.org', title:'MDN Web Docs', desc:'Documentação completa para tecnologias web: HTML, CSS, JavaScript.', tags:['dev','docs','frontend'], pinned:false, archived:false, views:18, lastVisit: now - 7200000, added: now - 86400000*3 },
    { id:3, url:'https://figma.com', title:'Figma', desc:'Ferramenta colaborativa de design de interfaces.', tags:['design','ferramentas'], pinned:true, archived:false, views:29, lastVisit: now - 1800000, added: now - 86400000*2 },
    { id:4, url:'https://tailwindcss.com', title:'Tailwind CSS', desc:'Framework CSS utilitário para desenvolvimento rápido.', tags:['dev','css','frontend'], pinned:false, archived:false, views:9, lastVisit: now - 86400000, added: now - 86400000*7 },
    { id:5, url:'https://news.ycombinator.com', title:'Hacker News', desc:'Notícias de tecnologia e startups da Y Combinator.', tags:['notícias','tech'], pinned:false, archived:true, views:5, lastVisit: now - 86400000*2, added: now - 86400000*10 },
    { id:6, url:'https://vercel.com', title:'Vercel', desc:'Plataforma de deploy para aplicações frontend e serverless.', tags:['dev','deploy','ferramentas'], pinned:false, archived:false, views:14, lastVisit: now - 900000, added: now - 86400000 },
  ];
  save();
}

function save() {
  localStorage.setItem('vault_bm', JSON.stringify(bookmarks));
}
function nextId() { return bookmarks.length ? Math.max(...bookmarks.map(b=>b.id))+1 : 1; }

function getFaviconUrl(url) {
  try { const u = new URL(url); return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`; }
  catch { return null; }
}

function timeAgo(ts) {
  const d = Date.now() - ts, s = Math.floor(d/1000);
  if (s<60) return 'agora';
  if (s<3600) return `${Math.floor(s/60)}m`;
  if (s<86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function getVisible() {
  let list = bookmarks.filter(b => currentView === 'archived' ? b.archived : (currentView==='pinned' ? !b.archived && b.pinned : !b.archived));
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(b => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q) || b.desc.toLowerCase().includes(q));
  }
  if (activeFilters.length) {
    list = list.filter(b => activeFilters.every(t => b.tags.includes(t)));
  }
  const sort = document.getElementById('sortSelect').value;
  if (sort==='visited') list.sort((a,b)=>b.lastVisit-a.lastVisit);
  else if (sort==='popular') list.sort((a,b)=>b.views-a.views);
  else list.sort((a,b)=>b.added-a.added);
  // pinned first in 'all'
  if (currentView==='all') list.sort((a,b)=> (b.pinned?1:0)-(a.pinned?1:0));
  return list;
}

function render() {
  const list = getVisible();
  const grid = document.getElementById('bookmarksGrid');

  // update badges
  document.getElementById('badge-all').textContent = bookmarks.filter(b=>!b.archived).length;
  document.getElementById('badge-pinned').textContent = bookmarks.filter(b=>b.pinned&&!b.archived).length;
  document.getElementById('badge-archived').textContent = bookmarks.filter(b=>b.archived).length;

  // sidebar tags
  const allTags = [...new Set(bookmarks.filter(b=>!b.archived).flatMap(b=>b.tags))].sort();
  const tagsList = document.getElementById('tagsList');
  tagsList.innerHTML = allTags.map(t=>`
    <div class="tag-nav ${activeFilters.includes(t)?'active':''}" onclick="toggleTagFilter('${t}')">
      <span class="tag-dot" style="background:${tagColor(t)}"></span>${t}
    </div>`).join('');

  // active tags bar
  const bar = document.getElementById('activeTagsBar');
  bar.innerHTML = activeFilters.map(t=>`
    <div class="active-tag" onclick="toggleTagFilter('${t}')">
      <span>${t}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </div>`).join('');

  // archived banner
  document.getElementById('archivedBanner').style.display = currentView==='archived'?'flex':'none';

  // section title
  const titles = {all:'Todos os Marcadores', pinned:'Fixados', archived:'Arquivados'};
  document.getElementById('sectionTitle').textContent = titles[currentView]||'Marcadores';

  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg></div>
        <p class="empty-title">Nenhum marcador encontrado</p>
        <p class="empty-sub">${searchQuery||activeFilters.length ? 'Tente outros filtros ou termos de busca.' : 'Adicione seu primeiro marcador clicando em "+ Adicionar".'}</p>
      </div>`;
    return;
  }

  grid.innerHTML = list.map(b => {
    const fav = getFaviconUrl(b.url);
    const host = (() => { try { return new URL(b.url).hostname; } catch { return b.url; }})();
    return `
    <div class="bookmark-card ${b.pinned?'pinned':''}" data-id="${b.id}">
      ${b.pinned ? `<div class="pin-badge"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>` : ''}
      <div class="card-header">
        <div class="favicon">${fav?`<img src="${fav}" onerror="this.style.display='none'" loading="lazy">`:''}${host.slice(0,2).toUpperCase()}</div>
        <div class="card-title-wrap">
          <div class="card-title">${esc(b.title)}</div>
          <div class="card-url">${esc(host)}</div>
        </div>
      </div>
      ${b.desc ? `<div class="card-desc">${esc(b.desc)}</div>` : ''}
      ${b.tags.length ? `<div class="card-tags">${b.tags.map(t=>`<span class="tag-chip" style="color:${tagColor(t)};border-color:${tagColor(t)}33" onclick="toggleTagFilter('${t}')">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="card-meta">
        <span class="meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${b.views} visitas</span>
        <span class="meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${timeAgo(b.lastVisit)}</span>
        <span class="meta-item" title="${formatDate(b.added)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${formatDate(b.added)}</span>
        <div class="card-actions">
          <button class="card-btn" onclick="visitBookmark(${b.id})" title="Abrir URL">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
          <button class="card-btn" onclick="copyUrl(${b.id})" title="Copiar URL">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
          <button class="card-btn" onclick="togglePin(${b.id})" title="${b.pinned?'Desafixar':'Fixar'}" style="${b.pinned?'color:var(--pin)':''}">
            <svg viewBox="0 0 24 24" fill="${b.pinned?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </button>
          <button class="card-btn" onclick="openEdit(${b.id})" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="card-btn" onclick="toggleArchive(${b.id})" title="${b.archived?'Desarquivar':'Arquivar'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
          </button>
          <button class="card-btn danger" onclick="deleteBookmark(${b.id})" title="Excluir">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function esc(s='') { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── ACTIONS ──────────────────────────────────────────────────────────────────
function setView(v, el) {
  currentView = v;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  if(el) el.classList.add('active');
  activeFilters = [];
  render();
}

function toggleTagFilter(tag) {
  if (activeFilters.includes(tag)) activeFilters = activeFilters.filter(t=>t!==tag);
  else activeFilters.push(tag);
  render();
}

function visitBookmark(id) {
  const b = bookmarks.find(x=>x.id===id);
  if (!b) return;
  b.views++; b.lastVisit = Date.now(); save(); render();
  window.open(b.url, '_blank');
}

function copyUrl(id) {
  const b = bookmarks.find(x=>x.id===id);
  if (!b) return;
  navigator.clipboard.writeText(b.url).then(()=>toast('URL copiada!','success')).catch(()=>toast('Erro ao copiar','error'));
}

function togglePin(id) {
  const b = bookmarks.find(x=>x.id===id);
  if (!b) return;
  b.pinned = !b.pinned; save(); render();
  toast(b.pinned?'Marcador fixado':'Marcador desafixado','info');
}

function toggleArchive(id) {
  const b = bookmarks.find(x=>x.id===id);
  if (!b) return;
  b.archived = !b.archived; if(b.archived) b.pinned = false;
  save(); render();
  toast(b.archived?'Arquivado':'Restaurado da biblioteca','info');
}

function deleteBookmark(id) {
  const b = bookmarks.find(x => x.id === id);
  if (!b) return;

  const confirmDelete = confirm(`Tem certeza que deseja excluir "${b.title}"?`);
  if (!confirmDelete) return;

  const input = prompt(`Para confirmar, digite o título do marcador:\n\n"${b.title}"`);

  if (input === null) return; // cancelou

  if (input.trim() !== b.title) {
    toast('Título incorreto. Exclusão cancelada.', 'error');
    return;
  }

  bookmarks = bookmarks.filter(x => x.id !== id);
  save();
  render();
  toast('Marcador excluído com sucesso', 'success');
}

// ── MODAL ──────────────────────────────────────────────────────────────────
function openModal(edit=false) {
  editingId = edit ? edit : null;
  modalTags = [];
  const b = edit ? bookmarks.find(x=>x.id===edit) : null;
  document.getElementById('modalTitle').textContent = edit ? 'Editar Marcador' : 'Adicionar Marcador';
  document.getElementById('fieldUrl').value = b ? b.url : '';
  document.getElementById('fieldTitle').value = b ? b.title : '';
  document.getElementById('fieldDesc').value = b ? b.desc : '';
  document.getElementById('tagRaw').value = '';
  document.getElementById('errUrl').textContent = '';
  document.getElementById('errTitle').textContent = '';
  if (b) { b.tags.forEach(t=>addModalTag(t)); }
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(()=>document.getElementById('fieldUrl').focus(), 80);
}
function openEdit(id) { openModal(id); }
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); editingId=null; }

function addModalTag(t) {
  t = t.trim().toLowerCase().replace(/,/g,'');
  if (!t || modalTags.includes(t)) return;
  modalTags.push(t);
  renderModalTags();
}
function removeModalTag(t) { modalTags = modalTags.filter(x=>x!==t); renderModalTags(); }
function renderModalTags() {
  document.getElementById('tagPillsContainer').innerHTML = modalTags.map(t=>`
    <div class="tag-pill">${esc(t)}<button type="button" onclick="removeModalTag('${t}')" aria-label="Remover">×</button></div>`).join('');
}

document.getElementById('tagRaw').addEventListener('keydown', e => {
  if (e.key==='Enter'||e.key===',') { e.preventDefault(); addModalTag(e.target.value); e.target.value=''; }
  if (e.key==='Backspace' && !e.target.value && modalTags.length) removeModalTag(modalTags[modalTags.length-1]);
});
document.getElementById('tagRaw').addEventListener('blur', e => { if(e.target.value.trim()){addModalTag(e.target.value);e.target.value='';} });

function validateUrl(url) {
  try { new URL(url); return true; } catch { return false; }
}

function checkDuplicate(url, excludeId=null) {
  return bookmarks.some(b => b.url===url && b.id!==excludeId);
}

function saveBookmark() {
  const url = document.getElementById('fieldUrl').value.trim();
  const title = document.getElementById('fieldTitle').value.trim();
  const desc = document.getElementById('fieldDesc').value.trim();
  let valid = true;
  document.getElementById('errUrl').textContent = '';
  document.getElementById('errTitle').textContent = '';
  document.getElementById('fieldUrl').classList.remove('error');
  document.getElementById('fieldTitle').classList.remove('error');

  if (!url) { document.getElementById('errUrl').textContent='URL é obrigatória'; document.getElementById('fieldUrl').classList.add('error'); valid=false; }
  else if (!validateUrl(url)) { document.getElementById('errUrl').textContent='URL inválida (inclua https://)'; document.getElementById('fieldUrl').classList.add('error'); valid=false; }
  else if (checkDuplicate(url, editingId)) { document.getElementById('errUrl').textContent='Este URL já foi adicionado'; document.getElementById('fieldUrl').classList.add('error'); valid=false; }
  if (!title) { document.getElementById('errTitle').textContent='Título é obrigatório'; document.getElementById('fieldTitle').classList.add('error'); valid=false; }
  if (!valid) return;

  // flush tag input
  const raw = document.getElementById('tagRaw').value.trim();
  if (raw) addModalTag(raw);

  if (editingId) {
    const b = bookmarks.find(x=>x.id===editingId);
    b.url=url; b.title=title; b.desc=desc; b.tags=[...modalTags];
    toast('Marcador atualizado','success');
  } else {
    bookmarks.unshift({ id:nextId(), url, title, desc, tags:[...modalTags], pinned:false, archived:false, views:0, lastVisit:Date.now(), added:Date.now() });
    toast('Marcador adicionado','success');
  }
  save(); render(); closeModal();
}

document.getElementById('addBtn').onclick = () => openModal();
document.getElementById('modalOverlay').addEventListener('click', e => { if(e.target===e.currentTarget) closeModal(); });
document.addEventListener('keydown', e => { if(e.key==='Escape') closeModal(); });

// ── SEARCH (debounce) ─────────────────────────────────────────────────────
document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(()=>{ searchQuery = e.target.value.trim(); render(); }, 220);
});

// ── THEME ────────────────────────────────────────────────────────────────────
let theme = localStorage.getItem('vault_theme') || 'dark';
document.documentElement.setAttribute('data-theme', theme);
document.getElementById('themeToggle').addEventListener('click', () => {
  theme = theme==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('vault_theme', theme);
});

// ── TOAST ─────────────────────────────────────────────────────────────────────
function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = `toast-item ${type}`;
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(()=>el.remove(), 2800);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
render();