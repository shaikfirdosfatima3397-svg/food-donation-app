// ==========================================
// ShareMeal - Client-Side Controller (SPA)
// Integrated with Google Maps JavaScript API
// With Dual Mode: Live Server & Local Simulation Fallback
// ==========================================

// --- CONFIGURATION ---
// Replace 'YOUR_KEY_HERE' with your real Google Maps API Key
const GOOGLE_MAPS_API_KEY = 'YOUR_KEY_HERE';

// Premium Google Maps Dark Mode Theme Stylesheet Array
const MAP_STYLE_DARK = [
  { elementType: "geometry", stylers: [{ color: "#0b111e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b111e" }, { weight: 2 }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1e293b" }]
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#161e31" }]
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#64748b" }]
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#161e31" }]
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1e293b" }]
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#94a3b8" }]
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#161e31" }]
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#060911" }]
  }
];

// Global State
let currentUser = null;
let ws = null;
let allListings = [];
let allPickups = [];
let userNotifications = [];

// Google Map instances
let regMap = null;
let regMarker = null;
let listMap = null;
let listMarker = null;
let ngoMap = null;
let ngoMarkersList = [];
let trackMap = null;
let trackMarkers = [];
let trackRouteLine = null;

// Geolocation & Nearby Organizations State
let allOrganizations = [];
let ngoCurrentCoords = null;
let ngoHomeMarker = null;

// Initial Map Settings (New Delhi, India center)
const DEFAULT_COORDS = [28.6139, 77.2090];

// Dual-Mode Toggle: True if server is offline or running via file://
let isSimulatedMode = false;

// Pending image for food listing upload
let pendingImageBase64 = null;

// Dynamic script loader for Google Maps API
function loadGoogleMapsScript() {
  return new Promise((resolve) => {
    if (window.google && window.google.maps) {
      resolve();
      return;
    }
    // Set up query parameters
    const keyParam = GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'YOUR_KEY_HERE' ? `key=${GOOGLE_MAPS_API_KEY}` : '';
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${keyParam}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      console.log("Google Maps API loaded successfully.");
      resolve();
    };
    script.onerror = () => {
      console.warn("Failed to load Google Maps script. Loading mock fallback map displays.");
      resolve();
    };
    document.head.appendChild(script);
  });
}

// Run on window load
window.addEventListener('DOMContentLoaded', async () => {
  // Load Google Maps Script
  await loadGoogleMapsScript();
  await fetchOrganizations();

  // Determine if we should run in simulated mode
  isSimulatedMode = (window.location.protocol === 'file:');
  if (!isSimulatedMode) {
    try {
      const ping = await fetch('/api/listings');
      if (!ping.ok) isSimulatedMode = true;
    } catch (e) {
      isSimulatedMode = true;
    }
  }

  if (isSimulatedMode) {
    console.log("⚠️ Running in SIMULATED BACKEND Mode. Data stored in localStorage.");
    initSimulatedDb();
  } else {
    console.log("🔌 Running in LIVE SERVER Mode.");
  }

  // Check local storage for session
  const sessionKey = isSimulatedMode ? 'sharemeal_user_sim' : 'sharemeal_user';
  const storedUser = localStorage.getItem(sessionKey);
  if (storedUser) {
    currentUser = JSON.parse(storedUser);
    setupLoggedInUI();
    initWebSocket();
    await fetchNotifications();
    await loadDashboardData();
  } else {
    setupLoggedOutUI();
    initRegMap();
  }

  // Bind Navigation Links
  document.querySelectorAll('.nav-link[data-target]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetSection = link.getAttribute('data-target');
      showSection(targetSection);
    });
  });

  // Bind Forms
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);
  document.getElementById('new-listing-form').addEventListener('submit', handleNewListing);
  document.getElementById('request-pickup-form').addEventListener('submit', handleRequestPickup);

  // Bind Notification Toggles
  const notifBtn = document.getElementById('notif-btn-toggle');
  const notifDropdown = document.getElementById('notif-dropdown');
  notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle('hidden');
    if (!notifDropdown.classList.contains('hidden')) {
      markNotificationsAsRead();
    }
  });

  document.getElementById('mark-all-read-btn').addEventListener('click', markNotificationsAsRead);

  document.body.addEventListener('click', () => {
    notifDropdown.classList.add('hidden');
  });

  // Modal Close
  document.getElementById('close-tracking-modal').addEventListener('click', () => {
    document.getElementById('tracking-modal').classList.add('hidden');
  });

  // Logout button
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Brand click triggers Home
  document.getElementById('nav-brand').addEventListener('click', (e) => {
    e.preventDefault();
    if (currentUser) {
      showSection('dashboard-section');
    } else {
      showSection('home-section');
    }
  });

  // --- IMAGE UPLOAD & CAMERA ACCESS ---
  const imageInput = document.getElementById('list-image');
  const uploadPlaceholder = document.getElementById('upload-placeholder');
  const uploadPreview = document.getElementById('upload-preview');
  const imagePreviewEl = document.getElementById('image-preview');
  const removeImageBtn = document.getElementById('remove-image-btn');

  if (imageInput) {
    imageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        showToast('File Too Large', 'Please select an image under 5MB.', 'warning');
        imageInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        pendingImageBase64 = ev.target.result;
        imagePreviewEl.src = pendingImageBase64;
        uploadPlaceholder.classList.add('hidden');
        uploadPreview.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    });
  }

  if (removeImageBtn) {
    removeImageBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pendingImageBase64 = null;
      imageInput.value = '';
      imagePreviewEl.src = '';
      uploadPreview.classList.add('hidden');
      uploadPlaceholder.classList.remove('hidden');
    });
  }
});

// --- DUAL-MODE API FETCH WRAPPER ---
async function apiFetch(url, options = {}) {
  if (!isSimulatedMode) {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
    return data;
  } else {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const result = handleSimulatedRequest(url, options);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      }, 200);
    });
  }
}

// --- UI ROUTING SYSTEM ---
function showSection(sectionId) {
  let targetId = sectionId;
  if (sectionId === 'dashboard-section') {
    if (!currentUser) {
      targetId = 'auth-section';
    } else if (currentUser.role === 'donor') {
      targetId = 'donor-dashboard-section';
    } else if (currentUser.role === 'ngo') {
      targetId = 'ngo-dashboard-section';
    } else if (currentUser.role === 'admin') {
      targetId = 'admin-dashboard-section';
    }
  }

  document.querySelectorAll('.app-section').forEach(sec => {
    if (sec.id === targetId) {
      sec.classList.add('active');
    } else {
      sec.classList.remove('active');
    }
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    const dataTarget = link.getAttribute('data-target');
    if (dataTarget === sectionId || (sectionId === 'dashboard-section' && dataTarget === 'dashboard-link')) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Redraw Google Maps
  setTimeout(() => {
    if (targetId === 'auth-section') {
      initRegMap();
      if (regMap && window.google) {
        google.maps.event.trigger(regMap, 'resize');
        regMap.setCenter({ lat: DEFAULT_COORDS[0], lng: DEFAULT_COORDS[1] });
      }
    } else if (targetId === 'donor-dashboard-section') {
      initListMap();
      if (listMap && window.google) {
        google.maps.event.trigger(listMap, 'resize');
        if (currentUser) {
          listMap.setCenter({ lat: currentUser.lat, lng: currentUser.lng });
        }
      }
    } else if (targetId === 'ngo-dashboard-section') {
      initNgoMap();
      if (ngoMap && window.google) {
        google.maps.event.trigger(ngoMap, 'resize');
        if (currentUser) {
          ngoMap.setCenter({ lat: currentUser.lat, lng: currentUser.lng });
        }
      }
    }
  }, 100);
}

function switchAuthTab(tabName) {
  const loginTab = document.getElementById('tab-login');
  const registerTab = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (tabName === 'login') {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
  } else {
    loginTab.classList.remove('active');
    registerTab.classList.add('active');
    loginForm.classList.remove('active');
    registerForm.classList.add('active');
    setTimeout(() => {
      initRegMap();
    }, 50);
  }
}

function showRegister(roleType) {
  showSection('auth-section');
  switchAuthTab('register');
  if (roleType === 'donor') {
    document.getElementById('role-donor').checked = true;
  } else {
    document.getElementById('role-ngo').checked = true;
  }
}

function setupLoggedInUI() {
  document.getElementById('login-btn').classList.add('hidden');
  document.getElementById('logout-btn').classList.remove('hidden');
  
  const greeting = document.getElementById('user-greeting');
  let modeTag = isSimulatedMode ? ' (SIM)' : '';
  greeting.textContent = `${currentUser.name} (${currentUser.role.toUpperCase()})${modeTag}`;
  greeting.classList.remove('hidden');
 
  const dashLink = document.getElementById('dashboard-link');
  dashLink.classList.remove('hidden');
 
  document.getElementById('notif-bell').classList.remove('hidden');
 
  if (currentUser.role === 'donor') {
    const el = document.getElementById('donor-welcome-msg');
    if (el) el.textContent = `Welcome back, ${currentUser.name}. Track pickup coordinates below.`;
  } else if (currentUser.role === 'ngo') {
    const el = document.getElementById('ngo-welcome-msg');
    if (el) el.textContent = `Welcome back, ${currentUser.name}. Explore surplus food map coordinates.`;
  }
}

function setupLoggedOutUI() {
  document.getElementById('login-btn').classList.remove('hidden');
  document.getElementById('logout-btn').classList.add('hidden');
  document.getElementById('user-greeting').classList.add('hidden');
  document.getElementById('dashboard-link').classList.add('hidden');
  document.getElementById('notif-bell').classList.add('hidden');
}

function scrollToElement(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// --- AUTH ACTIONS ---
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    currentUser = data;
    const sessionKey = isSimulatedMode ? 'sharemeal_user_sim' : 'sharemeal_user';
    localStorage.setItem(sessionKey, JSON.stringify(currentUser));
    
    document.getElementById('login-form').reset();
    showToast('Success', 'Logged in successfully', 'success');
    setupLoggedInUI();
    initWebSocket();
    await fetchNotifications();
    await loadDashboardData();
    showSection('dashboard-section');

  } catch (err) {
    showToast('Error', err.message, 'danger');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const phone = document.getElementById('reg-phone').value;
  const password = document.getElementById('reg-password').value;
  const address = document.getElementById('reg-address').value;
  const role = document.querySelector('input[name="reg-role"]:checked').value;
  const lat = parseFloat(document.getElementById('reg-lat').textContent);
  const lng = parseFloat(document.getElementById('reg-lng').textContent);

  try {
    await apiFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password, address, role, lat, lng })
    });

    showToast('Success', 'Account created! Please sign in.', 'success');
    switchAuthTab('login');
    document.getElementById('register-form').reset();

  } catch (err) {
    showToast('Registration Error', err.message, 'danger');
  }
}

function handleLogout() {
  if (ws) {
    if (ws.close) ws.close();
    ws = null;
  }
  const sessionKey = isSimulatedMode ? 'sharemeal_user_sim' : 'sharemeal_user';
  localStorage.removeItem(sessionKey);
  currentUser = null;
  setupLoggedOutUI();
  showToast('Logged Out', 'Successfully signed out.', 'info');
  showSection('home-section');
}

// --- WEBSOCKETS & TOAST REAL-TIME ALERTS ---
function initWebSocket() {
  if (!currentUser) return;

  if (!isSimulatedMode) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}`;
    
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'register',
        userId: currentUser.id,
        role: currentUser.role
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification') {
          showToast('Notification', data.notification.message, 'info');
          userNotifications.unshift(data.notification);
          renderNotificationsList();
          loadDashboardData();
        }
      } catch (e) {
        console.error('WebSocket parsing error:', e);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket closed. Retrying in 5s...');
      setTimeout(initWebSocket, 5000);
    };
  } else {
    ws = {
      close: () => { window.simulatedSocketHandler = null; }
    };
    window.simulatedSocketHandler = (notification) => {
      showToast('Live Alert', notification.message, 'info');
      userNotifications.unshift(notification);
      renderNotificationsList();
      loadDashboardData();
    };
  }
}

function triggerSimulatedSocketAlert(notification) {
  if (isSimulatedMode && window.simulatedSocketHandler) {
    window.simulatedSocketHandler(notification);
  }
}

function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast`;
  
  const icons = {
    success: 'fa-circle-check',
    danger: 'fa-circle-exclamation',
    info: 'fa-circle-info'
  };
  const icon = icons[type] || 'fa-bell';

  toast.innerHTML = `
    <div class="toast-icon"><i class="fa-solid ${icon}"></i></div>
    <div class="toast-body">
      <h4>${title}</h4>
      <p>${message}</p>
    </div>
    <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  });

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }
  }, 6000);
}

async function fetchNotifications() {
  if (!currentUser) return;
  try {
    userNotifications = await apiFetch(`/api/notifications/${currentUser.id}`);
    renderNotificationsList();
  } catch (e) {
    console.error('Error fetching notifications:', e);
  }
}

function renderNotificationsList() {
  const notifList = document.getElementById('notif-list');
  const countBadge = document.getElementById('notif-count');
  
  const unreadCount = userNotifications.filter(n => !n.read).length;
  
  if (unreadCount > 0) {
    countBadge.textContent = unreadCount;
    countBadge.classList.remove('hidden');
  } else {
    countBadge.classList.add('hidden');
  }

  if (userNotifications.length === 0) {
    notifList.innerHTML = `<div class="notif-empty">No notifications yet</div>`;
    return;
  }

  notifList.innerHTML = userNotifications.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" onclick="handleNotificationClick('${n.id}', '${n.listingId || ''}')">
      <p>${escapeHtml(n.message)}</p>
      <span class="notif-time">${formatTimeAgo(n.createdAt)}</span>
    </div>
  `).join('');
}

window.handleNotificationClick = async function(notifId, listingId) {
  markOneAsRead(notifId);

  if (listingId && currentUser && currentUser.role === 'ngo') {
    showSection('ngo-dashboard-section');
    setTimeout(() => {
      selectListingFromFeed(listingId);
      const panel = document.getElementById('ngo-detail-panel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth' });
    }, 200);
  }
};

async function markNotificationsAsRead() {
  if (!currentUser) return;
  try {
    await apiFetch(`/api/notifications/${currentUser.id}/read`, { method: 'POST' });
    userNotifications.forEach(n => n.read = true);
    renderNotificationsList();
  } catch (e) {
    console.error('Error marking notifications as read:', e);
  }
}

function markOneAsRead(id) {
  const notif = userNotifications.find(n => n.id === id);
  if (notif) {
    notif.read = true;
    renderNotificationsList();
  }
}

// --- DASHBOARD DATA LOADING ---
async function loadDashboardData() {
  if (!currentUser) return;

  try {
    allListings = await apiFetch('/api/listings');
    allPickups = await apiFetch('/api/pickups');
    await fetchOrganizations();

    if (currentUser.role === 'donor') {
      renderDonorDashboard();
    } else if (currentUser.role === 'ngo') {
      renderNgoDashboard();
    } else if (currentUser.role === 'admin') {
      renderAdminDashboard();
    }
  } catch (e) {
    console.error('Error fetching dashboard data:', e);
  }
}

// Send live notification when food is ready for pickup
window.sendReadyNotification = async function(listingId) {
  try {
    await apiFetch(`/api/listings/${listingId}/ready`, {
      method: 'POST'
    });
    showToast('Alert Sent', 'Notified nearby NGOs that this listing is ready for pickup.', 'success');
  } catch (err) {
    showToast('Notification Error', err.message, 'danger');
  }
};

// --- ADMIN WORKFLOWS ---
function renderAdminDashboard() {
  const donors = allOrganizations.filter(u => u.role === 'donor');
  const ngos = allOrganizations.filter(u => u.role === 'ngo');

  // Stats Card values
  document.getElementById('admin-stat-users').textContent = allOrganizations.length;
  document.getElementById('admin-stat-donors').textContent = donors.length;
  document.getElementById('admin-stat-ngos').textContent = ngos.length;
  document.getElementById('admin-stat-listings').textContent = allListings.length;

  const availableListings = allListings.filter(l => l.status === 'available');
  document.getElementById('admin-stat-listings-sub').textContent = `${availableListings.length} available`;

  // Count Badges
  document.getElementById('admin-count-donors').textContent = `${donors.length} Donors`;
  document.getElementById('admin-count-ngos').textContent = `${ngos.length} NGOs`;
  document.getElementById('admin-count-listings').textContent = `${allListings.length} Listings`;

  // Donors Table
  const donorsTbody = document.getElementById('admin-donors-tbody');
  if (donors.length === 0) {
    donorsTbody.innerHTML = `<tr><td colspan="5" class="table-empty">No donors registered yet.</td></tr>`;
  } else {
    donorsTbody.innerHTML = donors.map(d => `
      <tr>
        <td><strong>${escapeHtml(d.name)}</strong></td>
        <td>${escapeHtml(d.email)}</td>
        <td>${escapeHtml(d.phone || 'N/A')}</td>
        <td>${escapeHtml(d.address || 'N/A')}</td>
        <td><code class="text-sm">${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}</code></td>
      </tr>
    `).join('');
  }

  // NGOs Table
  const ngosTbody = document.getElementById('admin-ngos-tbody');
  if (ngos.length === 0) {
    ngosTbody.innerHTML = `<tr><td colspan="5" class="table-empty">No NGOs registered yet.</td></tr>`;
  } else {
    ngosTbody.innerHTML = ngos.map(n => `
      <tr>
        <td><strong>${escapeHtml(n.name)}</strong></td>
        <td>${escapeHtml(n.email)}</td>
        <td>${escapeHtml(n.phone || 'N/A')}</td>
        <td>${escapeHtml(n.address || 'N/A')}</td>
        <td><code class="text-sm">${n.lat.toFixed(5)}, ${n.lng.toFixed(5)}</code></td>
      </tr>
    `).join('');
  }

  // Listings Table
  const listingsTbody = document.getElementById('admin-listings-tbody');
  if (allListings.length === 0) {
    listingsTbody.innerHTML = `<tr><td colspan="6" class="table-empty">No food listings published yet.</td></tr>`;
  } else {
    listingsTbody.innerHTML = allListings.map(l => {
      let statusClass = 'status-available';
      if (l.status === 'requested') statusClass = 'status-requested';
      if (l.status === 'picked_up') statusClass = 'status-picked_up';
      if (l.status === 'delivered') statusClass = 'status-delivered';

      return `
        <tr>
          <td><strong>${escapeHtml(l.title)}</strong></td>
          <td><span class="category-badge text-xs" style="margin:0;">${escapeHtml(l.foodType)}</span></td>
          <td>${escapeHtml(l.donorName)}</td>
          <td>${escapeHtml(l.quantity)}</td>
          <td>${formatDate(l.expiryTime)}</td>
          <td><span class="status-indicator ${statusClass}">${escapeHtml(l.status.toUpperCase().replace('_', ' '))}</span></td>
        </tr>
      `;
    }).join('');
  }
}

// --- DONOR WORKFLOWS ---
function renderDonorDashboard() {
  const listingsTable = document.getElementById('donor-listings-tbody');
  const historyTable = document.getElementById('donor-history-tbody');

  const donorListings = allListings.filter(l => l.donorId === currentUser.id);
  const activeListings = donorListings.filter(l => l.status !== 'delivered');
  const completedListings = donorListings.filter(l => l.status === 'delivered');

  if (activeListings.length === 0) {
    listingsTable.innerHTML = `<tr><td colspan="5" class="table-empty">No active food listings. Submit the form on the left to donate!</td></tr>`;
  } else {
    listingsTable.innerHTML = activeListings.map(l => {
      const pickup = allPickups.find(p => p.listingId === l.id && p.status !== 'delivered');
      
      let actionHtml = '';
      if (l.status === 'available') {
        actionHtml = `<button class="btn btn-primary text-sm" onclick="sendReadyNotification('${l.id}')">
          <i class="fa-solid fa-bell"></i> Notify NGOs Ready
        </button>`;
      } else {
        actionHtml = `<button class="btn btn-secondary btn-outline text-sm" onclick="openTrackingModal('${l.id}', '${pickup ? pickup.id : ''}')">
          <i class="fa-solid fa-location-crosshairs"></i> Track Live
        </button>`;
      }

      return `
        <tr>
          <td><strong>${escapeHtml(l.title)}</strong></td>
          <td>${escapeHtml(l.quantity)} <span class="category-badge">${escapeHtml(l.foodType)}</span></td>
          <td>${formatDate(l.createdAt)}</td>
          <td><span class="status-badge ${l.status}">${l.status.replace('_', ' ')}</span></td>
          <td>${actionHtml}</td>
        </tr>
      `;
    }).join('');
  }

  if (completedListings.length === 0) {
    historyTable.innerHTML = `<tr><td colspan="5" class="table-empty">No completed donations yet.</td></tr>`;
  } else {
    historyTable.innerHTML = completedListings.map(l => {
      const pickup = allPickups.find(p => p.listingId === l.id);
      const claimedBy = pickup ? pickup.ngoName : 'NGO';
      return `
        <tr>
          <td><strong>${escapeHtml(l.title)}</strong></td>
          <td>${escapeHtml(l.quantity)}</td>
          <td>${formatDate(l.createdAt)}</td>
          <td>${escapeHtml(claimedBy)}</td>
          <td><span class="status-badge delivered">delivered</span></td>
        </tr>
      `;
    }).join('');
  }
}

async function handleNewListing(e) {
  e.preventDefault();
  const title = document.getElementById('list-title').value;
  const foodType = document.getElementById('list-type').value;
  const quantity = document.getElementById('list-qty').value;
  const expiryTime = document.getElementById('list-expiry').value;
  const description = document.getElementById('list-desc').value;
  const address = document.getElementById('list-address').value;
  const lat = parseFloat(document.getElementById('list-lat').textContent);
  const lng = parseFloat(document.getElementById('list-lng').textContent);

  const payload = {
    donorId: currentUser.id,
    donorName: currentUser.name,
    donorPhone: currentUser.phone || '',
    donorEmail: currentUser.email || '',
    title,
    foodType,
    quantity,
    expiryTime: new Date(expiryTime).toISOString(),
    description,
    address,
    lat,
    lng,
    imageBase64: pendingImageBase64 || null
  };

  try {
    await apiFetch('/api/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    showToast('Published', `Successfully listed "${title}"`, 'success');
    document.getElementById('new-listing-form').reset();

    // Reset image upload area
    pendingImageBase64 = null;
    document.getElementById('image-preview').src = '';
    document.getElementById('upload-preview').classList.add('hidden');
    document.getElementById('upload-placeholder').classList.remove('hidden');
    document.getElementById('list-image').value = '';
    
    document.getElementById('list-lat').textContent = currentUser.lat;
    document.getElementById('list-lng').textContent = currentUser.lng;
      if (listMarker && window.google) {
        listMarker.setPosition({ lat: currentUser.lat, lng: currentUser.lng });
        listMap.setCenter({ lat: currentUser.lat, lng: currentUser.lng });
        listMap.setZoom(14);
      }

    await loadDashboardData();

    if (isSimulatedMode) {
      setTimeout(() => {
        simulateNgoClaimFlow(title);
      }, 6000);
    }

  } catch (err) {
    showToast('Listing Error', err.message, 'danger');
  }
}

// --- NGO WORKFLOWS ---
function renderNgoDashboard() {
  const feedContainer = document.getElementById('ngo-listings-feed');
  const activeContainer = document.getElementById('ngo-active-pickups');

  let availableListings = allListings.filter(l => l.status === 'available');

  // If GPS / current location is active, calculate distances and sort listings
  if (ngoCurrentCoords) {
    availableListings.forEach(l => {
      l.distance = calculateDistance(ngoCurrentCoords.lat, ngoCurrentCoords.lng, l.lat, l.lng);
    });
    availableListings.sort((a, b) => a.distance - b.distance);
  }

  if (availableListings.length === 0) {
    feedContainer.innerHTML = `<div class="empty-state"><i class="fa-solid fa-cookie-bite"></i><p>No available listings right now.</p></div>`;
  } else {
    feedContainer.innerHTML = availableListings.map(l => {
      const imageHtml = l.imageBase64 ? `<img src="${l.imageBase64}" class="feed-card-image" alt="${escapeHtml(l.title)}">` : '';
      const distHtml = l.distance !== undefined ? `<span class="distance-badge"><i class="fa-solid fa-location-arrow"></i> ${l.distance.toFixed(1)} km</span>` : '';
      return `
      <div class="feed-card" id="feed-card-${l.id}" onclick="selectListingFromFeed('${l.id}')">
        ${imageHtml}
        <div class="feed-card-header">
          <h4>${escapeHtml(l.title)}</h4>
          <span class="category-badge">${escapeHtml(l.foodType)}</span>
        </div>
        <p class="feed-card-desc">${escapeHtml(l.description || 'No description provided')}</p>
        <div class="feed-card-footer">
          <span><i class="fa-solid fa-building"></i> ${escapeHtml(l.donorName)}</span>
          ${distHtml}
          <span>Qty: ${escapeHtml(l.quantity)}</span>
        </div>
      </div>
    `;
    }).join('');
  }

  const ngoPickups = allPickups.filter(p => p.ngoId === currentUser.id);
  const activePickups = ngoPickups.filter(p => p.status !== 'delivered');

  if (activePickups.length === 0) {
    activeContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-route"></i>
        <p>No active pickup requests. Browse the map and request surplus food above!</p>
      </div>
    `;
  } else {
    activeContainer.innerHTML = activePickups.map(p => {
      const listing = allListings.find(l => l.id === p.listingId);
      if (!listing) return '';

      return `
        <div class="pickup-tracker-card">
          <div class="tracker-card-header">
            <h4>${escapeHtml(listing.title)}</h4>
            <span class="status-badge ${p.status}">${p.status.replace('_', ' ')}</span>
          </div>
          <div class="tracker-card-body">
            <div>
              <span class="text-dim">Donor:</span>
              <strong>${escapeHtml(listing.donorName)}</strong>
            </div>
            <div>
              <span class="text-dim">Pickup Address:</span>
              <strong>${escapeHtml(listing.address)}</strong>
            </div>
            <div>
              <span class="text-dim">Quantity:</span>
              <strong>${escapeHtml(listing.quantity)}</strong>
            </div>
            <div>
              <span class="text-dim">Scheduled:</span>
              <strong>${formatDate(p.scheduledTime)}</strong>
            </div>
            <div style="grid-column: span 2; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 8px; margin-top: 4px;">
              <span class="text-dim"><i class="fa-solid fa-phone"></i> Contact:</span>
              <strong>${escapeHtml(listing.donorPhone || 'N/A')} | ${escapeHtml(listing.donorEmail || 'N/A')}</strong>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end;">
            <button class="btn btn-primary text-sm" onclick="openTrackingModal('${listing.id}', '${p.id}')">
              <i class="fa-solid fa-location-dot"></i> Live Tracker & Actions
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  refreshNgoMapMarkers(availableListings);
}

function selectListingFromFeed(listingId) {
  const listing = allListings.find(l => l.id === listingId);
  if (!listing) return;

  document.querySelectorAll('.feed-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(`feed-card-${listingId}`);
  if (card) card.classList.add('selected');

  document.getElementById('panel-empty-state').classList.add('hidden');
  const activePanel = document.getElementById('panel-active-state');
  activePanel.classList.remove('hidden');

  document.getElementById('panel-food-type').textContent = listing.foodType;
  document.getElementById('panel-title').textContent = listing.title;
  document.getElementById('panel-quantity').textContent = listing.quantity;
  document.getElementById('panel-expiry').textContent = formatDate(listing.expiryTime);
  document.getElementById('panel-donor-name').textContent = listing.donorName;
  document.getElementById('panel-address').textContent = listing.address;
  document.getElementById('panel-donor-phone').textContent = listing.donorPhone || 'N/A';
  document.getElementById('panel-donor-email').textContent = listing.donorEmail || 'N/A';
  document.getElementById('panel-desc').textContent = listing.description || 'No description provided';
  document.getElementById('request-listing-id').value = listingId;

  // Show food image if available
  const imgContainer = document.getElementById('panel-image-container');
  const imgEl = document.getElementById('panel-food-image');
  if (listing.imageBase64) {
    imgEl.src = listing.imageBase64;
    imgContainer.classList.remove('hidden');
  } else {
    imgEl.src = '';
    imgContainer.classList.add('hidden');
  }

  const defaultPickupTime = new Date(Date.now() + 60 * 60 * 1000);
  const formatOffset = defaultPickupTime.getTime() - (defaultPickupTime.getTimezoneOffset() * 60000);
  const formattedStr = new Date(formatOffset).toISOString().slice(0, 16);
  document.getElementById('pickup-time').value = formattedStr;

    if (ngoMap && window.google) {
      ngoMap.setCenter({ lat: listing.lat, lng: listing.lng });
      ngoMap.setZoom(15);
    }
}

async function handleRequestPickup(e) {
  e.preventDefault();
  const listingId = document.getElementById('request-listing-id').value;
  const pickupTimeStr = document.getElementById('pickup-time').value;

  const payload = {
    listingId,
    ngoId: currentUser.id,
    ngoName: currentUser.name,
    scheduledTime: new Date(pickupTimeStr).toISOString()
  };

  try {
    await apiFetch('/api/pickups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    showToast('Success', 'Surplus food listing requested successfully!', 'success');
    
    document.getElementById('panel-active-state').classList.add('hidden');
    document.getElementById('panel-empty-state').classList.remove('hidden');

    await loadDashboardData();

    if (isSimulatedMode) {
      showToast('Simulation', 'Driver assigned! You can mark item as Picked Up and Delivered in the Tracker modal.', 'info');
    }

  } catch (err) {
    showToast('Claim Error', err.message, 'danger');
  }
}

// --- LIVE DONATION TRACKER MODAL ---
function openTrackingModal(listingId, pickupId) {
  const listing = allListings.find(l => l.id === listingId);
  const pickup = allPickups.find(p => p.id === pickupId);

  if (!listing) return;

  document.getElementById('track-item-title').textContent = listing.title;
  document.getElementById('track-donor-name').textContent = listing.donorName;
  document.getElementById('track-donor-address').textContent = listing.address;
  document.getElementById('track-donor-contact').innerHTML = `
    <i class="fa-solid fa-phone"></i> ${escapeHtml(listing.donorPhone || 'N/A')} <br>
    <i class="fa-solid fa-envelope"></i> ${escapeHtml(listing.donorEmail || 'N/A')}
  `;
  document.getElementById('track-food-qty').textContent = listing.quantity;
  document.getElementById('track-food-expiry').textContent = `Expiry: ${formatDate(listing.expiryTime)}`;

  if (pickup) {
    document.getElementById('track-ngo-name').textContent = pickup.ngoName;
    document.getElementById('track-scheduled-time').textContent = formatDate(pickup.scheduledTime);
    document.getElementById('track-status-badge').innerHTML = `Status: <span class="status-badge ${pickup.status}">${pickup.status.replace('_', ' ')}</span>`;
    
    const ngoCoords = getSeededNgoCoords(pickup.ngoId);
    document.getElementById('track-ngo-address').textContent = getSeededNgoAddress(pickup.ngoId);
    
    initTrackingRouteMap([listing.lat, listing.lng], ngoCoords, listing.donorName, pickup.ngoName);
  } else {
    document.getElementById('track-ngo-name').textContent = 'Pending Request';
    document.getElementById('track-ngo-address').textContent = '-';
    document.getElementById('track-scheduled-time').textContent = 'Not scheduled';
    document.getElementById('track-status-badge').textContent = 'Status: Available';
    
    initTrackingRouteMap([listing.lat, listing.lng], null, listing.donorName, '');
  }

  updateTrackingStepper(listing.status);

  const actionPanel = document.getElementById('tracking-action-panel');
  actionPanel.innerHTML = '';

  if (pickup && pickup.status !== 'delivered') {
    if (currentUser.role === 'ngo') {
      let actionHtml = '';
      if (pickup.status === 'requested') {
        actionHtml = `<button class="btn btn-primary" onclick="updatePickupStatus('${pickup.id}', 'picked_up')">
          <i class="fa-solid fa-truck-ramp-box"></i> Mark Picked Up & En Route
        </button>`;
      } else if (pickup.status === 'picked_up') {
        actionHtml = `<button class="btn btn-primary" onclick="updatePickupStatus('${pickup.id}', 'delivered')">
          <i class="fa-solid fa-circle-check"></i> Mark Delivered / Completed
        </button>`;
      }
      actionPanel.innerHTML = actionHtml;
    } else {
      actionPanel.innerHTML = `<span class="text-dim"><i class="fa-solid fa-circle-notch fa-spin"></i> NGO is coordinating transport...</span>`;
    }
  }

  document.getElementById('tracking-modal').classList.remove('hidden');

  setTimeout(() => {
    if (trackMap) {
      trackMap.invalidateSize();
    }
  }, 150);
}

function updateTrackingStepper(status) {
  const steps = ['available', 'requested', 'picked_up', 'delivered'];
  const statusIndex = steps.indexOf(status);

  steps.forEach((step, idx) => {
    const stepEl = document.getElementById(`step-${step}`);
    if (!stepEl) return;

    if (idx < statusIndex) {
      stepEl.className = 'timeline-step completed';
    } else if (idx === statusIndex) {
      stepEl.className = 'timeline-step active';
    } else {
      stepEl.className = 'timeline-step';
    }
  });
}

async function updatePickupStatus(pickupId, newStatus) {
  try {
    await apiFetch(`/api/pickups/${pickupId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    showToast('Status Updated', `Donation marked as ${newStatus.replace('_', ' ')}`, 'success');
    document.getElementById('tracking-modal').classList.add('hidden');
    await loadDashboardData();

  } catch (err) {
    showToast('Tracking Error', err.message, 'danger');
  }
}

function getSeededNgoCoords(ngoId) {
  const coords = {
    'u_ngo_1': [28.6421, 77.1782],
    'u_ngo_2': [28.6129, 77.2295]
  };
  return coords[ngoId] || DEFAULT_COORDS;
}

function getSeededNgoAddress(ngoId) {
  const addresses = {
    'u_ngo_1': 'Rajendra Place District Centre, New Delhi',
    'u_ngo_2': 'KG Marg, Near India Gate, New Delhi'
  };
  return addresses[ngoId] || 'NGO Facility';
}

// --- LEAFLET.JS INTERACTIVE MAP IMPLEMENTATION ---

// --- GOOGLE MAPS INTERACTIVE MAP IMPLEMENTATION ---

// --- GEOLOCATION & GEOPROXIMITY MAPPING IMPLEMENTATION ---

// 1. Fetch all registered users / organizations
async function fetchOrganizations() {
  try {
    allOrganizations = await apiFetch('/api/users');
  } catch (e) {
    console.error('Error fetching organizations:', e);
    allOrganizations = SEED_USERS;
  }
}

// 2. Haversine Distance Calculation (in km)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 3. Geolocation Permission & Location Lookup Request
function requestUserLocation(successCallback, errorCallback, buttonId) {
  const btn = document.getElementById(buttonId);
  if (btn) {
    btn.classList.add('searching');
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Detecting...`;
  }

  if (!navigator.geolocation) {
    showToast('GPS Error', 'Geolocation is not supported by your browser.', 'danger');
    if (btn) {
      btn.classList.remove('searching');
      btn.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> Turn on location`;
    }
    if (errorCallback) errorCallback();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      if (btn) {
        btn.classList.remove('searching');
        btn.classList.add('active-location');
        btn.innerHTML = `<i class="fa-solid fa-location-dot"></i> Location Active`;
      }
      successCallback(lat, lng);
    },
    (err) => {
      console.warn("Geolocation error:", err);
      showToast('GPS Access Denied', 'Please enable location permissions in your browser to detect your current location.', 'warning');
      if (btn) {
        btn.classList.remove('searching');
        btn.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> Turn on location`;
      }
      if (errorCallback) errorCallback(err);
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

// 4. Registration Map Nearby Orgs Renderer
let regOrgMarkers = [];
function drawRegistrationNearbyOrganizations(centerLat, centerLng) {
  if (!regMap || !window.google || !window.google.maps) return;

  // Clear existing markers
  regOrgMarkers.forEach(m => m.setMap(null));
  regOrgMarkers = [];

  const selectedRole = document.querySelector('input[name="reg-role"]:checked').value;

  allOrganizations.forEach(org => {
    if (!org.lat || !org.lng) return;

    // Filter to show the opposite role (Donors see NGOs, NGOs see Donors)
    if (org.role === selectedRole) return;

    const dist = calculateDistance(centerLat, centerLng, org.lat, org.lng);
    if (dist > 15) return; // 15km limit

    const markerColor = org.role === 'donor' ? '#10b981' : '#6366f1';
    const marker = new google.maps.Marker({
      position: { lat: org.lat, lng: org.lng },
      map: regMap,
      title: org.name,
      icon: {
        path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        fillColor: markerColor,
        fillOpacity: 0.9,
        strokeWeight: 1,
        strokeColor: "#ffffff",
        scale: 7
      }
    });

    const infowindow = new google.maps.InfoWindow({
      content: `
        <div style="font-family: Inter; color: #1e293b; font-size:13px; max-width:200px;">
          <h4 style="margin: 0 0 4px 0; color: ${markerColor}; font-weight:700;">${escapeHtml(org.name)}</h4>
          <span style="font-size:10px; background:${org.role === 'donor' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)'}; color:${markerColor}; padding:2px 6px; border-radius:4px; font-weight:bold; text-transform:uppercase;">${org.role}</span>
          <p style="margin: 6px 0 2px 0;"><b>Phone:</b> ${escapeHtml(org.phone)}</p>
          <p style="margin: 0 0 4px 0;"><b>Address:</b> ${escapeHtml(org.address)}</p>
          <p style="margin: 4px 0 0 0; color:#10b981; font-weight:600;"><i class="fa-solid fa-location-arrow"></i> ${dist.toFixed(1)} km away</p>
        </div>
      `
    });

    marker.addListener('click', () => {
      infowindow.open({
        anchor: marker,
        map: regMap
      });
    });

    regOrgMarkers.push(marker);
  });
}

// 5. Donor Listing Map Nearby NGOs Renderer
let listOrgMarkers = [];
function drawListingNearbyNGOs(centerLat, centerLng) {
  if (!listMap || !window.google || !window.google.maps) return;

  // Clear existing NGO markers
  listOrgMarkers.forEach(m => m.setMap(null));
  listOrgMarkers = [];

  allOrganizations.forEach(org => {
    if (org.role !== 'ngo') return;
    if (!org.lat || !org.lng) return;

    const dist = calculateDistance(centerLat, centerLng, org.lat, org.lng);
    if (dist > 15) return; // 15km vicinity

    const marker = new google.maps.Marker({
      position: { lat: org.lat, lng: org.lng },
      map: listMap,
      title: org.name,
      icon: {
        path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        fillColor: "#6366f1", // Indigo for NGOs
        fillOpacity: 0.9,
        strokeWeight: 1,
        strokeColor: "#ffffff",
        scale: 7
      }
    });

    const infowindow = new google.maps.InfoWindow({
      content: `
        <div style="font-family: Inter; color: #1e293b; font-size:13px; max-width:200px;">
          <h4 style="margin: 0 0 4px 0; color: #6366f1; font-weight:700;">${escapeHtml(org.name)}</h4>
          <span style="font-size:10px; background:rgba(99, 102, 241, 0.1); color:#6366f1; padding:2px 6px; border-radius:4px; font-weight:bold; text-transform:uppercase;">NGO / Receiver</span>
          <p style="margin: 6px 0 2px 0;"><b>Phone:</b> ${escapeHtml(org.phone)}</p>
          <p style="margin: 0 0 4px 0;"><b>Address:</b> ${escapeHtml(org.address)}</p>
          <p style="margin: 4px 0 0 0; color:#10b981; font-weight:600;"><i class="fa-solid fa-location-arrow"></i> ${dist.toFixed(1)} km away</p>
        </div>
      `
    });

    marker.addListener('click', () => {
      infowindow.open({
        anchor: marker,
        map: listMap
      });
    });

    listOrgMarkers.push(marker);
  });
}

function initRegMap() {
  if (regMap || !window.google || !window.google.maps) return;

  const mapDiv = document.getElementById('register-map');
  if (!mapDiv) return;

  const centerLatLng = { lat: DEFAULT_COORDS[0], lng: DEFAULT_COORDS[1] };

  regMap = new google.maps.Map(mapDiv, {
    center: centerLatLng,
    zoom: 13,
    styles: MAP_STYLE_DARK,
    mapTypeControl: false,
    streetViewControl: false
  });

  regMarker = new google.maps.Marker({
    position: centerLatLng,
    map: regMap,
    draggable: true
  });
  
  regMap.addListener('click', (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    regMarker.setPosition({ lat, lng });
    document.getElementById('reg-lat').textContent = lat.toFixed(6);
    document.getElementById('reg-lng').textContent = lng.toFixed(6);
    drawRegistrationNearbyOrganizations(lat, lng);
  });

  regMarker.addListener('dragend', () => {
    const pos = regMarker.getPosition();
    const lat = pos.lat();
    const lng = pos.lng();
    document.getElementById('reg-lat').textContent = lat.toFixed(6);
    document.getElementById('reg-lng').textContent = lng.toFixed(6);
    drawRegistrationNearbyOrganizations(lat, lng);
  });

  // Bind GPS Turn On Button
  const btnRegGps = document.getElementById('btn-reg-gps');
  if (btnRegGps) {
    btnRegGps.addEventListener('click', () => {
      requestUserLocation((lat, lng) => {
        const latLng = { lat, lng };
        regMap.setCenter(latLng);
        regMap.setZoom(14);
        regMarker.setPosition(latLng);
        document.getElementById('reg-lat').textContent = lat.toFixed(6);
        document.getElementById('reg-lng').textContent = lng.toFixed(6);
        drawRegistrationNearbyOrganizations(lat, lng);
      }, null, 'btn-reg-gps');
    });
  }

  // Bind role toggles to update markers instantly
  document.querySelectorAll('input[name="reg-role"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const latText = document.getElementById('reg-lat').textContent;
      const lngText = document.getElementById('reg-lng').textContent;
      if (latText && lngText) {
        drawRegistrationNearbyOrganizations(parseFloat(latText), parseFloat(lngText));
      }
    });
  });

  // Draw initial nearby orgs
  drawRegistrationNearbyOrganizations(centerLatLng.lat, centerLatLng.lng);
}

function initListMap() {
  if (listMap || !window.google || !window.google.maps) return;

  const mapDiv = document.getElementById('listing-map');
  if (!mapDiv) return;

  const center = currentUser ? { lat: currentUser.lat, lng: currentUser.lng } : { lat: DEFAULT_COORDS[0], lng: DEFAULT_COORDS[1] };

  listMap = new google.maps.Map(mapDiv, {
    center: center,
    zoom: 14,
    styles: MAP_STYLE_DARK,
    mapTypeControl: false,
    streetViewControl: false
  });

  listMarker = new google.maps.Marker({
    position: center,
    map: listMap,
    draggable: true
  });
  
  document.getElementById('list-lat').textContent = center.lat.toFixed(6);
  document.getElementById('list-lng').textContent = center.lng.toFixed(6);

  listMap.addListener('click', (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    listMarker.setPosition({ lat, lng });
    document.getElementById('list-lat').textContent = lat.toFixed(6);
    document.getElementById('list-lng').textContent = lng.toFixed(6);
    drawListingNearbyNGOs(lat, lng);
  });

  listMarker.addListener('dragend', () => {
    const pos = listMarker.getPosition();
    const lat = pos.lat();
    const lng = pos.lng();
    document.getElementById('list-lat').textContent = lat.toFixed(6);
    document.getElementById('list-lng').textContent = lng.toFixed(6);
    drawListingNearbyNGOs(lat, lng);
  });

  // Bind GPS Turn On Button
  const btnListGps = document.getElementById('btn-list-gps');
  if (btnListGps) {
    btnListGps.addEventListener('click', () => {
      requestUserLocation((lat, lng) => {
        const latLng = { lat, lng };
        listMap.setCenter(latLng);
        listMap.setZoom(15);
        listMarker.setPosition(latLng);
        document.getElementById('list-lat').textContent = lat.toFixed(6);
        document.getElementById('list-lng').textContent = lng.toFixed(6);
        drawListingNearbyNGOs(lat, lng);
      }, null, 'btn-list-gps');
    });
  }

  // Draw initial nearby NGOs
  drawListingNearbyNGOs(center.lat, center.lng);
}

function initNgoMap() {
  if (ngoMap || !window.google || !window.google.maps) return;

  const mapDiv = document.getElementById('ngo-listings-map');
  if (!mapDiv) return;

  if (currentUser && !ngoCurrentCoords) {
    ngoCurrentCoords = { lat: currentUser.lat, lng: currentUser.lng };
  }

  const center = ngoCurrentCoords ? { lat: ngoCurrentCoords.lat, lng: ngoCurrentCoords.lng } : { lat: DEFAULT_COORDS[0], lng: DEFAULT_COORDS[1] };

  ngoMap = new google.maps.Map(mapDiv, {
    center: center,
    zoom: 13,
    styles: MAP_STYLE_DARK,
    mapTypeControl: false,
    streetViewControl: false
  });

  // Draw home/vicinity marker
  if (ngoCurrentCoords && !ngoHomeMarker) {
    ngoHomeMarker = new google.maps.Marker({
      position: { lat: ngoCurrentCoords.lat, lng: ngoCurrentCoords.lng },
      map: ngoMap,
      title: "Your Registered Location",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: "#6366f1", // Indigo for registered location
        fillOpacity: 0.9,
        strokeWeight: 2,
        strokeColor: "#ffffff",
        scale: 10
      }
    });
  }

  // Circle indicating NGO vicinity area
  if (ngoCurrentCoords && !window.ngoCircle) {
    window.ngoCircle = new google.maps.Circle({
      strokeColor: '#6366f1',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: '#6366f1',
      fillOpacity: 0.15,
      map: ngoMap,
      center: center,
      radius: 800
    });
  }

  // Bind GPS Turn On Button
  const btnNgoGps = document.getElementById('btn-ngo-gps');
  if (btnNgoGps) {
    // If location is already active, reflect it
    if (ngoCurrentCoords && ngoHomeMarker && ngoHomeMarker.getTitle() === "Your Location (GPS)") {
      btnNgoGps.classList.add('active-location');
      btnNgoGps.innerHTML = `<i class="fa-solid fa-location-dot"></i> Location Active`;
    }

    btnNgoGps.addEventListener('click', () => {
      requestUserLocation((lat, lng) => {
        ngoCurrentCoords = { lat, lng };
        const latLng = { lat, lng };
        ngoMap.setCenter(latLng);
        ngoMap.setZoom(14);

        if (ngoHomeMarker) {
          ngoHomeMarker.setPosition(latLng);
          ngoHomeMarker.setTitle("Your Location (GPS)");
          ngoHomeMarker.setIcon({
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: "#3b82f6", // Blue for live detected GPS
            fillOpacity: 0.9,
            strokeWeight: 2,
            strokeColor: "#ffffff",
            scale: 10
          });
        } else {
          ngoHomeMarker = new google.maps.Marker({
            position: latLng,
            map: ngoMap,
            title: "Your Location (GPS)",
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: "#3b82f6",
              fillOpacity: 0.9,
              strokeWeight: 2,
              strokeColor: "#ffffff",
              scale: 10
            }
          });
        }

        if (window.ngoCircle) {
          window.ngoCircle.setCenter(latLng);
          window.ngoCircle.setOptions({
            strokeColor: '#3b82f6',
            fillColor: '#3b82f6'
          });
        } else {
          window.ngoCircle = new google.maps.Circle({
            strokeColor: '#3b82f6',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#3b82f6',
            fillOpacity: 0.15,
            map: ngoMap,
            center: latLng,
            radius: 800
          });
        }

        // Re-draw listing markers & re-render feed based on new sorting
        loadDashboardData();
      }, null, 'btn-ngo-gps');
    });
  }
}

function refreshNgoMapMarkers(listings) {
  if (!ngoMap || !window.google || !window.google.maps) return;

  // Clear existing markers
  ngoMarkersList.forEach(m => m.setMap(null));
  ngoMarkersList = [];

  listings.forEach(l => {
    if (!l.lat || !l.lng) return;

    const marker = new google.maps.Marker({
      position: { lat: l.lat, lng: l.lng },
      map: ngoMap,
      title: l.title
    });

    const dist = ngoCurrentCoords ? calculateDistance(ngoCurrentCoords.lat, ngoCurrentCoords.lng, l.lat, l.lng) : null;
    const distanceText = dist !== null ? `<p style="margin: 0 0 6px 0; color: #10b981; font-weight:600;"><i class="fa-solid fa-location-arrow"></i> ${dist.toFixed(1)} km away</p>` : '';

    const infowindow = new google.maps.InfoWindow({
      content: `
        <div style="font-family: Inter; color: #1e293b; font-size:13px; max-width:200px;">
          <h4 style="margin: 0 0 6px 0; color: #10b981; font-weight:700;">${escapeHtml(l.title)}</h4>
          <p style="margin: 0 0 4px 0;"><b>Qty:</b> ${escapeHtml(l.quantity)}</p>
          <p style="margin: 0 0 4px 0; color: #64748b;">${escapeHtml(l.donorName)}</p>
          ${distanceText}
          <button style="background:#10b981; border:none; color:#0c1510; font-weight:600; padding:6px 12px; border-radius:4px; cursor:pointer; width:100%;" onclick="selectListingFromFeed('${l.id}')">
            View Details
          </button>
        </div>
      `
    });
    
    marker.addListener('click', () => {
      infowindow.open({
        anchor: marker,
        map: ngoMap
      });
      selectListingFromFeed(l.id);
    });

    ngoMarkersList.push(marker);
  });
}

function initTrackingRouteMap(donorCoords, ngoCoords, donorName, ngoName) {
  if (!window.google || !window.google.maps) return;

  const donorLatLng = { lat: donorCoords[0], lng: donorCoords[1] };

  if (trackMap) {
    trackMarkers.forEach(m => m.setMap(null));
    trackMarkers = [];
    if (trackRouteLine) {
      trackRouteLine.setMap(null);
      trackRouteLine = null;
    }
  } else {
    const mapDiv = document.getElementById('tracking-route-map');
    if (!mapDiv) return;
    trackMap = new google.maps.Map(mapDiv, {
      center: donorLatLng,
      zoom: 14,
      styles: MAP_STYLE_DARK,
      mapTypeControl: false,
      streetViewControl: false
    });
  }

  const donorMarker = new google.maps.Marker({
    position: donorLatLng,
    map: trackMap,
    title: `${donorName} (Origin)`
  });
  trackMarkers.push(donorMarker);

  const infoDonor = new google.maps.InfoWindow({
    content: `<div style="color:#1e293b; font-family:Inter; font-size:12px;"><b>${escapeHtml(donorName)}</b> (Donor Origin)</div>`
  });
  donorMarker.addListener('click', () => infoDonor.open(trackMap, donorMarker));

  if (ngoCoords) {
    const ngoLatLng = { lat: ngoCoords[0], lng: ngoCoords[1] };

    const ngoMarker = new google.maps.Marker({
      position: ngoLatLng,
      map: trackMap,
      title: `${ngoName} (Destination)`
    });
    trackMarkers.push(ngoMarker);

    const infoNgo = new google.maps.InfoWindow({
      content: `<div style="color:#1e293b; font-family:Inter; font-size:12px;"><b>${escapeHtml(ngoName)}</b> (NGO Destination)</div>`
    });
    ngoMarker.addListener('click', () => infoNgo.open(trackMap, ngoMarker));

    // Dotted routing line
    const lineSymbol = {
      path: 'M 0,-1 0,1',
      strokeOpacity: 1,
      scale: 3
    };

    trackRouteLine = new google.maps.Polyline({
      path: [donorLatLng, ngoLatLng],
      strokeColor: '#10b981',
      strokeOpacity: 0,
      icons: [{
        icon: lineSymbol,
        offset: '0',
        repeat: '15px'
      }],
      map: trackMap
    });

    const bounds = new google.maps.LatLngBounds();
    bounds.extend(donorLatLng);
    bounds.extend(ngoLatLng);
    trackMap.fitBounds(bounds);
  } else {
    trackMap.setCenter(donorLatLng);
    trackMap.setZoom(14);
  }
}

// --- SIMULATED DATABASE LAYER (LOCAL STORAGE fallback) ---
const SEED_USERS = [
  { id: "u_donor_1", email: "garden@cafe.com", name: "Green Garden Café", role: "donor", phone: "+91 98765 43210", address: "H-Block, Connaught Place, New Delhi", lat: 28.6304, lng: 77.2177 },
  { id: "u_donor_2", email: "fresh@market.com", name: "Fresh Mart Supermarket", role: "donor", phone: "+91 98765 01234", address: "Karol Bagh Metro Station, New Delhi", lat: 28.6448, lng: 77.1873 },
  { id: "u_ngo_1", email: "hope@foodbank.org", name: "Hope Food Bank", role: "ngo", phone: "+91 99999 11111", address: "Rajendra Place District Centre, New Delhi", lat: 28.6421, lng: 77.1782 },
  { id: "u_ngo_2", email: "share@care.org", name: "Care & Share Foundation", role: "ngo", phone: "+91 88888 22222", address: "KG Marg, Near India Gate, New Delhi", lat: 28.6129, lng: 77.2295 },
  { id: "u_admin_1", email: "admin@sharemeal.org", name: "Super Admin", role: "admin", phone: "+91 99999 99999", address: "Admin Head Office, CP, New Delhi", lat: 28.6139, lng: 77.2090 }
];

const SEED_LISTINGS = [
  { id: "l_1", donorId: "u_donor_1", donorName: "Green Garden Café", donorPhone: "+91 98765 43210", donorEmail: "garden@cafe.com", title: "Freshly Baked Sourdough Bread", description: "15 loaves of artisanal sourdough bread baked this morning. Perfect condition, unsold stock.", quantity: "15 loaves", expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), foodType: "Bakery", status: "available", address: "H-Block, Connaught Place, New Delhi", lat: 28.6304, lng: 77.2177, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { id: "l_2", donorId: "u_donor_2", donorName: "Fresh Mart Supermarket", donorPhone: "+91 98765 01234", donorEmail: "fresh@market.com", title: "Assorted Organic Apples & Bananas", description: "Around 12kg of ripe organic fruits. Packaged nicely, ready for distribution.", quantity: "12 kg", expiryTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), foodType: "Fruits/Vegetables", status: "requested", address: "Karol Bagh Metro Station, New Delhi", lat: 28.6448, lng: 77.1873, createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() },
  { id: "l_3", donorId: "u_donor_1", donorName: "Green Garden Café", donorPhone: "+91 98765 43210", donorEmail: "garden@cafe.com", title: "Vegetarian Pasta Trays", description: "5 trays of warm vegetable penne pasta. Surplus from a lunch corporate event.", quantity: "5 trays (approx. 25 servings)", expiryTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), foodType: "Cooked Meals", status: "delivered", address: "H-Block, Connaught Place, New Delhi", lat: 28.6304, lng: 77.2177, createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString() }
];

const SEED_PICKUPS = [
  { id: "p_1", listingId: "l_2", ngoId: "u_ngo_1", ngoName: "Hope Food Bank", status: "requested", scheduledTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), createdAt: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString() },
  { id: "p_2", listingId: "l_3", ngoId: "u_ngo_2", ngoName: "Care & Share Foundation", status: "delivered", scheduledTime: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString() }
];

const SEED_NOTIFS = [
  { id: "n_1", userId: "u_ngo_1", message: "New Food Listing: 'Freshly Baked Sourdough Bread' was posted nearby!", read: false, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { id: "n_2", userId: "u_donor_2", message: "Hope Food Bank has requested a pickup for your listing 'Assorted Organic Apples & Bananas'.", read: false, createdAt: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString() }
];

function initSimulatedDb() {
  if (!localStorage.getItem('sharemeal_sim_users')) {
    localStorage.setItem('sharemeal_sim_users', JSON.stringify(SEED_USERS));
    localStorage.setItem('sharemeal_sim_listings', JSON.stringify(SEED_LISTINGS));
    localStorage.setItem('sharemeal_sim_pickups', JSON.stringify(SEED_PICKUPS));
    localStorage.setItem('sharemeal_sim_notifications', JSON.stringify(SEED_NOTIFS));
  }
}

function handleSimulatedRequest(url, options) {
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : null;

  let users = JSON.parse(localStorage.getItem('sharemeal_sim_users'));
  let listings = JSON.parse(localStorage.getItem('sharemeal_sim_listings'));
  let pickups = JSON.parse(localStorage.getItem('sharemeal_sim_pickups'));
  let notifs = JSON.parse(localStorage.getItem('sharemeal_sim_notifications'));

  if (url === '/api/users') {
    return users.map(({ passwordHash, ...profile }) => profile);
  }

  if (url === '/api/auth/login') {
    const user = users.find(u => u.email.toLowerCase() === body.email.toLowerCase());
    if (!user) throw new Error('User not found');
    return user;
  }

  if (url === '/api/auth/register') {
    const existing = users.find(u => u.email.toLowerCase() === body.email.toLowerCase());
    if (existing) throw new Error('Email already registered');
    const newUser = { id: `u_${Date.now()}`, ...body };
    users.push(newUser);
    localStorage.setItem('sharemeal_sim_users', JSON.stringify(users));
    return newUser;
  }

  if (url === '/api/listings') {
    if (method === 'GET') return listings;
    if (method === 'POST') {
      const newL = {
        id: `l_${Date.now()}`,
        status: 'available',
        createdAt: new Date().toISOString(),
        ...body
      };
      listings.push(newL);
      localStorage.setItem('sharemeal_sim_listings', JSON.stringify(listings));
      
      const newNotif = {
        id: `n_${Date.now()}`,
        userId: 'all',
        message: `New Food Listing Available: "${newL.title}" (${newL.quantity}) listed by ${newL.donorName}.`,
        read: false,
        createdAt: new Date().toISOString()
      };
      notifs.unshift(newNotif);
      localStorage.setItem('sharemeal_sim_notifications', JSON.stringify(notifs));
      
      triggerSimulatedSocketAlert(newNotif);
      return newL;
    }
  }

  if (url.startsWith('/api/listings/') && url.endsWith('/ready')) {
    const parts = url.split('/');
    const listingId = parts[3];
    const l = listings.find(item => item.id === listingId);
    if (!l) throw new Error('Listing not found');

    const newNotif = {
      id: `n_${Date.now()}`,
      userId: 'all',
      message: `Donation Ready: "${l.title}" is ready for pickup at ${l.donorName}! Click to claim.`,
      read: false,
      createdAt: new Date().toISOString(),
      listingId: l.id
    };
    notifs.unshift(newNotif);
    localStorage.setItem('sharemeal_sim_notifications', JSON.stringify(notifs));
    triggerSimulatedSocketAlert(newNotif);
    return { success: true };
  }

  if (url === '/api/pickups') {
    if (method === 'GET') return pickups;
    if (method === 'POST') {
      const newP = {
        id: `p_${Date.now()}`,
        status: 'requested',
        createdAt: new Date().toISOString(),
        ...body
      };
      pickups.push(newP);
      
      const l = listings.find(item => item.id === body.listingId);
      if (l) l.status = 'requested';

      localStorage.setItem('sharemeal_sim_pickups', JSON.stringify(pickups));
      localStorage.setItem('sharemeal_sim_listings', JSON.stringify(listings));

      const newNotif = {
        id: `n_${Date.now()}`,
        userId: l ? l.donorId : 'all',
        message: `Pickup Requested: NGO "${newP.ngoName}" has requested to pick up your listing "${l ? l.title : ''}".`,
        read: false,
        createdAt: new Date().toISOString()
      };
      notifs.unshift(newNotif);
      localStorage.setItem('sharemeal_sim_notifications', JSON.stringify(notifs));
      
      triggerSimulatedSocketAlert(newNotif);
      return newP;
    }
  }

  if (url.startsWith('/api/pickups/') && url.endsWith('/status')) {
    const parts = url.split('/');
    const pickupId = parts[3];
    const status = body.status;

    const p = pickups.find(item => item.id === pickupId);
    if (!p) throw new Error('Pickup not found');
    p.status = status;

    const l = listings.find(item => item.id === p.listingId);
    if (l) l.status = status;

    localStorage.setItem('sharemeal_sim_pickups', JSON.stringify(pickups));
    localStorage.setItem('sharemeal_sim_listings', JSON.stringify(listings));

    const statusLabels = {
      'picked_up': 'has been Picked Up / En Route',
      'delivered': 'has been marked Delivered / Completed'
    };
    const label = statusLabels[status] || `status updated to ${status}`;

    const donorNotif = {
      id: `n_d_${Date.now()}`,
      userId: l.donorId,
      message: `Donation Tracking Update: "${l.title}" ${label}.`,
      read: false,
      createdAt: new Date().toISOString()
    };
    const ngoNotif = {
      id: `n_n_${Date.now()}`,
      userId: p.ngoId,
      message: `Donation Tracking Update: "${l.title}" ${label}.`,
      read: false,
      createdAt: new Date().toISOString()
    };
    
    notifs.unshift(donorNotif);
    notifs.unshift(ngoNotif);
    localStorage.setItem('sharemeal_sim_notifications', JSON.stringify(notifs));

    triggerSimulatedSocketAlert(currentUser.id === l.donorId ? donorNotif : ngoNotif);
    return { pickup: p, listing: l };
  }

  if (url.startsWith('/api/notifications/')) {
    const parts = url.split('/');
    const targetUserId = parts[3];

    if (targetUserId === 'read') {
      const actualUserId = parts[2];
      notifs.forEach(n => {
        if (n.userId === actualUserId || n.userId === 'all') n.read = true;
      });
      localStorage.setItem('sharemeal_sim_notifications', JSON.stringify(notifs));
      return { success: true };
    }

    return notifs.filter(n => n.userId === targetUserId || n.userId === 'all');
  }

  throw new Error('Endpoint mock not found');
}

function simulateNgoClaimFlow(listingTitle) {
  if (!currentUser) return;
  let listings = JSON.parse(localStorage.getItem('sharemeal_sim_listings'));
  let pickups = JSON.parse(localStorage.getItem('sharemeal_sim_pickups'));
  let notifs = JSON.parse(localStorage.getItem('sharemeal_sim_notifications'));

  const l = listings.find(item => item.title === listingTitle && item.status === 'available');
  if (!l) return;

  l.status = 'requested';

  const newP = {
    id: `p_${Date.now()}`,
    listingId: l.id,
    ngoId: 'u_ngo_1',
    ngoName: 'Hope Food Bank',
    status: 'requested',
    scheduledTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString()
  };
  pickups.push(newP);

  const newNotif = {
    id: `n_${Date.now()}`,
    userId: currentUser.id,
    message: `Pickup Requested: NGO "Hope Food Bank" has requested to pick up your listing "${l.title}".`,
    read: false,
    createdAt: new Date().toISOString()
  };
  notifs.unshift(newNotif);

  localStorage.setItem('sharemeal_sim_listings', JSON.stringify(listings));
  localStorage.setItem('sharemeal_sim_pickups', JSON.stringify(pickups));
  localStorage.setItem('sharemeal_sim_notifications', JSON.stringify(notifs));

  triggerSimulatedSocketAlert(newNotif);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  const date = new Date(isoStr);
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatTimeAgo(isoStr) {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  const seconds = Math.floor((new Date() - date) / 1000);

  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return interval + 'y ago';
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return interval + 'mo ago';
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return interval + 'd ago';
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return interval + 'h ago';
  interval = Math.floor(seconds / 60);
  if (interval >= 1) return interval + 'm ago';
  return 'just now';
}
