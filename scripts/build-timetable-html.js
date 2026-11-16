/**
 * build-timetable-html.js
 *
 * Reads data/timetable.json and regenerates the timetable tables
 * inside timetable.html. Preserves everything outside the
 * <!-- TIMETABLE-START --> / <!-- TIMETABLE-END --> markers.
 *
 * Also regenerates the homepage's schema.org Event markup (between
 * <!-- CLASS-EVENTS-START --> / <!-- CLASS-EVENTS-END --> in index.html)
 * from UPCOMING classes only, so Google never sees past-dated class events.
 */

const fs = require('fs');
const path = require('path');

const TIMETABLE_PATH = path.join(__dirname, '..', 'data', 'timetable.json');
const HTML_PATH = path.join(__dirname, '..', 'timetable.html');
const INDEX_PATH = path.join(__dirname, '..', 'index.html');
const MAX_CLASS_EVENTS = 6;

// Known class details for Google Event markup. Classes not listed here still
// get markup, with a date-only startDate and a generic description.
const CLASS_INFO = {
  'beginner bhangra': {
    name: 'Beginner Bhangra Class – Kids (Ages 7-12)',
    description: 'Weekly Beginner Bhangra dance class for kids ages 7-12 at Rhythms of India.',
    start: '10:00', end: '11:00',
    image: 'https://rhythmsofindia.com/wp-content/uploads/2023/05/6D8A1440.jpg'
  },
  'advance bhangra': {
    name: 'Advanced Bhangra Class – Teens & Adults (Ages 13+)',
    description: 'Weekly Advanced Bhangra dance class for teens and adults ages 13+ at Rhythms of India.',
    start: '11:00', end: '12:00',
    image: 'https://rhythmsofindia.com/wp-content/uploads/2023/05/ROIhome-dancer05.jpg'
  }
};
const DEFAULT_IMAGE = 'https://rhythmsofindia.com/wp-content/uploads/2023/05/6D8A1440.jpg';
const STUDIOS = {
  redmond: { name: 'Rhythms of India Studio – Redmond', streetAddress: '14501 NE 61st St', addressLocality: 'Redmond', postalCode: '98052' },
  lynden: { name: 'Rhythms of India Studio – Lynden', streetAddress: '125 E King Tut Road', addressLocality: 'Lynden', postalCode: '98264' }
};

// Pacific UTC offset for a date: PDT (-07:00) from the 2nd Sunday of March
// to the 1st Sunday of November, otherwise PST (-08:00).
function pacificOffset(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const nthSunday = (month, n) => {
    const firstDow = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return 1 + ((7 - firstDow) % 7) + 7 * (n - 1);
  };
  const dstStart = Date.UTC(y, 2, nthSunday(2, 2));
  const dstEnd = Date.UTC(y, 10, nthSunday(10, 1));
  const t = Date.UTC(y, mo - 1, d);
  return t >= dstStart && t < dstEnd ? '-07:00' : '-08:00';
}

function buildClassEvent(cls) {
  const info = CLASS_INFO[cls.class.trim().toLowerCase()] || {
    name: `${cls.class} Class`,
    description: `${cls.class} dance class at Rhythms of India.`,
    image: DEFAULT_IMAGE
  };
  const studio = STUDIOS[(cls.location || '').trim().toLowerCase()] ||
    { name: `Rhythms of India – ${cls.location}`, addressLocality: cls.location };
  const off = pacificOffset(cls.date);
  const address = { '@type': 'PostalAddress' };
  if (studio.streetAddress) address.streetAddress = studio.streetAddress;
  address.addressLocality = studio.addressLocality;
  address.addressRegion = 'WA';
  if (studio.postalCode) address.postalCode = studio.postalCode;
  address.addressCountry = 'US';

  const event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: info.name,
    description: `${info.description} Location: ${studio.addressLocality}, WA.`,
    startDate: info.start ? `${cls.date}T${info.start}:00${off}` : cls.date
  };
  if (info.end) event.endDate = `${cls.date}T${info.end}:00${off}`;
  Object.assign(event, {
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: { '@type': 'Place', name: studio.name, address },
    organizer: { '@type': 'Organization', name: 'Rhythms of India', url: 'https://rhythmsofindia.com/' },
    offers: {
      '@type': 'Offer',
      price: '150',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: 'https://rhythmsofindia.com/registration.html',
      description: '$150 per quarter for 10 classes',
      validFrom: '2026-01-01'
    },
    image: info.image,
    performer: (cls.instructors || 'Shub C. Kaur').split(',')
      .map(n => n.trim()).filter(Boolean)
      .map(name => ({ '@type': 'Person', name }))
  });
  const json = JSON.stringify(event, null, 2)
    .replace(/</g, '\\u003c')
    .split('\n').map(l => '    ' + l).join('\n');
  return `    <script type="application/ld+json">\n${json}\n    </script>`;
}

function updateHomepageEvents(classes) {
  if (!fs.existsSync(INDEX_PATH)) return;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = classes.filter(c => c.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, MAX_CLASS_EVENTS);

  let html = fs.readFileSync(INDEX_PATH, 'utf-8');
  const startMarker = '<!-- CLASS-EVENTS-START -->';
  const endMarker = '<!-- CLASS-EVENTS-END -->';
  const s = html.indexOf(startMarker);
  const e = html.indexOf(endMarker);
  if (s === -1 || e === -1) {
    console.error('CLASS-EVENTS markers not found in index.html; skipping event markup');
    return;
  }
  const nl = html.includes('\r\n') ? '\r\n' : '\n';
  const body = upcoming.map(buildClassEvent).join('\n');
  const inner = (body ? body + '\n    ' : '    ').replace(/\n/g, nl);
  html = html.substring(0, s + startMarker.length) + nl + inner + html.substring(e);
  fs.writeFileSync(INDEX_PATH, html, 'utf-8');
  console.log(`index.html: ${upcoming.length} upcoming class event(s) in schema markup.`);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const month = MONTHS[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const dayName = DAYS[d.getUTCDay()];
  return `${month} ${day}, ${year} (${dayName})`;
}

function buildRow(cls) {
  return `                        <tr data-date="${cls.date}"><td>${formatDate(cls.date)}</td><td>${escapeHtml(cls.class)}</td><td>${escapeHtml(cls.location)}</td><td>${escapeHtml(cls.instructors)}</td></tr>`;
}

function buildTimetable(classes) {
  const today = new Date().toISOString().slice(0, 10);

  const upcoming = classes.filter(c => c.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = classes.filter(c => c.date < today).sort((a, b) => b.date.localeCompare(a.date));

  const upcomingRows = upcoming.length > 0
    ? upcoming.map(buildRow).join('\n')
    : '                        <tr><td colspan="4" style="text-align:center;">No upcoming classes scheduled yet.</td></tr>';

  const pastRows = past.length > 0
    ? past.map(buildRow).join('\n')
    : '                        <tr><td colspan="4" style="text-align:center;">No past classes.</td></tr>';

  return `            <h3 class="timetable-heading">Upcoming Classes</h3>
            <div class="timetable-wrapper">
                <table class="timetable">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Class</th>
                            <th>Location</th>
                            <th>Instructors</th>
                        </tr>
                    </thead>
                    <tbody>
${upcomingRows}
                    </tbody>
                </table>
            </div>

            <h3 class="timetable-heading past-heading">Past Classes</h3>
            <div class="timetable-wrapper">
                <table class="timetable timetable-past">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Class</th>
                            <th>Location</th>
                            <th>Instructors</th>
                        </tr>
                    </thead>
                    <tbody>
${pastRows}
                    </tbody>
                </table>
            </div>`;
}

function main() {
  if (!fs.existsSync(TIMETABLE_PATH)) {
    console.error('timetable.json not found at', TIMETABLE_PATH);
    process.exit(1);
  }

  const classes = JSON.parse(fs.readFileSync(TIMETABLE_PATH, 'utf-8'));
  console.log(`Building timetable HTML from ${classes.length} classes...`);

  const timetableHtml = buildTimetable(classes);

  let html = fs.readFileSync(HTML_PATH, 'utf-8');

  const startMarker = '<!-- TIMETABLE-START -->';
  const endMarker = '<!-- TIMETABLE-END -->';

  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.error('Could not find TIMETABLE-START/END markers in timetable.html');
    process.exit(1);
  }

  const before = html.substring(0, startIdx + startMarker.length);
  const after = html.substring(endIdx);

  html = before + '\n' + timetableHtml + '\n            ' + after;

  fs.writeFileSync(HTML_PATH, html, 'utf-8');
  console.log('timetable.html updated successfully.');

  updateHomepageEvents(classes);
}

main();
