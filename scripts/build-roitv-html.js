/**
 * build-roitv-html.js
 *
 * Reads data/roitv.json and regenerates the ROI TV video grid inside
 * roi-tv/index.html. Preserves everything outside the
 * <!-- ROITV-GRID-START --> / <!-- ROITV-GRID-END --> markers, and updates
 * the featured player + og:image to point at the newest video.
 */

const fs = require('fs');
const path = require('path');

const VIDEOS_PATH = path.join(__dirname, '..', 'data', 'roitv.json');
const HTML_PATH = path.join(__dirname, '..', 'roi-tv', 'index.html');

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/–/g, '&ndash;')
    .replace(/—/g, '&mdash;')
    .replace(/'/g, '&rsquo;');
}

function buildCard(video) {
  const id = video.videoId;
  const title = escapeHtml(video.title);
  return `                <div class="roitv-card" data-videoid="${id}">
                    <div class="roitv-thumb"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="${title}" loading="lazy"><div class="roitv-play"><i class="fas fa-play"></i></div></div>
                    <h3>${title}</h3>
                </div>`;
}

function main() {
  if (!fs.existsSync(VIDEOS_PATH)) {
    console.error('roitv.json not found at', VIDEOS_PATH);
    process.exit(1);
  }

  const videos = JSON.parse(fs.readFileSync(VIDEOS_PATH, 'utf-8'));
  if (!Array.isArray(videos) || videos.length === 0) {
    console.error('roitv.json contains no videos.');
    process.exit(1);
  }
  console.log(`Building ROI TV HTML from ${videos.length} videos...`);

  const cards = videos.map(buildCard).join('\n');

  let html = fs.readFileSync(HTML_PATH, 'utf-8');

  const startMarker = '<!-- ROITV-GRID-START -->';
  const endMarker = '<!-- ROITV-GRID-END -->';
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    console.error('Could not find ROITV-GRID-START/END markers in roi-tv/index.html');
    process.exit(1);
  }

  const before = html.substring(0, startIdx + startMarker.length);
  const after = html.substring(endIdx);
  html = before + '\n            <div class="roitv-grid">\n' + cards + '\n            </div>\n            ' + after;

  // Point the featured player + social preview image at the newest video.
  const featuredId = videos[0].videoId;
  html = html.replace(
    /(<iframe id="roitvPlayer" src="https:\/\/www\.youtube\.com\/embed\/)[^?"]+/,
    `$1${featuredId}`
  );
  html = html.replace(
    /(<meta property="og:image" content="https:\/\/i\.ytimg\.com\/vi\/)[^/]+(\/hqdefault\.jpg")/,
    `$1${featuredId}$2`
  );

  fs.writeFileSync(HTML_PATH, html, 'utf-8');
  console.log('roi-tv/index.html updated successfully.');
}

main();
