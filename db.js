const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'db.json');

// Initial Seed Data
const getSeedData = () => {
  const salt = bcrypt.genSaltSync(10);
  const donorHash = bcrypt.hashSync('donor123', salt);
  const ngoHash = bcrypt.hashSync('ngo123', salt);

  const users = [
    {
      id: "u_donor_1",
      email: "garden@cafe.com",
      passwordHash: donorHash,
      name: "Green Garden Café",
      role: "donor",
      phone: "+91 98765 43210",
      address: "H-Block, Connaught Place, New Delhi",
      lat: 28.6304,
      lng: 77.2177
    },
    {
      id: "u_donor_2",
      email: "fresh@market.com",
      passwordHash: donorHash,
      name: "Fresh Mart Supermarket",
      role: "donor",
      phone: "+91 98765 01234",
      address: "Karol Bagh Metro Station, New Delhi",
      lat: 28.6448,
      lng: 77.1873
    },
    {
      id: "u_ngo_1",
      email: "hope@foodbank.org",
      passwordHash: ngoHash,
      name: "Hope Food Bank",
      role: "ngo",
      phone: "+91 99999 11111",
      address: "Rajendra Place District Centre, New Delhi",
      lat: 28.6421,
      lng: 77.1782
    },
    {
      id: "u_ngo_2",
      email: "share@care.org",
      passwordHash: ngoHash,
      name: "Care & Share Foundation",
      role: "ngo",
      phone: "+91 88888 22222",
      address: "KG Marg, Near India Gate, New Delhi",
      lat: 28.6129,
      lng: 77.2295
    }
  ];

  const listings = [
    {
      id: "l_1",
      donorId: "u_donor_1",
      donorName: "Green Garden Café",
      donorPhone: "+91 98765 43210",
      donorEmail: "garden@cafe.com",
      title: "Freshly Baked Sourdough Bread",
      description: "15 loaves of artisanal sourdough bread baked this morning. Perfect condition, unsold stock.",
      quantity: "15 loaves",
      expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
      foodType: "Bakery",
      status: "available",
      address: "H-Block, Connaught Place, New Delhi",
      lat: 28.6304,
      lng: 77.2177,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
    },
    {
      id: "l_2",
      donorId: "u_donor_2",
      donorName: "Fresh Mart Supermarket",
      donorPhone: "+91 98765 01234",
      donorEmail: "fresh@market.com",
      title: "Assorted Organic Apples & Bananas",
      description: "Around 12kg of ripe organic fruits. Packaged nicely, ready for distribution.",
      quantity: "12 kg",
      expiryTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      foodType: "Fruits/Vegetables",
      status: "requested",
      address: "Karol Bagh Metro Station, New Delhi",
      lat: 28.6448,
      lng: 77.1873,
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
    },
    {
      id: "l_3",
      donorId: "u_donor_1",
      donorName: "Green Garden Café",
      donorPhone: "+91 98765 43210",
      donorEmail: "garden@cafe.com",
      title: "Vegetarian Pasta Trays",
      description: "5 trays of warm vegetable penne pasta. Surplus from a lunch corporate event. Kept in food-grade warmers.",
      quantity: "5 trays (approx. 25 servings)",
      expiryTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      foodType: "Cooked Meals",
      status: "delivered",
      address: "H-Block, Connaught Place, New Delhi",
      lat: 28.6304,
      lng: 77.2177,
      createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
    }
  ];

  const pickups = [
    {
      id: "p_1",
      listingId: "l_2",
      ngoId: "u_ngo_1",
      ngoName: "Hope Food Bank",
      status: "requested",
      scheduledTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString()
    },
    {
      id: "p_2",
      listingId: "l_3",
      ngoId: "u_ngo_2",
      ngoName: "Care & Share Foundation",
      status: "delivered",
      scheduledTime: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString()
    }
  ];

  const notifications = [
    {
      id: "n_1",
      userId: "u_ngo_1",
      message: "New Food Listing: 'Freshly Baked Sourdough Bread' was posted nearby!",
      read: false,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    },
    {
      id: "n_2",
      userId: "u_donor_2",
      message: "Hope Food Bank has requested a pickup for your listing 'Assorted Organic Apples & Bananas'.",
      read: false,
      createdAt: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString()
    }
  ];

  return { users, listings, pickups, notifications };
};

// Database state holding in-memory cache
let db = {
  users: [],
  listings: [],
  pickups: [],
  notifications: []
};

// Load database from file or create it from seed data
const initDb = () => {
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(raw);
      console.log('Database loaded successfully from', DB_FILE);
    } catch (e) {
      console.error('Error loading database, resetting with seed data:', e);
      resetDb();
    }
  } else {
    resetDb();
  }
};

const resetDb = () => {
  db = getSeedData();
  saveDb();
  console.log('Database initialized with seed data.');
};

const saveDb = () => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing database to disk:', e);
  }
};

// Database Methods
const dbOperations = {
  users: {
    getAll: () => db.users,
    findByEmail: (email) => db.users.find(u => u.email.toLowerCase() === email.toLowerCase()),
    findById: (id) => db.users.find(u => u.id === id),
    create: (user) => {
      const newUser = { id: `u_${Date.now()}`, ...user };
      db.users.push(newUser);
      saveDb();
      return newUser;
    }
  },
  listings: {
    getAll: () => db.listings,
    getById: (id) => db.listings.find(l => l.id === id),
    create: (listing) => {
      const newListing = {
        id: `l_${Date.now()}`,
        status: 'available',
        createdAt: new Date().toISOString(),
        ...listing
      };
      db.listings.push(newListing);
      saveDb();
      return newListing;
    },
    updateStatus: (id, status) => {
      const listing = db.listings.find(l => l.id === id);
      if (listing) {
        listing.status = status;
        saveDb();
      }
      return listing;
    }
  },
  pickups: {
    getAll: () => db.pickups,
    getById: (id) => db.pickups.find(p => p.id === id),
    getByListingId: (listingId) => db.pickups.find(p => p.listingId === listingId),
    create: (pickup) => {
      const newPickup = {
        id: `p_${Date.now()}`,
        status: 'requested',
        createdAt: new Date().toISOString(),
        ...pickup
      };
      db.pickups.push(newPickup);
      // update listing status to requested
      const listing = db.listings.find(l => l.id === pickup.listingId);
      if (listing) {
        listing.status = 'requested';
      }
      saveDb();
      return newPickup;
    },
    updateStatus: (id, status) => {
      const pickup = db.pickups.find(p => p.id === id);
      if (pickup) {
        pickup.status = status;
        // Keep the listing status synced
        const listing = db.listings.find(l => l.id === pickup.listingId);
        if (listing) {
          listing.status = status; // e.g. 'picked_up', 'delivered'
        }
        saveDb();
      }
      return pickup;
    }
  },
  notifications: {
    getByUserId: (userId) => db.notifications.filter(n => n.userId === userId || n.userId === 'all'),
    create: (notification) => {
      const newNotification = {
        id: `n_${Date.now()}`,
        read: false,
        createdAt: new Date().toISOString(),
        ...notification
      };
      db.notifications.unshift(newNotification); // Newer notifications first
      saveDb();
      return newNotification;
    },
    markAllAsRead: (userId) => {
      db.notifications.forEach(n => {
        if (n.userId === userId || n.userId === 'all') {
          n.read = true;
        }
      });
      saveDb();
    }
  }
};

// Initialize DB on file load
initDb();

module.exports = dbOperations;
