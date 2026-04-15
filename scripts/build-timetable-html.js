/**
 * build-timetable-html.js
 *
 * Reads data/timetable.json and regenerates the timetable tables
 * inside timetable.html. Preserves everything outside the
 * <!-- TIMETABLE-START --> / <!-- TIMETABLE-END --> markers.
 */

const fs = require('fs');
const path = require('path');

const TIMETABLE_PATH = path.join(__dirname, '..', 'data', 'timetable.json');
const HTML_PATH = path.join(__dirname, '..', 'timetable.html');

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
  return `                        <tr><td>${formatDate(cls.date)}</td><td>${escapeHtml(cls.class)}</td><td>${escapeHtml(cls.location)}</td><td>${escapeHtml(cls.instructors)}</td></tr>`;
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
}

main();
