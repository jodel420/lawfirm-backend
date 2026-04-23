// ============================================================================
// server.js — Local development entry point
//
// This file delegates 100% to api/index.js (the Supabase-backed production
// API). Running `node server.js` is identical to `node api/index.js` locally.
//
// Vercel ignores this file — it uses api/index.js directly via vercel.json.
// ============================================================================

require('dotenv').config();

const app  = require('./api/index');
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────────────────────┐
  │   Aniceta Law Firm — Backend API                    │
  │   http://localhost:${PORT}                            │
  │                                                     │
  │   All routes live in: api/index.js                  │
  └─────────────────────────────────────────────────────┘
  `);
});
