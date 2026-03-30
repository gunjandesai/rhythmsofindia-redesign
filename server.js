const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8080;

// Serve static files from root
app.use(express.static(path.join(__dirname), {
    extensions: ['html', 'htm']
}));

// SPA fallback for clean URLs - serve index.html for directory requests
app.get('*', (req, res) => {
    // Check if requesting a directory with index.html
    const tryPath = path.join(__dirname, req.path, 'index.html');
    const fs = require('fs');
    if (fs.existsSync(tryPath)) {
        return res.sendFile(tryPath);
    }
    // Fallback to main index
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Rhythms of India running on port ${PORT}`);
});
