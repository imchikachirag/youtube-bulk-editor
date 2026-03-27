#!/usr/bin/env node
// ============================================================
// YouTube Bulk Editor - Security Audit
// Run: node tests/security.js
// ============================================================

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const BACKEND  = path.join(ROOT, 'backend');

let passed = 0, failed = 0;
const failures = [];

function pass(name) { process.stdout.write(`  ✅ ${name}\n`); passed++; }
function fail(name, detail) {
  process.stdout.write(`  ❌ ${name}${detail ? ': ' + detail : ''}\n`);
  failed++; failures.push({ name, detail });
}
function section(title) {
  process.stdout.write(`\n── ${title} ${'─'.repeat(50 - title.length)}\n`);
}

const read = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
const indexHtml = read(path.join(FRONTEND, 'index.html'));
const editorJs  = read(path.join(FRONTEND, 'editor.js'));
const serverJs  = read(path.join(BACKEND,  'server.js'));
const allFront  = indexHtml + editorJs;
const allFiles  = allFront + serverJs;

// ── 1. XSS Prevention ───────────────────────────────────────
section('XSS Prevention');

// No eval usage
!allFront.includes('eval(')
  ? pass('No eval() usage')
  : fail('No eval() usage', 'eval() found in frontend code');

// innerHTML uses — allowed for hardcoded status strings and template rows, not user input
// User input goes through textContent only. We verify no innerHTML uses raw user fields.
const unsafeInner = [
  editorJs.match(/innerHTML\s*=\s*[^`'"<]*(title|description|tags|csvTitle|csvDesc|csvTags)/g),
].filter(Boolean).flat();
unsafeInner.length === 0
  ? pass('innerHTML never receives raw user input (titles/descriptions/tags)')
  : fail('innerHTML never receives raw user input', `${unsafeInner.length} potential unsafe use(s)`);

// textContent used for user-facing dynamic text
allFront.includes('textContent')
  ? pass('textContent used for dynamic text rendering')
  : fail('textContent used for dynamic text rendering');

// Toast uses textContent not innerHTML
const toastFn = editorJs.match(/function showToast[\s\S]{0,200}/)?.[0] || '';
toastFn.includes('textContent')
  ? pass('Toast uses textContent (not innerHTML)')
  : fail('Toast uses textContent (not innerHTML)');

// Error messages stripped of HTML before display
editorJs.includes("replace(/<[^>]*>/g, '')")
  ? pass('API error messages stripped of HTML tags before display')
  : fail('API error messages stripped of HTML tags before display');

// No dangerouslySetInnerHTML
!allFront.includes('dangerouslySetInnerHTML')
  ? pass('No dangerouslySetInnerHTML')
  : fail('No dangerouslySetInnerHTML');

// ── 2. Credential & Token Security ──────────────────────────
section('Credential & Token Security');

// Token in sessionStorage not localStorage
editorJs.includes('sessionStorage') && !editorJs.includes("localStorage.setItem('yt_editor_token")
  ? pass('OAuth token stored in sessionStorage only (not localStorage)')
  : fail('OAuth token stored in sessionStorage only (not localStorage)');

// Token cleared on disconnect
editorJs.includes("sessionStorage.removeItem('yt_editor_token')")
  ? pass('Token cleared from sessionStorage on disconnect')
  : fail('Token cleared from sessionStorage on disconnect');

// Token cleared on 401
editorJs.includes('sessionStorage.removeItem') && editorJs.includes('status === 401')
  ? pass('Token cleared on 401 Unauthorized')
  : fail('Token cleared on 401 Unauthorized');

// No token in URL params (hash fragment is ok for initial delivery)
const tokenInUrl = editorJs.match(/window\.location\.(href|search).*token/g);
!tokenInUrl
  ? pass('Token not written to URL search params')
  : fail('Token not written to URL search params', 'found in URL manipulation');

// No logging of tokens
const logStatements = editorJs.match(/console\.(log|info|warn|error)\([^)]*token/gi) || [];
logStatements.length === 0
  ? pass('Token not logged to console')
  : fail('Token not logged to console', `${logStatements.length} instance(s) found`);

// Backend does not store token — strip comments first then check
const serverNoComments = serverJs.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const backendHasStorage = /\b(db|database|redis|mongoose|sequelize|\.save\(|\.insert\(|fs\.write)\b/i.test(serverNoComments);
!backendHasStorage
  ? pass('Backend has no storage/database — stateless OAuth handshake only')
  : fail('Backend has no storage/database', 'storage pattern found — verify tokens are not persisted');

// ── 3. Data Isolation ────────────────────────────────────────
section('Data Isolation');

// No shared global state that could bleed between users
!serverJs.includes('global.') && !serverJs.includes('app.set(')
  ? pass('No server-side global state between users')
  : fail('No server-side global state between users');

// sessionStorage (not shared between tabs)
editorJs.includes('sessionStorage')
  ? pass('sessionStorage used - data isolated per tab')
  : fail('sessionStorage used - data isolated per tab');

// ── 4. External Content Security ────────────────────────────
section('External Content Security');

// All external links have rel=noopener
const externalLinks = indexHtml.match(/target="_blank"/g) || [];
const noopenerCount = indexHtml.match(/rel="noopener/g) || []; // matches noopener and noopener noreferrer
externalLinks.length === noopenerCount.length
  ? pass(`All ${externalLinks.length} external links have rel=noopener`)
  : fail(`External links have rel=noopener`, `${externalLinks.length - noopenerCount.length} missing`);

// No external script tags (all scripts should be inline or same-origin)
const extScripts = indexHtml.match(/<script[^>]+src="http/g) || [];
extScripts.length === 0
  ? pass('No external script tags in HTML')
  : fail('No external script tags in HTML', `${extScripts.length} external script(s) found`);

// API calls go to YouTube directly (not proxied)
editorJs.includes('googleapis.com/youtube/v3')
  ? pass('YouTube API calls go directly to googleapis.com')
  : fail('YouTube API calls go directly to googleapis.com');

// Backend only handles auth endpoints
const backendRoutes = serverJs.match(/app\.(get|post|put|delete)\(/g) || [];
backendRoutes.length <= 4
  ? pass(`Backend has minimal routes (${backendRoutes.length} routes - auth only)`)
  : fail('Backend has minimal routes', `${backendRoutes.length} routes found - verify no data routes`);

// ── 5. State Machine Correctness ────────────────────────────
section('State Machine Correctness');

// isBulkSaving resets on completion
const bulkSavingReset = (editorJs.match(/isBulkSaving\s*=/g) || []).length;
bulkSavingReset >= 2
  ? pass('isBulkSaving flag set AND reset')
  : fail('isBulkSaving flag set AND reset', 'missing reset path');

// Save All button re-enabled after completion
editorJs.includes("btnSaveAll').disabled = false")
  ? pass('Save All button re-enabled after completion')
  : fail('Save All button re-enabled after completion');

// Filter resets on refresh
editorJs.includes("filterMode = 'all'")
  ? pass('Filter mode resets on refresh')
  : fail('Filter mode resets on refresh');

// ── 6. Error Handling Completeness ──────────────────────────
section('Error Handling');

// ytFetch has error handling
editorJs.includes('async function ytFetch') && editorJs.includes('if (!res.ok)')
  ? pass('ytFetch handles non-OK responses')
  : fail('ytFetch handles non-OK responses');

// ytUpdate has error handling
editorJs.includes('async function ytUpdate') && editorJs.includes('if (!res.ok)')
  ? pass('ytUpdate handles non-OK responses')
  : fail('ytUpdate handles non-OK responses');

// saveRow wrapped in try/catch — look for try block within the function
const saveRowIdx = editorJs.indexOf('async function saveRow');
const saveRowChunk = editorJs.slice(saveRowIdx, saveRowIdx + 2000);
saveRowChunk.includes('try {') && saveRowChunk.includes('} catch')
  ? pass('saveRow wrapped in try/catch')
  : fail('saveRow wrapped in try/catch');

// Quota errors produce user-friendly message
editorJs.includes('quota') && editorJs.includes('12:30 PM IST')
  ? pass('Quota errors produce friendly message with reset time')
  : fail('Quota errors produce friendly message with reset time');

// ── 7. OAuth CSRF Protection ─────────────────────────────────
section('OAuth CSRF Protection');

serverJs.includes('createState') && serverJs.includes('validateState')
  ? pass('OAuth state parameter generated and validated')
  : fail('OAuth state parameter generated and validated');

serverJs.includes('crypto.randomBytes')
  ? pass('State nonce uses cryptographic random bytes')
  : fail('State nonce uses cryptographic random bytes');

serverJs.includes('pendingStates.delete(state)') && serverJs.includes('STATE_TTL_MS')
  ? pass('State nonce is one-time use with TTL expiry')
  : fail('State nonce is one-time use with TTL expiry');

// ── 8. Security Headers ───────────────────────────────────────
section('Security Headers');

serverJs.includes("X-Frame-Options") && serverJs.includes("'DENY'")
  ? pass("X-Frame-Options: DENY set (clickjacking protection)")
  : fail("X-Frame-Options: DENY set (clickjacking protection)");

serverJs.includes('X-Content-Type-Options')
  ? pass('X-Content-Type-Options: nosniff set')
  : fail('X-Content-Type-Options: nosniff set');

serverJs.includes('Content-Security-Policy') && serverJs.includes("frame-ancestors 'none'")
  ? pass("CSP frame-ancestors 'none' set")
  : fail("CSP frame-ancestors 'none' set");

serverJs.includes('Referrer-Policy')
  ? pass('Referrer-Policy header set')
  : fail('Referrer-Policy header set');

// ── 9. CORS localhost in Production ───────────────────────────
section('CORS Production Safety');

serverJs.includes('IS_DEV') && serverJs.includes('NODE_ENV')
  ? pass('localhost CORS origins gated to development mode only')
  : fail('localhost CORS origins gated to development mode only');

serverJs.includes("allowedOrigins.some(o => origin.startsWith(o))")
  ? pass('CORS uses startsWith match — no wildcard')
  : fail('CORS uses startsWith match — no wildcard');
const total = passed + failed;
process.stdout.write(`\n${'═'.repeat(60)}\n`);
process.stdout.write(`SECURITY  ${passed}/${total} checks passed\n`);

if (failed === 0) {
  process.stdout.write(`✅ Security audit passed — no issues found\n`);
} else {
  process.stdout.write(`❌ ${failed} security issue${failed > 1 ? 's' : ''} found — review before delivery\n`);
  process.stdout.write(`\nFailed checks:\n`);
  failures.forEach(f => process.stdout.write(`  - ${f.name}${f.detail ? ': ' + f.detail : ''}\n`));
  process.exit(1);
}
process.stdout.write(`${'═'.repeat(60)}\n`);
// ── Summary ──────────────────────────────────────────────────
const total2 = passed + failed;
process.stdout.write(`\n${'═'.repeat(60)}\n`);
process.stdout.write(`SECURITY  ${passed}/${total2} checks passed\n`);

if (failed === 0) {
  process.stdout.write(`✅ Security audit passed — no issues found\n`);
} else {
  process.stdout.write(`❌ ${failed} security issue${failed > 1 ? 's' : ''} found — review before delivery\n`);
  process.stdout.write(`\nFailed checks:\n`);
  failures.forEach(f => process.stdout.write(`  - ${f.name}${f.detail ? ': ' + f.detail : ''}\n`));
  process.exit(1);
}
process.stdout.write(`${'═'.repeat(60)}\n`);
