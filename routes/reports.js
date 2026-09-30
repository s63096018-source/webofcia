const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { db, getNextReportNumber, logActivity } = require('../database');
const { authenticate, requireAgentOrAdmin, canMutateReport } = require('../middleware/auth');

const router = express.Router();
const MAX_EVIDENCE_FILES = 20;

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_EVIDENCE_FILES },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed as evidence.'));
    }
  }
});

function parseJsonField(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return typeof value === 'string' ? value.split(',').map(s => s.trim()).filter(Boolean) : fallback;
  }
}

function formatReport(row, evidence = []) {
  return {
    id: row.id,
    reportNumber: row.report_number,
    title: row.title,
    description: row.description,
    reporter: row.reporter,
    reporterCallsign: row.reporter_callsign,
    unitCallsigns: parseJsonField(row.unit_callsigns),
    location: row.location,
    classification: row.classification,
    status: row.status,
    incidentDate: row.incident_date,
    incidentTime: row.incident_time,
    priority: row.priority,
    tags: parseJsonField(row.tags),
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    evidence
  };
}

function getEvidenceForReport(reportId) {
  return db.prepare('SELECT * FROM report_evidence WHERE report_id = ? ORDER BY uploaded_at').all(reportId)
    .map(e => ({
      id: e.id,
      filename: e.filename,
      url: `/uploads/${e.filename}`,
      originalName: e.original_name,
      caption: e.caption,
      uploadedAt: e.uploaded_at
    }));
}

router.get('/stats', authenticate, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM reports').get().count;
  const open = db.prepare("SELECT COUNT(*) as count FROM reports WHERE status = 'OPEN'").get().count;
  const critical = db.prepare("SELECT COUNT(*) as count FROM reports WHERE priority = 'CRITICAL'").get().count;
  const classified = db.prepare("SELECT COUNT(*) as count FROM reports WHERE classification IN ('SECRET', 'TOP SECRET')").get().count;

  res.json({ total, open, critical, classified });
});

router.get('/next-number', authenticate, requireAgentOrAdmin, (req, res) => {
  res.json({ reportNumber: getNextReportNumber() });
});

router.get('/', authenticate, (req, res) => {
  const { search, status, classification, priority } = req.query;

  let query = 'SELECT * FROM reports WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (report_number LIKE ? OR title LIKE ? OR reporter LIKE ? OR description LIKE ? OR location LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term, term);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (classification) {
    query += ' AND classification = ?';
    params.push(classification);
  }
  if (priority) {
    query += ' AND priority = ?';
    params.push(priority);
  }

  query += ' ORDER BY incident_date DESC, incident_time DESC, id DESC';

  const rows = db.prepare(query).all(...params);
  const reports = rows.map(row => formatReport(row, getEvidenceForReport(row.id)));
  res.json(reports);
});

router.get('/:id', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: 'Report not found.' });
  }
  res.json(formatReport(row, getEvidenceForReport(row.id)));
});

router.post('/', authenticate, requireAgentOrAdmin, upload.array('evidence', MAX_EVIDENCE_FILES), (req, res) => {
  try {
    const {
      title, description, reporter, reporterCallsign, unitCallsigns,
      location, classification, status, incidentDate, incidentTime,
      priority, tags, notes, reportNumber
    } = req.body;

    if (!title || !description || !reporter || !incidentDate || !incidentTime) {
      return res.status(400).json({ error: 'Title, description, reporter, date, and time are required.' });
    }

    const finalReportNumber = reportNumber || getNextReportNumber();
    const callsigns = parseJsonField(unitCallsigns);
    const tagList = parseJsonField(tags);

    const result = db.prepare(`
      INSERT INTO reports (
        report_number, title, description, reporter, reporter_callsign,
        unit_callsigns, location, classification, status, incident_date,
        incident_time, priority, tags, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      finalReportNumber,
      title.trim(),
      description.trim(),
      reporter.trim(),
      reporterCallsign?.trim() || null,
      JSON.stringify(callsigns),
      location?.trim() || null,
      classification || 'CONFIDENTIAL',
      status || 'OPEN',
      incidentDate,
      incidentTime,
      priority || 'ROUTINE',
      JSON.stringify(tagList),
      notes?.trim() || null,
      req.user.id
    );

    const insertEvidence = db.prepare(`
      INSERT INTO report_evidence (report_id, filename, original_name, caption)
      VALUES (?, ?, ?, ?)
    `);

    const captions = req.body.captions ? (Array.isArray(req.body.captions) ? req.body.captions : [req.body.captions]) : [];

    if (req.files?.length) {
      req.files.forEach((file, i) => {
        insertEvidence.run(result.lastInsertRowid, file.filename, file.originalname, captions[i] || null);
      });
    }

    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(result.lastInsertRowid);
    logActivity(req, 'REPORT_CREATE', `${finalReportNumber} — ${title.trim()}`);
    res.status(201).json(formatReport(row, getEvidenceForReport(row.id)));
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Report number already exists.' });
    }
    res.status(500).json({ error: err.message || 'Failed to create report.' });
  }
});

router.put('/:id', authenticate, requireAgentOrAdmin, upload.array('evidence', MAX_EVIDENCE_FILES), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Report not found.' });
    }
    if (!canMutateReport(req.user, existing)) {
      return res.status(403).json({ error: 'You can only edit reports you filed.' });
    }

    const {
      title, description, reporter, reporterCallsign, unitCallsigns,
      location, classification, status, incidentDate, incidentTime,
      priority, tags, notes
    } = req.body;

    db.prepare(`
      UPDATE reports SET
        title = ?, description = ?, reporter = ?, reporter_callsign = ?,
        unit_callsigns = ?, location = ?, classification = ?, status = ?,
        incident_date = ?, incident_time = ?, priority = ?, tags = ?,
        notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title?.trim() || existing.title,
      description?.trim() || existing.description,
      reporter?.trim() || existing.reporter,
      reporterCallsign?.trim() || existing.reporter_callsign,
      JSON.stringify(parseJsonField(unitCallsigns, parseJsonField(existing.unit_callsigns))),
      location?.trim() ?? existing.location,
      classification || existing.classification,
      status || existing.status,
      incidentDate || existing.incident_date,
      incidentTime || existing.incident_time,
      priority || existing.priority,
      JSON.stringify(parseJsonField(tags, parseJsonField(existing.tags))),
      notes?.trim() ?? existing.notes,
      req.params.id
    );

    if (req.body.removeEvidence) {
      const toRemove = Array.isArray(req.body.removeEvidence) ? req.body.removeEvidence : [req.body.removeEvidence];
      const getEvidence = db.prepare('SELECT * FROM report_evidence WHERE id = ? AND report_id = ?');
      const deleteEvidence = db.prepare('DELETE FROM report_evidence WHERE id = ?');

      toRemove.forEach(id => {
        const ev = getEvidence.get(id, req.params.id);
        if (ev) {
          const filePath = path.join(uploadsDir, ev.filename);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          deleteEvidence.run(id);
        }
      });
    }

    if (req.files?.length) {
      const insertEvidence = db.prepare(`
        INSERT INTO report_evidence (report_id, filename, original_name, caption)
        VALUES (?, ?, ?, ?)
      `);
      const captions = req.body.captions ? (Array.isArray(req.body.captions) ? req.body.captions : [req.body.captions]) : [];

      req.files.forEach((file, i) => {
        insertEvidence.run(req.params.id, file.filename, file.originalname, captions[i] || null);
      });
    }

    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
    logActivity(req, 'REPORT_UPDATE', `${row.report_number} — ${row.title}`);
    res.json(formatReport(row, getEvidenceForReport(row.id)));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update report.' });
  }
});

router.delete('/:id', authenticate, requireAgentOrAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Report not found.' });
  }
  if (!canMutateReport(req.user, existing)) {
    return res.status(403).json({ error: 'You can only delete reports you filed.' });
  }

  const evidence = db.prepare('SELECT * FROM report_evidence WHERE report_id = ?').all(req.params.id);
  evidence.forEach(ev => {
    const filePath = path.join(uploadsDir, ev.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
  logActivity(req, 'REPORT_DELETE', `${existing.report_number} — ${existing.title}`);
  res.json({ message: 'Report deleted.' });
});

module.exports = router;
