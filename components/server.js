const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

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
      } else {
        // Personal message — send to sender's room and receiver's room
        io.to(senderId).emit('new-message', msg);
        io.to(receiverId).emit('new-message', msg);
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
