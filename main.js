import pako from 'pako';
import qrGenerator from 'qrcode-generator';

// --- STATE MANAGEMENT ---
let menuData = [];
let nextSectionId = 1;
let nextItemId = 1;
let ipHash = ''; // To store the hashed IP address
// let _isWasmReady = false;

const QR_PAYLOAD_LIMIT = 2000; // Common URL length limit for QR codes

// --- DOM REFERENCES ---
// const app = document.getElementById('app');
const addSectionBtn = document.getElementById('add-section-btn');
const menuSectionsContainer = document.getElementById('menu-sections');
const previewIframe = document.getElementById('preview-iframe');
const sizeDisplay = document.getElementById('size-display');
const sizeWarning = document.getElementById('size-warning');
const qrCodeImg = document.getElementById('qr-code-img');
const qrCodePlaceholder = document.getElementById('qr-code-placeholder');
const saveJsonBtn = document.getElementById('save-json-btn');
const loadJsonBtn = document.getElementById('load-json-btn');
const jsonFileInput = document.getElementById('json-file-input');

// --- CRYPTO HELPERS ---

/**
 * Derives a 256-bit AES key from a string (the timestamp).
 * @param {string} secretString - The string to derive the key from.
 * @returns {Promise<CryptoKey>} The derived CryptoKey.
 */
async function deriveKey(secretString) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretString),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('static-menu-qr-salt'), // A static salt
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a string using AES-GCM.
 * @param {string} plaintext - The text to encrypt.
 * @param {string} secretString - The secret string (timestamp) to derive the key from.
 * @returns {Promise<string>} A base64 string containing the IV and the encrypted data.
 */
async function encryptIP(plaintext, secretString) {
  const key = await deriveKey(secretString);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // GCM recommended IV size
  const encryptedData = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    new TextEncoder().encode(plaintext)
  );

  // Prepend IV to the encrypted data for use during decryption
  const combined = new Uint8Array(iv.length + encryptedData.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedData), iv.length);

  // Return as a base64 string
  return btoa(String.fromCharCode.apply(null, combined));
}

// --- CORE FUNCTIONS ---

/**
 * Renders the entire menu editor UI based on the menuData state.
 */
function renderMenuEditor() {
  menuSectionsContainer.innerHTML = ''; // Clear existing sections

  if (menuData.length === 0) {
    menuSectionsContainer.innerHTML =
      '<p>No sections yet. Click "Add Section" to get started!</p>';
  }

  menuData.forEach((section) => {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'menu-section';
    sectionEl.dataset.sectionId = section.id;

    sectionEl.innerHTML = `
      <div class="menu-section-header">
        <input type="text" class="section-name-input" placeholder="Section Name (e.g., Appetizers)" value="${section.name}">
        <button class="delete-section-btn" title="Delete Section"><i class="fas fa-trash"></i> Delete Section</button>
      </div>
      <div class="menu-items">
        <!-- Menu items will be rendered here -->
      </div>
      <button class="add-item-btn"><i class="fas fa-plus"></i> Add Menu Item</button>
    `;

    const itemsContainer = sectionEl.querySelector('.menu-items');
    section.items.forEach((item) => {
      const itemEl = createItemElement(item);
      itemsContainer.appendChild(itemEl);
    });

    menuSectionsContainer.appendChild(sectionEl);
  });
  updatePreview();
}

/**
 * Creates a DOM element for a single menu item.
 * @param {object} item - The item object from menuData.
 * @returns {HTMLElement} The created DOM element.
 */
function createItemElement(item) {
  const itemEl = document.createElement('div');
  itemEl.className = 'menu-item';
  itemEl.dataset.itemId = item.id;

  itemEl.innerHTML = `
        <input type="text" class="item-name-input" placeholder="Item Name (e.g., Calamari)" value="${item.name}">
        <input type="text" class="item-price-input" placeholder="Price (e.g., $12.99)" value="${item.price}">
        <button class="delete-btn delete-item-btn" title="Delete Item"><i class="fas fa-times"></i></button>
        <input type="text" class="item-desc-input" placeholder="Description (e.g., served with marinara sauce)" value="${item.description}">
    `;
  return itemEl;
}

/**
 * Updates the preview pane (iframe, size counter, QR code).
 */
async function updatePreview() {
  const url = await generateMenuURL();

  // Update the iframe to show a true preview of the customer page
  previewIframe.src = url || 'about:blank';

  const byteSize = url.length;

  sizeDisplay.textContent = `${byteSize} characters`;
  sizeWarning.hidden = byteSize <= QR_PAYLOAD_LIMIT;

  if (menuData.length > 0 && byteSize <= QR_PAYLOAD_LIMIT) {
    generateQRCode(url);
    qrCodeImg.hidden = false;
    qrCodePlaceholder.style.display = 'none';
  } else {
    qrCodeImg.src = '';
    qrCodeImg.hidden = true;
    qrCodePlaceholder.style.display = 'flex'; // Use flex for centering icon and text
    const placeholderText = qrCodePlaceholder.querySelector('p');
    if (byteSize > QR_PAYLOAD_LIMIT) {
      placeholderText.textContent = 'Menu is too large for a QR Code.';
    } else {
      placeholderText.textContent = 'Your QR code will appear here.';
    }
  }

  // Show the raw link in development for easier testing
  if (import.meta.env.DEV) {
    const devLinkContainer = document.getElementById('dev-link-container');
    const devLink = document.getElementById('dev-menu-link');
    if (url) {
      devLink.href = url;
      devLink.textContent = url;
      devLinkContainer.style.display = 'block';
    } else {
      devLinkContainer.style.display = 'none';
    }
  }
}

/**
 * Generates a compressed, URL-safe data string from the menu data and builds a URL.
 * @returns {string} The full URL for the menu viewer.
 */
async function generateMenuURL() {
  if (menuData.length === 0) {
    return '';
  }

  // 1. Fetch IP and create timestamp
  const timestamp = new Date().toISOString();
  let ipAddress = 'ip_not_available';
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    if (response.ok) {
      const data = await response.json();
      ipAddress = data.ip;
    }
  } catch (error) {
    console.error('Could not fetch IP address:', error);
  }

  // 2. Encrypt IP using the timestamp
  const encryptedIP = await encryptIP(ipAddress, timestamp);

  // 3. Create a new payload object that includes metadata
  const payload = {
    menu: menuData,
    meta: {
      ts: timestamp, // Timestamp of creation (also the key)
      eid: encryptedIP, // Encrypted IP address
    },
  };

  // 4. Stringify JSON
  const jsonString = JSON.stringify(payload);

  // 5. Compress
  const compressed = pako.deflate(jsonString);

  // 6. Encode to URL-safe base64
  // btoa is safe for this as the output of pako is a string-like Uint8Array
  const base64 = btoa(String.fromCharCode.apply(null, compressed));
  const urlSafeBase64 = base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // 7. Build URL
  const viewerUrl = new URL('menu.html', window.location.href).href;
  return `${viewerUrl}?data=${urlSafeBase64}`;
}

/**
 * Generates a QR code from the menu URL.
 * @param {string} url - The menu URL string.
 */
function generateQRCode(url) {
  try {
    const typeNumber = 0; // 0 = auto-detect
    const errorCorrectionLevel = 'L'; // Low, allows for longer URLs
    const qr = qrGenerator(typeNumber, errorCorrectionLevel);
    qr.addData(url);
    qr.make();
    qrCodeImg.src = qr.createDataURL(10, 5); // (cellSize, margin)
  } catch (err) {
    console.error('Error generating QR code:', err);
    const placeholderText = qrCodePlaceholder.querySelector('p');
    placeholderText.textContent = 'Could not generate QR code.';
    qrCodeImg.hidden = true;
    qrCodePlaceholder.style.display = 'flex';
  }
}

// --- EVENT LISTENERS ---

addSectionBtn.addEventListener('click', () => {
  const newSection = {
    id: `section-${nextSectionId++}`,
    name: '',
    items: [],
  };
  menuData.push(newSection);
  renderMenuEditor();
  updatePreview();
});

menuSectionsContainer.addEventListener('click', (e) => {
  const target = e.target;
  const button = target.closest('button'); // More robust way to get the button
  if (!button) return;

  if (button.classList.contains('delete-section-btn')) {
    const sectionEl = button.closest('.menu-section');
    sectionEl.classList.add('hiding');
    sectionEl.addEventListener(
      'animationend',
      () => {
        const sectionId = sectionEl.dataset.sectionId;
        menuData = menuData.filter((section) => section.id !== sectionId);
        renderMenuEditor();
        updatePreview();
      },
      { once: true }
    );
  }

  if (button.classList.contains('add-item-btn')) {
    const sectionId = button.closest('.menu-section').dataset.sectionId;
    const section = menuData.find((s) => s.id === sectionId);
    const newItem = {
      id: `item-${nextItemId++}`,
      name: '',
      price: '',
      description: '',
    };
    section.items.push(newItem);

    // Don't re-render everything, just add the new item element
    const itemsContainer = button.previousElementSibling;
    const itemEl = createItemElement(newItem);
    itemsContainer.appendChild(itemEl);
    updatePreview();
  }

  if (button.classList.contains('delete-item-btn')) {
    const itemEl = button.closest('.menu-item');
    itemEl.classList.add('hiding');

    itemEl.addEventListener(
      'animationend',
      () => {
        const sectionEl = button.closest('.menu-section');
        const sectionId = sectionEl.dataset.sectionId;
        const itemId = itemEl.dataset.itemId;

        const section = menuData.find((s) => s.id === sectionId);
        section.items = section.items.filter((item) => item.id !== itemId);

        itemEl.remove(); // Remove from DOM
        updatePreview();
      },
      { once: true }
    );
  }
});

menuSectionsContainer.addEventListener('input', (e) => {
  const target = e.target;
  const sectionEl = target.closest('.menu-section');
  if (!sectionEl) return;
  const sectionId = sectionEl.dataset.sectionId;
  const section = menuData.find((s) => s.id === sectionId);

  if (target.classList.contains('section-name-input')) {
    section.name = target.value;
  }

  if (
    target.classList.contains('item-name-input') ||
    target.classList.contains('item-price-input') ||
    target.classList.contains('item-desc-input')
  ) {
    const itemEl = target.closest('.menu-item');
    const itemId = itemEl.dataset.itemId;
    const item = section.items.find((i) => i.id === itemId);

    if (target.classList.contains('item-name-input')) item.name = target.value;
    if (target.classList.contains('item-price-input'))
      item.price = target.value;
    if (target.classList.contains('item-desc-input'))
      item.description = target.value;
  }

  updatePreview();
});

saveJsonBtn.addEventListener('click', () => {
  if (menuData.length === 0) {
    alert('Menu is empty. Nothing to save.');
    return;
  }
  const jsonString = JSON.stringify(menuData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'menu.json';
  a.click();
  URL.revokeObjectURL(url);
});

loadJsonBtn.addEventListener('click', () => {
  jsonFileInput.click();
});

jsonFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      // Basic validation
      if (
        Array.isArray(data) &&
        data.every(
          (s) => s.id && s.name !== undefined && Array.isArray(s.items)
        )
      ) {
        menuData = data;
        // Ensure next IDs are higher than any in the loaded file to prevent collisions
        const maxSectionId = Math.max(
          0,
          ...data.map((s) => parseInt(s.id.split('-')[1] || 0))
        );
        const allItems = data.flatMap((s) => s.items);
        const maxItemId = Math.max(
          0,
          ...allItems.map((i) => parseInt(i.id.split('-')[1] || 0))
        );
        nextSectionId = maxSectionId + 1;
        nextItemId = maxItemId + 1;
        renderMenuEditor();
        updatePreview();
      } else {
        alert('Invalid or corrupted JSON file.');
      }
    } catch (err) {
      alert('Error reading JSON file: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // Reset for next load
});

// --- UTILITY FUNCTIONS ---

/*
const escapeHTML = (str) => {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function (match) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        }[match];
    });
};
*/

// --- INITIALIZATION ---

function init() {
  renderMenuEditor();
  updatePreview();
}

init();
