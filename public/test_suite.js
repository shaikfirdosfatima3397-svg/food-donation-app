// ==========================================
// ShareMeal - Automated Browser Test Suite
// ==========================================

(function() {
  // Check if testing mode is enabled via URL query parameter: ?test=true or ?run_tests=true
  const urlParams = new URLSearchParams(window.location.search);
  const runTests = urlParams.get('test') === 'true' || urlParams.get('run_tests') === 'true';

  if (!runTests) return;

  console.log("🧪 ShareMeal Automated Test Suite detected! Injecting Test Runner UI...");

  // 1. Inject Test Runner styles dynamically
  const style = document.createElement('style');
  style.innerHTML = `
    .test-runner-panel {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 380px;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(99, 102, 241, 0.4);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 20px rgba(99, 102, 241, 0.2);
      border-radius: 12px;
      z-index: 99999;
      font-family: 'Inter', sans-serif;
      color: #f8fafc;
      overflow: hidden;
      backdrop-filter: blur(16px);
      transition: all 0.3s ease;
    }
    .test-runner-header {
      background: linear-gradient(135deg, #4f46e5, #6366f1);
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.5px;
    }
    .test-runner-header h3 {
      margin: 0;
      font-family: 'Outfit', sans-serif;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .test-runner-body {
      padding: 16px;
      max-height: 350px;
      overflow-y: auto;
    }
    .test-step {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 13px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .test-step:last-child {
      border-bottom: none;
    }
    .step-label {
      color: #cbd5e1;
    }
    .step-status {
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      text-transform: uppercase;
    }
    .status-pending {
      background: rgba(255, 255, 255, 0.05);
      color: #94a3b8;
    }
    .status-running {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      animation: pulse-orange 1.5s infinite;
    }
    .status-passed {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
    }
    .status-failed {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
    }
    .test-runner-footer {
      padding: 12px 16px;
      background: rgba(0, 0, 0, 0.3);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
    .test-btn {
      background: #10b981;
      color: #0c1510;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-weight: 700;
      cursor: pointer;
      font-size: 12px;
    }
    .test-btn:hover {
      background: #059669;
    }
    @keyframes pulse-orange {
      0% { opacity: 0.6; }
      50% { opacity: 1; }
      100% { opacity: 0.6; }
    }
    .test-success-banner {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 10px;
      border-radius: 6px;
      color: #10b981;
      text-align: center;
      font-weight: 600;
      margin-top: 10px;
      font-size: 13px;
      display: none;
    }
  `;
  document.head.appendChild(style);

  // 2. Create and inject Test Runner HTML
  const runner = document.createElement('div');
  runner.className = 'test-runner-panel';
  runner.innerHTML = `
    <div class="test-runner-header">
      <h3><i class="fa-solid fa-flask"></i> ShareMeal Test Runner</h3>
      <button class="test-btn" id="start-test-btn">Run Tests</button>
    </div>
    <div class="test-runner-body">
      <div class="test-step" id="step-0">
        <span class="step-label">1. Clear storage & Seed DB</span>
        <span class="step-status status-pending">Pending</span>
      </div>
      <div class="test-step" id="step-1">
        <span class="step-label">2. Register new Donor profile</span>
        <span class="step-status status-pending">Pending</span>
      </div>
      <div class="test-step" id="step-2">
        <span class="step-label">3. Log in Donor Account</span>
        <span class="step-status status-pending">Pending</span>
      </div>
      <div class="test-step" id="step-3">
        <span class="step-label">4. Publish Surplus food listing</span>
        <span class="step-status status-pending">Pending</span>
      </div>
      <div class="test-step" id="step-4">
        <span class="step-label">5. Log out & Log in NGO account</span>
        <span class="step-status status-pending">Pending</span>
      </div>
      <div class="test-step" id="step-5">
        <span class="step-label">6. Search available Map Listing & Claim</span>
        <span class="step-status status-pending">Pending</span>
      </div>
      <div class="test-step" id="step-6">
        <span class="step-label">7. Track delivery timeline states</span>
        <span class="step-status status-pending">Pending</span>
      </div>
      <div class="test-success-banner" id="test-success-banner">
        🎉 ALL TESTS PASSED SUCCESSFULLY!
      </div>
    </div>
    <div class="test-runner-footer">
      <span>Auto-testing active</span>
      <a href="?" style="color: #64748b; font-size:11px;">Exit Test Mode</a>
    </div>
  `;
  document.body.appendChild(runner);

  // Bind runner action
  document.getElementById('start-test-btn').addEventListener('click', () => {
    document.getElementById('start-test-btn').disabled = true;
    document.getElementById('start-test-btn').textContent = "Running...";
    executeTestSuite();
  });

  // Helper Sleep function
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Assert Helper
  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || "Assertion failed");
    }
  }

  // Update visual state of a step
  function updateStep(index, status, textContent) {
    const stepEl = document.getElementById(`step-${index}`);
    if (!stepEl) return;
    const statusEl = stepEl.querySelector('.step-status');
    statusEl.className = `step-status status-${status}`;
    statusEl.textContent = textContent || status;
  }

  // Main Test Runner Pipeline
  async function executeTestSuite() {
    try {
      // ----------------------------------------
      // TEST STEP 0: Clear session & Reset DB
      // ----------------------------------------
      updateStep(0, 'running', 'Resetting...');
      await sleep(1000);
      
      // Clear sessions
      localStorage.removeItem('sharemeal_user');
      localStorage.removeItem('sharemeal_user_sim');
      // If simulated, re-initialize database seeds
      if (typeof initSimulatedDb === 'function') {
        localStorage.removeItem('sharemeal_sim_users');
        localStorage.removeItem('sharemeal_sim_listings');
        localStorage.removeItem('sharemeal_sim_pickups');
        localStorage.removeItem('sharemeal_sim_notifications');
        initSimulatedDb();
      }
      
      // Perform logouts if logged in
      if (typeof handleLogout === 'function' && currentUser) {
        handleLogout();
      } else {
        setupLoggedOutUI();
        showSection('home-section');
      }
      
      updateStep(0, 'passed', 'Reset Done');

      // ----------------------------------------
      // TEST STEP 1: Register New Donor Profile
      // ----------------------------------------
      updateStep(1, 'running', 'Registering...');
      await sleep(1500);

      // Open Auth section, switch to Register
      showSection('auth-section');
      switchAuthTab('register');
      await sleep(1000);

      // Fill in register form
      const donorEmail = `donor_${Date.now()}@testcafe.com`;
      document.getElementById('role-donor').checked = true;
      document.getElementById('reg-name').value = 'Automated Test Bistro';
      document.getElementById('reg-email').value = donorEmail;
      document.getElementById('reg-phone').value = '555-6677';
      document.getElementById('reg-password').value = 'password123';
      document.getElementById('reg-address').value = 'Market Square Bistro, Connaught Place, New Delhi';

      // Pin coordinates click simulation
      document.getElementById('reg-lat').textContent = '28.6304';
      document.getElementById('reg-lng').textContent = '77.2177';

      await sleep(1500);

      // Submit registration form
      document.getElementById('register-form').dispatchEvent(new Event('submit'));
      await sleep(1500);

      // Verify redirection to Login view
      assert(document.getElementById('login-form').classList.contains('active'), 'Form should redirect to Login tab');
      updateStep(1, 'passed', 'Registered');

      // ----------------------------------------
      // TEST STEP 2: Log in Donor Account
      // ----------------------------------------
      updateStep(2, 'running', 'Logging in...');
      await sleep(1000);

      // Fill login form
      document.getElementById('login-email').value = donorEmail;
      document.getElementById('login-password').value = 'password123';
      await sleep(1000);

      // Click login
      document.getElementById('login-form').dispatchEvent(new Event('submit'));
      await sleep(1500);

      // Assert login details
      assert(currentUser !== null, 'currentUser session must be populated');
      assert(currentUser.role === 'donor', 'Role must be donor');
      assert(currentUser.email === donorEmail, 'Email must match registered email');
      updateStep(2, 'passed', 'Logged In');

      // ----------------------------------------
      // TEST STEP 3: Publish Surplus Food Listing
      // ----------------------------------------
      updateStep(3, 'running', 'Listing...');
      await sleep(1500);

      // Go to Donor Dashboard (it should have loaded, but force route)
      showSection('dashboard-section');
      await sleep(1000);

      // Fill listing details
      const listingTitle = `Test Donuts Surplus - ${Date.now()}`;
      document.getElementById('list-title').value = listingTitle;
      document.getElementById('list-type').value = 'Bakery';
      document.getElementById('list-qty').value = '36 glazed donuts';
      
      // Expiry: set to tomorrow
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const formatOffset = tomorrow.getTime() - (tomorrow.getTimezoneOffset() * 60000);
      document.getElementById('list-expiry').value = new Date(formatOffset).toISOString().slice(0, 16);
      
      document.getElementById('list-desc').value = 'Assorted fresh glazed donuts from closing inventory. Kept boxed.';
      document.getElementById('list-address').value = 'Market Square Bistro, Connaught Place, New Delhi';
      document.getElementById('list-lat').textContent = '28.6304';
      document.getElementById('list-lng').textContent = '77.2177';

      await sleep(2000);

      // Submit new listing form
      document.getElementById('new-listing-form').dispatchEvent(new Event('submit'));
      await sleep(2000);

      // Verify listing shows in table/listings
      const listingObj = allListings.find(l => l.title === listingTitle);
      assert(listingObj !== undefined, 'New food listing should be inside allListings database');
      assert(listingObj.status === 'available', 'Status of new listing must be available');
      
      // Verify Toast Alert appeared
      const toastsHTML = document.getElementById('toast-container').innerHTML;
      assert(toastsHTML.includes('Successfully listed') || toastsHTML.includes('Published'), 'Toast notification should alert donor');

      updateStep(3, 'passed', 'Listed & Alerted');

      // ----------------------------------------
      // TEST STEP 4: Log out & Log in NGO account
      // ----------------------------------------
      updateStep(4, 'running', 'Switching role...');
      await sleep(1500);

      // Log out
      handleLogout();
      await sleep(1000);

      // Open login form
      showSection('auth-section');
      switchAuthTab('login');
      await sleep(1000);

      // Log in as NGO
      document.getElementById('login-email').value = 'hope@foodbank.org';
      document.getElementById('login-password').value = 'ngo123';
      await sleep(1000);

      document.getElementById('login-form').dispatchEvent(new Event('submit'));
      await sleep(1500);

      // Assert NGO user active
      assert(currentUser !== null, 'NGO session must be populated');
      assert(currentUser.role === 'ngo', 'Role must be NGO');
      updateStep(4, 'passed', 'NGO Logged In');

      // ----------------------------------------
      // TEST STEP 5: Search Map & Request Claim
      // ----------------------------------------
      updateStep(5, 'running', 'Claiming food...');
      await sleep(1500);

      // Route to NGO dashboard
      showSection('dashboard-section');
      await sleep(1000);

      // Select listing from feed
      const claimedListing = allListings.find(l => l.title === listingTitle);
      assert(claimedListing !== undefined, 'Food listing must be available to browse');

      selectListingFromFeed(claimedListing.id);
      await sleep(1500);

      // Assert detail panel matches
      assert(document.getElementById('panel-title').textContent === listingTitle, 'Details panel title must match listing');
      assert(document.getElementById('panel-quantity').textContent === '36 glazed donuts', 'Details quantity must match listing');

      // Request pickup
      document.getElementById('request-pickup-form').dispatchEvent(new Event('submit'));
      await sleep(2000);

      // Assert claim success (status shifts to requested)
      const updatedListing = allListings.find(l => l.id === claimedListing.id);
      assert(updatedListing.status === 'requested', 'Listing status must change to requested');
      
      // Assert pickup object exists in database
      const pickupObj = allPickups.find(p => p.listingId === claimedListing.id);
      assert(pickupObj !== undefined, 'Pickup record should be created');

      updateStep(5, 'passed', 'Claimed');

      // ----------------------------------------
      // TEST STEP 6: Live Tracking Timeline
      // ----------------------------------------
      updateStep(6, 'running', 'Tracking...');
      await sleep(1500);

      // Open Live tracking modal
      openTrackingModal(claimedListing.id, pickupObj.id);
      await sleep(2000);

      // Assert timeline step status requested is active
      assert(document.getElementById('step-requested').classList.contains('active'), 'Timeline status Requested step must be active');
      assert(!document.getElementById('tracking-modal').classList.contains('hidden'), 'Tracking modal must be visible');

      // Click "Mark Picked Up & En Route"
      const actionButton1 = document.getElementById('tracking-action-panel').querySelector('button');
      assert(actionButton1 !== null, 'Action button for pickup update must exist');
      actionButton1.click();
      await sleep(2000);

      // Assert state updated to picked_up
      const pickedPickup = allPickups.find(p => p.id === pickupObj.id);
      assert(pickedPickup.status === 'picked_up', 'Pickup status must change to picked_up');

      // Re-open tracking modal to verify next action
      openTrackingModal(claimedListing.id, pickupObj.id);
      await sleep(1500);
      assert(document.getElementById('step-picked_up').classList.contains('active'), 'Timeline step En Route must be active');

      // Click "Mark Delivered"
      const actionButton2 = document.getElementById('tracking-action-panel').querySelector('button');
      assert(actionButton2 !== null, 'Action button for delivery update must exist');
      actionButton2.click();
      await sleep(2000);

      // Assert state updated to delivered
      const deliveredListing = allListings.find(l => l.id === claimedListing.id);
      assert(deliveredListing.status === 'delivered', 'Listing status must change to delivered');

      updateStep(6, 'passed', 'Delivered');

      // Show final success banner
      document.getElementById('test-success-banner').style.display = 'block';
      document.getElementById('start-test-btn').textContent = "Tests Passed";
      document.getElementById('start-test-btn').style.background = "#10b981";

    } catch (err) {
      console.error("❌ TEST FAILURE:", err);
      // Highlight the failing step
      const runningStep = document.querySelector('.test-step .status-running');
      if (runningStep) {
        runningStep.className = 'step-status status-failed';
        runningStep.textContent = 'Failed';
      }
      showToast('Test Suite Failed', err.message, 'danger');
      document.getElementById('start-test-btn').textContent = "Failed";
      document.getElementById('start-test-btn').style.background = "#ef4444";
    }
  }
})();
