const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Connection string from environment variable or user's Singapore Render PostgreSQL URI
const connectionString = process.env.DATABASE_URL || 'postgresql://hgs:T5DdPFtwrDjdB5yfqC7eSlgmTxR9FuNa@dpg-d8o0etj7uimc73aaiv4g-a.singapore-postgres.render.com/db_kfhc';

// Configure connection pool with SSL enabled (required for Render)
const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

// Setup Table schema creation queries
const initDb = async () => {
  const client = await pool.connect();
  try {
    // 1. Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL,
        phone VARCHAR(30) NOT NULL,
        address VARCHAR(255) NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL
      )
    `);

    // 2. Listings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS listings (
        id VARCHAR(50) PRIMARY KEY,
        donor_id VARCHAR(50) NOT NULL,
        donor_name VARCHAR(100) NOT NULL,
        donor_phone VARCHAR(30),
        donor_email VARCHAR(100),
        title VARCHAR(150) NOT NULL,
        description TEXT,
        quantity VARCHAR(50) NOT NULL,
        expiry_time VARCHAR(50) NOT NULL,
        food_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        address VARCHAR(255) NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        image_base64 TEXT,
        created_at VARCHAR(50) NOT NULL
      )
    `);

    // 3. Pickups table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pickups (
        id VARCHAR(50) PRIMARY KEY,
        listing_id VARCHAR(50) NOT NULL,
        ngo_id VARCHAR(50) NOT NULL,
        ngo_name VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL,
        scheduled_time VARCHAR(50) NOT NULL,
        created_at VARCHAR(50) NOT NULL
      )
    `);

    // 4. Notifications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        created_at VARCHAR(50) NOT NULL
      )
    `);

    console.log("PostgreSQL Database tables verified/initialized.");

    // Seed default users if empty
    const { rows } = await client.query("SELECT COUNT(*) FROM users");
    if (parseInt(rows[0].count) === 0) {
      console.log("Seeding default users...");
      const salt = bcrypt.genSaltSync(10);
      const donorHash = bcrypt.hashSync('donor123', salt);
      const ngoHash = bcrypt.hashSync('ngo123', salt);

      const SEED_USERS = [
        ["u_donor_1", "garden@cafe.com", donorHash, "Green Garden Café", "donor", "+91 98765 43210", "H-Block, Connaught Place, New Delhi", 28.6304, 77.2177],
        ["u_donor_2", "fresh@market.com", donorHash, "Fresh Mart Supermarket", "donor", "+91 98765 01234", "Karol Bagh Metro Station, New Delhi", 28.6448, 77.1873],
        ["u_ngo_1", "hope@foodbank.org", ngoHash, "Hope Food Bank", "ngo", "+91 99999 11111", "Rajendra Place District Centre, New Delhi", 28.6421, 77.1782],
        ["u_ngo_2", "share@care.org", ngoHash, "Care & Share Foundation", "ngo", "+91 88888 22222", "KG Marg, Near India Gate, New Delhi", 28.6129, 77.2295]
      ];

      for (const user of SEED_USERS) {
        await client.query(`
          INSERT INTO users (id, email, password_hash, name, role, phone, address, lat, lng)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, user);
      }
      console.log("Default users seeded.");
    }

    // Seed default listings if empty
    const resListings = await client.query("SELECT COUNT(*) FROM listings");
    if (parseInt(resListings[0].count) === 0) {
      console.log("Seeding default listings...");
      const SEED_LISTINGS = [
        ["l_1", "u_donor_1", "Green Garden Café", "+91 98765 43210", "garden@cafe.com", "Freshly Baked Sourdough Bread", "15 loaves of artisanal sourdough bread baked this morning. Perfect condition, unsold stock.", "15 loaves", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), "Bakery", "available", "H-Block, Connaught Place, New Delhi", 28.6304, 77.2177, null, new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()],
        ["l_2", "u_donor_2", "Fresh Mart Supermarket", "+91 98765 01234", "fresh@market.com", "Assorted Organic Apples & Bananas", "Around 12kg of ripe organic fruits. Packaged nicely, ready for distribution.", "12 kg", new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), "Fruits/Vegetables", "requested", "Karol Bagh Metro Station, New Delhi", 28.6448, 77.1873, null, new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()],
        ["l_3", "u_donor_1", "Green Garden Café", "+91 98765 43210", "garden@cafe.com", "Vegetarian Pasta Trays", "5 trays of warm vegetable penne pasta. Surplus from a lunch corporate event.", "5 trays (approx. 25 servings)", new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), "Cooked Meals", "delivered", "H-Block, Connaught Place, New Delhi", 28.6304, 77.2177, null, new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()]
      ];

      for (const listing of SEED_LISTINGS) {
        await client.query(`
          INSERT INTO listings (id, donor_id, donor_name, donor_phone, donor_email, title, description, quantity, expiry_time, food_type, status, address, lat, lng, image_base64, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        `, listing);
      }
      console.log("Default listings seeded.");
    }

    // Seed default pickups if empty
    const resPickups = await client.query("SELECT COUNT(*) FROM pickups");
    if (parseInt(resPickups[0].count) === 0) {
      console.log("Seeding default pickups...");
      const SEED_PICKUPS = [
        ["p_1", "l_2", "u_ngo_1", "Hope Food Bank", "requested", new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString()],
        ["p_2", "l_3", "u_ngo_2", "Care & Share Foundation", "delivered", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString()]
      ];

      for (const pickup of SEED_PICKUPS) {
        await client.query(`
          INSERT INTO pickups (id, listing_id, ngo_id, ngo_name, status, scheduled_time, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, pickup);
      }
      console.log("Default pickups seeded.");
    }

  } catch (err) {
    console.error("Database initialization error:", err);
  } finally {
    client.release();
  }
};

// Database operation helper methods mapped to Postgres queries
const dbOperations = {
  users: {
    findByEmail: async (email) => {
      const { rows } = await pool.query("SELECT * FROM users WHERE LOWER(email) = LOWER($1)", [email]);
      if (rows.length === 0) return null;
      const u = rows[0];
      return { id: u.id, email: u.email, passwordHash: u.password_hash, name: u.name, role: u.role, phone: u.phone, address: u.address, lat: u.lat, lng: u.lng };
    },
    findById: async (id) => {
      const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
      if (rows.length === 0) return null;
      const u = rows[0];
      return { id: u.id, email: u.email, passwordHash: u.password_hash, name: u.name, role: u.role, phone: u.phone, address: u.address, lat: u.lat, lng: u.lng };
    },
    getAll: async () => {
      const { rows } = await pool.query("SELECT * FROM users");
      return rows.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, phone: u.phone, address: u.address, lat: u.lat, lng: u.lng }));
    },
    create: async (user) => {
      const id = `u_${Date.now()}`;
      await pool.query(`
        INSERT INTO users (id, email, password_hash, name, role, phone, address, lat, lng)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [id, user.email, user.passwordHash, user.name, user.role, user.phone, user.address, Number(user.lat), Number(user.lng)]);
      return { id, ...user };
    }
  },
  listings: {
    getAll: async () => {
      const { rows } = await pool.query("SELECT * FROM listings ORDER BY created_at DESC");
      return rows.map(l => ({
        id: l.id, donorId: l.donor_id, donorName: l.donor_name, donorPhone: l.donor_phone, donorEmail: l.donor_email,
        title: l.title, description: l.description, quantity: l.quantity, expiryTime: l.expiry_time,
        foodType: l.food_type, status: l.status, address: l.address, lat: l.lat, lng: l.lng,
        imageBase64: l.image_base64, createdAt: l.created_at
      }));
    },
    getById: async (id) => {
      const { rows } = await pool.query("SELECT * FROM listings WHERE id = $1", [id]);
      if (rows.length === 0) return null;
      const l = rows[0];
      return {
        id: l.id, donorId: l.donor_id, donorName: l.donor_name, donorPhone: l.donor_phone, donorEmail: l.donor_email,
        title: l.title, description: l.description, quantity: l.quantity, expiryTime: l.expiry_time,
        foodType: l.food_type, status: l.status, address: l.address, lat: l.lat, lng: l.lng,
        imageBase64: l.image_base64, createdAt: l.created_at
      };
    },
    create: async (listing) => {
      const id = `l_${Date.now()}`;
      const createdAt = new Date().toISOString();
      await pool.query(`
        INSERT INTO listings (id, donor_id, donor_name, donor_phone, donor_email, title, description, quantity, expiry_time, food_type, status, address, lat, lng, image_base64, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [id, listing.donorId, listing.donorName, listing.donorPhone, listing.donorEmail, listing.title, listing.description || '', listing.quantity, listing.expiryTime, listing.foodType, 'available', listing.address, Number(listing.lat), Number(listing.lng), listing.imageBase64 || null, createdAt]);
      return { id, status: 'available', createdAt, ...listing };
    },
    updateStatus: async (id, status) => {
      await pool.query("UPDATE listings SET status = $1 WHERE id = $2", [status, id]);
      return { id, status };
    }
  },
  pickups: {
    getAll: async () => {
      const { rows } = await pool.query("SELECT * FROM pickups ORDER BY created_at DESC");
      return rows.map(p => ({
        id: p.id, listingId: p.listing_id, ngoId: p.ngo_id, ngoName: p.ngo_name,
        status: p.status, scheduledTime: p.scheduled_time, createdAt: p.created_at
      }));
    },
    getById: async (id) => {
      const { rows } = await pool.query("SELECT * FROM pickups WHERE id = $1", [id]);
      if (rows.length === 0) return null;
      const p = rows[0];
      return {
        id: p.id, listingId: p.listing_id, ngoId: p.ngo_id, ngoName: p.ngo_name,
        status: p.status, scheduledTime: p.scheduled_time, createdAt: p.created_at
      };
    },
    create: async (pickup) => {
      const id = `p_${Date.now()}`;
      const createdAt = new Date().toISOString();
      // 1. Insert pickup
      await pool.query(`
        INSERT INTO pickups (id, listing_id, ngo_id, ngo_name, status, scheduled_time, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [id, pickup.listingId, pickup.ngoId, pickup.ngoName, 'requested', pickup.scheduledTime, createdAt]);
      
      // 2. Sync listing status
      await pool.query("UPDATE listings SET status = 'requested' WHERE id = $1", [pickup.listingId]);
      
      return { id, status: 'requested', createdAt, ...pickup };
    },
    updateStatus: async (id, status) => {
      // 1. Update pickup status
      const { rows } = await pool.query("UPDATE pickups SET status = $1 WHERE id = $2 RETURNING listing_id", [status, id]);
      if (rows.length > 0) {
        const listingId = rows[0].listing_id;
        // 2. Sync listing status
        await pool.query("UPDATE listings SET status = $1 WHERE id = $2", [status, listingId]);
      }
      return { id, status };
    }
  },
  notifications: {
    getByUserId: async (userId) => {
      const { rows } = await pool.query("SELECT * FROM notifications WHERE user_id = $1 OR user_id = 'all' ORDER BY created_at DESC", [userId]);
      return rows.map(n => ({ id: n.id, userId: n.user_id, message: n.message, read: n.read, createdAt: n.created_at }));
    },
    create: async (notification) => {
      const id = `n_${Date.now()}`;
      const createdAt = new Date().toISOString();
      await pool.query(`
        INSERT INTO notifications (id, user_id, message, read, created_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, notification.userId || 'all', notification.message, false, createdAt]);
      return { id, read: false, createdAt, ...notification };
    },
    markAllAsRead: async (userId) => {
      await pool.query("UPDATE notifications SET read = TRUE WHERE user_id = $1 OR user_id = 'all'", [userId]);
    }
  }
};

// Run initialization
initDb();

module.exports = dbOperations;
