require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: ['http://localhost:5173', 'https://anicetalawfirm.vercel.app']
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Multer (image uploads) ───────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// ─── Nodemailer transporter ───────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ─── Static admin credentials ─────────────────────────────────────────
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'legaledge2025';

// Active session tokens (in-memory)
const activeSessions = new Set();

// ─── In-memory data stores (seeded with existing data) ────────────────
let attorneys = [
  {
    id: 1,
    name: 'Lucia Garcia',
    role: 'Managing Partner',
    specialty: 'Family Law & Civil Litigation',
    image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=500&q=80&fit=crop&crop=faces,center',
    linkedin: '',
    twitter: '',
    email: '',
  },
  {
    id: 2,
    name: 'Adam Baines',
    role: 'Senior Partner',
    specialty: 'Corporate Law & Contracts',
    image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=500&q=80&fit=crop&crop=faces,center',
    linkedin: '',
    twitter: '',
    email: '',
  },
  {
    id: 3,
    name: 'Ava Williams',
    role: 'Associate Attorney',
    specialty: 'Criminal Defense',
    image: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=500&q=80&fit=crop&crop=faces,center',
    linkedin: '',
    twitter: '',
    email: '',
  },
  {
    id: 4,
    name: 'Noah Bryan',
    role: 'Associate Attorney',
    specialty: 'Immigration Law',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&q=80&fit=crop&crop=faces,center',
    linkedin: '',
    twitter: '',
    email: '',
  },
];

let testimonials = [
  {
    id: 1,
    name: 'Brandon Artiss',
    role: 'Business Owner',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80&fit=crop&crop=faces,center',
    text: "Aniceta handled my corporate dispute with exceptional skill and professionalism. Their strategic approach and clear communication made a stressful situation manageable. I couldn't have asked for better representation.",
  },
  {
    id: 2,
    name: 'Sarah Mitchell',
    role: 'Marketing Director',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80&fit=crop&crop=faces,center',
    text: 'The attorneys at Aniceta went above and beyond for my family law case. They were compassionate, thorough, and always kept my best interests at heart. I highly recommend them to anyone seeking legal counsel.',
  },
  {
    id: 3,
    name: 'James Ortega',
    role: 'Real Estate Investor',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&q=80&fit=crop&crop=faces,center',
    text: 'Outstanding legal support for my property transactions. The team was knowledgeable, responsive, and incredibly detail-oriented. Aniceta is my go-to firm for all real estate legal matters.',
  },
];

let practiceAreas = [
  { id: 1, icon: 'FaBalanceScale', title: 'Family Law', desc: 'Divorce, custody, adoption, and domestic relations handled with compassion and expertise.' },
  { id: 2, icon: 'FaBuilding', title: 'Corporate Law', desc: 'Business formation, contracts, mergers, and compliance solutions for your company.' },
  { id: 3, icon: 'FaGavel', title: 'Criminal Law', desc: 'Aggressive defense representation for misdemeanors, felonies, and federal offenses.' },
  { id: 4, icon: 'FaPassport', title: 'Immigration Law', desc: 'Visas, green cards, citizenship, and deportation defense for individuals and families.' },
  { id: 5, icon: 'FaHome', title: 'Real Estate Law', desc: 'Property transactions, disputes, zoning, and title issues resolved professionally.' },
  { id: 6, icon: 'FaFileContract', title: 'Civil Litigation', desc: 'Representing plaintiffs and defendants in complex civil disputes and appeals.' },
];

let aboutContent = {
  image: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=700&q=80&fit=crop&crop=faces,center',
  heading: 'Committed To Helping\nOur Clients Succeed',
  paragraph1: "Our client's success is our top priority, and we strive to deliver exceptional legal support, advocacy, and counsel every step of the way. Trust us to be your reliable legal partner, committed to achieving your goals.",
  paragraph2: "We're one of the leading law firms in Chicago. With a solid reputation built on years of successful cases and satisfied clients, our firm has established itself as a trusted name in the legal industry.",
  bullets: [
    'Client-Centered Approach',
    'Commitment to Communication',
    'Strong Negotiation Skills',
    'Trial-Ready Representation',
  ],
};

let posts = [
  {
    id: 1,
    title: 'Understanding Your Rights During a Police Stop',
    category: 'Criminal Law',
    date: 'March 12, 2025',
    excerpt: 'Knowing your constitutional rights during a traffic stop or police encounter can make a significant difference in the outcome.',
    image: 'https://images.unsplash.com/photo-1589578527966-fdac0f44566c?w=600&q=80&fit=crop&crop=center',
  },
  {
    id: 2,
    title: 'Key Changes to Corporate Law in 2025',
    category: 'Corporate Law',
    date: 'February 28, 2025',
    excerpt: "New regulatory changes affecting businesses this year — here's what every business owner needs to know.",
    image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&q=80&fit=crop&crop=center',
  },
  {
    id: 3,
    title: 'Navigating Divorce: A Step-by-Step Guide',
    category: 'Family Law',
    date: 'January 15, 2025',
    excerpt: 'Divorce proceedings can be complex and emotionally draining. Our comprehensive guide walks you through every step.',
    image: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=600&q=80&fit=crop&crop=center',
  },
];

let nextId = { attorneys: 5, testimonials: 4, practiceAreas: 7, posts: 4 };

// ─── Admin auth middleware ─────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
}

// ─── Admin: Login ─────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.add(token);
    return res.json({ success: true, token });
  }
  res.status(401).json({ success: false, message: 'Invalid credentials' });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  activeSessions.delete(token);
  res.json({ success: true });
});

// ─── Admin: Image Upload ──────────────────────────────────────────────
app.post('/api/admin/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const url = `http://localhost:${PORT}/uploads/${req.file.filename}`;
  res.json({ success: true, url });
});

// ─── Admin: Attorneys CRUD ────────────────────────────────────────────
app.get('/api/admin/attorneys', requireAdmin, (req, res) => {
  res.json({ success: true, data: attorneys });
});

app.post('/api/admin/attorneys', requireAdmin, (req, res) => {
  const { name, role, specialty, image, linkedin, twitter, email } = req.body;
  if (!name || !role) return res.status(400).json({ success: false, message: 'Name and role are required' });
  const item = { id: nextId.attorneys++, name, role, specialty: specialty || '', image: image || '', linkedin: linkedin || '', twitter: twitter || '', email: email || '' };
  attorneys.push(item);
  res.json({ success: true, data: item });
});

app.put('/api/admin/attorneys/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const idx = attorneys.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found' });
  attorneys[idx] = { ...attorneys[idx], ...req.body, id };
  res.json({ success: true, data: attorneys[idx] });
});

app.delete('/api/admin/attorneys/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  attorneys = attorneys.filter(a => a.id !== id);
  res.json({ success: true });
});

// ─── Admin: Testimonials CRUD ─────────────────────────────────────────
app.get('/api/admin/testimonials', requireAdmin, (req, res) => {
  res.json({ success: true, data: testimonials });
});

app.post('/api/admin/testimonials', requireAdmin, (req, res) => {
  const { name, role, avatar, text } = req.body;
  if (!name || !text) return res.status(400).json({ success: false, message: 'Name and text are required' });
  const item = { id: nextId.testimonials++, name, role: role || '', avatar: avatar || '', text };
  testimonials.push(item);
  res.json({ success: true, data: item });
});

app.put('/api/admin/testimonials/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const idx = testimonials.findIndex(t => t.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found' });
  testimonials[idx] = { ...testimonials[idx], ...req.body, id };
  res.json({ success: true, data: testimonials[idx] });
});

app.delete('/api/admin/testimonials/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  testimonials = testimonials.filter(t => t.id !== id);
  res.json({ success: true });
});

// ─── Admin: Practice Areas CRUD ───────────────────────────────────────
app.get('/api/admin/practice-areas', requireAdmin, (req, res) => {
  res.json({ success: true, data: practiceAreas });
});

app.post('/api/admin/practice-areas', requireAdmin, (req, res) => {
  const { icon, title, desc } = req.body;
  if (!title) return res.status(400).json({ success: false, message: 'Title is required' });
  const item = { id: nextId.practiceAreas++, icon: icon || 'FaGavel', title, desc: desc || '' };
  practiceAreas.push(item);
  res.json({ success: true, data: item });
});

app.put('/api/admin/practice-areas/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const idx = practiceAreas.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found' });
  practiceAreas[idx] = { ...practiceAreas[idx], ...req.body, id };
  res.json({ success: true, data: practiceAreas[idx] });
});

app.delete('/api/admin/practice-areas/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  practiceAreas = practiceAreas.filter(p => p.id !== id);
  res.json({ success: true });
});

// ─── Admin: About Content ─────────────────────────────────────────────
app.get('/api/admin/about', requireAdmin, (req, res) => {
  res.json({ success: true, data: aboutContent });
});

app.put('/api/admin/about', requireAdmin, (req, res) => {
  aboutContent = { ...aboutContent, ...req.body };
  res.json({ success: true, data: aboutContent });
});

// ─── Admin: Blog Posts CRUD ───────────────────────────────────────────
app.get('/api/admin/posts', requireAdmin, (req, res) => {
  res.json({ success: true, data: posts });
});

app.post('/api/admin/posts', requireAdmin, (req, res) => {
  const { title, category, date, excerpt, image } = req.body;
  if (!title) return res.status(400).json({ success: false, message: 'Title is required' });
  const item = { id: nextId.posts++, title, category: category || '', date: date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), excerpt: excerpt || '', image: image || '' };
  posts.push(item);
  res.json({ success: true, data: item });
});

app.put('/api/admin/posts/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const idx = posts.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found' });
  posts[idx] = { ...posts[idx], ...req.body, id };
  res.json({ success: true, data: posts[idx] });
});

app.delete('/api/admin/posts/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  posts = posts.filter(p => p.id !== id);
  res.json({ success: true });
});

// ─── Public API endpoints ─────────────────────────────────────────────
app.get('/api/attorneys', (req, res) => {
  res.json({ success: true, data: attorneys });
});

app.get('/api/testimonials', (req, res) => {
  res.json({ success: true, data: testimonials });
});

app.get('/api/practice-areas', (req, res) => {
  res.json({ success: true, data: practiceAreas });
});

app.get('/api/about', (req, res) => {
  res.json({ success: true, data: aboutContent });
});

app.get('/api/posts', (req, res) => {
  res.json({ success: true, data: posts });
});

// ─── Contact / Consultation form ─────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const { firstName, lastName, email, preferredLawyer, notes } = req.body;

  if (!firstName || !email) {
    return res.status(400).json({ success: false, message: 'First name and email are required.' });
  }

  console.log('New consultation request:', { firstName, lastName, email, preferredLawyer, notes });

  try {
    await transporter.sendMail({
      from: `"Aniceta Website" <${process.env.EMAIL_USER}>`,
      to: process.env.NOTIFY_EMAIL,
      subject: `New Consultation Request — ${firstName} ${lastName || ''}`,
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
            Submitted from aniceta.com — ${new Date().toLocaleString()}
          </div>
        </div>
      `,
    });

    await transporter.sendMail({
      from: `"Aniceta Law Firm" <${process.env.EMAIL_USER}>`,
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
            © ${new Date().getFullYear()} Aniceta LLC · Chicago, IL
          </div>
        </div>
      `,
    });

    res.json({
      success: true,
      message: `Thank you, ${firstName}! We've received your request and will contact you within 24 hours. Please check your email for a confirmation.`,
    });

  } catch (err) {
    console.error('Email send error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Your request was received but we could not send a confirmation email. We will still contact you.',
    });
  }
});

// ─── Newsletter subscription ─────────────────────────────────────────
app.post('/api/newsletter', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }

  console.log('Newsletter subscription:', email);

  try {
    await transporter.sendMail({
      from: `"Aniceta Website" <${process.env.EMAIL_USER}>`,
      to: process.env.NOTIFY_EMAIL,
      subject: 'New Newsletter Subscriber',
      html: `<p>New subscriber: <strong>${email}</strong></p><p style="color:#999;font-size:12px;">${new Date().toLocaleString()}</p>`,
    });

    await transporter.sendMail({
      from: `"Aniceta Law Firm" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "You're subscribed to Aniceta Insights",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;">
          <div style="background:#1a2638;padding:24px 28px;">
            <h2 style="color:#c9a84c;margin:0;font-size:18px;letter-spacing:1px;">ANICETA</h2>
            <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:12px;">News + Insights</p>
          </div>
          <div style="padding:28px;">
            <p style="color:#1a2638;font-size:15px;font-weight:600;">Welcome to Aniceta Insights!</p>
            <p style="color:#6b7280;font-size:14px;line-height:1.7;">
              You're now subscribed to our newsletter. You'll be among the first to receive 
              legal news, case wins, and exclusive insights from our attorneys.
            </p>
            <p style="color:#6b7280;font-size:14px;">— <strong style="color:#1a2638;">The Aniceta Team</strong></p>
          </div>
          <div style="background:#f5f2ed;padding:16px 28px;font-size:12px;color:#9ca3af;">
            © ${new Date().getFullYear()} Aniceta LLC · You can unsubscribe at any time.
          </div>
        </div>
      `,
    });

    res.json({ success: true, message: 'Successfully subscribed! Check your inbox for a welcome email.' });

  } catch (err) {
    console.error('Newsletter email error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Subscription recorded but confirmation email failed to send.',
    });
  }
});

// ─── SC Judiciary News (RSS feed with 1-hour cache) ──────────────────
const SC_FEEDS = [
  'https://sc.judiciary.gov.ph/category/general-announcements/feed/',
  'https://sc.judiciary.gov.ph/feed/?cat=-decisions',
];
const SC_FALLBACK_IMAGE = 'https://sc.judiciary.gov.ph/wp-content/uploads/2025/01/elementor/thumbs/SC-Logo-with-halo-thin-scaled-r00uu7jeuccfu4vag4zxdbwn1ettc5khhhdbvbso58.webp';
const LEGAL_FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1589578527966-fdac0f44566c?w=600&q=80&fit=crop&crop=center';

let scNewsCache = null;
let scNewsCacheTime = 0;
const SC_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function formatRssDate(pubDate) {
  try {
    return new Date(pubDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return pubDate || '';
  }
}

function extractImage(contentEncoded, description) {
  const src = (contentEncoded || description || '').match(/https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp|gif)[^\s"']*/i);
  return src ? src[0].split('"')[0] : null;
}

async function fetchScFeed(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LegalEdgeBot/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function loadScNews() {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const seen = new Set();
  const articles = [];

  for (const feedUrl of SC_FEEDS) {
    try {
      const xml = await fetchScFeed(feedUrl);
      const parsed = parser.parse(xml);
      const items = parsed?.rss?.channel?.item;
      if (!items) continue;
      const list = Array.isArray(items) ? items : [items];

      for (const item of list) {
        const link = item.link || item.guid || '';
        if (seen.has(link)) continue;

        const cats = Array.isArray(item.category)
          ? item.category
          : item.category ? [item.category] : [];

        // Skip pure court decisions
        const isDecision = cats.some(c =>
          typeof c === 'string' && /^decisions$/i.test(c.trim())
        );
        if (isDecision) continue;

        seen.add(link);
        const contentEncoded = item['content:encoded'] || '';
        const description = stripHtml(item.description || '');
        const image = extractImage(contentEncoded, item.description) || LEGAL_FALLBACK_IMAGE;
        const category = cats.find(c => typeof c === 'string' && !/^\d{4}$/.test(c)) || 'SC News';

        articles.push({
          id: `sc-${seen.size}`,
          title: stripHtml(item.title || '').slice(0, 120),
          date: formatRssDate(item.pubDate),
          pubDateRaw: new Date(item.pubDate || 0).getTime(),
          category,
          excerpt: description.slice(0, 220) + (description.length > 220 ? '…' : ''),
          image,
          link,
          source: 'SC Judiciary',
        });
      }
    } catch (err) {
      console.error(`SC feed error (${feedUrl}):`, err.message);
    }
  }

  // Sort newest first, return up to 9
  return articles.sort((a, b) => b.pubDateRaw - a.pubDateRaw).slice(0, 9);
}

app.get('/api/sc-news', async (req, res) => {
  const now = Date.now();
  if (scNewsCache && now - scNewsCacheTime < SC_CACHE_TTL) {
    return res.json({ success: true, data: scNewsCache, cached: true });
  }
  try {
    const articles = await loadScNews();
    scNewsCache = articles;
    scNewsCacheTime = now;
    res.json({ success: true, data: articles, cached: false });
  } catch (err) {
    console.error('SC news fetch failed:', err.message);
    if (scNewsCache) return res.json({ success: true, data: scNewsCache, cached: true });
    res.status(500).json({ success: false, message: 'Could not fetch SC news.' });
  }
});

// ─── Health check ────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Aniceta API is running.' });
});

app.listen(PORT, () => {
  console.log(`Aniceta API server running on http://localhost:${PORT}`);
});
