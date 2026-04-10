const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const { EmailClient } = require('@azure/communication-email');
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
                subject: subject ? `Website Contact: ${esc(subject)}` : `Website Contact from ${esc(name)}`,
                html: `
                    <h2>New Contact Form Message</h2>
                    <table style="border-collapse:collapse;width:100%;max-width:600px;">
                        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Name</td><td style="padding:8px;border:1px solid #ddd;">${esc(name)}</td></tr>
                        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Email</td><td style="padding:8px;border:1px solid #ddd;"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
                        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Subject</td><td style="padding:8px;border:1px solid #ddd;">${esc(subject || 'N/A')}</td></tr>
                        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Message</td><td style="padding:8px;border:1px solid #ddd;">${esc(message).replace(/\n/g, '<br>')}</td></tr>
                    </table>
                    <p style="color:#999;font-size:12px;margin-top:20px;">Sent from rhythmsofindia-wus2.azurewebsites.net contact form</p>
                `
            },
            recipients: {
                to: [{ address: toEmail, displayName: 'Rhythms of India' }]
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
