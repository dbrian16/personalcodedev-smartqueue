const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('redis');
const log = require('../utils/logger');
const { verifyToken } = require('../middleware/auth');
const config = require('../config');
const { isMemoryStore } = require('../store/connection');

let io;
let adapterClients = [];

const ADMIN_ROOM = 'admin_room';
const positionRoom = (position) => `position_${position}`;
const ticketRoom = (ticketNumber) => `ticket_${ticketNumber}`;

const initSocket = async (server) => {
  io = new Server(server, {
    cors: {
      origin: config.allowedOrigins,
      credentials: true
    }
  });

  // The Redis adapter exists to fan events out across several backend instances.
  // On the in-process store there is exactly one instance, and dialling a Redis
  // that is not running is what used to stop the server from booting at all.
  if (!isMemoryStore()) {
    const pubClient = Redis.createClient({ url: config.REDIS_URL });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => log.error('Redis PubClient Error', { error: err.message }));
    subClient.on('error', (err) => log.error('Redis SubClient Error', { error: err.message }));

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    adapterClients = [pubClient, subClient];
    log.info('socket:adapter', { type: 'redis' });
  } else {
    log.info('socket:adapter', { type: 'in-process' });
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = verifyToken(token);
      socket.userId = decoded.userId;
      socket.userType = decoded.userType;
      socket.ticketNumber = decoded.ticketNumber;
      socket.service = decoded.service;
      return next();
    } catch (error) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    log.debug('socket:connected', { id: socket.id, userType: socket.userType });

    socket.on('error', (err) => {
      log.error('socket:error', { id: socket.id, error: err.message });
    });

    if (socket.userType === 'admin') socket.join(ADMIN_ROOM);

    // A customer is only ever interested in one ticket. Giving them a room of
    // their own is what lets the server stop broadcasting every status change to
    // every open browser.
    if (socket.userType === 'customer' && socket.ticketNumber) {
      socket.join(ticketRoom(socket.ticketNumber));
    }

    if (socket.userType === 'staff' && socket.service) {
      socket.join(positionRoom(socket.service));
    }

    socket.on('subscribe_position', (position) => {
      if (position) socket.join(positionRoom(position));
    });

    socket.on('unsubscribe_position', (position) => {
      if (position) socket.leave(positionRoom(position));
    });

    socket.on('disconnect', (reason) => {
      log.debug('socket:disconnected', { id: socket.id, reason });
    });
  });

  return io;
};

/** True once initSocket has run — lets background jobs stay quiet before boot. */
const hasIo = () => !!io;

const emitToAdmins = (event, payload) => {
  if (io) io.to(ADMIN_ROOM).emit(event, payload);
};

const emitToPosition = (position, event, payload) => {
  if (io && position) io.to(positionRoom(position)).emit(event, payload);
};

const emitToTicket = (ticketNumber, event, payload) => {
  if (io && ticketNumber) io.to(ticketRoom(ticketNumber)).emit(event, payload);
};

/**
 * Sends one ticket's public state to exactly the parties that care: the admin
 * dashboard, the counter serving that queue, and the customer holding it.
 * @param {Object} publicLead - Already reduced to public fields by the store.
 * @param {string} [event='lead_status_updated']
 */
const broadcastLead = (publicLead, event = 'lead_status_updated') => {
  if (!io || !publicLead) return;
  emitToAdmins(event, publicLead);
  emitToPosition(publicLead.assignedPosition, event, publicLead);
  emitToTicket(publicLead.ticketNumber, event, publicLead);
};

const closeSocket = async () => {
  for (const client of adapterClients) {
    try { await client.quit(); } catch (_error) { /* already gone */ }
  }
  adapterClients = [];
  if (io) {
    await new Promise((resolve) => io.close(resolve));
    io = undefined;
  }
};

module.exports = {
  initSocket,
  hasIo,
  emitToAdmins,
  emitToPosition,
  emitToTicket,
  broadcastLead,
  closeSocket,
  ADMIN_ROOM,
  positionRoom,
  ticketRoom
};
