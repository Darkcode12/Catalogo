'use strict';

// ===== STATE =====
let db;
let categories = [];
let currentCatId = null;
let editingCatId = null;
let editingProdId = null;
let pendingImg = null;
let currentStatus = 'try';
let activeFilter = 'all';
let accent = localStorage.getItem('catalogo_accent') || '#a78bfa';

// ===== DB =====
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('catalogo_db', 1);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('categories')) d.createObjectStore('categories', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('products'))   d.createObjectStore('products',   { keyPath: 'id' });
    };
    req.onsuccess = e => { db = e.target.result; res(); };
    req.onerror = () => rej(req.error);
  });
}
function dbGetAll(store) {
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readonly').objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
function dbPut(store, obj) {
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readwrite').objectStore(store).put(obj);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}
function dbDelete(store, id) {
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readwrite').objectStore(store).delete(id);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

// ===== HELPERS =====
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const showSheet = id => document.getElementById(id).classList.add('open');
const hideSheet = id => document.getElementById(id).classList.remove('open');
const showView  = id => {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
};

const STATUS_LABEL = { works:'✅ Funciona', nope:'❌ No funciona', try:'🟡 Por probar' };
const STATUS_BADGE = { works:'badge-works', nope:'badge-nope', try:'badge-try' };
const STATUS_DETAIL_BADGE = { works:'detail-badge-works', nope:'detail-badge-nope', try:'detail-badge-try' };

// ===== LOAD =====
async function loadCategories() {
  categories = await dbGetAll('categories');
  categories.sort((a,b) => (a.order||0) - (b.order||0));
}

// ===== HOME =====
async function renderHome() {
  await loadCategories();
  const allProducts = await dbGetAll('products');
  const list  = document.getElementById('categoriesList');
  const empty = document.getElementById('emptyHome');

  if (!categories.length) { list.innerHTML = ''; empty.classList.add('show'); return; }
  empty.classList.remove('show');

  list.innerHTML = categories.map((cat, i) => {
    const prods = allProducts.filter(p => p.categoryId === cat.id);
    const works = prods.filter(p => p.status === 'works').length;
    const nope  = prods.filter(p => p.status === 'nope').length;
    const tryN  = prods.filter(p => p.status === 'try').length;
    return `<div class="cat-card" data-id="${cat.id}" style="animation-delay:${Math.min(i*.05,.3)}s">
      <div class="cat-left">
        <span class="cat-name">${esc(cat.name)}</span>
        <div class="cat-stats">
          <span class="cat-stat"><span class="stat-dot" style="background:var(--works)"></span>${works} funciona</span>
          <span class="cat-stat"><span class="stat-dot" style="background:var(--nope)"></span>${nope} no funciona</span>
          <span class="cat-stat"><span class="stat-dot" style="background:var(--try)"></span>${tryN} por probar</span>
        </div>
      </div>
      <span class="cat-arrow">›</span>
    </div>`;
  }).join('');

  list.querySelectorAll('.cat-card').forEach(el => {
    el.addEventListener('click', () => openCategory(Number(el.dataset.id)));
  });
}

// ===== CATEGORY VIEW =====
async function openCategory(id) {
  currentCatId = id;
  activeFilter = 'all';
  document.querySelectorAll('.sf-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
  const cat = categories.find(c => c.id === id);
  document.getElementById('categoryTitle').textContent = cat?.name || '';
  showView('viewCategory');
  await renderProducts();
}

async function renderProducts() {
  const allProducts = await dbGetAll('products');
  let products = allProducts.filter(p => p.categoryId === currentCatId).sort((a,b) => (a.order||0)-(b.order||0));

  // Apply search filter if active
  const searchVal = document.getElementById('catSearchInput').value.trim().toLowerCase();
  if (searchVal) products = products.filter(p => p.name.toLowerCase().includes(searchVal));
  // Apply status filter
  if (activeFilter !== 'all') products = products.filter(p => p.status === activeFilter);

  const grid  = document.getElementById('productGrid');
  const empty = document.getElementById('emptyCategory');

  if (!products.length) { grid.innerHTML = ''; empty.classList.add('show'); return; }
  empty.classList.remove('show');

  grid.innerHTML = products.map((p, i) => `
    <div class="prod-card ${p.status}" data-id="${p.id}" style="animation-delay:${Math.min(i*.04,.3)}s">
      <div class="prod-cover">
        ${p.img ? `<img src="${esc(p.img)}" loading="lazy" onerror="this.style.display='none'">` : '📦'}
      </div>
      <div class="prod-info">
        <div class="prod-name">${esc(p.name)}</div>
        <span class="prod-badge ${STATUS_BADGE[p.status]}">${STATUS_LABEL[p.status]}</span>
      </div>
      ${p.notes ? '<div class="prod-notes-icon">📝</div>' : ''}
    </div>
  `).join('');

  grid.querySelectorAll('.prod-card').forEach(el => {
    el.addEventListener('click', () => openDetail(Number(el.dataset.id)));
  });
}

// ===== DETAIL VIEW =====
async function openDetail(id) {
  const allProducts = await dbGetAll('products');
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  editingProdId = id;
  document.getElementById('detailTitle').textContent = p.name;
  const content = document.getElementById('detailContent');
  content.innerHTML = `
    ${p.img
      ? `<img class="detail-img" src="${esc(p.img)}" alt="${esc(p.name)}">`
      : `<div class="detail-img-placeholder">📦</div>`}
    <div class="detail-body">
      <span class="detail-status-badge ${STATUS_DETAIL_BADGE[p.status]}">${STATUS_LABEL[p.status]}</span>
      ${p.notes ? `
        <div>
          <div class="detail-notes-label">Notas</div>
          <div class="detail-notes-text">${esc(p.notes)}</div>
        </div>` : ''}
    </div>
  `;
  showView('viewDetail');
}

// ===== SEARCH =====
function initSearch() {
  // Home search
  document.getElementById('btnHomeSearch').addEventListener('click', () => {
    document.getElementById('homeSearchBar').style.display = 'flex';
    document.getElementById('homeSearchInput').focus();
    document.getElementById('categoriesList').style.display = 'none';
    document.getElementById('emptyHome').style.display = 'none';
    document.getElementById('searchResults').style.display = 'flex';
  });
  document.getElementById('btnHomeSearchClose').addEventListener('click', () => {
    document.getElementById('homeSearchBar').style.display = 'none';
    document.getElementById('homeSearchInput').value = '';
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('categoriesList').style.display = '';
    renderHome();
  });
  document.getElementById('homeSearchInput').addEventListener('input', async e => {
    const q = e.target.value.trim().toLowerCase();
    const resultsEl = document.getElementById('searchResults');
    if (!q) { resultsEl.innerHTML = ''; return; }
    const allProducts = await dbGetAll('products');
    const allCats = await dbGetAll('categories');
    const results = allProducts.filter(p => p.name.toLowerCase().includes(q));
    if (!results.length) { resultsEl.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px">Sin resultados</div>'; return; }
    resultsEl.innerHTML = results.map(p => {
      const cat = allCats.find(c => c.id === p.categoryId);
      return `<div class="search-result-item" data-prod-id="${p.id}" data-cat-id="${p.categoryId}">
        <div class="sr-thumb">${p.img ? `<img src="${esc(p.img)}" loading="lazy">` : '📦'}</div>
        <div class="sr-info">
          <div class="sr-name">${esc(p.name)}</div>
          <div class="sr-cat">${cat ? esc(cat.name) : ''}</div>
        </div>
        <div class="sr-status sr-${p.status}"></div>
      </div>`;
    }).join('');
    resultsEl.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', async () => {
        await openCategory(Number(el.dataset.catId));
        openDetail(Number(el.dataset.prodId));
      });
    });
  });

  // Category search
  document.getElementById('btnCatSearch').addEventListener('click', () => {
    document.getElementById('catSearchBar').style.display = 'flex';
    document.getElementById('catSearchInput').focus();
  });
  document.getElementById('btnCatSearchClose').addEventListener('click', () => {
    document.getElementById('catSearchBar').style.display = 'none';
    document.getElementById('catSearchInput').value = '';
    renderProducts();
  });
  document.getElementById('catSearchInput').addEventListener('input', () => renderProducts());
}

// ===== STATUS FILTER =====
document.querySelectorAll('.sf-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('.sf-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderProducts();
  });
});

// ===== NAVIGATION =====
document.getElementById('btnBack').addEventListener('click', () => {
  document.getElementById('catSearchBar').style.display = 'none';
  document.getElementById('catSearchInput').value = '';
  showView('viewHome');
  renderHome();
});
document.getElementById('btnBackDetail').addEventListener('click', () => {
  showView('viewCategory');
  renderProducts();
});
document.getElementById('btnEditProduct').addEventListener('click', () => openEditProduct(editingProdId));

// ===== CATEGORY SHEET =====
document.getElementById('btnAddCategory').addEventListener('click', () => {
  editingCatId = null;
  document.getElementById('catSheetTitle').textContent = 'Nueva categoría';
  document.getElementById('inp-cat-name').value = '';
  document.getElementById('catDeleteWrap').style.display = 'none';
  showSheet('sheetCategory');
  setTimeout(() => document.getElementById('inp-cat-name').focus(), 300);
});

document.getElementById('btnEditCategory').addEventListener('click', () => {
  const cat = categories.find(c => c.id === currentCatId);
  if (!cat) return;
  editingCatId = currentCatId;
  document.getElementById('catSheetTitle').textContent = 'Editar categoría';
  document.getElementById('inp-cat-name').value = cat.name;
  document.getElementById('catDeleteWrap').style.display = 'block';
  showSheet('sheetCategory');
  setTimeout(() => document.getElementById('inp-cat-name').focus(), 300);
});

document.getElementById('btnSaveCategory').addEventListener('click', async () => {
  const name = document.getElementById('inp-cat-name').value.trim();
  if (!name) return;
  if (editingCatId) {
    const cat = categories.find(c => c.id === editingCatId);
    if (cat) { cat.name = name; await dbPut('categories', cat); }
    document.getElementById('categoryTitle').textContent = name;
  } else {
    const cat = { id: Date.now(), name, order: categories.length };
    categories.push(cat);
    await dbPut('categories', cat);
  }
  hideSheet('sheetCategory');
  renderHome();
});

document.getElementById('inp-cat-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btnSaveCategory').click();
});

document.getElementById('btnDeleteCategory').addEventListener('click', async () => {
  if (!editingCatId) return;
  await dbDelete('categories', editingCatId);
  const allProducts = await dbGetAll('products');
  for (const p of allProducts.filter(p => p.categoryId === editingCatId)) await dbDelete('products', p.id);
  categories = categories.filter(c => c.id !== editingCatId);
  hideSheet('sheetCategory');
  showView('viewHome');
  renderHome();
});

// ===== PRODUCT SHEET =====
function resetProductForm() {
  document.getElementById('inp-prod-name').value = '';
  document.getElementById('inp-prod-notes').value = '';
  document.getElementById('inp-prod-img-url').value = '';
  document.getElementById('prod-file-label').textContent = 'Toca para elegir imagen';
  document.getElementById('prod-img-preview-wrap').style.display = 'none';
  document.getElementById('prod-img-preview').src = '';
  document.getElementById('prodDeleteWrap').style.display = 'none';
  pendingImg = null;
  currentStatus = 'try';
  document.querySelectorAll('.sp-btn').forEach(b => b.classList.toggle('active', b.dataset.status === 'try'));
  setImgTab('url', document.querySelector('.itab[data-tab="url"]'));
}

function setImgTab(tab, el) {
  document.querySelectorAll('.itab').forEach(b => b.classList.remove('active'));
  el?.classList.add('active');
  document.getElementById('itab-url').style.display  = tab === 'url'  ? '' : 'none';
  document.getElementById('itab-file').style.display = tab === 'file' ? '' : 'none';
}
document.querySelectorAll('.itab').forEach(btn => {
  btn.addEventListener('click', () => setImgTab(btn.dataset.tab, btn));
});

document.querySelectorAll('.sp-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentStatus = btn.dataset.status;
    document.querySelectorAll('.sp-btn').forEach(b => b.classList.toggle('active', b === btn));
  });
});

document.getElementById('inp-prod-img-url').addEventListener('input', e => {
  const url = e.target.value.trim();
  if (url) { document.getElementById('prod-img-preview').src = url; document.getElementById('prod-img-preview-wrap').style.display = 'flex'; pendingImg = url; }
  else { document.getElementById('prod-img-preview-wrap').style.display = 'none'; pendingImg = null; }
});

document.getElementById('inp-prod-img-file').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    pendingImg = ev.target.result;
    document.getElementById('prod-img-preview').src = pendingImg;
    document.getElementById('prod-img-preview-wrap').style.display = 'flex';
    document.getElementById('prod-file-label').textContent = file.name;
  };
  reader.readAsDataURL(file);
});

document.getElementById('btnClearProdImg').addEventListener('click', () => {
  pendingImg = null;
  document.getElementById('inp-prod-img-url').value = '';
  document.getElementById('prod-file-label').textContent = 'Toca para elegir imagen';
  document.getElementById('prod-img-preview-wrap').style.display = 'none';
});

document.getElementById('btnAddProduct').addEventListener('click', () => {
  editingProdId = null;
  document.getElementById('prodSheetTitle').textContent = 'Nuevo producto';
  resetProductForm();
  showSheet('sheetProduct');
  setTimeout(() => document.getElementById('inp-prod-name').focus(), 300);
});

async function openEditProduct(id) {
  const allProducts = await dbGetAll('products');
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  editingProdId = id;
  document.getElementById('prodSheetTitle').textContent = 'Editar producto';
  document.getElementById('inp-prod-name').value = p.name;
  document.getElementById('inp-prod-notes').value = p.notes || '';
  currentStatus = p.status;
  document.querySelectorAll('.sp-btn').forEach(b => b.classList.toggle('active', b.dataset.status === p.status));
  pendingImg = p.img || null;
  if (p.img) {
    document.getElementById('prod-img-preview').src = p.img;
    document.getElementById('prod-img-preview-wrap').style.display = 'flex';
    if (!p.img.startsWith('data:')) {
      document.getElementById('inp-prod-img-url').value = p.img;
      setImgTab('url', document.querySelector('.itab[data-tab="url"]'));
    } else {
      setImgTab('file', document.querySelector('.itab[data-tab="file"]'));
      document.getElementById('prod-file-label').textContent = 'Imagen guardada';
    }
  } else {
    setImgTab('url', document.querySelector('.itab[data-tab="url"]'));
    document.getElementById('prod-img-preview-wrap').style.display = 'none';
  }
  document.getElementById('prodDeleteWrap').style.display = 'block';
  showSheet('sheetProduct');
}

document.getElementById('btnSaveProduct').addEventListener('click', async () => {
  const name = document.getElementById('inp-prod-name').value.trim();
  if (!name) { document.getElementById('inp-prod-name').focus(); return; }
  const notes = document.getElementById('inp-prod-notes').value.trim();
  if (editingProdId) {
    const allProducts = await dbGetAll('products');
    const p = allProducts.find(x => x.id === editingProdId);
    if (p) { p.name = name; p.status = currentStatus; p.img = pendingImg||null; p.notes = notes; await dbPut('products', p); }
    // Update detail view if open
    document.getElementById('detailTitle').textContent = name;
  } else {
    const allProducts = await dbGetAll('products');
    const order = allProducts.filter(p => p.categoryId === currentCatId).length;
    await dbPut('products', { id: Date.now(), categoryId: currentCatId, name, status: currentStatus, img: pendingImg||null, notes, order });
  }
  hideSheet('sheetProduct');
  await renderProducts();
  // If we were in detail, go back to grid
  if (document.getElementById('viewDetail').classList.contains('active')) {
    showView('viewCategory');
  }
});

document.getElementById('btnDeleteProduct').addEventListener('click', async () => {
  if (!editingProdId) return;
  await dbDelete('products', editingProdId);
  hideSheet('sheetProduct');
  showView('viewCategory');
  await renderProducts();
});

// ===== OVERLAY CLOSE =====
['sheetCategory','sheetProduct','sheetSettings'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.id === id) hideSheet(id);
  });
});

// ===== SETTINGS =====
const PRESETS = ['#a78bfa','#60a5fa','#34d399','#f87171','#fb923c','#facc15','#f472b6','#22d3ee','#4af','#e8ff47','#fff','#888'];

function applyAccent(c) {
  document.documentElement.style.setProperty('--accent', c);
  accent = c;
}

function buildColorGrid() {
  const grid = document.getElementById('colorGrid');
  grid.innerHTML = PRESETS.map(c => `<div class="color-swatch${c===accent?' selected':''}" style="background:${c}" data-c="${c}"></div>`).join('');
  grid.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      grid.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      document.getElementById('inp-accent').value = sw.dataset.c;
      applyAccent(sw.dataset.c);
    });
  });
}

document.getElementById('btnSettings').addEventListener('click', () => {
  document.getElementById('inp-app-name').value = localStorage.getItem('catalogo_name') || '';
  document.getElementById('inp-accent').value = accent;
  buildColorGrid();
  showSheet('sheetSettings');
});

document.getElementById('inp-accent').addEventListener('input', e => {
  applyAccent(e.target.value);
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
});

document.getElementById('btnSaveSettings').addEventListener('click', () => {
  const name = document.getElementById('inp-app-name').value.trim() || 'Catálogo';
  localStorage.setItem('catalogo_name', name);
  localStorage.setItem('catalogo_accent', accent);
  document.getElementById('homeTitle').textContent = name;
  document.querySelector('.splash-name').textContent = name;
  document.title = name;
  hideSheet('sheetSettings');
});

// ===== BACKUP =====
function hint(msg, type='ok') {
  const el = document.getElementById('backupHint');
  el.textContent = msg; el.className = `backup-hint ${type}`;
  setTimeout(() => { el.textContent=''; el.className='backup-hint'; }, 3000);
}

document.getElementById('btnExport').addEventListener('click', async () => {
  const cats  = await dbGetAll('categories');
  const prods = await dbGetAll('products');
  if (!cats.length) { hint('No hay nada que exportar','err'); return; }
  const data = { v:1, exportedAt: new Date().toISOString(), accent, name: localStorage.getItem('catalogo_name')||'', categories: cats, products: prods };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.download = `catalogo-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  hint(`✓ ${cats.length} categorías, ${prods.length} productos exportados`);
});

document.getElementById('btnImport').addEventListener('click', () => {
  document.getElementById('inp-backup').value = '';
  document.getElementById('inp-backup').click();
});

document.getElementById('inp-backup').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.categories || !data.products) throw new Error();
      const ec = new Set((await dbGetAll('categories')).map(x=>x.id));
      const ep = new Set((await dbGetAll('products')).map(x=>x.id));
      let nc=0, np=0;
      for (const c of data.categories) { if (!ec.has(c.id)) { await dbPut('categories',c); nc++; } }
      for (const p of data.products)   { if (!ep.has(p.id)) { await dbPut('products',p);   np++; } }
      if (data.accent) { applyAccent(data.accent); localStorage.setItem('catalogo_accent',data.accent); }
      if (data.name)   { localStorage.setItem('catalogo_name',data.name); document.getElementById('homeTitle').textContent=data.name; document.title=data.name; }
      await renderHome();
      hint(`✓ ${nc} categorías, ${np} productos importados`);
    } catch { hint('Archivo no válido','err'); }
  };
  reader.readAsText(file);
});

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

// ===== INIT =====
window.addEventListener('load', async () => {
  await openDB();
  applyAccent(accent);
  const name = localStorage.getItem('catalogo_name');
  if (name) {
    document.getElementById('homeTitle').textContent = name;
    document.querySelector('.splash-name').textContent = name;
    document.title = name;
  }
  initSearch();
  await renderHome();
  setTimeout(() => document.getElementById('splash').classList.add('out'), 700);
});
