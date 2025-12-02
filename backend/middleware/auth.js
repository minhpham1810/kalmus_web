/**
 * Authentication middleware for header-based authentication
 *
 * This middleware extracts user information from HTTP headers that are
 * set by an upstream authentication proxy (e.g., Shibboleth, CAS, etc.)
 *
 * Expected headers:
 * - x-username: User's username
 * - x-mail: User's email address
 * - x-givenname: User's first name
 * - x-surname: User's last name
 */

export function authenticateUser(req, res, next) {
  // Extract user information from headers
  const username = req.headers['x-username'];
  const mail = req.headers['x-mail'];
  const givenname = req.headers['x-givenname'];
  const surname = req.headers['x-surname'];

  // Check if required authentication headers are present
  if (!username) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Missing authentication headers. Please ensure you are accessing this application through the proper authentication gateway.'
    });
  }

  // Attach user information to request object for use in routes
  req.user = {
    username: username,
    email: mail || null,
    givenName: givenname || null,
    surname: surname || null,
    fullName: givenname && surname ? `${givenname} ${surname}` : username
  };

  // Log authentication for debugging (remove in production if privacy is a concern)
  console.log(`[AUTH] User authenticated: ${req.user.username} (${req.user.fullName})`);

  next();
}

/**
 * Optional middleware to extract user info without requiring authentication
 * Useful for routes that should work with or without authentication
 */
export function extractUserIfPresent(req, res, next) {
  const username = req.headers['x-username'];
  const mail = req.headers['x-mail'];
  const givenname = req.headers['x-givenname'];
  const surname = req.headers['x-surname'];

  if (username) {
    req.user = {
      username: username,
      email: mail || null,
      givenName: givenname || null,
      surname: surname || null,
      fullName: givenname && surname ? `${givenname} ${surname}` : username
    };
  } else {
    req.user = null;
  }

  next();
}
