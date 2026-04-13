/**
 * sync-facebook-events.js
 *
 * Fetches recent posts from the Rhythms of India Facebook page via the
 * Meta Graph API, identifies event/performance posts, and merges them
 * into data/events.json.
 *
 * Required environment variables:
 *   FB_PAGE_ACCESS_TOKEN  – Long-lived Page Access Token
 *   FB_PAGE_ID            – Facebook Page ID (default: 84815582904)
 */

const fs = require('fs');
const path = require('path');

const PAGE_ID = process.env.FB_PAGE_ID || '84815582904';
const ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const EVENTS_PATH = path.join(__dirname, '..', 'data', 'events.json');

// Keywords that indicate a post is about an event / performance
const EVENT_KEYWORDS = [
  'perform', 'performance', 'performing', 'performed',
  'event', 'festival', 'workshop', 'celebration',
  'holi', 'diwali', 'bhangra', 'dance',
  'honored', 'honor', 'showcase', 'stage',
  'block party', 'cultural night', 'color festival'
];

// Location hints found in posts mapped to display location
const LOCATION_HINTS = [
  { pattern: /seattle/i, location: 'Seattle, WA' },
  { pattern: /redmond/i, location: 'Redmond, WA' },
  { pattern: /bellingham/i, location: 'Bellingham, WA' },
  { pattern: /lynden/i, location: 'Lynden, WA' },
  { pattern: /snoqualmie/i, location: 'Snoqualmie, WA' },
  { pattern: /renton/i, location: 'Renton, WA' },
  { pattern: /bellevue/i, location: 'Bellevue, WA' },
  { pattern: /ikea performing/i, location: 'Renton, WA' }
];

function isEventPost(message) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return EVENT_KEYWORDS.some(kw => lower.includes(kw));
}

function extractLocation(message, place) {
  if (place && place.name) {
    // Try to match place name to a known location
    for (const hint of LOCATION_HINTS) {
      if (hint.pattern.test(place.name)) return hint.location;
    }
    return place.name;
  }
  if (message) {
    for (const hint of LOCATION_HINTS) {
      if (hint.pattern.test(message)) return hint.location;
    }
  }
  return 'Redmond, WA'; // default
}

function extractTitle(message) {
  // Use the first sentence (up to 80 chars) as the title
  const firstLine = message.split('\n')[0];
  const firstSentence = firstLine.split(/[.!]/, 1)[0].trim();
  if (firstSentence.length <= 80) return firstSentence;
  return firstSentence.substring(0, 77) + '...';
}

function cleanDescription(message) {
  // Remove hashtags and excessive whitespace
  return message
    .replace(/#\w+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchPosts() {
  if (!ACCESS_TOKEN) {
    console.error('Error: FB_PAGE_ACCESS_TOKEN environment variable is not set.');
    console.error('See README for instructions on obtaining a token.');
    process.exit(1);
  }

  const fields = 'id,message,created_time,place';
  const limit = 50;
  const url = `https://graph.facebook.com/v21.0/${PAGE_ID}/posts?fields=${fields}&limit=${limit}&access_token=${ACCESS_TOKEN}`;

  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.json();
    console.error('Facebook API error:', JSON.stringify(err, null, 2));
    process.exit(1);
  }

  const data = await response.json();
  return data.data || [];
}

function loadExistingEvents() {
  if (!fs.existsSync(EVENTS_PATH)) return [];
  return JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf-8'));
}

function saveEvents(events) {
  fs.mkdirSync(path.dirname(EVENTS_PATH), { recursive: true });
  fs.writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2) + '\n', 'utf-8');
}

async function main() {
  console.log('Fetching posts from Facebook page', PAGE_ID, '...');
  const posts = await fetchPosts();
  console.log(`Fetched ${posts.length} posts`);

  const existing = loadExistingEvents();
  const existingIds = new Set(existing.filter(e => e.fbPostId).map(e => e.fbPostId));
  const existingDates = new Set(existing.map(e => e.date + '|' + e.title));

  let added = 0;

  for (const post of posts) {
    if (!post.message) continue;
    if (!isEventPost(post.message)) continue;
    if (existingIds.has(post.id)) continue;

    const dateStr = post.created_time.split('T')[0]; // YYYY-MM-DD
    const title = extractTitle(post.message);

    // Also check for duplicate by date+title
    if (existingDates.has(dateStr + '|' + title)) continue;

    const event = {
      date: dateStr,
      location: extractLocation(post.message, post.place),
      title: title,
      description: cleanDescription(post.message),
      source: null,
      sourceName: null,
      fbPostId: post.id
    };

    existing.push(event);
    existingIds.add(post.id);
    existingDates.add(dateStr + '|' + title);
    added++;
    console.log(`  + ${event.date} | ${event.title}`);
  }

  // Sort by date descending
  existing.sort((a, b) => b.date.localeCompare(a.date));

  saveEvents(existing);
  console.log(`Done. Added ${added} new event(s). Total: ${existing.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
