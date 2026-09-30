const express = require('express');
const { db } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, requireAdmin, (req, res) => {
  const { search, action } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  let query = 'SELECT * FROM activity_logs WHERE 1=1';
  let countQuery = 'SELECT COUNT(*) as total FROM activity_logs WHERE 1=1';
  const params = [];
  const countParams = [];

  if (action) {
    query += ' AND action = ?';
    countQuery += ' AND action = ?';
    params.push(action);
    countParams.push(action);
  }

  if (search) {
    query += ' AND (username LIKE ? OR details LIKE ? OR ip LIKE ? OR action LIKE ?)';
    countQuery += ' AND (username LIKE ? OR details LIKE ? OR ip LIKE ? OR action LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
    countParams.push(term, term, term, term);
  }

  const total = db.prepare(countQuery).get(...countParams).total;
  const totalPages = Math.ceil(total / pageSize);
  const currentPage = totalPages ? Math.min(page, totalPages) : 1;
  query += ' ORDER BY datetime(created_at) DESC, id DESC LIMIT ? OFFSET ?';
  params.push(pageSize, (currentPage - 1) * pageSize);

  const rows = db.prepare(query).all(...params);
  res.json({
    items: rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      role: row.role,
      action: row.action,
      details: row.details,
      ip: row.ip,
      createdAt: row.created_at
    })),
    total,
    page: currentPage,
    pageSize,
    totalPages
  });
});

module.exports = router;
