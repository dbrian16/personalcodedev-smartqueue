const rateLimit = require('express-rate-limit');

const {
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_GENERAL_MAX,
  RATE_LIMIT_AUTH_MAX,
  RATE_LIMIT_PUBLIC_MAX,
  RATE_LIMIT_LOOKUP_MAX,
  RATE_LIMIT_TICKET_TOKEN_MAX
} = require('../config/constants');

const generalLimiter = rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_GENERAL_MAX, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_AUTH_MAX, message: { error: 'Too many login attempts, please try again later' }, standardHeaders: true, legacyHeaders: false });
const publicEndpointLimiter = rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_PUBLIC_MAX, message: { error: 'Too many requests, please try again later' }, standardHeaders: true, legacyHeaders: false });

// Ticket lookup takes a phone number or an email address and returns whether it
// holds a ticket, so an unthrottled endpoint is an enumeration oracle.
const lookupLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_LOOKUP_MAX,
  message: { error: 'Too many lookups from this address. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// A ticket number is the only thing needed to mint a customer token, and ticket
// numbers run in sequence, so this is the cheapest endpoint to enumerate.
const ticketTokenLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_TICKET_TOKEN_MAX,
  message: { error: 'Too many ticket lookups from this address. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  generalLimiter,
  authLimiter,
  publicEndpointLimiter,
  lookupLimiter,
  ticketTokenLimiter
};
