const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cia-classified-portal-secret-change-in-production';

function authenticate(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Access denied.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

function isFullAccessUser(user) {
  return user?.role === 'admin' || user?.role === 'full' || user?.username === 'full';
}

function requireAdmin(req, res, next) {
  if (!isFullAccessUser(req.user)) {
    return res.status(403).json({ error: 'Insufficient clearance. Full access required.' });
  }
  next();
}

function requireAgentOrAdmin(req, res, next) {
  if (!isFullAccessUser(req.user) && req.user?.role !== 'agent') {
    return res.status(403).json({ error: 'Insufficient clearance. Write access required.' });
  }
  next();
}

function canMutateReport(user, report) {
  if (!user || !report) return false;
  if (isFullAccessUser(user)) return true;
  if (user.role === 'agent' && Number(report.created_by) === Number(user.id)) return true;
  return false;
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, displayName: user.display_name, callsign: user.callsign },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

module.exports = { authenticate, requireAdmin, requireAgentOrAdmin, canMutateReport, signToken, JWT_SECRET, isFullAccessUser };
