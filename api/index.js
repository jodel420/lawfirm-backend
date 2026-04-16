require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const multer     = require('multer');
const axios      = require('axios');
const cheerio    = require('cheerio');

const dbConnect    = require('../lib/db');
const requireAuth  = require('../lib/auth');
const Attorney     = require('../models/Attorney');
const Testimonial  = require('../models/Testimonial');
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
  origin:         process.env.CORS_ORIGIN || '*',
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());
app.use(express.json());

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

app.get('/api/testimonials', async (req, res) => {
  try {
    const data = await Testimonial.find().sort({ createdAt: 1 });
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

// ── SC Judiciary RSS feed ─────────────────────────────────────────────────────
app.get('/api/sc-news', async (req, res) => {
  try {
    const { data: xml } = await axios.get(
      'https://sc.judiciary.gov.ph/feed/',
      { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const $ = cheerio.load(xml, { xmlMode: true });
    const articles = [];

    $('item').each((i, el) => {
      if (articles.length >= 6) return false;
      const $el      = $(el);
      const title    = $el.find('title').first().text().trim();
      const link     = $el.find('link').first().text().trim() || $el.find('guid').first().text().trim();
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
    console.error('SC news feed error:', e.message);
    res.status(500).json({ success: false, message: 'Could not fetch SC news' });
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
//  ADMIN: TESTIMONIALS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/testimonials', requireAuth, async (req, res) => {
  const data = await Testimonial.find().sort({ createdAt: 1 });
  res.json({ success: true, data });
});

app.post('/api/admin/testimonials', requireAuth, async (req, res) => {
  try {
    const doc = await Testimonial.create(req.body);
    res.json({ success: true, data: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.put('/api/admin/testimonials/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Testimonial.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/testimonials/:id', requireAuth, async (req, res) => {
  await Testimonial.findByIdAndDelete(req.params.id);
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
