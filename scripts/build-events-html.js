/**
 * build-events-html.js
 *
 * Reads data/events.json and regenerates the events timeline section
 * inside events.html. Preserves everything outside the
 * <!-- EVENTS-TIMELINE-START --> / <!-- EVENTS-TIMELINE-END --> markers.
 */

const fs = require('fs');
const path = require('path');

const EVENTS_PATH = path.join(__dirname, '..', 'data', 'events.json');
const HTML_PATH = path.join(__dirname, '..', 'events.html');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

function buildEventCard(event) {
  const d = new Date(event.date + 'T00:00:00');
  const day = d.getUTCDate();
  const month = MONTHS[d.getUTCMonth()];

  const paragraphs = event.description
    .split('\n')
    .filter(p => p.trim())
    .map(p => `                            <p>${escapeHtml(p)}</p>`)
    .join('\n');

  let source = '';
  if (event.sourceName) {
    source = `\n                            <p class="event-source"><i class="fas fa-external-link-alt"></i> Featured in <strong>${escapeHtml(event.sourceName)}</strong></p>`;
  }

  return `                    <article class="event-card" data-date="${event.date}">
                        <div class="event-date-badge">
                            <span class="event-day">${day}</span>
                            <span class="event-month">${month}</span>
                        </div>
                        <div class="event-card-body">
                            <div class="event-location"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(event.location)}</div>
                            <h3>${escapeHtml(event.title)}</h3>
${paragraphs}${source}
                        </div>
                    </article>`;
}

function buildTimeline(events) {
  // Group by year
  const groups = {};
  for (const event of events) {
    const year = event.date.substring(0, 4);
    if (!groups[year]) groups[year] = [];
    groups[year].push(event);
  }

  // Sort years descending
  const years = Object.keys(groups).sort((a, b) => b - a);

  const sections = years.map(year => {
    // Sort events within year by date descending
    groups[year].sort((a, b) => b.date.localeCompare(a.date));

    const cards = groups[year].map(buildEventCard).join('\n\n');

    return `                <!-- ${year} -->
                <div class="events-year-group" data-year="${year}">
                    <h3 class="events-year-label">${year}</h3>

${cards}
                </div>`;
  });

  return sections.join('\n\n');
}

function main() {
  if (!fs.existsSync(EVENTS_PATH)) {
    console.error('events.json not found at', EVENTS_PATH);
    process.exit(1);
  }

  const events = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf-8'));
  console.log(`Building HTML from ${events.length} events...`);

  const timeline = buildTimeline(events);

  let html = fs.readFileSync(HTML_PATH, 'utf-8');

  const startMarker = '<!-- EVENTS-TIMELINE-START -->';
  const endMarker = '<!-- EVENTS-TIMELINE-END -->';

  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.error('Could not find EVENTS-TIMELINE-START/END markers in events.html');
    process.exit(1);
  }

  const before = html.substring(0, startIdx + startMarker.length);
  const after = html.substring(endIdx);

  html = before + '\n            <div class="events-timeline">\n' + timeline + '\n            </div>\n            ' + after;

  fs.writeFileSync(HTML_PATH, html, 'utf-8');
  console.log('events.html updated successfully.');
}

main();
