const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * A staff session should end with the shift; a customer's ticket should outlive
 * it. Issuing both with the same 12h lifetime is what made the documented
 * "customer tickets never expire" untrue.
 */
const generateToken = (userId, userType, extra = {}) => jwt.sign(
  { userId: String(userId), userType, ...extra },
  config.JWT_SECRET,
  { expiresIn: userType === 'customer' ? config.CUSTOMER_JWT_EXPIRES_IN : config.JWT_EXPIRES_IN }
);

const verifyToken = (token) => jwt.verify(token, config.JWT_SECRET);

const getBearerToken = (req) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
};

const requireAuth = (roles = []) => (req, res, next) => {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = verifyToken(token);
    if (roles.length > 0 && !roles.includes(decoded.userType)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = {
  generateToken,
  verifyToken,
  getBearerToken,
  requireAuth
};
