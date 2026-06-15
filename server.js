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
  const dbUserId = targetUserId || 'all';
  
  // Fire-and-forget save notification in PostgreSQL and broadcast to sockets
  db.notifications.create({
    userId: dbUserId,
    message: messageText
  }).then((notification) => {
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
  }).catch((err) => {
    console.error("Error creating database notification:", err);
  });
}

// --- API ROUTES ---

// 1. Auth: Register
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, role, phone, address, lat, lng } = req.body;

  if (!email || !password || !name || !role || !phone || !address) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const existing = await db.users.findByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const newUser = await db.users.create({
      email,
      passwordHash,
      name,
      role,
      phone,
      address,
      lat: Number(lat) || 28.6139,
      lng: Number(lng) || 77.2090
    });

    const { passwordHash: _, ...userProfile } = newUser;
    res.status(201).json(userProfile);
  } catch (err) {
    console.error("Registration endpoint error:", err);
    res.status(500).json({ error: 'Server registration failed' });
  }
});

// 2. Auth: Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await db.users.findByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const matches = bcrypt.compareSync(password, user.passwordHash);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const { passwordHash, ...userProfile } = user;
    res.json(userProfile);
  } catch (err) {
    console.error("Login endpoint error:", err);
    res.status(500).json({ error: 'Server authentication failed' });
  }
});

// 3. Listings: Get all
app.get('/api/listings', async (req, res) => {
  try {
    const listings = await db.listings.getAll();
    res.json(listings);
  } catch (err) {
    console.error("Fetch listings error:", err);
    res.status(500).json({ error: 'Server failed to fetch listings' });
  }
});

// 4. Listings: Create new
app.post('/api/listings', async (req, res) => {
  const { donorId, donorName, donorPhone, donorEmail, title, description, quantity, expiryTime, foodType, lat, lng, address } = req.body;

  if (!donorId || !title || !quantity || !expiryTime || !foodType || !address) {
    return res.status(400).json({ error: 'Missing listing information' });
  }

  try {
    const newListing = await db.listings.create({
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

    sendNotification(
      null,
      'ngo',
      `New Food Listing Available: "${title}" (${quantity}) listed by ${donorName}.`,
      { listingId: newListing.id }
    );

    res.status(201).json(newListing);
  } catch (err) {
    console.error("Listing creation error:", err);
    res.status(500).json({ error: 'Server failed to create listing' });
  }
});

// 5. Pickups: Create Request (Claim Food)
app.post('/api/pickups', async (req, res) => {
  const { listingId, ngoId, ngoName, scheduledTime } = req.body;

  if (!listingId || !ngoId || !ngoName || !scheduledTime) {
    return res.status(400).json({ error: 'Missing pickup request data' });
  }

  try {
    const listing = await db.listings.getById(listingId);
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    if (listing.status !== 'available') {
      return res.status(400).json({ error: 'Food listing is no longer available' });
    }

    const newPickup = await db.pickups.create({
      listingId,
      ngoId,
      ngoName,
      scheduledTime
    });

    sendNotification(
      listing.donorId,
      null,
      `Pickup Requested: NGO "${ngoName}" has requested to pick up your listing "${listing.title}".`,
      { listingId, pickupId: newPickup.id }
    );

    res.status(201).json(newPickup);
  } catch (err) {
    console.error("Pickup creation error:", err);
    res.status(500).json({ error: 'Server failed to request pickup' });
  }
});

// 6. Pickups: Update Status
app.put('/api/pickups/:id/status', async (req, res) => {
  const pickupId = req.params.id;
  const { status } = req.body;

  if (!status || !['requested', 'picked_up', 'delivered'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const pickup = await db.pickups.getById(pickupId);
    if (!pickup) {
      return res.status(404).json({ error: 'Pickup request not found' });
    }

    const result = await db.pickups.updateStatus(pickupId, status);
    const listing = await db.listings.getById(pickup.listingId);

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

    res.json({ pickup: result, listing });
  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).json({ error: 'Server failed to update status' });
  }
});

// 7. Pickups: Get active pickups (for list)
app.get('/api/pickups', async (req, res) => {
  try {
    const pickups = await db.pickups.getAll();
    res.json(pickups);
  } catch (err) {
    console.error("Fetch pickups error:", err);
    res.status(500).json({ error: 'Server failed to fetch pickups' });
  }
});

// 8. Notifications: Get for specific user
app.get('/api/notifications/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    const notifications = await db.notifications.getByUserId(userId);
    res.json(notifications);
  } catch (err) {
    console.error("Fetch notifications error:", err);
    res.status(500).json({ error: 'Server failed to fetch notifications' });
  }
});

// 9. Notifications: Mark all as read
app.post('/api/notifications/:userId/read', async (req, res) => {
  const userId = req.params.userId;
  try {
    await db.notifications.markAllAsRead(userId);
    res.json({ success: true });
  } catch (err) {
    console.error("Mark read notifications error:", err);
    res.status(500).json({ error: 'Server failed to read notifications' });
  }
});

// 10. Users: Get all (excluding sensitive info)
app.get('/api/users', async (req, res) => {
  try {
    const allUsers = await db.users.getAll();
    const users = allUsers.map(({ passwordHash, ...profile }) => profile);
    res.json(users);
  } catch (err) {
    console.error("Fetch users error:", err);
    res.status(500).json({ error: 'Server failed to fetch users list' });
  }
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
