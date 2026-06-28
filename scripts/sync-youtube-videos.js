/**
 * sync-youtube-videos.js
 *
 * Fetches the latest uploads from the Rhythms of India YouTube channel via
 * the public RSS feed (no API key required), and merges any new videos into
 * data/roitv.json. New videos are prepended so the newest appears first.
 *
 * Optional environment variable:
 *   YT_CHANNEL_ID  – YouTube channel ID (default: ROI Bhangra channel)
 */

const fs = require('fs');
const path = require('path');

const CHANNEL_ID = process.env.YT_CHANNEL_ID || 'UCfS1fysgTvYIQ7lI4OjFGMw';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const VIDEOS_PATH = path.join(__dirname, '..', 'data', 'roitv.json');

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

async function fetchFeed() {
  const response = await fetch(FEED_URL, {
    headers: { 'User-Agent': 'rhythmsofindia-sync/1.0' }
  });
  if (!response.ok) {
    console.error(`YouTube RSS feed error: HTTP ${response.status}`);
    process.exit(1);
  }
  return response.text();
}

function parseEntries(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    const idMatch = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const publishedMatch = block.match(/<published>([^<]+)<\/published>/);
    if (!idMatch) continue;
    entries.push({
      videoId: idMatch[1].trim(),
      title: titleMatch ? decodeEntities(titleMatch[1].trim()) : '',
      publishedAt: publishedMatch ? publishedMatch[1].trim() : null
    });
  }
  return entries;
}

function loadExisting() {
  if (!fs.existsSync(VIDEOS_PATH)) return [];
  return JSON.parse(fs.readFileSync(VIDEOS_PATH, 'utf-8'));
}

function saveVideos(videos) {
  fs.mkdirSync(path.dirname(VIDEOS_PATH), { recursive: true });
  fs.writeFileSync(VIDEOS_PATH, JSON.stringify(videos, null, 2) + '\n', 'utf-8');
}

async function main() {
  console.log('Fetching YouTube uploads for channel', CHANNEL_ID, '...');
  const xml = await fetchFeed();
  const feedVideos = parseEntries(xml);
  console.log(`Feed returned ${feedVideos.length} videos`);

  const existing = loadExisting();
  const existingIds = new Set(existing.map(v => v.videoId));

  // Backfill publishedAt for seed entries that we now have a date for.
  for (const v of existing) {
    if (!v.publishedAt) {
      const fromFeed = feedVideos.find(f => f.videoId === v.videoId);
      if (fromFeed && fromFeed.publishedAt) v.publishedAt = fromFeed.publishedAt;
    }
  }

  // New videos = in feed but not yet stored, preserving feed (newest-first) order.
  const newVideos = feedVideos.filter(v => !existingIds.has(v.videoId));

  if (newVideos.length === 0) {
    console.log('No new videos found.');
    saveVideos(existing); // persist any publishedAt backfill
    return;
  }

  newVideos.forEach(v => console.log('  + new:', v.videoId, '-', v.title));
  const merged = [...newVideos, ...existing];
  saveVideos(merged);
  console.log(`Added ${newVideos.length} new video(s). Total: ${merged.length}.`);
}

main().catch(err => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
