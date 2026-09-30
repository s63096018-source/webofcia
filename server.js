const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDatabase } = require('./database');
const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const logRoutes = require('./routes/logs');
const rosterRoutes = require('./routes/roster');

const app = express();
const PORT = process.env.PORT || 3000;

initDatabase();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/roster', rosterRoutes);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message || 'Request failed.' });
  }
  next();
});

app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   CIA FIELD OPERATIONS — REPORTS PORTAL      ║');
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log(`  ║   Server running at http://localhost:${PORT}     ║`);
  console.log('  ║                                              ║');
  console.log('  ║   Full:    full   / full123                  ║');
  console.log('  ║   Agent:   agent  / agent123                 ║');
  console.log('  ║   Viewer:  viewer / viewer123                ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
});
