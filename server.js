const express = require('express');
const compression = require('compression');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { EmailClient } = require('@azure/communication-email');
const app = express();
const PORT = process.env.PORT || 8080;

// Enable gzip compression for all responses
app.use(compression());

// Parse JSON bodies for the contact form
app.use(express.json());

// ── Admin authentication ──────────────────────────────────────────────
// Set ADMIN_PASSWORD env var (defaults to "changeme" for local dev ONLY)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const activeSessions = new Map(); // token -> expiry timestamp

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const expiry = activeSessions.get(token);
  if (Date.now() > expiry) {
    activeSessions.delete(token);
    return res.status(401).json({ success: false, message: 'Session expired' });
  }
  // Extend session on activity (24 hours)
  activeSessions.set(token, Date.now() + 24 * 60 * 60 * 1000);
  next();
}

// Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Invalid password' });
  }
  const token = generateToken();
  activeSessions.set(token, Date.now() + 24 * 60 * 60 * 1000);
  res.json({ success: true, token });
});

// Logout
app.post('/api/admin/logout', requireAuth, (req, res) => {
  const token = req.headers['x-admin-token'];
  activeSessions.delete(token);
  res.json({ success: true });
});

// ── Helper: rebuild HTML files from JSON data ─────────────────────────
function rebuildEvents() {
  execSync('node scripts/build-events-html.js', { cwd: __dirname, stdio: 'pipe' });
}

function rebuildTimetable() {
  execSync('node scripts/build-timetable-html.js', { cwd: __dirname, stdio: 'pipe' });
}

// ── Events API ────────────────────────────────────────────────────────
const EVENTS_JSON = path.join(__dirname, 'data', 'events.json');

app.get('/api/admin/events', requireAuth, (req, res) => {
  const events = JSON.parse(fs.readFileSync(EVENTS_JSON, 'utf-8'));
  res.json({ success: true, events });
});

app.post('/api/admin/events', requireAuth, (req, res) => {
  const { date, location, title, description } = req.body;
  if (!date || !location || !title || !description) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }
  const events = JSON.parse(fs.readFileSync(EVENTS_JSON, 'utf-8'));
  events.push({ date, location, title, description, source: null, sourceName: null, fbPostId: null });
  // Sort by date descending
  events.sort((a, b) => b.date.localeCompare(a.date));
  fs.writeFileSync(EVENTS_JSON, JSON.stringify(events, null, 2), 'utf-8');
  rebuildEvents();
  res.json({ success: true, message: 'Event added and page rebuilt.' });
});

app.delete('/api/admin/events/:index', requireAuth, (req, res) => {
  const idx = parseInt(req.params.index, 10);
  const events = JSON.parse(fs.readFileSync(EVENTS_JSON, 'utf-8'));
  if (isNaN(idx) || idx < 0 || idx >= events.length) {
    return res.status(400).json({ success: false, message: 'Invalid index.' });
  }
  events.splice(idx, 1);
  fs.writeFileSync(EVENTS_JSON, JSON.stringify(events, null, 2), 'utf-8');
  rebuildEvents();
  res.json({ success: true, message: 'Event deleted and page rebuilt.' });
});

// ── Timetable API ─────────────────────────────────────────────────────
const TIMETABLE_JSON = path.join(__dirname, 'data', 'timetable.json');

app.get('/api/admin/timetable', requireAuth, (req, res) => {
  const classes = JSON.parse(fs.readFileSync(TIMETABLE_JSON, 'utf-8'));
  res.json({ success: true, classes });
});

app.post('/api/admin/timetable', requireAuth, (req, res) => {
  const entries = req.body;
  // Support both single object and array of objects
  const items = Array.isArray(entries) ? entries : [entries];
  const classes = JSON.parse(fs.readFileSync(TIMETABLE_JSON, 'utf-8'));
  for (const item of items) {
    const { date, class: className, location, instructors } = item;
    if (!date || !className || !location || !instructors) {
      return res.status(400).json({ success: false, message: 'All fields (date, class, location, instructors) are required.' });
    }
    classes.push({ date, class: className, location, instructors });
  }
  // Sort by date descending
  classes.sort((a, b) => b.date.localeCompare(a.date));
  fs.writeFileSync(TIMETABLE_JSON, JSON.stringify(classes, null, 2), 'utf-8');
  rebuildTimetable();
  res.json({ success: true, message: `${items.length} class(es) added and page rebuilt.` });
});

app.delete('/api/admin/timetable/:index', requireAuth, (req, res) => {
  const idx = parseInt(req.params.index, 10);
  const classes = JSON.parse(fs.readFileSync(TIMETABLE_JSON, 'utf-8'));
  if (isNaN(idx) || idx < 0 || idx >= classes.length) {
    return res.status(400).json({ success: false, message: 'Invalid index.' });
  }
  classes.splice(idx, 1);
  fs.writeFileSync(TIMETABLE_JSON, JSON.stringify(classes, null, 2), 'utf-8');
  rebuildTimetable();
  res.json({ success: true, message: 'Class deleted and page rebuilt.' });
});

// Contact form email endpoint
app.post('/api/contact', async (req, res) => {
    const { name, email, subject, message, recaptchaToken } = req.body;

    // Verify Google reCAPTCHA
    if (!recaptchaToken) {
        return res.status(400).json({ success: false, message: 'reCAPTCHA verification is required.' });
    }
    try {
        const recaptchaResp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `secret=${encodeURIComponent(process.env.RECAPTCHA_SECRET_KEY)}&response=${encodeURIComponent(recaptchaToken)}`
        });
        const recaptchaData = await recaptchaResp.json();
        if (!recaptchaData.success || recaptchaData.score < 0.5) {
            return res.status(400).json({ success: false, message: 'reCAPTCHA verification failed. Please try again.' });
        }
    } catch (err) {
        console.error('reCAPTCHA verification error:', err.message);
        return res.status(500).json({ success: false, message: 'Could not verify reCAPTCHA. Please try again.' });
    }

    // Validate required fields
    if (!name || !email || !message) {
        return res.status(400).json({ success: false, message: 'Name, email, and message are required.' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, message: 'Invalid email address.' });
    }

    // Check ACS is configured
    if (!process.env.ACS_CONNECTION_STRING || !process.env.ACS_SENDER_EMAIL) {
        console.error('Azure Communication Services not configured');
        return res.status(500).json({ success: false, message: 'Email service not configured.' });
    }

    // Sanitize inputs
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    try {
        const client = new EmailClient(process.env.ACS_CONNECTION_STRING);
        const toEmail = process.env.CONTACT_TO_EMAIL || 'skg@rhythmsofindia.net';

        const emailMessage = {
            senderAddress: process.env.ACS_SENDER_EMAIL,
            content: {
                subject: subject ? `Rhythms Of India Web Site Contact: ${esc(subject)}` : `Rhythms Of India Web Site Contact from ${esc(name)}`,
                html: `
                    <h2>New Contact Form Message</h2>
                    <table style="border-collapse:collapse;width:100%;max-width:600px;">
                        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Name</td><td style="padding:8px;border:1px solid #ddd;">${esc(name)}</td></tr>
                        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Email</td><td style="padding:8px;border:1px solid #ddd;"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
                        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Subject</td><td style="padding:8px;border:1px solid #ddd;">${esc(subject || 'N/A')}</td></tr>
                        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Message</td><td style="padding:8px;border:1px solid #ddd;">${esc(message).replace(/\n/g, '<br>')}</td></tr>
                    </table>
                    <p style="color:#999;font-size:12px;margin-top:20px;">Sent from rhythmsofindia.com contact form</p>
                `
            },
            recipients: {
                to: [
                    { address: toEmail, displayName: 'Rhythms of India' },
                    { address: 'avu000@yahoo.com', displayName: 'Rhythms of India' }
                ]
            },
            replyTo: [{ address: email, displayName: name }]
        };

        const poller = await client.beginSend(emailMessage);
        // Poll with a 30-second timeout
        const timeout = 30000;
        const start = Date.now();
        let result;
        while (!poller.isDone()) {
            if (Date.now() - start > timeout) {
                // Email was accepted by ACS, just hasn't finished polling
                console.log('Email accepted, polling timed out but send was initiated');
                return res.json({ success: true, message: 'Message sent successfully!' });
            }
            await poller.poll();
            await new Promise(r => setTimeout(r, 1000));
        }
        result = poller.getResult();
        console.log('Email sent, status:', result.status);

        res.json({ success: true, message: 'Message sent successfully!' });
    } catch (err) {
        console.error('Email send error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to send message. Please try again later.' });
    }
});

// Serve static files from root
app.use(express.static(path.join(__dirname), {
    extensions: ['html', 'htm'],
    maxAge: '7d',
    setHeaders: (res, filePath) => {
        // SEO & security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        // Longer cache for assets
        if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        } else if (/\.(jpg|jpeg|png|gif|svg|webp|ico)$/.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        } else if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }
    }
}));

// SPA fallback for clean URLs - serve index.html for directory requests
app.get('*', (req, res) => {
    const tryPath = path.join(__dirname, req.path, 'index.html');
    if (fs.existsSync(tryPath)) {
        return res.sendFile(tryPath);
    }
    // Serve 404 page for unknown routes
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.listen(PORT, () => {
    console.log(`Rhythms of India running on port ${PORT}`);
});
