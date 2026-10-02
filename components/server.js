const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const webpush = require('web-push');

// ───── VAPID Keys for Web Push Notifications ─────
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BKfFxryu2PKuFLJn8VU2qY3mXdJALbB2jML-6Q4Qqs6PxCVTR1L8O3fO-kEfAmkSHWV29QcwjdJ7u9I52LJgZeo';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'z9S4pzwSSCjoXoQ7Rqz4UsJmULJI8z2xz1MN7abAYwo';

webpush.setVapidDetails(
  'mailto:admin@timetrack.app',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: { origin: '*' },
    path: '/api/socketio',
  });

  const onlineUsers = new Map();
  // Track typing status
  const typingUsers = new Map();
  // In-memory chat history for the session
  let chatMessages = [];
  // Dynamic custom groups { groupId: { id, name, members: string[] } }
  const customGroups = new Map();
  // Push subscriptions: employeeCode -> [{ subscription, ... }]
  const pushSubscriptions = new Map();

  // ───── Helper: Send Push Notification ─────
  function sendPushToUser(employeeCode, payload) {
    const subs = pushSubscriptions.get(employeeCode);
    if (!subs || subs.length === 0) return;

    const payloadStr = JSON.stringify(payload);
    const toRemove = [];

    subs.forEach((sub, index) => {
      webpush.sendNotification(sub, payloadStr).catch((err) => {
        console.log(`[push] Failed to send to ${employeeCode}:`, err.statusCode);
        if (err.statusCode === 404 || err.statusCode === 410) {
          // Subscription expired or invalid — mark for removal
          toRemove.push(index);
        }
      });
    });

    // Clean up expired subscriptions
    if (toRemove.length > 0) {
      const filtered = subs.filter((_, i) => !toRemove.includes(i));
      if (filtered.length > 0) {
        pushSubscriptions.set(employeeCode, filtered);
      } else {
        pushSubscriptions.delete(employeeCode);
      }
    }
  }

  io.on('connection', (socket) => {
    console.log(`[socket] Connected: ${socket.id}`);

    // User joins with their identity
    socket.on('join', (user) => {
      onlineUsers.set(socket.id, user);
      socket.join(user.employeeCode); // personal room
      socket.join('group1');           // Default group room
      console.log(`[socket] ${user.name} (${user.employeeCode}) joined`);

      // Re-join any custom groups this user is part of
      for (const [groupId, group] of customGroups.entries()) {
        if (group.members.includes(user.employeeCode)) {
          socket.join(groupId);
        }
      }

      // Send chat history to the joined user
      const userGroups = ['group1', ...Array.from(customGroups.keys()).filter(gId => customGroups.get(gId).members.includes(user.employeeCode))];
      
      const userHistory = chatMessages.filter(
        m => m.senderId === user.employeeCode || m.receiverId === user.employeeCode || userGroups.includes(m.receiverId)
      );
      socket.emit('chat-history', userHistory);

      // Send custom groups list
      socket.emit('custom-groups', Array.from(customGroups.values()).filter(g => g.members.includes(user.employeeCode)));

      // Broadcast updated online list
      const onlineList = Array.from(onlineUsers.values()).map(u => u.employeeCode);
      io.emit('online-users', onlineList);
    });

    // ───── Push Subscription Management ─────
    socket.on('subscribe-push', (data) => {
      const { employeeCode, subscription } = data;
      if (!employeeCode || !subscription) return;

      let subs = pushSubscriptions.get(employeeCode) || [];
      // Avoid duplicates by checking endpoint
      const exists = subs.some(s => s.endpoint === subscription.endpoint);
      if (!exists) {
        subs.push(subscription);
        pushSubscriptions.set(employeeCode, subs);
        console.log(`[push] ${employeeCode} subscribed (total: ${subs.length})`);
      }
    });

    socket.on('unsubscribe-push', (data) => {
      const { employeeCode, endpoint } = data;
      if (!employeeCode) return;
      const subs = pushSubscriptions.get(employeeCode) || [];
      const filtered = subs.filter(s => s.endpoint !== endpoint);
      if (filtered.length > 0) {
        pushSubscriptions.set(employeeCode, filtered);
      } else {
        pushSubscriptions.delete(employeeCode);
      }
      console.log(`[push] ${employeeCode} unsubscribed`);
    });

    // Create custom group
    socket.on('create-group', (data) => {
      const { id, name, members } = data; // members is array of employeeCodes
      customGroups.set(id, { id, name, members });
      
      // For all online users who are in this new group, make them join the room
      for (const [sId, user] of onlineUsers.entries()) {
        if (members.includes(user.employeeCode)) {
          const s = io.sockets.sockets.get(sId);
          if (s) {
            s.join(id);
            s.emit('custom-groups', Array.from(customGroups.values()).filter(g => g.members.includes(user.employeeCode)));
          }
        }
      }
    });

    // Send a message
    socket.on('send-message', (data) => {
      const { text, senderId, senderName, receiverId, gifUrl } = data;
      const msg = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
        text,
        senderId,
        senderName,
        receiverId,
        gifUrl,
        timestamp: new Date().toISOString(),
        status: 'sent',
      };

      chatMessages.push(msg);
      console.log(`[socket] Message: ${senderName} → ${receiverId}: "${text}"`);

      if (receiverId === 'group1' || customGroups.has(receiverId)) {
        // Group message — send to everyone in the group room
        io.to(receiverId).emit('new-message', msg);

        // Send push notifications to group members who are NOT the sender
        const group = customGroups.get(receiverId);
        const members = group ? group.members : Array.from(onlineUsers.values()).map(u => u.employeeCode);
        members.forEach(memberCode => {
          if (memberCode !== senderId) {
            sendPushToUser(memberCode, {
              title: 'New Group Message',
              body: gifUrl ? '📷 Sent a GIF' : text,
              senderName: senderName,
              chatId: receiverId,
              isGroup: true,
              groupName: group ? group.name : 'Self Chat',
              icon: '/favicon.jpg',
            });
          }
        });
      } else {
        // Personal message — send to sender's room and receiver's room
        io.to(senderId).emit('new-message', msg);
        io.to(receiverId).emit('new-message', msg);

        // Send push notification to the receiver
        sendPushToUser(receiverId, {
          title: 'New Message',
          body: gifUrl ? '📷 Sent a GIF' : text,
          senderName: senderName,
          chatId: senderId,
          isGroup: false,
          icon: '/favicon.jpg',
        });
      }
    });

    // Edit message
    socket.on('edit-message', (data) => {
      const { messageId, newText } = data;
      const msg = chatMessages.find(m => m.id === messageId);
      if (msg) {
        msg.text = newText;
        msg.isEdited = true;
        // Broadcast the edit
        if (msg.receiverId === 'group1' || customGroups.has(msg.receiverId)) {
          io.to(msg.receiverId).emit('message-edited', { messageId, newText });
        } else {
          io.to(msg.senderId).emit('message-edited', { messageId, newText });
          io.to(msg.receiverId).emit('message-edited', { messageId, newText });
        }
      }
    });

    // Delete message
    socket.on('delete-message', (data) => {
      const { messageId } = data;
      const msg = chatMessages.find(m => m.id === messageId);
      if (msg) {
        // Only allow the sender to delete their own message
        const user = onlineUsers.get(socket.id);
        if (user && msg.senderId === user.employeeCode) {
          chatMessages = chatMessages.filter(m => m.id !== messageId);
          // Broadcast the deletion
          if (msg.receiverId === 'group1' || customGroups.has(msg.receiverId)) {
            io.to(msg.receiverId).emit('message-deleted', { messageId });
          } else {
            io.to(msg.senderId).emit('message-deleted', { messageId });
            io.to(msg.receiverId).emit('message-deleted', { messageId });
          }
        }
      }
    });

    // Typing indicator
    socket.on('typing', (data) => {
      const { senderId, receiverId, senderName } = data;
      if (receiverId === 'group1' || customGroups.has(receiverId)) {
        socket.to(receiverId).emit('user-typing', { senderId, senderName, receiverId });
      } else {
        socket.to(receiverId).emit('user-typing', { senderId, senderName, receiverId });
      }
    });

    socket.on('stop-typing', (data) => {
      const { senderId, receiverId, senderName } = data;
      if (receiverId === 'group1' || customGroups.has(receiverId)) {
        socket.to(receiverId).emit('user-stop-typing', { senderId, senderName, receiverId });
      } else {
        socket.to(receiverId).emit('user-stop-typing', { senderId, senderName, receiverId });
      }
    });

    // Message read receipt
    socket.on('messages-read', (data) => {
      const { messageIds, readerId, senderId } = data;
      
      // Update in memory history
      chatMessages.forEach(m => {
        if (messageIds.includes(m.id)) {
          m.status = 'read';
        }
      });

      io.to(senderId).emit('messages-read-ack', { messageIds, readerId });
    });

    // Clear history on logout
    socket.on('clear-history', (data) => {
      const { employeeCode } = data;
      // Remove all messages involving this user (except group messages sent by others maybe? For now just remove all their personal messages to simulate wipe)
      chatMessages = chatMessages.filter(
        m => m.senderId !== employeeCode && (m.receiverId !== employeeCode || m.receiverId === 'group1')
      );
    });

    // Disconnect
    socket.on('disconnect', () => {
      const user = onlineUsers.get(socket.id);
      if (user) {
        console.log(`[socket] ${user.name} disconnected`);
        onlineUsers.delete(socket.id);
        const onlineList = Array.from(onlineUsers.values()).map(u => u.employeeCode);
        io.emit('online-users', onlineList);
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.IO server running on path /api/socketio`);
  });
});
