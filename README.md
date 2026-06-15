# ShareMeal - Food Donation and Tracking Network

ShareMeal is a full-stack surplus food redistribution web application designed to connect food donors (restaurants, supermarkets) with receivers (NGOs, charities). It includes location coordinates mapping, real-time notification alerts, and step-by-step donation status tracking.

---

## 🚀 How to Run the Web Application

Since Node.js/npm is not detected on your system PATH, we have engineered **ShareMeal** with a **Dual-Mode Engine**. You do not need to install any software to test this application.

### Method 1: Direct File Launch (No Setup Required - RECOMMENDED)
Simply open the client interface directly in your browser:
1. Navigate to the folder: `c:\Users\reena\Desktop\food-donation-app\public\`
2. Double-click the `index.html` file to open it in Google Chrome or any modern browser.
3. The app will automatically run in **Simulated Backend Mode**, meaning it uses a mock network socket and local database stored in your browser's `localStorage`. All features (notifications, maps, tracking, listings) work seamlessly!

### Method 2: Node.js Backend Server (Optional)
If you decide to install Node.js in the future:
1. Open terminal in `c:\Users\reena\Desktop\food-donation-app`
2. Run `npm install` to download dependencies.
3. Run `npm start` or `node server.js` to boot up the backend.
4. Open your browser and navigate to: `http://localhost:3000`

---

## 🔑 Seed Accounts (For Testing)

We have pre-populated the database with test accounts. Use these to log in and try the dashboards immediately:

### 🥦 Donor Account (Restaurant)
- **Email:** `garden@cafe.com`
- **Password:** `donor123` *(or simulated login)*
- **Role:** Donor (Green Garden Café)
- **Use Case:** List fresh sourdough bread or pasta, place pins on the map, and watch active pickup schedules.

### 🏢 NGO Account (Receiver)
- **Email:** `hope@foodbank.org`
- **Password:** `ngo123` *(or simulated login)*
- **Role:** NGO (Hope Food Bank)
- **Use Case:** Browse available nearby surplus food on the local map, request pickup times, and update delivery tracking states.

---

## 🌟 Key Features

1. **Interactive Location Maps**: Uses Leaflet.js with custom dark-themed OpenStreetMap tiles. Donors click to pin coordinates; NGOs see all nearby listings on their local grid.
2. **Dashboard Interfaces**: Tab-switched views customized specifically for Donor operations (publish, listing tables) and NGO workflows (claim listing, map explorer, active collections).
3. **Step-by-Step Live Tracking**: Full visualization of the delivery lifecycle: **Listed ➔ Requested ➔ En Route ➔ Delivered**.
4. **Real-time Notifications**: Custom sliding slide-in Toast notifications and a notification log center indicating listing claims, driver progress, and completion states.
5. **Interactive Transport Driver Mode**: NGOs can simulate transport drivers by clicking "Mark Picked Up" and "Mark Delivered" within the tracker modal, facilitating a full end-to-end cycle demonstration.
