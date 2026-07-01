// Local development server. On Vercel the files in /api are the backend; this
// little Express server mounts those SAME handlers so `npm start` works locally
// against your Supabase project. It is NOT used in the Vercel deployment.
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4321;

app.use(express.json({ limit: '12mb' })); // photos arrive as base64
app.use(express.static(path.join(__dirname, 'public')));

app.all('/api/children', require('./api/children'));
app.all('/api/search', require('./api/search'));
app.all('/api/stats', require('./api/stats'));
app.all('/api/alerts', require('./api/alerts'));
app.all('/api/login', require('./api/login'));

app.listen(PORT, () => {
  console.log(`Missing Child Finder (local) running at http://localhost:${PORT}`);
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('NOTE: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — see .env.example');
  }
});
