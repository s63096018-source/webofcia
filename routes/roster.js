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
  const rows = db.prepare('SELECT * FROM agent_roster ORDER BY sort_order ASC, id ASC').all();
  res.json(rows.map(formatEntry));
});

router.post('/reorder', authenticate, requireAdmin, (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.some(id => !Number.isInteger(Number(id)) || Number(id) < 1)) {
    return res.status(400).json({ error: 'Provide the roster entry IDs in the new order.' });
  }

  const orderedIds = ids.map(Number);
  if (new Set(orderedIds).size !== orderedIds.length) {
    return res.status(400).json({ error: 'Roster entry IDs cannot be repeated.' });
  }

  const currentIds = db.prepare('SELECT id FROM agent_roster ORDER BY sort_order ASC, id ASC').all().map(row => row.id);
  if (orderedIds.length !== currentIds.length || orderedIds.some(id => !currentIds.includes(id))) {
    return res.status(400).json({ error: 'The order must include every current roster entry exactly once.' });
  }

  const updatePosition = db.prepare("UPDATE agent_roster SET sort_order = ?, updated_at = datetime('now') WHERE id = ?");
  db.transaction(() => orderedIds.forEach((id, index) => updatePosition.run(index + 1, id)))();
  logActivity(req, 'ROSTER_REORDER', `Reordered ${orderedIds.length} roster entries`);
  res.json({ message: 'Roster order updated.' });
});

router.post('/', authenticate, requireAdmin, (req, res) => {
  const { entry, error } = readEntry(req.body || {});
  if (error) return res.status(400).json({ error });

  const result = db.prepare(`
    INSERT INTO agent_roster (rank, name, discord_id, citizen_id, responsibility, sort_order)
    VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM agent_roster))
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
