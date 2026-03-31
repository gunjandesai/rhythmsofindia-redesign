const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 8080;

// Enable gzip compression for all responses
app.use(compression());

// Parse JSON bodies for the contact form
app.use(express.json());

// Contact form email endpoint
app.post('/api/contact', async (req, res) => {
    const { name, email, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
        return res.status(400).json({ success: false, message: 'Name, email, and message are required.' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, message: 'Invalid email address.' });
    }

    // Check SMTP is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error('SMTP credentials not configured');
        return res.status(500).json({ success: false, message: 'Email service not configured.' });
    }

    try {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.office365.com',
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            tls: { ciphers: 'SSLv3' }
        });

        const toEmail = process.env.CONTACT_TO_EMAIL || 'skg@rhythmsofindia.net';
        const fromEmail = process.env.SMTP_USER;

        await transporter.sendMail({
            from: `"Rhythms of India Website" <${fromEmail}>`,
            to: toEmail,
            replyTo: email,
            subject: subject ? `Website Contact: ${subject}` : `Website Contact from ${name}`,
            html: `
                <h2>New Contact Form Message</h2>
                <table style="border-collapse:collapse;width:100%;max-width:600px;">
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Name</td><td style="padding:8px;border:1px solid #ddd;">${name.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Email</td><td style="padding:8px;border:1px solid #ddd;"><a href="mailto:${email}">${email.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a></td></tr>
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Subject</td><td style="padding:8px;border:1px solid #ddd;">${(subject || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Message</td><td style="padding:8px;border:1px solid #ddd;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</td></tr>
                </table>
                <p style="color:#999;font-size:12px;margin-top:20px;">Sent from rhythmsofindia-wus2.azurewebsites.net contact form</p>
            `
        });

        res.json({ success: true, message: 'Message sent successfully!' });
    } catch (err) {
        console.error('Email send error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to send message. Please try again later.' });
    }
});

// Serve static files from root
app.use(express.static(path.join(__dirname), {
    extensions: ['html', 'htm']
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
