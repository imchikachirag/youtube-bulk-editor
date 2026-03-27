// ============================================================
// YouTube Bulk Editor  -  Backend Server
// github.com/imchikachirag/youtube-bulk-editor
//
// Copyright (c) 2026 Chirag Mehta
// https://chiragmehta.info | @imchikachirag
//
// MIT License  -  free to use, modify, and distribute
//
// PURPOSE: This server handles ONLY the Google OAuth 2.0
// login handshake (2 routes). It does NOT store tokens,
// video data, user emails, or any personal information.
// After login the token lives in the user's browser
// sessionStorage only. All YouTube API calls go directly
// from the browser to YouTube  -  this server is never
// involved again after the login step.
// ============================================================

'use strict';

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const https    = require('https');
const crypto   = require('crypto');

const app = express();

// ── Config ───────────────────────────────────────────────────
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = process.env.REDIRECT_URI;   // e.g. https://your-app.run.app/auth/callback
const FRONTEND_URL  = process.env.FRONTEND_URL;   // e.g. https://chiragmehta.info/youtube-bulk-editor
const IS_DEV        = process.env.NODE_ENV === 'development';

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !FRONTEND_URL) {
  console.error('Missing required environment variables. Check .env file.');
  process.exit(1);
}

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube.readonly'
].join(' ');

// ── CORS: only allow requests from the frontend domain ────────
// localhost only allowed in development mode
const allowedOrigins = [
  FRONTEND_URL,
  ...(IS_DEV ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : [])
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      cb(null, true);
    } else {
      cb(new Error('CORS: origin not allowed'));
    }
  },
  credentials: true
}));

// ── Security headers ──────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'"
  );
  next();
});

// ── OAuth state store (in-memory, short-lived) ─────────────────
// State nonces expire after 10 minutes to prevent replay
const pendingStates = new Map();
const STATE_TTL_MS  = 10 * 60 * 1000;

function createState() {
  const state   = crypto.randomBytes(16).toString('hex');
  const expires = Date.now() + STATE_TTL_MS;
  pendingStates.set(state, expires);
  // Clean up expired states
  for (const [s, exp] of pendingStates) {
    if (Date.now() > exp) pendingStates.delete(s);
  }
  return state;
}

function validateState(state) {
  if (!state || !pendingStates.has(state)) return false;
  const expires = pendingStates.get(state);
  pendingStates.delete(state); // one-time use
  return Date.now() <= expires;
}

app.use(express.json());

// ── Health check ──────────────────────────────────────────────
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
app.get('/', (req, res) => {
  res.json({
    service:   'YouTube Bulk Editor  -  OAuth Service',
    author:    'Chirag Mehta (@imchikachirag)',
    github:    'https://github.com/imchikachirag/youtube-bulk-editor',
    privacy:   'This server stores nothing. Zero token or user data retention.',
    status:    'ok'
  });
});

// ── Route 1: /auth/login ──────────────────────────────────────
// Builds the Google OAuth URL and redirects the user to Google.
// Generates a one-time state nonce to prevent CSRF attacks.
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
app.get('/auth/login', (req, res) => {
  const state  = createState();
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'online',   // no refresh token  -  session only
    prompt:        'select_account',
    state
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  res.redirect(googleAuthUrl);
});

// ── Route 2: /auth/callback ───────────────────────────────────
// Google redirects here with a one-time code after user signs in.
// State param is verified first to prevent CSRF attacks.
// We exchange the code for a token, then immediately send it to
// the browser via URL fragment (#token=...).
// The token is NEVER logged, stored in a database, or written
// to any file. It lives only in the user's sessionStorage.
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
app.get('/auth/callback', async (req, res) => {
  const { code, error, state } = req.query;

  // Validate state to prevent CSRF
  if (!validateState(state)) {
    const reason = encodeURIComponent('Invalid or expired login session. Please try again.');
    return res.redirect(`${FRONTEND_URL}?auth_error=${reason}`);
  }

  if (error || !code) {
    const reason = encodeURIComponent(error || 'No code returned from Google');
    return res.redirect(`${FRONTEND_URL}?auth_error=${reason}`);
  }

  try {
    const token = await exchangeCodeForToken(code);
    // Send token to frontend via URL fragment  -  fragments are never sent
    // to servers or written to server logs. Safe for token delivery.
    const redirectUrl = `${FRONTEND_URL}?auth=success#token=${encodeURIComponent(token)}`;
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('Token exchange failed:', err.message);
    const reason = encodeURIComponent('Login failed. Please try again.');
    res.redirect(`${FRONTEND_URL}?auth_error=${reason}`);
  }
});

// ── Token exchange helper ─────────────────────────────────────
// Calls Google's token endpoint to swap the one-time code for
// an access token. The token is returned to the caller and
// immediately forwarded to the browser  -  never persisted here.
// Copyright (c) 2026 Chirag Mehta  -  github.com/imchikachirag/youtube-bulk-editor
function exchangeCodeForToken(code) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code'
    }).toString();

    const options = {
      hostname: 'oauth2.googleapis.com',
      path:     '/token',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', chunk => { data += chunk; });
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            resolve(parsed.access_token);
          } else {
            reject(new Error(parsed.error_description || 'No access_token in response'));
          }
        } catch (e) {
          reject(new Error('Failed to parse token response'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`YouTube Bulk Editor OAuth service running on port ${PORT}`);
  console.log(`Author: Chirag Mehta (@imchikachirag)`);
  console.log(`GitHub: https://github.com/imchikachirag/youtube-bulk-editor`);
});
