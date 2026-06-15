const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store active WebSocket connections
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('New WebSocket client connected. Total clients:', clients.size);

  ws.on('message', (messageStr) => {
    try {
      const data = JSON.parse(messageStr);
      if (data.type === 'register') {
        ws.userId = data.userId;
        ws.role = data.role;
        console.log(`WebSocket client registered: User=${data.userId}, Role=${data.role}`);
      }
    } catch (err) {
      console.error('Error processing WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('WebSocket client disconnected. Total clients:', clients.size);
  });
});

// Helper: Send Real-time Notification
function sendNotification(targetUserId, targetRole, messageText, extraData = {}) {
  // 1. Create DB Notification record
  // If targetUserId is 'all' (or null), we save with userId: 'all'
  const dbUserId = targetUserId || 'all';
  const notification = db.notifications.create({
    userId: dbUserId,
    message: messageText
  });

  // 2. Broadcast to matching connected clients
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      const matchUser = targetUserId && client.userId === targetUserId;
      const matchRole = targetRole && client.role === targetRole;
      const isGlobal = !targetUserId && !targetRole;

      if (matchUser || matchRole || isGlobal) {
        client.send(JSON.stringify({
          type: 'notification',
          notification,
          extra: extraData
        }));
      }
    }
  });
}

// --- API ROUTES ---

// 1. Auth: Register
app.post('/api/auth/register', (req, res) => {
  const { email, password, name, role, phone, address, lat, lng } = req.body;

  if (!email || !password || !name || !role || !phone || !address) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const existing = db.users.findByEmail(email);
  if (existing) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);

  const newUser = db.users.create({
    email,
    passwordHash,
    name,
    role,
    phone,
    address,
    lat: Number(lat) || 28.6139, // Default to New Delhi coordinates if missing
    lng: Number(lng) || 77.2090
  });

  // Don't return password hash
  const { passwordHash: _, ...userProfile } = newUser;
  res.status(201).json(userProfile);
});

// 2. Auth: Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.users.findByEmail(email);
  if (!user) {
    return res.status(400).json({ error: 'Invalid email or password' });
  }

  const matches = bcrypt.compareSync(password, user.passwordHash);
  if (!matches) {
    return res.status(400).json({ error: 'Invalid email or password' });
  }

  const { passwordHash, ...userProfile } = user;
  res.json(userProfile);
});

// 3. Listings: Get all
app.get('/api/listings', (req, res) => {
  res.json(db.listings.getAll());
});

// 4. Listings: Create new
app.post('/api/listings', (req, res) => {
  const { donorId, donorName, donorPhone, donorEmail, title, description, quantity, expiryTime, foodType, lat, lng, address } = req.body;

  if (!donorId || !title || !quantity || !expiryTime || !foodType || !address) {
    return res.status(400).json({ error: 'Missing listing information' });
  }

  const newListing = db.listings.create({
    donorId,
    donorName,
    donorPhone: donorPhone || '',
    donorEmail: donorEmail || '',
    title,
    description: description || '',
    quantity,
    expiryTime,
    foodType,
    address,
    lat: Number(lat),
    lng: Number(lng)
  });

  // Notify all NGOs that new food is available in real time
  sendNotification(
    null,
    'ngo',
    `New Food Listing Available: "${title}" (${quantity}) listed by ${donorName}.`,
    { listingId: newListing.id }
  );

  res.status(201).json(newListing);
});

// 5. Pickups: Create Request (Claim Food)
app.post('/api/pickups', (req, res) => {
  const { listingId, ngoId, ngoName, scheduledTime } = req.body;

  if (!listingId || !ngoId || !ngoName || !scheduledTime) {
    return res.status(400).json({ error: 'Missing pickup request data' });
  }

  const listing = db.listings.getById(listingId);
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }

  if (listing.status !== 'available') {
    return res.status(400).json({ error: 'Food listing is no longer available' });
  }

  const newPickup = db.pickups.create({
    listingId,
    ngoId,
    ngoName,
    scheduledTime
  });

  // Notify the donor that their food has been claimed/requested
  sendNotification(
    listing.donorId,
    null,
    `Pickup Requested: NGO "${ngoName}" has requested to pick up your listing "${listing.title}".`,
    { listingId, pickupId: newPickup.id }
  );

  res.status(201).json(newPickup);
});

// 6. Pickups: Update Status
app.put('/api/pickups/:id/status', (req, res) => {
  const pickupId = req.params.id;
  const { status } = req.body; // e.g., 'picked_up', 'delivered'

  if (!status || !['requested', 'picked_up', 'delivered'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const pickup = db.pickups.getById(pickupId);
  if (!pickup) {
    return res.status(404).json({ error: 'Pickup request not found' });
  }

  db.pickups.updateStatus(pickupId, status);
  const listing = db.listings.getById(pickup.listingId);

  // Friendly status labels
  const statusLabels = {
    'picked_up': 'has been Picked Up / En Route',
    'delivered': 'has been marked Delivered / Completed'
  };
  const label = statusLabels[status] || `status updated to ${status}`;

  // Notify donor
  sendNotification(
    listing.donorId,
    null,
    `Donation Tracking Update: "${listing.title}" ${label}.`,
    { listingId: listing.id, status }
  );

  // Notify NGO
  sendNotification(
    pickup.ngoId,
    null,
    `Donation Tracking Update: "${listing.title}" ${label}.`,
    { listingId: listing.id, status }
  );

  res.json({ pickup, listing });
});

// 7. Pickups: Get active pickups (for list)
app.get('/api/pickups', (req, res) => {
  res.json(db.pickups.getAll());
});

// 8. Notifications: Get for specific user (including global 'all' ones)
app.get('/api/notifications/:userId', (req, res) => {
  const userId = req.params.userId;
  res.json(db.notifications.getByUserId(userId));
});

// 9. Notifications: Mark all as read
app.post('/api/notifications/:userId/read', (req, res) => {
  const userId = req.params.userId;
  db.notifications.markAllAsRead(userId);
  res.json({ success: true });
});

// 10. Users: Get all (excluding sensitive info)
app.get('/api/users', (req, res) => {
  const users = db.users.getAll().map(({ passwordHash, ...profile }) => profile);
  res.json(users);
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(` ShareMeal Food Donation Server is running!`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(` WebSocket: ws://localhost:${PORT}`);
  console.log(`===================================================`);
});
