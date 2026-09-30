const express = require('express');
const { db, logActivity } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function formatEntry(row) {
  return {
    id: row.id,
    rank: row.rank,
    name: row.name,
    discordId: row.discord_id,
    citizenId: row.citizen_id,
    responsibility: row.responsibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function readEntry(body) {
  const entry = {
    rank: typeof body.rank === 'string' ? body.rank.trim() : '',
    name: typeof body.name === 'string' ? body.name.trim() : '',
    discordId: typeof body.discordId === 'string' ? body.discordId.trim() : '',
    citizenId: typeof body.citizenId === 'string' ? body.citizenId.trim() : '',
    responsibility: typeof body.responsibility === 'string' ? body.responsibility.trim() : ''
  };

  if (!entry.rank || !entry.name) {
    return { error: 'Rank and name are required.' };
  }
  if (entry.rank.length > 100 || entry.name.length > 120 || entry.discordId.length > 120 ||
      entry.citizenId.length > 120 || entry.responsibility.length > 500) {
    return { error: 'One or more fields are too long.' };
  }

  return { entry };
}

router.get('/', authenticate, (req, res) => {
  const rows = db.prepare('SELECT * FROM agent_roster ORDER BY id ASC').all();
  res.json(rows.map(formatEntry));
});

router.post('/', authenticate, requireAdmin, (req, res) => {
  const { entry, error } = readEntry(req.body || {});
  if (error) return res.status(400).json({ error });

  const result = db.prepare(`
    INSERT INTO agent_roster (rank, name, discord_id, citizen_id, responsibility)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    entry.rank,
    entry.name,
    entry.discordId || null,
    entry.citizenId || null,
    entry.responsibility || null
  );

  const row = db.prepare('SELECT * FROM agent_roster WHERE id = ?').get(result.lastInsertRowid);
  logActivity(req, 'ROSTER_CREATE', `${entry.rank} — ${entry.name}`);
  res.status(201).json(formatEntry(row));
});

router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { entry, error } = readEntry(req.body || {});
  if (error) return res.status(400).json({ error });

  const existing = db.prepare('SELECT id FROM agent_roster WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Roster entry not found.' });

  db.prepare(`
    UPDATE agent_roster
    SET rank = ?, name = ?, discord_id = ?, citizen_id = ?, responsibility = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    entry.rank,
    entry.name,
    entry.discordId || null,
    entry.citizenId || null,
    entry.responsibility || null,
    req.params.id
  );

  const row = db.prepare('SELECT * FROM agent_roster WHERE id = ?').get(req.params.id);
  logActivity(req, 'ROSTER_UPDATE', `${entry.rank} — ${entry.name}`);
  res.json(formatEntry(row));
});

router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM agent_roster WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Roster entry not found.' });

  db.prepare('DELETE FROM agent_roster WHERE id = ?').run(req.params.id);
  logActivity(req, 'ROSTER_DELETE', `${existing.rank} — ${existing.name}`);
  res.json({ message: 'Roster entry deleted.' });
});

module.exports = router;
