# YouTube Bulk Editor

**Free tool to bulk edit YouTube video titles, descriptions and tags in one place.**

Built by [Chirag Mehta](https://chiragmehta.info) ([@imchikachirag](https://twitter.com/imchikachirag))

Live at: [chiragmehta.info/youtube-bulk-editor](https://chiragmehta.info/youtube-bulk-editor)

---

## What It Does

No more opening each YouTube video one by one. This tool loads all your videos into a clean spreadsheet-style table where you can:

- Edit titles, descriptions and tags inline
- Sort by title or publish date
- Search and filter across all videos
- Save row by row or save all changes at once
- Export a full CSV backup of all video metadata
- Paginate through 10, 25, 50 or 100 videos per page

## Privacy and Architecture

This tool is built with privacy as the primary constraint, not an afterthought.

**How the login works:**

1. You click "Sign in with Google" and are redirected to Google's own login page
2. After you approve, Google sends a one-time code to our backend on Google Cloud Run
3. The backend exchanges the code for an OAuth token and immediately redirects it to your browser as a URL fragment
4. The token is stored in your browser's `sessionStorage` only  -  never written to any server, database, or log
5. All YouTube API calls go directly from your browser to YouTube. Our server is never involved again

**What our server stores:** Nothing. Zero. The backend is a 60-line file with two routes. You can read every line at `backend/server.js`.

**When you Disconnect:** The token is revoked at Google immediately and cleared from `sessionStorage`.

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Backend hosting | Google Cloud Run | Trusted globally, scales automatically, 2M free requests/month |
| Authentication | Google OAuth 2.0 | Industry standard, your credentials never touch our code |
| Video data | YouTube Data API v3 | Official Google API, direct browser-to-YouTube |
| Token storage | Browser sessionStorage | Cleared on tab close, never leaves your device |
| Frontend hosting | chiragmehta.info | Static files, fully in your control |
| Source code | GitHub (this repo) | Open source, fully auditable |

## Self-Hosting

You can run this entirely yourself:

### Backend

```bash
cd backend
cp .env.example .env
# Fill in your Google OAuth credentials in .env
npm install
npm start
```

### Google Cloud Console Setup

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable the YouTube Data API v3
3. Create an OAuth 2.0 client (Web Application type)
4. Add your backend URL as an authorised redirect URI: `https://YOUR-BACKEND-URL/auth/callback`
5. Add your frontend URL as an authorised JavaScript origin

### Frontend

Copy the `frontend/` folder to your web server. Update `BACKEND_URL` in `editor.js` to point to your backend.

## Contributing

Issues and pull requests are welcome. Please open an issue first to discuss any significant changes.

## License

MIT License. Free to use, modify, and distribute. See [LICENSE](LICENSE).

## Support

If this tool saved you time, please donate to any NGO of your choice. That is all the payment asked for.

- Twitter: [@imchikachirag](https://twitter.com/imchikachirag)
- Email: jain.chirag+youtubebulkeditor@gmail.com
- Website: [chiragmehta.info](https://chiragmehta.info)

---

*Copyright 2026 Chirag Mehta. Made with ❤️ in India.*
