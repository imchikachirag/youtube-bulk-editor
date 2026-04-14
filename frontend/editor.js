// ============================================================
// YouTube Bulk Editor  -  Frontend Logic
// github.com/imchikachirag/youtube-bulk-editor
//
// Copyright (c) 2026 Chirag Mehta
// https://chiragmehta.info | @imchikachirag
//
// MIT License  -  free to use, modify, and distribute
//
// PRIVACY NOTE: This file makes all YouTube API calls directly
// from the browser to YouTube. The backend server (Google Cloud
// Run) is only used for the OAuth login handshake and is never
// involved in any video data operations.
// ============================================================

'use strict';

// ── Config ───────────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
const APP_VERSION = '2.3.2';
const BACKEND_URL = window.YT_EDITOR_CONFIG?.backendUrl || 'https://youtube-bulk-editor-api-48045104741.asia-south1.run.app';
const YT_BASE     = 'https://www.googleapis.com/youtube/v3';

// ── Dark Theme ───────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
(function initTheme() {
  const saved = localStorage.getItem('yt_editor_theme');
  // If no saved preference, follow system preference
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (saved === 'dark' || (!saved && prefersDark)) {
    document.body.classList.add('dark');
  }
  updateThemeIcon();
})();

function updateThemeIcon() {
  const isDark = document.body.classList.contains('dark');
  const sun  = document.getElementById('iconSun');
  const moon = document.getElementById('iconMoon');
  if (sun)  sun.style.display  = isDark ? 'block' : 'none';
  if (moon) moon.style.display = isDark ? 'none'  : 'block';
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnTheme');
  if (btn) {
    btn.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      const isDark = document.body.classList.contains('dark');
      localStorage.setItem('yt_editor_theme', isDark ? 'dark' : 'light');
      updateThemeIcon();
    });
  }
});

// ── DOM refs ─────────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
const $ = id => document.getElementById(id);
const screens = {
  signIn:  $('screenSignIn'),
  loading: $('screenLoading'),
  picker:  $('screenPicker'),
  editor:  $('screenEditor')
};

// ── State ─────────────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
let accessToken  = null;
let allVideos    = [];
let filteredVids = [];
let editedVideos = {};
let savedRows    = new Set();
let currentPage  = 1;
let perPage      = 25;
let sortMode     = 'default';
let filterMode   = 'all';
let searchQuery  = '';

// ── Screen switcher ───────────────────────────────────────────
function showScreen(name) {
  Object.keys(screens).forEach(k => screens[k].classList.add('hidden'));
  screens[name].classList.remove('hidden');
}
function setLoading(msg, count = '') {
  $('loadingMsg').textContent   = msg;
  $('loadingCount').textContent = count;
  showScreen('loading');
}

// ── Init  -  check URL hash for token from backend ─────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
// The token arrives in the URL hash (#token=...) after OAuth.
// Hash fragments are never sent to servers or written to logs.
// We read it once, store in sessionStorage, then clean the URL.
window.addEventListener('DOMContentLoaded', () => {
  // Set version badge from constant
  const vBadge = $('appVersionBadge');
  if (vBadge) {
    vBadge.textContent = `v${APP_VERSION}`;
    // href already set in HTML as changelog/?from=app
  }
  const vFooter = $('footerVersion');
  if (vFooter) vFooter.textContent = `v${APP_VERSION}`;
  const vFooterSignin = $('footerVersionSignin');
  if (vFooterSignin) vFooterSignin.textContent = `v${APP_VERSION}`;

  const params    = new URLSearchParams(window.location.search);
  const hashToken = new URLSearchParams(window.location.hash.slice(1)).get('token');
  const authError = params.get('auth_error');

  if (authError) {
    $('authError').textContent = decodeURIComponent(authError);
    $('authError').classList.remove('hidden');
    // Clean URL
    history.replaceState(null, '', window.location.pathname);
    showScreen('signIn');
    return;
  }

  if (hashToken) {
    // Store token in sessionStorage  -  cleared when tab closes
    sessionStorage.setItem('yt_editor_token', decodeURIComponent(hashToken));
    // Clean URL so token is not visible or bookmarkable
    history.replaceState(null, '', window.location.pathname);
  }

  const stored = sessionStorage.getItem('yt_editor_token');
  if (stored) {
    accessToken = stored;
    loadChannels();
  } else {
    showScreen('signIn');
  }
});

// ── Sign in  -  redirect to backend OAuth endpoint ─────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
$('btnSignIn').addEventListener('click', () => {
  window.location.href = `${BACKEND_URL}/auth/login`;
});

// ── Switch Channel ────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
$('btnSwitchChannel').addEventListener('click', () => {
  if (cachedChannels.length > 1) {
    renderChannelPicker(cachedChannels);
    showScreen('picker');
  }
});

// ── Sign out  -  revoke token at Google ────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
$('btnSignOut').addEventListener('click', async () => {
  if (accessToken) {
    // Best-effort token revocation at Google
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, { method: 'POST' });
    } catch (_) {}
  }
  sessionStorage.removeItem('yt_editor_token');
  accessToken  = null;
  allVideos    = [];
  editedVideos = {};
  savedRows    = new Set();
  $('channelBadge').classList.add('hidden');
  ['exportBtnGroup', 'btnImport', 'btnSaveAll', 'btnSignOut', 'btnSwitchChannel'].forEach(id => $(id).classList.add('hidden'));
  showScreen('signIn');
  showToast('Disconnected. Token revoked at Google.', 'success');
});

// ── Authenticated YouTube API fetch ──────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
// All calls go directly from this browser to YouTube.
// The backend server is never involved in these requests.
function parseYTError(err) {
  // Strip any HTML tags from error messages (e.g. YouTube quota error contains <a> tags)
  const raw = (typeof err === 'string' ? err : err?.message || 'Unknown error');
  const stripped = raw.replace(/<[^>]*>/g, '').trim();

  // Detect quota exceeded
  if (stripped.toLowerCase().includes('quota') || stripped.toLowerCase().includes('exceeded')) {
    return { msg: 'Daily YouTube API quota exceeded. Resets at 12:30 PM IST tomorrow.', type: 'quota' };
  }
  return { msg: stripped, type: 'error' };
}

async function ytFetch(path) {
  const res = await fetch(`${YT_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (res.status === 401) {
    sessionStorage.removeItem('yt_editor_token');
    showToast('Session expired. Please sign in again.', 'error');
    setTimeout(() => showScreen('signIn'), 1500);
    throw new Error('Unauthorised');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const raw = err.error?.message || `HTTP ${res.status}`;
    const { msg, type } = parseYTError(raw);
    if (type === 'quota') showToast(msg, 'warning');
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

async function ytUpdate(videoId, snippet) {
  const res = await fetch(`${YT_BASE}/videos?part=snippet`, {
    method:  'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({ id: videoId, snippet })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const raw = err.error?.message || `HTTP ${res.status}`;
    const { msg, type } = parseYTError(raw);
    if (type === 'quota') showToast(msg, 'warning');
    throw new Error(msg);
  }
  return res.json();
}

// ── Load channels ─────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
let cachedChannels   = [];
let importParsed     = []; // populated by parseAndPreviewCSV, consumed by btnConfirmImport
let currentChannelId = null; // tracks selected channel so refresh stays on the right one

async function loadChannels() {
  setLoading('Fetching your YouTube channels...');
  try {
    const data     = await ytFetch('/channels?part=snippet,contentDetails&mine=true&maxResults=50');
    const channels = data.items || [];
    cachedChannels = channels;
    if (!channels.length) {
      showToast('No YouTube channels found for this account.', 'error');
      showScreen('signIn');
      return;
    }
    if (channels.length === 1) {
      await loadVideos(channels[0]);
    } else {
      renderChannelPicker(channels);
      showScreen('picker');
    }
  } catch (e) {
    if (e.message !== 'Unauthorised') showToast(e.message, 'error');
    showScreen('signIn');
  }
}

// ── Channel picker ────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
function renderChannelPicker(channels) {
  const list = $('channelList');
  list.innerHTML = '';
  channels.forEach(ch => {
    const thumb = ch.snippet?.thumbnails?.default?.url || '';
    const btn   = document.createElement('button');
    btn.className = 'channel-pick-btn';
    btn.innerHTML = `
      ${thumb ? `<img src="${thumb}" alt="">` : `<div class="ch-thumb-placeholder"></div>`}
      <div class="ch-info">
        <div class="ch-name">${esc(ch.snippet?.title || ch.id)}</div>
        <div class="ch-id">${esc(ch.id)}</div>
      </div>`;
    btn.addEventListener('click', () => loadVideos(ch));
    list.appendChild(btn);
  });
}

// ── Load all videos ───────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
async function loadVideos(channel) {
  currentChannelId = channel.id; // track so refresh stays on the selected channel
  setLoading('Loading your videos...');
  try {
    const thumb = channel.snippet?.thumbnails?.default?.url || '';
    $('channelThumb').src = thumb;
    $('channelName').textContent = channel.snippet?.title || channel.id;
    $('channelBadge').classList.remove('hidden');

    const uploadPlaylist = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadPlaylist) throw new Error('Could not find uploads playlist for this channel.');

    allVideos = [];
    let pageToken = '';

    do {
      const ptParam = pageToken ? `&pageToken=${pageToken}` : '';
      const page    = await ytFetch(
        `/playlistItems?part=contentDetails&playlistId=${uploadPlaylist}&maxResults=50${ptParam}`
      );
      const ids = (page.items || []).map(i => i.contentDetails.videoId);

      for (let i = 0; i < ids.length; i += 50) {
        const chunk  = ids.slice(i, i + 50).join(',');
        const detail = await ytFetch(`/videos?part=snippet,status,statistics,contentDetails&id=${chunk}&maxResults=50`);
        allVideos.push(...(detail.items || []));
        $('loadingCount').textContent = `${allVideos.length} videos loaded...`;
      }
      pageToken = page.nextPageToken || '';
    } while (pageToken);

    editedVideos = {};
    savedRows    = new Set();
    currentPage  = 1;

    applyFiltersAndRender();
    showScreen('editor');
    $('exportBtnGroup').classList.remove('hidden');
    $('btnImport').classList.remove('hidden');
    $('btnSaveAll').classList.remove('hidden');
    $('btnSignOut').classList.remove('hidden');
    // Only show Switch Channel if user has more than one channel
    if (cachedChannels.length > 1) {
      $('btnSwitchChannel').classList.remove('hidden');
    }
    showToast(`Loaded ${allVideos.length} videos`, 'success');
  } catch (e) {
    if (e.message !== 'Unauthorised') showToast(e.message, 'error');
    showScreen('signIn');
  }
}

// ── Filter, sort, paginate, render ───────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
function applyFiltersAndRender() {
  const q = searchQuery.toLowerCase();

  let vids = allVideos.filter(v => {
    const sn = v.snippet || {};
    if (filterMode === 'changed' && !editedVideos[v.id]) return false;
    if (filterMode === 'saved'   && !savedRows.has(v.id)) return false;
    if (q) {
      const title = (sn.title || '').toLowerCase();
      const desc  = (sn.description || '').toLowerCase();
      const tags  = (sn.tags || []).join(' ').toLowerCase();
      if (!title.includes(q) && !desc.includes(q) && !tags.includes(q)) return false;
    }
    return true;
  });

  if (sortMode === 'title-az') vids.sort((a,b) => (a.snippet?.title||'').localeCompare(b.snippet?.title||''));
  if (sortMode === 'title-za') vids.sort((a,b) => (b.snippet?.title||'').localeCompare(a.snippet?.title||''));
  if (sortMode === 'date-new') vids.sort((a,b) => new Date(b.snippet?.publishedAt||0) - new Date(a.snippet?.publishedAt||0));
  if (sortMode === 'date-old') vids.sort((a,b) => new Date(a.snippet?.publishedAt||0) - new Date(b.snippet?.publishedAt||0));

  filteredVids = vids;
  const totalPages = Math.max(1, Math.ceil(filteredVids.length / perPage));
  if (currentPage > totalPages) currentPage = totalPages;

  renderPage();
  requestAnimationFrame(() => setTimeout(autoResizeAll, 0));
  renderPagination();
  updateVideoCount();
}

// ── Render one page of rows ───────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
function renderPage() {
  const tbody = $('videoTableBody');
  tbody.innerHTML = '';
  const start = (currentPage - 1) * perPage;
  const slice = filteredVids.slice(start, start + perPage);

  slice.forEach((v, localIdx) => {
    const globalIdx = start + localIdx + 1;
    const id        = v.id;
    const sn        = v.snippet || {};
    const thumb     = sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || '';
    const tags      = (sn.tags || []).join(', ');
    const isChanged = !!editedVideos[id];
    const isSaved   = savedRows.has(id);
    const ytUrl     = `https://www.youtube.com/watch?v=${id}`;
    const rowClass  = 'video-row' + (isChanged ? ' changed' : '') + (isSaved && !isChanged ? ' saved' : '');
    const statusHtml = isChanged
      ? '<span class="status-changed">Edited</span>'
      : (isSaved ? '<span class="status-saved">Saved</span>' : '');

    const tr = document.createElement('tr');
    tr.className   = rowClass;
    tr.dataset.vid = id;
    tr.innerHTML   = `
      <td class="row-num">${globalIdx}</td>
      <td class="thumb-wrap">
        ${thumb
          ? `<a href="${ytUrl}" target="_blank" rel="noopener noreferrer" title="Open on YouTube"><img src="${thumb}" alt="" loading="lazy"></a>`
          : `<div class="thumb-placeholder"></div>`}
      </td>
      <td><div class="field-wrap" data-field="title">
        <div class="field-original"></div>
        <textarea class="editable title-field" data-vid="${id}" data-field="title" maxlength="100" placeholder="Video title...">${esc(editedVideos[id]?.title ?? sn.title ?? '')}</textarea>
        <span class="char-count" data-max="100">${(editedVideos[id]?.title ?? sn.title ?? '').length} / 100</span>
      </div></td>
      <td><div class="field-wrap" data-field="description">
        <div class="field-original"></div>
        <textarea class="editable desc-field" data-vid="${id}" data-field="description" maxlength="5000" placeholder="Video description...">${esc(editedVideos[id]?.description ?? sn.description ?? '')}</textarea>
        <span class="char-count" data-max="5000">${(editedVideos[id]?.description ?? sn.description ?? '').length} / 5000</span>
      </div></td>
      <td><div class="field-wrap" data-field="tags">
        <div class="field-original"></div>
        <textarea class="editable tags-field" data-vid="${id}" data-field="tags" placeholder="tag1, tag2, tag3...">${esc(editedVideos[id]?.tags ?? tags)}</textarea>
        <span class="tags-hint">Comma separated</span>
      </div></td>
      <td><span class="row-status" data-vid="${id}">${statusHtml}</span></td>
      <td><div class="action-col">
        <div class="edit-hint" title="Click any field to edit">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </div>
        <button class="btn-save-row" data-vid="${id}">Save</button>
        <button class="btn-revert-row" data-vid="${id}">Revert</button>
      </div></td>`;
    tbody.appendChild(tr);

    // Restore yellow highlight for already-edited rows
    if (isChanged) {
      ['title','description','tags'].forEach(field => {
        const el   = tr.querySelector(`textarea[data-field="${field}"]`);
        const wrap = el?.closest('.field-wrap');
        if (!el || !wrap) return;
        const origVal = field === 'tags' ? (sn.tags||[]).join(', ') : (sn[field]||'');
        if (el.value !== origVal) {
          wrap.classList.add('changed');
          el.classList.add('is-changed');
          const origEl = wrap.querySelector('.field-original');
          if (origEl) origEl.textContent = `Original: ${origVal}`;
        }
      });
    }

    tr.querySelectorAll('.editable').forEach(el => {
      el.addEventListener('input', onFieldInput);
      if (el.classList.contains('title-field')) el.addEventListener('input', autoResize);
      const cc  = el.nextElementSibling;
      const max = el.getAttribute('maxlength');
      if (cc && max && cc.classList.contains('char-count')) {
        updateCharCount(cc, el.value.length, parseInt(max));
      }
    });
    tr.querySelector('.btn-save-row').addEventListener('click', () => saveRow(id));
    tr.querySelector('.btn-revert-row').addEventListener('click', () => revertRow(id));
  });
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function autoResize() {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
}
function autoResizeAll() {
  document.querySelectorAll('.title-field').forEach(el => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  });
}

// ── Pagination ────────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
function renderPagination() {
  const total      = filteredVids.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start      = Math.min((currentPage-1)*perPage+1, total);
  const end        = Math.min(currentPage*perPage, total);
  const infoText   = total > 0
    ? `Showing ${start} to ${end} of ${total} video${total!==1?'s':''}`
    : 'No videos match your filters';

  ['paginationInfo','paginationInfoTop'].forEach(id => {
    const el = $(id);
    if (el) el.textContent = infoText;
  });

  ['paginationControls','paginationControlsTop'].forEach(containerId => {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = '';

    const addBtn = (label, page, disabled, active) => {
      const b = document.createElement('button');
      b.className = 'page-btn' + (active ? ' active' : '');
      b.disabled  = disabled;
      b.innerHTML = label;
      if (!disabled) b.addEventListener('click', () => {
        currentPage = page;
        renderPage();
        renderPagination();
        window.scrollTo(0, 0);
      });
      container.appendChild(b);
    };

    addBtn('&laquo;', 1, currentPage===1, false);
    addBtn('&lsaquo;', currentPage-1, currentPage===1, false);
    let ps = Math.max(1, currentPage-2);
    let pe = Math.min(totalPages, ps+4);
    if (pe-ps < 4) ps = Math.max(1, pe-4);
    for (let p = ps; p <= pe; p++) addBtn(p, p, false, p===currentPage);
    addBtn('&rsaquo;', currentPage+1, currentPage===totalPages, false);
    addBtn('&raquo;', totalPages, currentPage===totalPages, false);
  });
}

function updateVideoCount() {
  const changed = Object.keys(editedVideos).length;
  $('videoCount').textContent = `${filteredVids.length} of ${allVideos.length} videos` +
    (changed ? ` · ${changed} edited` : '');
}

// ── Field input handler ───────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
function onFieldInput(e) {
  const el    = e.target;
  const vid   = el.dataset.vid;
  const field = el.dataset.field;
  const row   = el.closest('tr');
  const wrap  = el.closest('.field-wrap');
  const orig  = allVideos.find(v => v.id === vid);
  if (!orig) return;

  const origVal = field === 'tags'
    ? (orig.snippet?.tags||[]).join(', ')
    : (orig.snippet?.[field]||'');
  const newVal  = el.value;
  const changed = newVal !== origVal;

  if (!editedVideos[vid]) editedVideos[vid] = {};
  editedVideos[vid][field] = newVal;

  wrap.classList.toggle('changed', changed);
  el.classList.toggle('is-changed', changed);
  const origEl = wrap.querySelector('.field-original');
  if (origEl) origEl.textContent = changed ? `Original: ${origVal}` : '';

  const cc  = el.nextElementSibling;
  const max = el.getAttribute('maxlength');
  if (cc && max) updateCharCount(cc, newVal.length, parseInt(max));

  const anyChanged = ['title','description','tags'].some(f => {
    const fEl = row.querySelector(`[data-vid="${vid}"][data-field="${f}"]`);
    if (!fEl) return false;
    const ov = f === 'tags' ? (orig.snippet?.tags||[]).join(', ') : (orig.snippet?.[f]||'');
    return fEl.value !== ov;
  });

  row.classList.toggle('changed', anyChanged);
  if (!anyChanged) delete editedVideos[vid];

  const statusEl = row.querySelector(`.row-status[data-vid="${vid}"]`);
  if (statusEl) statusEl.innerHTML = anyChanged ? '<span class="status-changed">Edited</span>' : '';
  updateVideoCount();
}

function updateCharCount(el, len, max) {
  el.textContent = `${len} / ${max}`;
  el.className   = 'char-count' + (len > max*0.9 ? (len >= max ? ' over' : ' warn') : '');
}

// ── Save row ──────────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
async function saveRow(vid) {
  const orig = allVideos.find(v => v.id === vid);
  if (!orig) return;
  const edits = editedVideos[vid] || {};
  const sn    = orig.snippet;

  const newSnippet = {
    title:       edits.title       !== undefined ? edits.title       : sn.title,
    description: edits.description !== undefined ? edits.description : sn.description,
    tags:        edits.tags        !== undefined
      ? edits.tags.split(',').map(t=>t.trim()).filter(Boolean)
      : (sn.tags||[]),
    categoryId:  sn.categoryId || '22',
    defaultLanguage: sn.defaultLanguage
  };

  // YouTube API rejects descriptions containing < or > characters
  if (/[<>]/.test(newSnippet.description || '')) {
    const row    = document.querySelector(`tr[data-vid="${vid}"]`);
    const status = document.querySelector(`.row-status[data-vid="${vid}"]`);
    if (row) row.classList.add('error');
    if (status) status.innerHTML = '<span class="status-error">Error</span>';
    const err = new Error('Description contains < or > characters which YouTube does not allow. Please remove them and try again.');
    if (!isBulkSaving) showToast(err.message, 'error');
    throw err;
  }

  // YouTube API rejects titles containing < or > characters
  if (/[<>]/.test(newSnippet.title || '')) {
    const row    = document.querySelector(`tr[data-vid="${vid}"]`);
    const status = document.querySelector(`.row-status[data-vid="${vid}"]`);
    if (row) row.classList.add('error');
    if (status) status.innerHTML = '<span class="status-error">Error</span>';
    const err = new Error('Title contains < or > characters which YouTube does not allow. Please remove them and try again.');
    if (!isBulkSaving) showToast(err.message, 'error');
    throw err;
  }

  const row    = document.querySelector(`tr[data-vid="${vid}"]`);
  const status = document.querySelector(`.row-status[data-vid="${vid}"]`);
  if (status) status.innerHTML = '<span class="status-saving">Saving...</span>';

  try {
    await ytUpdate(vid, newSnippet);
    orig.snippet = { ...sn, ...newSnippet };
    delete editedVideos[vid];
    savedRows.add(vid);

    if (row) {
      row.classList.remove('changed','error');
      row.classList.add('saved');
      row.querySelectorAll('.editable').forEach(el => {
        el.classList.remove('is-changed');
        el.closest('.field-wrap').classList.remove('changed');
        const origEl = el.closest('.field-wrap').querySelector('.field-original');
        if (origEl) origEl.textContent = '';
      });
    }
    if (status) status.innerHTML = '<span class="status-saved">Saved</span>';
    updateVideoCount();
    if (!isBulkSaving) showToast('Saved!', 'success');
  } catch (e) {
    if (row) row.classList.add('error');
    if (status) status.innerHTML = '<span class="status-error">Error</span>';
    if (!isBulkSaving) showToast(`Save failed: ${e.message}`, 'error');
    throw e; // re-throw so Save All can count it
  }
}

// ── Revert row ────────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
function revertRow(vid) {
  const orig = allVideos.find(v => v.id === vid);
  if (!orig) return;
  const row  = document.querySelector(`tr[data-vid="${vid}"]`);
  const sn   = orig.snippet;

  if (row) {
    const tf  = row.querySelector(`textarea[data-field="title"]`);
    const df  = row.querySelector(`textarea[data-field="description"]`);
    const tgf = row.querySelector(`textarea[data-field="tags"]`);
    if (tf)  tf.value  = sn.title || '';
    if (df)  df.value  = sn.description || '';
    if (tgf) tgf.value = (sn.tags||[]).join(', ');
    row.querySelectorAll('.editable').forEach(el => {
      el.classList.remove('is-changed');
      el.closest('.field-wrap').classList.remove('changed');
      const origEl = el.closest('.field-wrap').querySelector('.field-original');
      if (origEl) origEl.textContent = '';
    });
    row.classList.remove('changed','error');
    const statusEl = row.querySelector(`.row-status[data-vid="${vid}"]`);
    if (statusEl) statusEl.innerHTML = '';
  }
  delete editedVideos[vid];
  updateVideoCount();
}

// ── Save all ──────────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
$('btnSaveAll').addEventListener('click', async () => {
  const ids = Object.keys(editedVideos);
  if (!ids.length) { showToast('No changes to save', 'error'); return; }
  const bar = $('saveBar'), msg = $('saveBarMsg'), prog = $('saveProgress');
  bar.classList.remove('hidden');
  $('btnSaveAll').disabled = true;
  isBulkSaving = true;
  let done = 0, failed = 0;
  for (const id of ids) {
    msg.textContent = `Saving ${done + failed + 1} of ${ids.length}...`;
    prog.innerHTML  = `<div class="save-progress-inner" style="width:${Math.round((done+failed)/ids.length*100)}%"></div>`;
    try {
      await saveRow(id);
      done++;
    } catch(e) {
      failed++;
    }
    await new Promise(r => setTimeout(r, 80)); // small delay so progress is visible
  }
  prog.innerHTML = `<div class="save-progress-inner" style="width:100%"></div>`;
  $('btnSaveAll').disabled = false;
  isBulkSaving = false;

  // Show clear summary
  if (failed === 0) {
    msg.textContent = `All ${done} video${done > 1 ? 's' : ''} saved successfully!`;
    showToast(`${done} video${done > 1 ? 's' : ''} saved successfully!`, 'success');
  } else if (done === 0) {
    msg.textContent = `All ${failed} saves failed. Check your connection or quota.`;
    showToast(`All ${failed} saves failed. Quota exceeded or connection error.`, 'warning');
  } else {
    msg.textContent = `${done} saved, ${failed} failed. Scroll to see red rows.`;
    showToast(`${done} saved, ${failed} failed. Check red rows below.`, 'warning');
  }
  setTimeout(() => bar.classList.add('hidden'), failed > 0 ? 6000 : 3500);
});

// ── Toolbar events ────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
$('searchInput').addEventListener('input', e => { searchQuery = e.target.value; currentPage = 1; applyFiltersAndRender(); });
$('sortSelect').addEventListener('change', e => { sortMode = e.target.value; currentPage = 1; applyFiltersAndRender(); });
$('filterSelect').addEventListener('change', e => { filterMode = e.target.value; currentPage = 1; applyFiltersAndRender(); });

// Sync both per-page selects
$('perPageSelect').addEventListener('change', e => {
  perPage = parseInt(e.target.value);
  if ($('perPageSelectTop')) $('perPageSelectTop').value = e.target.value;
  currentPage = 1;
  applyFiltersAndRender();
});
const topPP = $('perPageSelectTop');
if (topPP) topPP.addEventListener('change', e => {
  perPage = parseInt(e.target.value);
  $('perPageSelect').value = e.target.value;
  currentPage = 1;
  applyFiltersAndRender();
});

// ── Refresh ───────────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
$('btnRefresh').addEventListener('click', async () => {
  if (!accessToken) { showToast('Not signed in', 'error'); return; }
  editedVideos = {};
  savedRows    = new Set();
  // Reset filter to All so table doesn't appear blank after refresh
  filterMode = 'all';
  const filterSel = $('filterSelect');
  if (filterSel) filterSel.value = 'all';
  currentPage = 1;
  setLoading('Refreshing...');
  try {
    const data     = await ytFetch('/channels?part=snippet,contentDetails&mine=true&maxResults=50');
    const channels = data.items || [];
    if (channels.length) {
      // Stay on the currently selected channel rather than always defaulting to the first
      const current = channels.find(c => c.id === currentChannelId) || channels[0];
      await loadVideos(current);
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
});

// ── Export CSV ────────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
function buildCSV(videoList) {
  const headers = [
    'Video ID', 'Title', 'Description', 'Tags',
    'Privacy Status', 'Publish Status', 'Published At', 'Last Updated At',
    'Duration', 'Views', 'Likes', 'Comments',
    'Default Language', 'Category ID', 'Live Broadcast Content', 'URL'
  ];
  const rows = [headers];
  videoList.forEach(v => {
    const sn   = v.snippet        || {};
    const st   = v.status         || {};
    const cd   = v.contentDetails || {};
    const stat = v.statistics     || {};
    function parseDuration(iso) {
      if (!iso) return '';
      const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!m) return iso;
      const h = parseInt(m[1]||0), min = parseInt(m[2]||0), s = parseInt(m[3]||0);
      return [h && `${h}h`, min && `${min}m`, `${s}s`].filter(Boolean).join(' ');
    }
    function fmtDate(iso) {
      if (!iso) return '';
      return new Date(iso).toISOString().replace('T',' ').substring(0,19) + ' UTC';
    }
    rows.push([
      csvCell(v.id),
      csvCell(sn.title                      || ''),
      csvCell(sn.description                || ''),
      csvCell((sn.tags || []).join(', ')    || ''),
      csvCell(st.privacyStatus              || ''),
      csvCell(st.uploadStatus               || ''),
      csvCell(fmtDate(sn.publishedAt)       || ''),
      csvCell(fmtDate(cd.lastUpdated)        || ''),
      csvCell(parseDuration(cd.duration)    || ''),
      csvCell(stat.viewCount                || '0'),
      csvCell(stat.likeCount                || '0'),
      csvCell(stat.commentCount             || '0'),
      csvCell(sn.defaultLanguage            || ''),
      csvCell(sn.categoryId                 || ''),
      csvCell(sn.liveBroadcastContent       || ''),
      csvCell(`https://www.youtube.com/watch?v=${v.id}`)
    ]);
  });
  return rows.map(r => r.join(',')).join('\n');
}
function csvCell(val) { return `"${String(val).replace(/"/g,'""')}"`; }

function downloadCSV(csv, filename) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// Export All: always downloads complete channel backup
$('btnDownload').addEventListener('click', () => {
  if (!allVideos.length) return;
  downloadCSV(buildCSV(allVideos), `youtube-videos-${new Date().toISOString().split('T')[0]}.csv`);
  showToast(`CSV downloaded (${allVideos.length} videos)`, 'success');
});

// Dropdown toggle
$('btnExportDropdown').addEventListener('click', e => {
  e.stopPropagation();
  $('exportDropdownMenu').classList.toggle('hidden');
});

// Close dropdown when clicking anywhere else
document.addEventListener('click', () => {
  const menu = $('exportDropdownMenu');
  if (menu) menu.classList.add('hidden');
});

// Export Visible: downloads only the currently filtered/searched rows
$('btnExportVisible').addEventListener('click', () => {
  $('exportDropdownMenu').classList.add('hidden');
  if (!filteredVids.length) { showToast('No videos visible to export', 'error'); return; }
  const isFiltered = filteredVids.length < allVideos.length;
  const suffix     = isFiltered ? '-filtered' : '';
  downloadCSV(buildCSV(filteredVids), `youtube-videos${suffix}-${new Date().toISOString().split('T')[0]}.csv`);
  const label = isFiltered ? `${filteredVids.length} visible videos` : `${filteredVids.length} videos`;
  showToast(`CSV downloaded (${label})`, 'success');
});

// ── Import CSV ────────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
// Accepts the same CSV format as Export CSV.
// Parses the file, matches video IDs against currently loaded videos,
// shows a preview modal, then loads changes into the editor on confirm.

let isBulkSaving = false; // suppress per-row toasts during Save All

$('btnImport').addEventListener('click', () => {
  if (!allVideos.length) { showToast('No videos loaded yet', 'error'); return; }
  $('csvFileInput').value = '';
  $('csvFileInput').click();
});

$('csvFileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      parseAndPreviewCSV(ev.target.result);
    } catch (err) {
      showToast('Failed to read CSV: ' + err.message, 'error');
    }
  };
  reader.onerror = () => showToast('Could not read the file. Please try again.', 'error');
  reader.readAsText(file, 'UTF-8');
});

function parseAndPreviewCSV(raw) {
  // Strip BOM if present
  const text = raw.replace(/^\uFEFF/, '');

  // Parse entire CSV respecting quoted fields that span multiple lines
  function parseCSV(str) {
    const rows = [];
    let cur = [], field = '', inQuote = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '"') {
        if (inQuote && str[i+1] === '"') { field += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cur.push(field); field = '';
      } else if ((ch === '\n' || (ch === '\r' && str[i+1] === '\n')) && !inQuote) {
        if (ch === '\r') i++; // skip \n after \r
        cur.push(field); field = '';
        if (cur.some(c => c !== '') || rows.length > 0) rows.push(cur);
        cur = [];
      } else {
        field += ch;
      }
    }
    // Last field/row
    if (field || cur.length) { cur.push(field); if (cur.some(c => c !== '')) rows.push(cur); }
    return rows;
  }

  const allRows = parseCSV(text);
  if (allRows.length < 2) { showToast('CSV appears empty', 'error'); return; }

  // Strip any surrounding quotes from headers (Excel sometimes adds them) and normalise
  const headers = allRows[0].map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
  const idCol    = headers.indexOf('video id');
  const titleCol = headers.indexOf('title');
  const descCol  = headers.indexOf('description');
  const tagsCol  = headers.indexOf('tags');

  if (idCol === -1) {
    showToast('CSV missing "Video ID" column. Make sure the header row has a "Video ID" column.', 'error');
    return;
  }

  // Build lookup of currently loaded videos
  const loadedMap = {};
  allVideos.forEach(v => { loadedMap[v.id] = v; });

  importParsed = [];
  const tableRows = [];
  let countOk = 0, countSkip = 0, countErr = 0;

  for (let i = 1; i < allRows.length; i++) {
    const cols  = allRows[i];
    // Strip surrounding quotes from video ID (Excel can add extra quoting)
    const vid   = (cols[idCol] || '').trim().replace(/^["']|["']$/g, '');
    if (!vid) continue;

    const csvTitle = titleCol > -1 ? (cols[titleCol] || '').trim() || null : null;
    const csvDesc  = descCol  > -1 ? (cols[descCol]  || '').trim() || null : null;
    const csvTags  = tagsCol  > -1 ? (cols[tagsCol]  || '').trim() || null : null;

    const existing = loadedMap[vid];

    if (!existing) {
      countErr++;
      tableRows.push({ vid, status: 'err', title: csvTitle || vid, changes: 'Not in loaded channel' });
      continue;
    }

    const sn = existing.snippet || {};
    const changes = [];
    // Trim both sides for comparison so trailing whitespace/newlines from YouTube
    // or from the CSV editor don't produce false "change detected" results
    const memTitle = (sn.title       || '').trim();
    const memDesc  = (sn.description || '').trim();
    const memTags  = (sn.tags        || []).join(', ').trim();
    if (csvTitle !== null && csvTitle !== memTitle)   changes.push('Title');
    if (csvDesc  !== null && csvDesc  !== memDesc)    changes.push('Description');
    if (csvTags  !== null && csvTags  !== memTags)    changes.push('Tags');

    if (!changes.length) {
      countSkip++;
      tableRows.push({ vid, status: 'skip', title: sn.title || vid, changes: 'No changes' });
      continue;
    }

    countOk++;
    importParsed.push({ vid, csvTitle, csvDesc, csvTags, changes });
    tableRows.push({ vid, status: 'ok', title: sn.title || vid, changes: changes.join(', ') });
  }

  // Render summary
  $('importSummary').innerHTML = `
    <span><span class="ok">${countOk}</span> will update</span>
    <span><span class="warn">${countSkip}</span> no changes</span>
    <span><span class="err">${countErr}</span> not found in channel</span>
    <span style="color:var(--text3)">${allRows.length - 1} rows in file</span>`;

  // Render table
  const tbody = $('importTableBody');
  tbody.innerHTML = tableRows.map(r => `
    <tr class="row-${r.status}">
      <td><span class="import-badge ${r.status}">${
        r.status === 'ok' ? 'Will Update' : r.status === 'skip' ? 'No Change' : 'Not Found'
      }</span></td>
      <td style="font-family:monospace;font-size:11px">${r.vid}</td>
      <td style="font-size:12px">${r.title.substring(0, 55)}${r.title.length > 55 ? '...' : ''}</td>
      <td style="font-size:12px;color:var(--text2)">${r.changes}</td>
    </tr>`).join('');

  $('importFooterNote').textContent = countOk
    ? `${countOk} video${countOk > 1 ? 's' : ''} will be marked as edited. Review each row before saving.`
    : 'Nothing to import.';

  $('btnConfirmImport').disabled = countOk === 0;

  if (countOk === 0 && countErr === 0) {
    // All rows matched exactly - no edits detected
    showToast(`No changes found in ${allRows.length - 1} row${allRows.length > 2 ? 's' : ''}. The imported file matches your current data.`, 'warning');
    return;
  }

  $('importModal').classList.remove('hidden');
}

$('btnCloseImport').addEventListener('click',  () => $('importModal').classList.add('hidden'));
$('btnCancelImport').addEventListener('click', () => $('importModal').classList.add('hidden'));

$('btnConfirmImport').addEventListener('click', () => {
  if (!importParsed.length) return;

  const applyTitle = $('importApplyTitle')?.checked !== false;
  const applyDesc  = $('importApplyDesc')?.checked  !== false;
  const applyTags  = $('importApplyTags')?.checked  !== false;

  let applied = 0;

  importParsed.forEach(({ vid, csvTitle, csvDesc, csvTags, changes }) => {
    const existing = allVideos.find(v => v.id === vid);
    if (!existing) return;

    if (!editedVideos[vid]) editedVideos[vid] = {};
    if (applyTitle && csvTitle !== null && changes.includes('Title'))       editedVideos[vid].title       = csvTitle;
    if (applyDesc  && csvDesc  !== null && changes.includes('Description')) editedVideos[vid].description = csvDesc;
    if (applyTags  && csvTags  !== null && changes.includes('Tags'))        editedVideos[vid].tags        = csvTags;

    // Check if anything was actually applied
    if (Object.keys(editedVideos[vid]).length === 0) {
      delete editedVideos[vid];
      return;
    }

    // Update the rendered row if visible
    const row = document.querySelector(`tr[data-vid="${vid}"]`);
    if (row) {
      const tf  = row.querySelector(`textarea[data-field="title"]`);
      const df  = row.querySelector(`textarea[data-field="description"]`);
      const tgf = row.querySelector(`textarea[data-field="tags"]`);
      if (tf  && applyTitle && changes.includes('Title'))       { tf.value  = csvTitle; tf.dispatchEvent(new Event('input')); }
      if (df  && applyDesc  && changes.includes('Description')) { df.value  = csvDesc;  df.dispatchEvent(new Event('input')); }
      if (tgf && applyTags  && changes.includes('Tags'))        { tgf.value = csvTags;  tgf.dispatchEvent(new Event('input')); }
    }
    applied++;
  });

  $('importModal').classList.add('hidden');

  // Switch filter to show only imported/changed rows
  filterMode = 'changed';
  const filterSel = $('filterSelect');
  if (filterSel) filterSel.value = 'changed';
  currentPage = 1;

  applyFiltersAndRender();
  showToast(`${applied} video${applied > 1 ? 's' : ''} loaded  -  review edits and save`, 'success');
  importParsed = [];
});

// ── Feedback form ─────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
$('btnSendFeedback').addEventListener('click', () => {
  const name    = $('fbName')?.value.trim()    || 'Anonymous';
  const channel = $('fbChannel')?.value.trim() || '';
  const type    = $('fbType')?.value           || 'General Feedback';
  const rating  = $('fbRating')?.value         || '';
  const message = $('fbMessage')?.value.trim() || '';
  if (!message) { showToast('Please write your feedback before sending.', 'error'); return; }
  const subject = encodeURIComponent(`[YouTube Bulk Editor] ${type} from ${name}`);
  const body    = encodeURIComponent(
    `Name: ${name}\nChannel: ${channel||'N/A'}\nType: ${type}\nRating: ${rating}\n\nFeedback:\n${message}`
  );
  window.open(`mailto:jain.chirag+youtubebulkeditor@gmail.com?subject=${subject}&body=${body}`);
  showToast('Opening your email client...', 'success');
});

// ── Toast ─────────────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
let _tt;
function showToast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className   = 'toast' + (type ? ` ${type}` : '');
  t.classList.remove('hidden');
  clearTimeout(_tt);
  // Quota/warning messages stay longer so user can read them
  // Error messages also stay longer (5s) so they are not missed
  const duration = (type === 'warning') ? 8000 : (type === 'error') ? 5000 : 3500;
  _tt = setTimeout(() => t.classList.add('hidden'), duration);
}
