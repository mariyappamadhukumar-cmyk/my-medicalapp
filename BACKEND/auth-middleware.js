import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'medicare-secret-key-change-in-production-2025';

/**
 * Middleware to verify JWT token and authenticate requests
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication required. Please login.' 
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('❌ Token verification failed:', err.message);
      return res.status(403).json({ 
        success: false, 
        error: 'Invalid or expired token. Please login again.' 
      });
    }
    
    // Attach userId to request object for use in routes
    req.userId = user.userId;
    req.userEmail = user.email;
    next();
  });
};

/**
 * Generate JWT token for authenticated user
 * @param {string} userId - MongoDB user ID
 * @param {string} email - User email
 * @returns {string} JWT token
 */
export const generateToken = (userId, email) => {
  return jwt.sign(
    { userId, email }, 
    JWT_SECRET, 
    { expiresIn: '30d' } // Token expires in 30 days
  );
};

/**
 * Optional middleware - allows access without token but attaches userId if present
 */
export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.userId = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      req.userId = null;
    } else {
      req.userId = user.userId;
      req.userEmail = user.email;
    }
    next();
  });
};

export default { authenticateToken, generateToken, optionalAuth };
