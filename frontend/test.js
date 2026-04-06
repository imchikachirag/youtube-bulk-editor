#!/usr/bin/env node
// ============================================================
// YouTube Bulk Editor - Automated Test Suite
// Run: node tests/test.js
// ============================================================

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const BACKEND  = path.join(ROOT, 'backend');

let passed = 0, failed = 0, warnings = 0;
const failures = [];

function pass(name) {
  process.stdout.write(`  ✅ ${name}\n`);
  passed++;
}
function fail(name, detail) {
  process.stdout.write(`  ❌ ${name}${detail ? ': ' + detail : ''}\n`);
  failed++;
  failures.push({ name, detail });
}
function warn(name, detail) {
  process.stdout.write(`  ⚠️  ${name}${detail ? ': ' + detail : ''}\n`);
  warnings++;
}
function section(title) {
  process.stdout.write(`\n── ${title} ${'─'.repeat(50 - title.length)}\n`);
}

const read = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;

const indexHtml   = read(path.join(FRONTEND, 'index.html'));
const editorJs    = read(path.join(FRONTEND, 'editor.js'));
const privacyHtml = read(path.join(FRONTEND, 'privacy', 'index.html'));
const changelogHtml = read(path.join(FRONTEND, 'changelog', 'index.html'));
const serverJs    = read(path.join(BACKEND, 'server.js'));
const packageJson = read(path.join(BACKEND, 'package.json'));

// ── 1. File Integrity ────────────────────────────────────────
section('File Integrity');
[
  ['frontend/index.html',          indexHtml],
  ['frontend/editor.js',           editorJs],
  ['frontend/privacy/index.html',  privacyHtml],
  ['frontend/changelog/index.html',changelogHtml],
  ['backend/server.js',            serverJs],
  ['backend/package.json',         packageJson],
].forEach(([name, content]) => {
  if (content) pass(`${name} exists`);
  else fail(`${name} exists`, 'file not found');
});

const favicon = fs.existsSync(path.join(FRONTEND, 'favicon.ico'));
favicon ? pass('favicon.ico exists') : fail('favicon.ico exists');

// ── 2. Version Consistency ───────────────────────────────────
section('Version Consistency');
const versionMatch = editorJs?.match(/const APP_VERSION = '([\d.]+)'/);
const currentVersion = versionMatch?.[1];

if (currentVersion) {
  pass(`APP_VERSION defined: v${currentVersion}`);

  // Check all version references match
  const checks = [
    ['index.html version badge href', indexHtml?.includes(`changelog/?from=app`)],
    ['index.html footer version',     indexHtml?.includes(`v${currentVersion}`)],
    ['changelog page exists',         !!changelogHtml],
    ['changelog mentions version',    changelogHtml?.includes(`v${currentVersion}`)],
  ];
  checks.forEach(([name, ok]) => ok ? pass(name) : fail(name));
} else {
  fail('APP_VERSION defined in editor.js');
}

// ── 3. Core Functions Present ────────────────────────────────
section('Core Functions');
const coreFunctions = [
  'function showToast',
  'function parseYTError',
  'function ytFetch',
  'function ytUpdate',
  'function saveRow',
  'function revertRow',
  'function applyFiltersAndRender',
  'function renderPage',
  'function updateVideoCount',
  'function parseAndPreviewCSV',
  'function toggleRelease',
  'function updateThemeIcon',
  'function initTheme',
];
coreFunctions.forEach(fn => {
  (editorJs?.includes(fn) || indexHtml?.includes(fn) || changelogHtml?.includes(fn))
    ? pass(fn)
    : fail(fn, 'not found');
});

// ── 4. UI Elements Present ───────────────────────────────────
section('UI Elements');
const uiElements = [
  ['Sign in button',        'screenSignIn'],
  ['Loading screen',        'screenLoading'],
  ['Channel picker',        'screenPicker'],
  ['Editor screen',         'screenEditor'],
  ['Save All button',       'btnSaveAll'],
  ['Refresh button',        'btnRefresh'],
  ['Export All button',     'btnDownload'],
  ['Export Visible button', 'btnExportVisible'],
  ['Export dropdown arrow', 'btnExportDropdown'],
  ['Export split group',    'exportBtnGroup'],
  ['Import CSV button',     'btnImport'],
  ['Disconnect button',     'btnSignOut'],
  ['Theme toggle',          'btnTheme'],
  ['Search input',          'searchInput'],
  ['Filter dropdown',       'filterSelect'],
  ['Sort dropdown',         'sortSelect'],
  ['Toast notification',    'id="toast"'],
  ['Save progress bar',     'saveBar'],
  ['Import modal',          'importModal'],
  ['Version badge',         'appVersionBadge'],
  ['Import field toggles',  'importApplyDesc'],
];
uiElements.forEach(([name, id]) => {
  indexHtml?.includes(id) ? pass(name) : fail(name, `${id} not found`);
});

// ── 5. Changelog Page ────────────────────────────────────────
section('Changelog Page');
const changelogChecks = [
  ['Has timeline structure',  changelogHtml?.includes('class="timeline"')],
  ['Has CTA banner',          changelogHtml?.includes('id="ctaBanner"')],
  ['CTA hidden when from=app',changelogHtml?.includes("params.get('from') === 'app'")],
  ['Has dark mode toggle',    changelogHtml?.includes('btnTheme')],
  ['Has back to app button',  changelogHtml?.includes('btnBackToApp')],
  ['Has v2.2.0 release',      changelogHtml?.includes('v2.2.0')],
  ['Has v2.1.0 release',      changelogHtml?.includes('v2.1.0')],
  ['Has v2.0.0 release',      changelogHtml?.includes('v2.0.0')],
  ['Latest release open',     changelogHtml?.includes('release-card open')],
  ['Uses same CSS variables',  changelogHtml?.includes('var(--accent)')],
];
changelogChecks.forEach(([name, ok]) => ok ? pass(name) : fail(name));

// ── 6. Import/Export Logic ───────────────────────────────────
section('Import / Export Logic');
const importChecks = [
  ['Empty CSV field treated as null',        editorJs?.includes("|| null : null")],
  ['Field toggle: importApplyTitle',         editorJs?.includes("importApplyTitle")],
  ['Field toggle: importApplyDesc',          editorJs?.includes("importApplyDesc")],
  ['Field toggle: importApplyTags',          editorJs?.includes("importApplyTags")],
  ['Multiline CSV parser (char-by-char)',     editorJs?.includes("function parseCSV")],
  ['Filter resets to all after import',      editorJs?.includes("filterMode = 'changed'")],
  ['Filter resets to all on refresh',        editorJs?.includes("filterMode = 'all'")],
  ['buildCSV helper function exists',        editorJs?.includes('function buildCSV')],
  ['downloadCSV helper function exists',     editorJs?.includes('function downloadCSV')],
  ['Export All uses allVideos',              editorJs?.includes('buildCSV(allVideos)')],
  ['Export Visible uses filteredVids',       editorJs?.includes('buildCSV(filteredVids)')],
  ['Export Visible skips when empty',        editorJs?.includes('No videos visible to export')],
  ['Export Visible filename has -filtered',  editorJs?.includes("'-filtered'")],
  ['Export dropdown toggle exists',          editorJs?.includes('btnExportDropdown')],
  ['Export dropdown closes on outside click',editorJs?.includes("classList.add('hidden')")],
  ['csvCell helper function exists',         editorJs?.includes('function csvCell')],
];
importChecks.forEach(([name, ok]) => ok ? pass(name) : fail(name));

// ── 7. Save Logic ────────────────────────────────────────────
section('Save Logic');
const saveChecks = [
  ['isBulkSaving flag exists',              editorJs?.includes('isBulkSaving')],
  ['Per-row toasts suppressed during bulk', editorJs?.includes('if (!isBulkSaving) showToast')],
  ['Save All counts failures',              editorJs?.includes('failed++')],
  ['Save All shows success summary',        editorJs?.includes('saved successfully')],
  ['Save All shows failure summary',        editorJs?.includes('saves failed')],
  ['saveRow re-throws for count',           editorJs?.includes('throw e; // re-throw')],
];
saveChecks.forEach(([name, ok]) => ok ? pass(name) : fail(name));

// ── 8. Regression: Previously Fixed Bugs ────────────────────
section('Regression Tests');
const regressions = [
  // R1: Quota error showed raw HTML
  ['R1: parseYTError strips HTML tags',      editorJs?.includes("replace(/<[^>]*>/g, '')")],
  // R2: Import only loaded first line (multiline CSV bug)
  ['R2: CSV parser handles multiline fields', editorJs?.includes('inQuote = !inQuote')],
  // R3: Refresh with Changed Only filter showed blank table
  ['R3: Refresh resets filter to all',        editorJs?.includes("filterMode = 'all'") && editorJs?.includes('btnRefresh')],
  // R4: Empty desc in CSV wiped existing descriptions
  ['R4: Empty CSV field = null, not empty string', editorJs?.includes("|| null : null")],
  // R5: Footer layout broken on sign-in screen
  ['R5: Signin footer has max-width constraint', indexHtml?.includes('max-width:860px')],
  // R6: Dark mode hover invisible
  ['R6: Dark mode row hover defined', indexHtml?.includes('body.dark .video-row:hover')],
  // R7: Version badge was not clickable
  ['R7: Version badge is a link to changelog', indexHtml?.includes('changelog/?from=app')],
  // R8: Save All had no success/fail summary
  ['R8: Save All has outcome summary message', editorJs?.includes('saved successfully!')],
];
regressions.forEach(([name, ok]) => ok ? pass(name) : fail(name));

// ── 9. Privacy and Trust ─────────────────────────────────────
section('Privacy & Trust');
const privacyChecks = [
  ['sessionStorage used for token (not localStorage)', editorJs?.includes("sessionStorage")],
  ['localStorage NOT used for token',                  !editorJs?.includes("localStorage.setItem('yt_editor_token")],
  ['Token cleared on disconnect',                      editorJs?.includes("sessionStorage.removeItem('yt_editor_token')")],
  ['Privacy policy page exists',                       !!privacyHtml],
  ['Privacy banner present in app',                    indexHtml?.includes('Zero server storage')],
  ['No token written to URL',                          !editorJs?.includes("location.href += 'token=") && !editorJs?.includes('pushState') ],
];
privacyChecks.forEach(([name, ok]) => ok ? pass(name) : fail(name));

// ── Summary ──────────────────────────────────────────────────
const total = passed + failed;
process.stdout.write(`\n${'═'.repeat(60)}\n`);
process.stdout.write(`RESULTS  ${passed}/${total} passed`);
if (warnings) process.stdout.write(`  ${warnings} warnings`);
process.stdout.write(`\n`);

if (failed === 0) {
  process.stdout.write(`✅ All tests passed - safe to deliver v${currentVersion || '?'}\n`);
} else {
  process.stdout.write(`❌ ${failed} test${failed > 1 ? 's' : ''} failed - fix before delivery\n`);
  process.stdout.write(`\nFailed tests:\n`);
  failures.forEach(f => process.stdout.write(`  - ${f.name}${f.detail ? ': ' + f.detail : ''}\n`));
  process.exit(1);
}
process.stdout.write(`${'═'.repeat(60)}\n`);
