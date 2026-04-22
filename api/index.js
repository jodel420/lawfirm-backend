require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });

const express    = require('express');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const multer     = require('multer');
const nodemailer = require('nodemailer');
const axios      = require('axios');
const cheerio    = require('cheerio');
const crypto     = require('crypto');

const supabase   = require('../lib/db');
const requireAuth = require('../lib/auth');

const STORAGE_BUCKET = 'images';

// ── Multer (memory storage – no disk writes) ──────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
});

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());
app.use(express.json());

// ── SC Judiciary RSS feed (no DB needed) ─────────────────────────────────────
app.get('/api/sc-news', async (req, res) => {
  try {
    const { data: xml } = await axios.get(
      'https://sc.judiciary.gov.ph/feed/',
      {
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
      }
    );
    const $ = cheerio.load(xml, { xmlMode: true });
    const articles = [];

    $('item').each((i, el) => {
      if (articles.length >= 6) return false;
      const $el      = $(el);
      const title    = $el.find('title').first().text().trim();
      const rawLink  = $el.find('link').first().text().trim();
      const guid     = $el.find('guid').first().text().trim();
      const link     = rawLink || guid || '';
      const pubDate  = $el.find('pubDate').first().text().trim();
      const rawDesc  = $el.find('description').first().text().trim();
      const excerpt  = cheerio.load(rawDesc).text().replace(/\s+/g, ' ').trim().slice(0, 200);
      const category = $el.find('category').first().text().trim() || 'SC Judiciary';

      if (title) {
        articles.push({
          id:       i + 1,
          title,
          link,
          date:     pubDate,
          excerpt,
          image:    'https://images.unsplash.com/photo-1589578527966-fdac0f44566c?w=600&q=80&fit=crop&crop=center',
          category,
          source:   'sc.judiciary.gov.ph',
        });
      }
    });

    if (!articles.length) {
      return res.json({ success: false, data: [], message: 'No articles found' });
    }
    res.json({ success: true, data: articles });
  } catch (e) {
    console.error('SC news feed error:', e.code || e.message, e.response?.status);
    res.status(502).json({
      success: false,
      message: 'Could not fetch SC news',
      error:   e.code || e.message,
    });
  }
});

// ── Health check (no DB required) ────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    version: '4.0',
    env: {
      EMAIL_USER: !!process.env.EMAIL_USER,
      EMAIL_PASS: !!process.env.EMAIL_PASS,
      NOTIFY_EMAIL: !!process.env.NOTIFY_EMAIL,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      CORS_ORIGIN: process.env.CORS_ORIGIN || '(not set)',
    },
  });
});

// ── Contact form (email only — no DB) ────────────────────────────────────────
function getTransporter() {
  const user = (process.env.EMAIL_USER || '').trim();
  const pass = (process.env.EMAIL_PASS || '').trim();
  if (!user || !pass) {
    throw new Error(`Email credentials missing – EMAIL_USER=${user ? 'set' : 'EMPTY'}, EMAIL_PASS=${pass ? 'set' : 'EMPTY'}`);
  }
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
}

app.post('/api/contact', async (req, res) => {
  const { firstName, lastName, email, phone, preferredLawyer, notes } = req.body;

  if (!firstName || !email) {
    return res.status(400).json({ success: false, message: 'First name and email are required.' });
  }

  try {
    const transporter = getTransporter();
    const fromUser = (process.env.EMAIL_USER || '').trim();

    await transporter.sendMail({
      from: `"Aniceta Website" <${fromUser}>`,
      to: (process.env.NOTIFY_EMAIL || fromUser).trim(),
      subject: `New Consultation Request — ${firstName} ${lastName || ''}`.trim(),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;">
          <div style="background:#1a2638;padding:24px 28px;">
            <h2 style="color:#c9a84c;margin:0;font-size:18px;letter-spacing:1px;">ANICETA</h2>
            <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:12px;">New Consultation Request</p>
          </div>
          <div style="padding:28px;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Name</td><td style="padding:8px 0;color:#1a2638;font-weight:600;">${firstName} ${lastName || ''}</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280;">Email</td><td style="padding:8px 0;color:#1a2638;"><a href="mailto:${email}" style="color:#c9a84c;">${email}</a></td></tr>
              ${phone ? `<tr><td style="padding:8px 0;color:#6b7280;">Phone</td><td style="padding:8px 0;color:#1a2638;"><a href="tel:${phone}" style="color:#c9a84c;">${phone}</a></td></tr>` : ''}
              <tr><td style="padding:8px 0;color:#6b7280;">Preferred Lawyer</td><td style="padding:8px 0;color:#1a2638;">${preferredLawyer || 'Not specified'}</td></tr>
              ${notes ? `<tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;">Concern / Notes</td><td style="padding:8px 0;color:#1a2638;white-space:pre-wrap;">${notes}</td></tr>` : ''}
            </table>
          </div>
          <div style="background:#f5f2ed;padding:16px 28px;font-size:12px;color:#9ca3af;">
            Submitted from gavsb.com — ${new Date().toLocaleString()}
          </div>
        </div>
      `,
    });

    // Confirmation to the client
    await transporter.sendMail({
      from: `"Aniceta Law Firm" <${fromUser}>`,
      to: email,
      subject: 'We received your consultation request — Aniceta',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;">
          <div style="background:#1a2638;padding:24px 28px;">
            <h2 style="color:#c9a84c;margin:0;font-size:18px;letter-spacing:1px;">ANICETA</h2>
            <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:12px;">Law Firm</p>
          </div>
          <div style="padding:28px;">
            <p style="color:#1a2638;font-size:15px;">Dear ${firstName},</p>
            <p style="color:#6b7280;font-size:14px;line-height:1.7;">
              Thank you for reaching out to Aniceta. We have received your consultation request
              and one of our attorneys will contact you within <strong style="color:#1a2638;">24 hours</strong>.
            </p>
            <div style="margin:28px 0;padding:20px;background:#f5f2ed;border-left:3px solid #c9a84c;">
              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Preferred lawyer: <strong style="color:#1a2638;">${preferredLawyer || 'Not specified'}</strong></p>
              ${notes ? `<p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Your concern:<br/><strong style="color:#1a2638;white-space:pre-wrap;">${notes}</strong></p>` : ''}
            </div>
            <p style="color:#6b7280;font-size:14px;">Warm regards,<br/><strong style="color:#1a2638;">The Aniceta Team</strong></p>
          </div>
          <div style="background:#f5f2ed;padding:16px 28px;font-size:12px;color:#9ca3af;">
            © ${new Date().getFullYear()} Aniceta Law Firm. All rights reserved.
          </div>
        </div>
      `,
    });

    res.json({
      success: true,
      message: `Thank you, ${firstName}! We've received your request and will contact you within 24 hours. Please check your email for a confirmation.`,
    });
  } catch (err) {
    console.error('Contact email error:', err.message, '| code:', err.code, '| responseCode:', err.responseCode);
    res.status(500).json({
      success: false,
      message: 'Your request was received but we could not send a confirmation email. We will still contact you.',
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/attorneys', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('attorneys')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/practice-areas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('practice_areas')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/about', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('about')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    res.json({ success: true, data: data || DEFAULT_ABOUT });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/posts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Newsletter ────────────────────────────────────────────────────────────────
app.post('/api/newsletter', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
  try {
    const { data: existing } = await supabase
      .from('newsletters')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existing) return res.json({ success: true, message: "You're already subscribed!" });

    const { error } = await supabase
      .from('newsletters')
      .insert({ email: email.toLowerCase().trim() });
    if (error) throw error;

    res.json({ success: true, message: 'Thank you for subscribing!' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN AUTH (from Supabase admins table)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }

  try {
    const expiry = await getSetting('token_expiry', '7d');

    const { data: admin, error } = await supabase
      .from('admins')
      .select('*')
      .eq('username', username)
      .eq('is_active', true)
      .maybeSingle();

    if (error && error.message.includes('admins')) {
      const defaultUser = process.env.ADMIN_USERNAME || 'admin';
      const defaultPass = process.env.ADMIN_PASSWORD || 'admin123';
      if (username === defaultUser && password === defaultPass) {
        const token = jwt.sign(
          { id: 'default', username: defaultUser, role: 'super_admin', type: 'admin' },
          process.env.JWT_SECRET || 'dev-secret',
          { expiresIn: expiry }
        );
        return res.json({ success: true, token, user: { id: 'default', username: defaultUser, full_name: 'Admin', role: 'super_admin' } });
      }
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (error) throw error;
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role, type: 'admin' },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: expiry }
    );
    res.json({ success: true, token, user: { id: admin.id, username: admin.username, full_name: admin.full_name, role: admin.role } });
  } catch (e) {
    console.error('Admin login error:', e.message);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  res.json({ success: true });
});

// ── Admin: Settings ───────────────────────────────────────────────────────────

async function getSetting(key, fallback) {
  try {
    const { data } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
    return data?.value ?? fallback;
  } catch {
    return fallback;
  }
}

app.get('/api/admin/settings', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('settings').select('*');
    if (error && error.message.includes('settings')) {
      return res.json({ success: true, data: { token_expiry: '7d' } });
    }
    if (error) throw error;
    const settings = {};
    (data || []).forEach(r => { settings[r.key] = r.value; });
    if (!settings.token_expiry) settings.token_expiry = '7d';
    res.json({ success: true, data: settings });
  } catch (e) {
    res.json({ success: true, data: { token_expiry: '7d' } });
  }
});

app.put('/api/admin/settings', requireAuth, async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      const { data: existing } = await supabase.from('settings').select('id').eq('key', key).maybeSingle();
      if (existing) {
        await supabase.from('settings').update({ value }).eq('key', key);
      } else {
        await supabase.from('settings').insert({ key, value });
      }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ── Admin: Manage admin accounts ──────────────────────────────────────────────

app.get('/api/admin/admins', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('admins')
    .select('id, username, email, full_name, role, is_active, created_at')
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, data });
});

app.post('/api/admin/admins', requireAuth, async (req, res) => {
  try {
    const { username, email, password, full_name, role } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Username, email, and password are required' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('admins')
      .insert({ username, email, password_hash, full_name: full_name || '', role: role || 'admin' })
      .select('id, username, email, full_name, role, is_active, created_at')
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.put('/api/admin/admins/:id', requireAuth, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.password) {
      updates.password_hash = await bcrypt.hash(updates.password, 10);
      delete updates.password;
    }
    const { data, error } = await supabase
      .from('admins')
      .update(updates)
      .eq('id', req.params.id)
      .select('id, username, email, full_name, role, is_active, created_at')
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/admins/:id', requireAuth, async (req, res) => {
  const { error } = await supabase.from('admins').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  LAWYER AUTH & PERSONAL ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/lawyer/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }

  try {
    const { data: account, error } = await supabase
      .from('lawyer_accounts')
      .select('*, attorneys(id, name, role, image)')
      .eq('email', email.toLowerCase().trim())
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    if (!account) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, account.password_hash);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    await supabase.from('lawyer_accounts').update({ last_login: new Date().toISOString() }).eq('id', account.id);

    const lawyerExpiry = await getSetting('token_expiry', '7d');
    const token = jwt.sign(
      { id: account.id, attorney_id: account.attorney_id, email: account.email, type: 'lawyer' },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: lawyerExpiry }
    );
    res.json({
      success: true,
      token,
      user: { id: account.id, attorney_id: account.attorney_id, email: account.email, attorney: account.attorneys },
    });
  } catch (e) {
    console.error('Lawyer login error:', e.message);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// ── Admin: Manage lawyer accounts ─────────────────────────────────────────────

app.get('/api/admin/lawyer-accounts', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('lawyer_accounts')
    .select('id, attorney_id, email, is_active, last_login, created_at, attorneys(name)')
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, data });
});

app.post('/api/admin/lawyer-accounts', requireAuth, async (req, res) => {
  try {
    const { attorney_id, email, password } = req.body;
    if (!attorney_id || !email || !password) {
      return res.status(400).json({ success: false, message: 'Attorney, email, and password are required' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('lawyer_accounts')
      .insert({ attorney_id, email: email.toLowerCase().trim(), password_hash })
      .select('id, attorney_id, email, is_active, created_at')
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.put('/api/admin/lawyer-accounts/:id', requireAuth, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.password) {
      updates.password_hash = await bcrypt.hash(updates.password, 10);
      delete updates.password;
    }
    const { data, error } = await supabase
      .from('lawyer_accounts')
      .update(updates)
      .eq('id', req.params.id)
      .select('id, attorney_id, email, is_active, created_at')
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/lawyer-accounts/:id', requireAuth, async (req, res) => {
  const { error } = await supabase.from('lawyer_accounts').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true });
});

// ── Lawyer: Personal notes/agenda/status ──────────────────────────────────────

app.get('/api/lawyer/notes', requireAuth, async (req, res) => {
  try {
    const { category, status } = req.query;
    let query = supabase
      .from('lawyer_notes')
      .select('*')
      .eq('attorney_id', req.user.attorney_id)
      .order('created_at', { ascending: false });

    if (category) query = query.eq('category', category);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/lawyer/notes', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('lawyer_notes')
      .insert({ ...req.body, attorney_id: req.user.attorney_id })
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.put('/api/lawyer/notes/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('lawyer_notes')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('attorney_id', req.user.attorney_id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/lawyer/notes/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('lawyer_notes')
    .delete()
    .eq('id', req.params.id)
    .eq('attorney_id', req.user.attorney_id);
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true });
});

// ── Lawyer: View own profile ──────────────────────────────────────────────────

app.get('/api/lawyer/profile', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('attorneys')
      .select('*')
      .eq('id', req.user.attorney_id)
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN: IMAGE UPLOAD (Supabase Storage)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/admin/upload', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });
  try {
    const ext = req.file.originalname.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const filePath = `uploads/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    res.json({ success: true, url: publicUrl });
  } catch (e) {
    console.error('Image upload error:', e.message);
    res.status(500).json({ success: false, message: 'Image upload failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN: ATTORNEYS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/attorneys', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('attorneys')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, data });
});

app.post('/api/admin/attorneys', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('attorneys')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.put('/api/admin/attorneys/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('attorneys')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/attorneys/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('attorneys')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN: HEARINGS (Consolidated Attorney Calendar)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Email helper ─────────────────────────────────────────────────────────────
async function sendHearingEmail(hearing, attorney, { subject, intro, tag }) {
  const user = (process.env.EMAIL_USER || '').trim();
  const pass = (process.env.EMAIL_PASS || '').trim();
  if (!user || !pass) return { sent: false, reason: 'EMAIL_USER / EMAIL_PASS not configured' };
  if (!attorney || !attorney.email) return { sent: false, reason: 'Attorney has no email address on file' };

  try {
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });

    const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const fmtTime = (t) => {
      if (!t) return '—';
      const [h, m] = t.split(':');
      const hr = parseInt(h, 10);
      return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
    };

    const statusColors = { Scheduled: '#1d4ed8', Reset: '#92400e', Done: '#15803d', Cancelled: '#dc2626' };
    const statusBg     = { Scheduled: '#dbeafe', Reset: '#fef3c7', Done: '#dcfce7', Cancelled: '#fee2e2' };

    await transporter.sendMail({
      from: `"Aniceta Law Firm" <${user}>`,
      to: attorney.email,
      subject,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;">
          <div style="background:#1a2638;padding:24px 28px;display:flex;align-items:center;gap:12px;">
            <div>
              <h2 style="color:#c9a84c;margin:0;font-size:18px;letter-spacing:1.5px;">ANICETA</h2>
              <p style="color:rgba(255,255,255,0.5);margin:3px 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Law Firm — Hearing Notice</p>
            </div>
          </div>
          <div style="padding:28px;">
            <p style="font-size:15px;color:#1a2638;margin:0 0 6px;">Dear <strong>${attorney.name}</strong>,</p>
            <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.6;">${intro}</p>

            <div style="background:#f8fafc;border-left:4px solid #c9a84c;border-radius:0 6px 6px 0;padding:20px 24px;margin-bottom:24px;">
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <tr>
                  <td style="padding:7px 0;color:#9ca3af;width:140px;vertical-align:top;">Case</td>
                  <td style="padding:7px 0;color:#1a2638;font-weight:700;">${hearing.case_title}</td>
                </tr>
                ${hearing.case_number ? `<tr><td style="padding:7px 0;color:#9ca3af;">Case No.</td><td style="padding:7px 0;color:#1a2638;">${hearing.case_number}</td></tr>` : ''}
                <tr>
                  <td style="padding:7px 0;color:#9ca3af;">Date</td>
                  <td style="padding:7px 0;color:#1a2638;font-weight:600;">${fmt(hearing.hearing_date)}</td>
                </tr>
                ${hearing.hearing_time ? `<tr><td style="padding:7px 0;color:#9ca3af;">Time</td><td style="padding:7px 0;color:#1a2638;">${fmtTime(hearing.hearing_time)}</td></tr>` : ''}
                ${hearing.court ? `<tr><td style="padding:7px 0;color:#9ca3af;">Court</td><td style="padding:7px 0;color:#1a2638;">${hearing.court}</td></tr>` : ''}
                <tr>
                  <td style="padding:7px 0;color:#9ca3af;">Type</td>
                  <td style="padding:7px 0;color:#1a2638;">${hearing.hearing_type}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#9ca3af;">Status</td>
                  <td style="padding:7px 0;">
                    <span style="display:inline-block;padding:2px 10px;background:${statusBg[hearing.status] || '#e5e7eb'};color:${statusColors[hearing.status] || '#374151'};border-radius:4px;font-size:12px;font-weight:700;">
                      ${hearing.status}
                    </span>
                  </td>
                </tr>
                ${hearing.notes ? `<tr><td style="padding:7px 0;color:#9ca3af;vertical-align:top;">Notes</td><td style="padding:7px 0;color:#6b7280;font-style:italic;">${hearing.notes}</td></tr>` : ''}
              </table>
            </div>

            <p style="font-size:13px;color:#9ca3af;margin:0;">
              This is an automated notice from the Aniceta Law Firm admin system.<br/>
              If you believe this was sent in error, please contact the admin.
            </p>
          </div>
          <div style="background:#f5f2ed;padding:14px 28px;font-size:11px;color:#9ca3af;display:flex;justify-content:space-between;">
            <span>© ${new Date().getFullYear()} Aniceta Law Firm</span>
            <span>${tag} — ${new Date().toLocaleString('en-PH')}</span>
          </div>
        </div>
      `,
    });
    return { sent: true, to: attorney.email };
  } catch (e) {
    console.error('Hearing email error:', e.message);
    return { sent: false, reason: e.message };
  }
}

// ── GET all hearings ──────────────────────────────────────────────────────────
app.get('/api/admin/hearings', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('hearings')
    .select('*, attorneys(id, name, role, email)')
    .order('hearing_date', { ascending: true })
    .order('hearing_time', { ascending: true });
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, data });
});

// ── POST create hearing + notify attorney ─────────────────────────────────────
app.post('/api/admin/hearings', requireAuth, async (req, res) => {
  try {
    const { attorneys: _atty, ...payload } = req.body;
    const { data, error } = await supabase
      .from('hearings')
      .insert(payload)
      .select('*, attorneys(id, name, role, email)')
      .single();
    if (error) throw error;

    const emailResult = await sendHearingEmail(data, data.attorneys, {
      subject: `Hearing Scheduled — ${data.case_title}`,
      intro: `A hearing has been scheduled for you. Please review the details below and make the necessary preparations.`,
      tag: 'Hearing Created',
    });

    res.json({ success: true, data, emailSent: emailResult.sent, emailNote: emailResult.reason || emailResult.to });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ── PUT update hearing + notify attorney ──────────────────────────────────────
app.put('/api/admin/hearings/:id', requireAuth, async (req, res) => {
  try {
    const { attorneys: _atty, id: _id, created_at: _ca, ...payload } = req.body;
    const { data, error } = await supabase
      .from('hearings')
      .update(payload)
      .eq('id', req.params.id)
      .select('*, attorneys(id, name, role, email)')
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });

    const emailResult = await sendHearingEmail(data, data.attorneys, {
      subject: `Hearing Updated — ${data.case_title}`,
      intro: `The details of your hearing have been updated. Please review the latest information below.`,
      tag: 'Hearing Updated',
    });

    res.json({ success: true, data, emailSent: emailResult.sent, emailNote: emailResult.reason || emailResult.to });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ── DELETE hearing ────────────────────────────────────────────────────────────
app.delete('/api/admin/hearings/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('hearings')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true });
});

// ── POST send tomorrow's reminders ───────────────────────────────────────────
app.post('/api/admin/hearings/send-reminders', requireAuth, async (req, res) => {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { data: hearings, error } = await supabase
      .from('hearings')
      .select('*, attorneys(id, name, role, email)')
      .eq('hearing_date', tomorrowStr)
      .eq('status', 'Scheduled');

    if (error) throw error;
    if (!hearings || hearings.length === 0) {
      return res.json({ success: true, sent: 0, message: 'No scheduled hearings for tomorrow.' });
    }

    const results = await Promise.all(
      hearings.map(h =>
        sendHearingEmail(h, h.attorneys, {
          subject: `⏰ Reminder: Hearing Tomorrow — ${h.case_title}`,
          intro: `This is a reminder that you have a court hearing <strong>tomorrow</strong>. Please ensure you are fully prepared and have all required documents ready.`,
          tag: 'Day-Before Reminder',
        })
      )
    );

    const sent  = results.filter(r => r.sent).length;
    const fails = results.filter(r => !r.sent).length;

    res.json({
      success: true,
      total: hearings.length,
      sent,
      failed: fails,
      message: `Reminders sent: ${sent} of ${hearings.length} attorneys notified for ${tomorrowStr}.`,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN: PRACTICE AREAS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/practice-areas', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('practice_areas')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, data });
});

app.post('/api/admin/practice-areas', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('practice_areas')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.put('/api/admin/practice-areas/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('practice_areas')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/practice-areas/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('practice_areas')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN: ABOUT
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/about', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('about')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, data: data || DEFAULT_ABOUT });
});

app.put('/api/admin/about', requireAuth, async (req, res) => {
  try {
    const { data: existing } = await supabase
      .from('about')
      .select('id')
      .limit(1)
      .maybeSingle();

    let data, error;
    if (existing) {
      ({ data, error } = await supabase
        .from('about')
        .update(req.body)
        .eq('id', existing.id)
        .select()
        .single());
    } else {
      ({ data, error } = await supabase
        .from('about')
        .insert(req.body)
        .select()
        .single());
    }
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN: BLOG POSTS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/posts', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, data });
});

app.post('/api/admin/posts', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.put('/api/admin/posts/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/posts/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  FALLBACK DEFAULT DATA (if DB is empty)
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_ABOUT = {
  image:      'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=700&q=80&fit=crop&crop=faces,center',
  heading:    'Committed To Helping\nOur Clients Succeed',
  paragraph1: "Our client's success is our top priority, and we strive to deliver exceptional legal support, advocacy, and counsel every step of the way. Trust us to be your reliable legal partner, committed to achieving your goals.",
  paragraph2: "We're one of the leading law firms in Cebu. With a solid reputation built on years of successful cases and satisfied clients, our firm has established itself as a trusted name in the legal industry.",
  bullets:    ['Client-Centered Approach', 'Commitment to Communication', 'Strong Negotiation Skills', 'Trial-Ready Representation'],
};

// ═══════════════════════════════════════════════════════════════════════════════
//  LOCAL DEV SERVER (not used by Vercel)
// ═══════════════════════════════════════════════════════════════════════════════

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Backend running → http://localhost:${PORT}`));
}

module.exports = app;
