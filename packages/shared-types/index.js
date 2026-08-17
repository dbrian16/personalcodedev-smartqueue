const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5100/api';
const AUTH_BASE = API_BASE.replace(/\/api\/?$/, '');
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || AUTH_BASE;
// Where the kiosk QR code points: the phone-friendly tracker for a ticket.
const ONLINE_PORTAL_URL = process.env.REACT_APP_ONLINE_PORTAL_URL || 'http://localhost:3103';

const trackingUrlFor = (ticketNumber) =>
  `${ONLINE_PORTAL_URL}/?ticket=${encodeURIComponent(ticketNumber)}`;

exports.API_BASE = API_BASE;
exports.AUTH_BASE = AUTH_BASE;
exports.SOCKET_URL = SOCKET_URL;
exports.ONLINE_PORTAL_URL = ONLINE_PORTAL_URL;
exports.trackingUrlFor = trackingUrlFor;
