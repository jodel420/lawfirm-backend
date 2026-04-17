require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const multer     = require('multer');
const nodemailer = require('nodemailer');
const axios      = require('axios');
const cheerio    = require('cheerio');

const dbConnect    = require('../lib/db');
const requireAuth  = require('../lib/auth');
const Attorney     = require('../models/Attorney');
const PracticeArea = require('../models/PracticeArea');
const About        = require('../models/About');
const Post         = require('../models/Post');
const Newsletter   = require('../models/Newsletter');

// ── Cloudinary ────────────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

app.use(cors({
  origin:         (process.env.CORS_ORIGIN || '*').trim(),
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
    version: '2.1',
    env: {
      EMAIL_USER: !!process.env.EMAIL_USER,
      EMAIL_PASS: !!process.env.EMAIL_PASS,
      NOTIFY_EMAIL: !!process.env.NOTIFY_EMAIL,
      MONGO_URI: !!process.env.MONGO_URI,
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
  const { firstName, lastName, email, preferredLawyer, notes } = req.body;

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
              <tr><td style="padding:8px 0;color:#6b7280;">Preferred Lawyer</td><td style="padding:8px 0;color:#1a2638;">${preferredLawyer || 'Not specified'}</td></tr>
              ${notes ? `<tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;">Concern / Notes</td><td style="padding:8px 0;color:#1a2638;white-space:pre-wrap;">${notes}</td></tr>` : ''}
            </table>
          </div>
          <div style="background:#f5f2ed;padding:16px 28px;font-size:12px;color:#9ca3af;">
            Submitted from anicetalawfirm.vercel.app — ${new Date().toLocaleString()}
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

// Connect DB before every request (cached after first call)
app.use(async (req, res, next) => {
  try {
    await dbConnect();
    next();
  } catch (err) {
    console.error('DB connection error:', err.message);
    res.status(503).json({ success: false, message: 'Database unavailable' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/attorneys', async (req, res) => {
  try {
    const data = await Attorney.find().sort({ createdAt: 1 });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/practice-areas', async (req, res) => {
  try {
    const data = await PracticeArea.find().sort({ createdAt: 1 });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/about', async (req, res) => {
  try {
    const data = await About.findOne();
    res.json({ success: true, data: data || DEFAULT_ABOUT });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/posts', async (req, res) => {
  try {
    const data = await Post.find().sort({ createdAt: -1 });
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
    const exists = await Newsletter.findOne({ email });
    if (exists) return res.json({ success: true, message: "You're already subscribed!" });
    await Newsletter.create({ email });
    res.json({ success: true, message: 'Thank you for subscribing!' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN AUTH
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }

  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  if (username !== adminUser) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const hash = process.env.ADMIN_PASSWORD_HASH;
  const plain = process.env.ADMIN_PASSWORD || 'admin123';
  const valid = hash ? await bcrypt.compare(password, hash) : password === plain;

  if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

  const token = jwt.sign({ username }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
  res.json({ success: true, token });
});

app.post('/api/admin/logout', (req, res) => {
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN: IMAGE UPLOAD (Cloudinary)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/admin/upload', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });
  try {
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'aniceta-law-firm', resource_type: 'image' },
        (err, r) => (err ? reject(err) : resolve(r))
      ).end(req.file.buffer);
    });
    res.json({ success: true, url: result.secure_url });
  } catch (e) {
    console.error('Cloudinary upload error:', e.message);
    res.status(500).json({ success: false, message: 'Image upload failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN: ATTORNEYS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/attorneys', requireAuth, async (req, res) => {
  const data = await Attorney.find().sort({ createdAt: 1 });
  res.json({ success: true, data });
});

app.post('/api/admin/attorneys', requireAuth, async (req, res) => {
  try {
    const doc = await Attorney.create(req.body);
    res.json({ success: true, data: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.put('/api/admin/attorneys/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Attorney.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/attorneys/:id', requireAuth, async (req, res) => {
  await Attorney.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN: PRACTICE AREAS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/practice-areas', requireAuth, async (req, res) => {
  const data = await PracticeArea.find().sort({ createdAt: 1 });
  res.json({ success: true, data });
});

app.post('/api/admin/practice-areas', requireAuth, async (req, res) => {
  try {
    const doc = await PracticeArea.create(req.body);
    res.json({ success: true, data: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.put('/api/admin/practice-areas/:id', requireAuth, async (req, res) => {
  try {
    const doc = await PracticeArea.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/practice-areas/:id', requireAuth, async (req, res) => {
  await PracticeArea.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN: ABOUT
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/about', requireAuth, async (req, res) => {
  const data = await About.findOne();
  res.json({ success: true, data: data || DEFAULT_ABOUT });
});

app.put('/api/admin/about', requireAuth, async (req, res) => {
  try {
    const doc = await About.findOneAndUpdate({}, req.body, { new: true, upsert: true, runValidators: true });
    res.json({ success: true, data: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN: BLOG POSTS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/posts', requireAuth, async (req, res) => {
  const data = await Post.find().sort({ createdAt: -1 });
  res.json({ success: true, data });
});

app.post('/api/admin/posts', requireAuth, async (req, res) => {
  try {
    const doc = await Post.create(req.body);
    res.json({ success: true, data: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.put('/api/admin/posts/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Post.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/posts/:id', requireAuth, async (req, res) => {
  await Post.findByIdAndDelete(req.params.id);
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
