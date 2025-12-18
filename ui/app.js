(() => {
  const root = document.getElementById('root');

  const wallpaperEl = document.getElementById('wallpaper');
  const appBackdrop = document.getElementById('appBackdrop');

  const homeView = document.getElementById('homeView');
  const appView  = document.getElementById('appView');
  const appBody  = document.getElementById('appBody');
  const homebar  = document.getElementById('homebar');

  const pagesWrap = document.getElementById('pagesWrap');
  const pagesEl = document.getElementById('pages');
  const dotsEl = document.getElementById('pageDots');
  const dockEl = document.getElementById('dock');
  const toastEl = document.getElementById('toast');
  const editHint = document.getElementById('editHint');
  const sbTime = document.getElementById('sbTime');
  const sbRight = document.getElementById('sbRight');

  // IMPORTANT: statusbar element must exist in index.html
  const statusbarEl = document.getElementById('statusbar') || document.querySelector('.statusbar');

  let cfg = null;
  let profile = null;
  let registry = { apps: {}, widgets: {} };

  let currentPage = 1;
  let layout = null;
  let dock = [];
  let openAppId = null;

  let editMode = false;

  // Drag state
  let holdTimer = null;
  const HOLD_MS = 520;
  const DRAG_START_PX = 8;

  let dragCandidate = null; // { id, from, sx, sy }
  let dragItem = null;      // { id, from }
  let ghostEl = null;
  let hover = { kind:null, key:null };

  const nui = (name, data={}) => fetch(`https://${GetParentResourceName()}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(data)
  });

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.style.display = 'none', 1400);
  }

  // ---- Color helpers ----
  function hexToRgb(hex) {
    const h = String(hex || '').trim().replace('#','');
    if (h.length !== 6) return null;
    const r = parseInt(h.slice(0,2), 16);
    const g = parseInt(h.slice(2,4), 16);
    const b = parseInt(h.slice(4,6), 16);
    if ([r,g,b].some(n => Number.isNaN(n))) return null;
    return { r, g, b };
  }
  function rgbToHex({r,g,b}) {
    const to = (n) => n.toString(16).padStart(2,'0');
    return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
  }
  function mix(a, b, t) { return Math.round(a + (b - a) * t); }
  function shade(hex, t) {
    const c = hexToRgb(hex);
    if (!c) return hex;
    const target = t >= 0 ? {r:255,g:255,b:255} : {r:0,g:0,b:0};
    const tt = Math.min(1, Math.max(0, Math.abs(t)));
    return rgbToHex({
      r: mix(c.r, target.r, tt),
      g: mix(c.g, target.g, tt),
      b: mix(c.b, target.b, tt),
    });
  }

  // Status icons use currentColor (CSS theme controls this)
  function uiCellBars(){
    return `
      <svg class="sb-ico" viewBox="0 0 24 14" aria-hidden="true">
        <rect x="2"  y="10" width="2" height="3" rx="1"></rect>
        <rect x="6"  y="8"  width="2" height="5" rx="1"></rect>
        <rect x="10" y="6"  width="2" height="7" rx="1"></rect>
        <rect x="14" y="4"  width="2" height="9" rx="1"></rect>
        <rect x="18" y="2"  width="2" height="11" rx="1"></rect>
      </svg>
    `;
  }
  function uiWifi(){
    return `
      <svg class="sb-ico" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 9.2C8.7 5.2 15.3 5.2 20.5 9.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M6.7 12.3c3.4-2.7 7.2-2.7 10.6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M9.8 15.4c1.7-1.3 2.7-1.3 4.4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="12" cy="18.5" r="1.15" fill="currentColor"/>
      </svg>
    `;
  }
  function uiBattery(level = 0.86){
    const pct = Math.max(0.10, Math.min(0.98, level));
    const w = Math.round(15.6 * pct);
    return `
      <svg class="sb-ico" viewBox="0 0 27 12" aria-hidden="true">
        <rect x="0.9" y="1.35" width="22.1" height="9.3" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.4"></rect>
        <rect x="23.6" y="4.25" width="2.4" height="3.5" rx="1.2" fill="currentColor"></rect>
        <rect x="2.4" y="2.75" width="${w}" height="6.5" rx="1.9" fill="currentColor"></rect>
      </svg>
    `;
  }

  function updateTime(){
    const d = new Date();
    let h = d.getHours() % 12;
    if (h === 0) h = 12;
    const mm = String(d.getMinutes()).padStart(2,'0');
    sbTime.textContent = `${h}:${mm}`;
  }

  function applyUiScale(scale) {
    document.documentElement.style.setProperty('--uiScale', String(scale));
  }

  function applyTheme(theme) {
    const t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
  }

  function applyWallpaper(wp) {
    if (!wp) return;
    if (wp.type === 'url') wallpaperEl.style.backgroundImage = `url("${wp.value}")`;
    else wallpaperEl.style.backgroundImage = `url("assets/${wp.value}.jpg")`;
  }

  // ===== FIX #1: frame colors ALWAYS apply =====
  // Supports:
  // - config entries with {top,bottom}  (preferred)
  // - config entries with {value:"#RRGGBB"} (we auto shade)
  // - if config missing, we still apply a safe default
  function applyFrameColor(id) {
    const list = (cfg && cfg.frameColors) ? cfg.frameColors : [];
    const entry = list.find(x => Number(x.id) === Number(id));

    let top = null;
    let bottom = null;

    if (entry?.top && entry?.bottom) {
      top = entry.top;
      bottom = entry.bottom;
    } else if (entry?.value) {
      const base = String(entry.value).trim().slice(0,7);
      top = shade(base, +0.10);
      bottom = shade(base, -0.26);
    } else {
      // hard fallback (Space Black vibe)
      top = '#2B2D33';
      bottom = '#141416';
    }

    document.documentElement.style.setProperty('--frameTop', top);
    document.documentElement.style.setProperty('--frameBottom', bottom);
  }

  function save() {
    nui('saveProfile', {
      frameColor: profile.frameColor,
      wallpaper: profile.wallpaper,
      uiScale: profile.uiScale,
      theme: profile.theme || 'dark',
      layout,
      dock
    });
  }

  // ===== FIX #2: keep status bar always on top (never scrolls under app) =====
  function pinStatusBarToScreen() {
    // ensure statusbar sits inside .screen and is last child so it paints above
    const screen = document.querySelector('.screen');
    if (!screen || !statusbarEl) return;

    if (statusbarEl.parentElement !== screen) {
      screen.appendChild(statusbarEl);
    }

    // force it above everything
    statusbarEl.style.zIndex = '999';
    statusbarEl.style.pointerEvents = 'none';
  }

  // ----- layout helpers -----
  function ensurePages(n) {
    while (layout.pages.length < n) layout.pages.push({ slots: [] });
  }
  function getSlot(page, x, y) {
    const pg = layout.pages[page - 1];
    if (!pg) return null;
    return pg.slots.find(s => s.x === x && s.y === y);
  }
  function removeSlot(page, x, y) {
    const pg = layout.pages[page - 1];
    if (!pg) return;
    pg.slots = pg.slots.filter(s => !(s.x === x && s.y === y));
  }
  function setSlot(page, x, y, item) {
    removeSlot(page, x, y);
    layout.pages[page - 1].slots.push({ ...item, x, y });
  }
  function findFirstFreeSlot() {
    for (let p = 1; p <= layout.pages.length; p++) {
      for (let y = 1; y <= cfg.gridRows; y++) {
        for (let x = 1; x <= cfg.gridCols; x++) {
          if (!getSlot(p, x, y)) return { page: p, x, y };
        }
      }
    }
    layout.pages.push({ slots: [] });
    return { page: layout.pages.length, x: 1, y: 1 };
  }

  // One-icon-only enforcement
  function removeAppFromAllPages(appId) {
    layout.pages.forEach(pg => {
      pg.slots = pg.slots.filter(s => !(s.type === 'app' && s.id === appId));
    });
  }
  function removeAppFromDock(appId) {
    for (let i = 0; i < cfg.dockSlots; i++) if (dock[i] === appId) dock[i] = null;
  }
  function removeAppEverywhere(appId) {
    removeAppFromAllPages(appId);
    removeAppFromDock(appId);
  }
  function markRemoved(appId) {
    layout.removedApps = layout.removedApps || [];
    if (!layout.removedApps.includes(appId)) layout.removedApps.push(appId);
  }
  function unmarkRemoved(appId) {
    layout.removedApps = layout.removedApps || [];
    layout.removedApps = layout.removedApps.filter(x => x !== appId);
  }
  function isRemoved(appId) {
    return (layout.removedApps || []).includes(appId);
  }

  function setEditMode(state) {
    editMode = state;
    document.body.classList.toggle('editing', editMode);
    if (editHint) editHint.style.display = 'none';
    renderDock();
    renderPages();
  }
  function exitEditMode() {
    if (!editMode) return;
    setEditMode(false);
    cancelDrag();
  }

  function goHome(forcePage1=true) {
    openAppId = null;
    homeView.style.display = 'block';
    appView.style.display = 'none';
    appBackdrop.classList.remove('show');
    wallpaperEl.classList.remove('hidden');

    if (forcePage1 && cfg.homeReturnAlwaysPage1) currentPage = 1;
    pagesEl.style.transform = `translateX(${-(currentPage - 1) * 100}%)`;
    renderDots();
  }

  function openApp(appId) {
    const app = registry.apps[appId];
    if (!app) return;

    openAppId = appId;
    homeView.style.display = 'none';
    appView.style.display = 'block';
    appBackdrop.classList.add('show');
    wallpaperEl.classList.add('hidden');

    if (appId === 'settings') renderSettings();
    else appBody.innerHTML = `<div class="glass-bubble" style="padding:14px;border-radius:22px;">App UI coming soon.</div>`;
  }

  function renderSettings() {
    const wp = profile.wallpaper || { type:'builtin', value: cfg.builtInWallpapers[0] };
    const builtin = cfg.builtInWallpapers || [];
    const theme = profile.theme || 'dark';

    const frameColors = cfg.frameColors || [];
    const frameButtons = frameColors.map(c => {
      const sel = (Number(profile.frameColor) === Number(c.id)) ? ' (Selected)' : '';
      return `<div class="glass-bubble" style="padding:12px;border-radius:22px;margin-bottom:10px;cursor:pointer;" data-frame="${c.id}">
        <div style="font-weight:900;">Frame: ${c.name}${sel}</div>
      </div>`;
    }).join('');

    const wpTiles = builtin.map(id => {
      const sel = (wp.type === 'builtin' && wp.value === id) ? ' (Selected)' : '';
      return `<div class="glass-bubble" style="padding:12px;border-radius:22px;margin-bottom:10px;cursor:pointer;" data-wp="${id}">
        <div style="font-weight:900;">Wallpaper: ${id}${sel}</div>
      </div>`;
    }).join('');

    appBody.innerHTML = `
      <div class="glass-bubble" style="padding:14px;border-radius:22px;margin-bottom:12px;">
        <div style="font-weight:900;">Appearance</div>
        <div style="opacity:.72;font-size:12px;margin-top:4px;">Choose Light or Dark</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
          <div class="glass-bubble" style="padding:12px;border-radius:18px;text-align:center;font-weight:900;cursor:pointer;${theme==='dark'?'outline:2px solid rgba(255,255,255,.25)':''}" data-theme="dark">Dark</div>
          <div class="glass-bubble" style="padding:12px;border-radius:18px;text-align:center;font-weight:900;cursor:pointer;${theme==='light'?'outline:2px solid rgba(255,255,255,.25)':''}" data-theme="light">Light</div>
        </div>
      </div>

      <div class="glass-bubble" style="padding:14px;border-radius:22px;margin-bottom:12px;">
        <div style="font-weight:900;margin-bottom:10px;">UI Scale</div>
        <input id="uiScale" type="range" min="${cfg.minUiScale}" max="${cfg.maxUiScale}" step="0.01" value="${profile.uiScale}">
        <div style="opacity:.7;font-size:12px;margin-top:6px;" id="uiScaleLabel">${Math.round(profile.uiScale*100)}%</div>
      </div>

      ${wpTiles}

      <div class="glass-bubble" style="padding:14px;border-radius:22px;margin-top:12px;">
        <div style="font-weight:900;">Custom URL Wallpaper</div>
        <div style="opacity:.72;font-size:12px;margin-top:4px;">Paste an image URL (https://...)</div>
        <input id="wpUrl" placeholder="https://example.com/wallpaper.jpg" value="${wp.type==='url' ? wp.value : ''}"
          style="margin-top:10px;width:100%;padding:12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.18);color:var(--text);">
        <div style="height:10px"></div>
        <button id="applyUrl" style="width:100%;border:0;border-radius:18px;padding:12px;background:rgba(255,255,255,0.18);color:var(--text);font-weight:800;">Apply URL Wallpaper</button>
      </div>

      <div style="height:12px"></div>

      <div class="glass-bubble" style="padding:14px;border-radius:22px;">
        <div style="font-weight:900;margin-bottom:10px;">Frame Color</div>
        ${frameButtons || `<div style="opacity:.7;font-size:12px;">No frame colors configured.</div>`}
      </div>
    `;

    // theme
    appBody.querySelectorAll('[data-theme]').forEach(el => {
      el.addEventListener('click', () => {
        profile.theme = el.dataset.theme;
        applyTheme(profile.theme);
        // status icons are currentColor, so they update automatically
        save();
        renderSettings();
      });
    });

    // UI Scale
    const scale = document.getElementById('uiScale');
    const scaleLabel = document.getElementById('uiScaleLabel');
    scale.addEventListener('input', () => {
      const v = Number(scale.value);
      applyUiScale(v);
      scaleLabel.textContent = `${Math.round(v*100)}%`;
    });
    scale.addEventListener('change', () => {
      profile.uiScale = Number(scale.value);
      applyUiScale(profile.uiScale);
      scaleLabel.textContent = `${Math.round(profile.uiScale*100)}%`;
      save();
    });

    // wallpapers
    appBody.querySelectorAll('[data-wp]').forEach(el => {
      el.addEventListener('click', () => {
        profile.wallpaper = { type:'builtin', value: el.dataset.wp };
        applyWallpaper(profile.wallpaper);
        showToast('Wallpaper updated');
        save();
        renderSettings();
      });
    });

    // url wallpaper
    document.getElementById('applyUrl').addEventListener('click', () => {
      const url = (document.getElementById('wpUrl').value || '').trim();
      if (!url.startsWith('https://')) return showToast('URL must start with https://');
      profile.wallpaper = { type:'url', value: url };
      applyWallpaper(profile.wallpaper);
      showToast('Wallpaper URL applied');
      save();
      renderSettings();
    });

    // frame colors
    appBody.querySelectorAll('[data-frame]').forEach(el => {
      el.addEventListener('click', () => {
        profile.frameColor = Number(el.dataset.frame);
        applyFrameColor(profile.frameColor);
        showToast('Frame updated');
        save();
        renderSettings();
      });
    });
  }

  function makeDeleteBadge(appId) {
    const b = document.createElement('div');
    b.className = 'del-badge';
    b.textContent = '×';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (appId === 'settings') return showToast("Can't delete Settings");
      removeAppEverywhere(appId);
      markRemoved(appId);
      save();
      renderDock();
      renderPages();
      showToast('App removed');
    });
    return b;
  }

  function appIcon(appId, from) {
    const app = registry.apps[appId];
    if (!app) return null;

    const el = document.createElement('div');
    el.className = 'icon';
    el.dataset.appId = appId;

    const img = document.createElement('img');
    img.src = `nui://${app.resource}/` + app.icon;
    img.draggable = false;
    img.onerror = () => { img.style.display = 'none'; };
    el.appendChild(img);

    if (editMode) el.appendChild(makeDeleteBadge(appId));

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      setEditMode(true);
    });

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;

      clearTimeout(holdTimer);

      holdTimer = setTimeout(() => {
        setEditMode(true);
        dragCandidate = { id: appId, from, sx: e.clientX, sy: e.clientY };
      }, HOLD_MS);

      if (editMode) {
        dragCandidate = { id: appId, from, sx: e.clientX, sy: e.clientY };
      }
    });

    el.addEventListener('pointerup', () => clearTimeout(holdTimer));

    el.addEventListener('click', () => {
      if (editMode) return;
      if (dragItem) return;
      openApp(appId);
    });

    return el;
  }

  function renderDock() {
    dockEl.innerHTML = '';
    for (let i = 0; i < cfg.dockSlots; i++) {
      const slot = document.createElement('div');
      const appId = dock[i];

      slot.className = 'dock-slot ' + (appId ? 'filled glass-bubble' : 'empty');
      slot.dataset.dockIndex = String(i);

      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        setEditMode(true);
      });

      if (appId && registry.apps[appId]) {
        slot.appendChild(appIcon(appId, { kind:'dock', index:i }));
      }

      dockEl.appendChild(slot);
    }
  }

  function renderDots() {
    dotsEl.innerHTML = '';
    for (let i = 1; i <= layout.pages.length; i++) {
      const d = document.createElement('div');
      d.className = 'dot' + (i === currentPage ? ' active' : '');
      dotsEl.appendChild(d);
    }
  }

  function renderPages() {
    pagesEl.innerHTML = '';
    ensurePages(layout.pages.length);

    layout.pages.forEach((pg, idx) => {
      const pageNum = idx + 1;
      const page = document.createElement('div');
      page.className = 'page';

      page.addEventListener('click', (e) => {
        if (e.target === page && editMode) exitEditMode();
      });

      for (let y = 1; y <= cfg.gridRows; y++) {
        for (let x = 1; x <= cfg.gridCols; x++) {
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.dataset.page = String(pageNum);
          cell.dataset.x = String(x);
          cell.dataset.y = String(y);

          const slot = getSlot(pageNum, x, y);
          if (slot && slot.type === 'app') {
            const icon = appIcon(slot.id, { kind:'grid', page:pageNum, x, y });
            if (icon) cell.appendChild(icon);
          }
          page.appendChild(cell);
        }
      }

      pagesEl.appendChild(page);
    });

    pagesEl.style.transform = `translateX(${-(currentPage - 1) * 100}%)`;
    renderDots();
  }

  function autoPlaceApp(appMeta) {
    if (isRemoved(appMeta.id)) return;

    if (dock.includes(appMeta.id)) return;
    for (let p = 1; p <= layout.pages.length; p++) {
      const pg = layout.pages[p-1];
      if (pg.slots.some(s => s.type === 'app' && s.id === appMeta.id)) return;
    }

    const free = findFirstFreeSlot();
    ensurePages(free.page);
    setSlot(free.page, free.x, free.y, { type:'app', id: appMeta.id });
  }

  function registerApp(appMeta) {
    registry.apps[appMeta.id] = appMeta;
    autoPlaceApp(appMeta);
    renderDock();
    renderPages();
    save();
  }

  // ----- hit tests + hover -----
  function clearHover() {
    if (hover.kind === 'grid') {
      const el = document.querySelector(`.cell[data-page="${hover.key.page}"][data-x="${hover.key.x}"][data-y="${hover.key.y}"]`);
      el?.classList.remove('hover');
    }
    if (hover.kind === 'dock') {
      const el = document.querySelector(`.dock-slot[data-dock-index="${hover.key.index}"]`);
      el?.classList.remove('hover');
    }
    hover = { kind:null, key:null };
  }

  function setHoverGrid(page, x, y) {
    if (hover.kind === 'grid' && hover.key.page === page && hover.key.x === x && hover.key.y === y) return;
    clearHover();
    const el = document.querySelector(`.cell[data-page="${page}"][data-x="${x}"][data-y="${y}"]`);
    el?.classList.add('hover');
    hover = { kind:'grid', key:{ page, x, y } };
  }

  function setHoverDock(index) {
    if (hover.kind === 'dock' && hover.key.index === index) return;
    clearHover();
    const el = document.querySelector(`.dock-slot[data-dock-index="${index}"]`);
    el?.classList.add('hover');
    hover = { kind:'dock', key:{ index } };
  }

  function hitTestDock(clientX, clientY) {
    const rect = dockEl.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const slotW = rect.width / cfg.dockSlots;
    const relX = clientX - rect.left;
    const index = clamp(Math.floor(relX / slotW), 0, cfg.dockSlots - 1);
    return { index };
  }

  function hitTestGrid(clientX, clientY) {
    const pages = [...document.querySelectorAll('.page')];
    const page = pages[currentPage - 1];
    if (!page) return null;

    const rect = page.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    const cellW = rect.width / cfg.gridCols;
    const cellH = rect.height / cfg.gridRows;

    const x = clamp(Math.floor(relX / cellW) + 1, 1, cfg.gridCols);
    const y = clamp(Math.floor(relY / cellH) + 1, 1, cfg.gridRows);
    return { page: currentPage, x, y };
  }

  // ----- drag ghost -----
  function makeGhost(appId, x, y) {
    const app = registry.apps[appId];
    if (!app) return;

    ghostEl?.remove();
    ghostEl = document.createElement('div');
    ghostEl.className = 'drag-ghost';
    ghostEl.innerHTML = `<img src="nui://${app.resource}/${app.icon}" />`;
    document.body.appendChild(ghostEl);
    moveGhost(x, y);
  }

  function moveGhost(x, y) {
    if (!ghostEl) return;
    ghostEl.style.left = `${x}px`;
    ghostEl.style.top = `${y}px`;
  }

  function cancelDrag() {
    clearTimeout(holdTimer);
    dragCandidate = null;
    dragItem = null;
    clearHover();
    ghostEl?.remove();
    ghostEl = null;
  }

  function startDragIfMoved(e) {
    if (!editMode || !dragCandidate || dragItem) return;
    const dx = e.clientX - dragCandidate.sx;
    const dy = e.clientY - dragCandidate.sy;
    if (Math.hypot(dx, dy) < DRAG_START_PX) return;

    dragItem = { id: dragCandidate.id, from: dragCandidate.from };
    dragCandidate = null;

    if (dragItem.from.kind === 'grid') removeSlot(dragItem.from.page, dragItem.from.x, dragItem.from.y);
    if (dragItem.from.kind === 'dock') dock[dragItem.from.index] = null;

    renderDock();
    renderPages();

    makeGhost(dragItem.id, e.clientX, e.clientY);
  }

  function restoreOrigin(appId, from) {
    if (from.kind === 'grid') setSlot(from.page, from.x, from.y, { type:'app', id: appId });
    if (from.kind === 'dock') dock[from.index] = appId;
  }

  function handleDrop(clientX, clientY) {
    if (!editMode || !dragItem) return;

    const id = dragItem.id;
    const origin = dragItem.from;

    // enforce single instance
    removeAppEverywhere(id);

    const dockHit = hitTestDock(clientX, clientY);
    const gridHit = hitTestGrid(clientX, clientY);

    if (dockHit) {
      const idx = dockHit.index;
      const existing = dock[idx];
      dock[idx] = id;
      if (existing) restoreOrigin(existing, origin);

      cancelDrag();
      renderDock(); renderPages(); save();
      return;
    }

    if (gridHit) {
      const existing = getSlot(gridHit.page, gridHit.x, gridHit.y);

      if (!existing) {
        setSlot(gridHit.page, gridHit.x, gridHit.y, { type:'app', id });
      } else if (existing.type === 'app') {
        setSlot(gridHit.page, gridHit.x, gridHit.y, { type:'app', id });
        restoreOrigin(existing.id, origin);
      }

      cancelDrag();
      renderDock(); renderPages(); save();
      return;
    }

    // invalid drop -> go back
    restoreOrigin(id, origin);
    cancelDrag();
    renderDock(); renderPages(); save();
  }

  // swipe (home only, not editing and not dragging)
  let swipe = { active:false, sx:0, sy:0 };
  function beginSwipe(e) {
    if (!cfg.enableSwipe) return;
    if (openAppId) return;
    if (editMode) return;
    swipe.active = true;
    swipe.sx = e.clientX;
    swipe.sy = e.clientY;
  }
  function endSwipe(e) {
    if (!swipe.active || !cfg.enableSwipe || openAppId || editMode) return;
    swipe.active = false;

    const dx = e.clientX - swipe.sx;
    const dy = e.clientY - swipe.sy;
    if (Math.abs(dx) < cfg.swipeThreshold) return;
    if (Math.abs(dx) < Math.abs(dy)) return;

    if (dx < 0) currentPage = clamp(currentPage + 1, 1, layout.pages.length);
    else currentPage = clamp(currentPage - 1, 1, layout.pages.length);

    pagesEl.style.transform = `translateX(${-(currentPage - 1) * 100}%)`;
    renderDots();
  }

  pagesWrap.addEventListener('pointerdown', beginSwipe);

  window.addEventListener('pointermove', (e) => {
    startDragIfMoved(e);

    if (dragItem) {
      moveGhost(e.clientX, e.clientY);

      const d = hitTestDock(e.clientX, e.clientY);
      const g = hitTestGrid(e.clientX, e.clientY);

      if (d) setHoverDock(d.index);
      else if (g) setHoverGrid(g.page, g.x, g.y);
      else clearHover();
    }
  });

  window.addEventListener('pointerup', (e) => {
    clearTimeout(holdTimer);

    if (dragItem) {
      handleDrop(e.clientX, e.clientY);
      return;
    }

    endSwipe(e);
    dragCandidate = null;
    clearHover();
  });

  homebar.addEventListener('click', () => {
    exitEditMode();
    goHome(true);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (editMode) return exitEditMode();
    if (openAppId) return goHome(true);
    nui('closePhone', {});
  });

  // NUI messages
  window.addEventListener('message', (event) => {
    const { action, data } = event.data || {};
    if (!action) return;

    if (action === 'open') {
      cfg = data.config;
      profile = data.profile;
      registry = data.registry || registry;

      profile.theme = profile.theme || 'dark';
      profile.frameColor = Number(profile.frameColor || 0);

      applyUiScale(profile.uiScale || 1.0);
      applyTheme(profile.theme);
      applyWallpaper(profile.wallpaper);
      applyFrameColor(profile.frameColor);

      // status icons use currentColor -> theme will flip them
      sbRight.innerHTML = `${uiCellBars()}${uiWifi()}${uiBattery(0.86)}`;

      updateTime();
      clearInterval(window.__sbTimer);
      window.__sbTimer = setInterval(updateTime, 1000);

      // pin statusbar above everything
      pinStatusBarToScreen();

      layout = profile.layout || { pages: [ { slots: [] } ], removedApps: [] };
      dock = profile.dock || [];
      layout.removedApps = layout.removedApps || [];
      ensurePages(layout.pages.length);

      if (!registry.apps.settings) {
        registry.apps.settings = {
          id: 'settings',
          name: 'Settings',
          icon: 'ui/assets/settings.png',
          resource: GetParentResourceName()
        };
      }
      unmarkRemoved('settings');

      Object.values(registry.apps).forEach(a => autoPlaceApp(a));

      renderDock();
      renderPages();
      setEditMode(false);
      cancelDrag();
      goHome(true);

      root.classList.remove('hidden');

      // Some setups hide/show with .phone-wrap; safe for both
      document.querySelector('.phone-wrap')?.classList.add('open');

      nui('uiReady', {});
    }

    if (action === 'close') {
      root.classList.add('hidden');
      document.querySelector('.phone-wrap')?.classList.remove('open');
      openAppId = null;
      cancelDrag();
      setEditMode(false);
    }

    if (action === 'registerApp') registerApp(data);
  });
})();
