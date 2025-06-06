import pako from 'pako';
import qrGenerator from 'qrcode-generator';

// --- STATE MANAGEMENT ---
let menuData = {
  title: '',
  sections: [],
};
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
const menuTitleInput = document.getElementById('menu-title-input');

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

// --- UI RENDERING ---

/**
 * Creates a DOM element for a single menu item.
 * @param {object} item - The item object from menuData.
 * @returns {HTMLElement} The created item element.
 */
function createItemElement(item) {
  const itemEl = document.createElement('div');
  itemEl.className = 'menu-item';
  itemEl.dataset.itemId = item.id;

  itemEl.innerHTML = `
    <input type="text" class="item-name-input" placeholder="Item Name" value="${
      item.name
    }">
    <input type="text" class="item-price-input" placeholder="Price" value="${
      item.price
    }">
    <textarea class="item-desc-input" placeholder="Description">${
      item.description
    }</textarea>
    <div class="item-image-container">
      <label for="item-image-${
        item.id
      }" class="item-image-label">Add Image</label>
      <input type="file" id="item-image-${
        item.id
      }" class="item-image-input" accept="image/jpeg, image/png, image/gif">
      <div class="item-image-preview">
        ${
          item.image
            ? `<img src="${item.image}" alt="Preview"><button class="remove-image-btn" title="Remove Image">&times;</button>`
            : '<span>No Image</span>'
        }
      </div>
    </div>
    <button class="delete-item-btn" title="Delete Item"><i class="fas fa-trash"></i></button>
  `;
  return itemEl;
}

/**
 * Creates a new menu section element for the editor.
 * @param {object} section - The section object from menuData.
 * @returns {HTMLElement} The created DOM element.
 */
function createSectionElement(section) {
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

  return sectionEl;
}

// --- CORE FUNCTIONS ---

/**
 * Renders the entire menu editor UI based on the menuData state.
 */
function renderMenuEditor() {
  menuSectionsContainer.innerHTML = ''; // Clear existing sections

  if (menuData.sections.length === 0) {
    menuSectionsContainer.innerHTML =
      '<p>No sections yet. Click "Add Section" to get started!</p>';
  }

  menuData.sections.forEach((section) => {
    const sectionEl = createSectionElement(section);
    menuSectionsContainer.appendChild(sectionEl);
  });
  updatePreview();
}

/**
 * Updates the preview iframe and QR code based on the current menu data.
 */
async function updatePreview() {
  const url = await generateMenuURL();

  // Use postMessage to update the iframe's content securely
  if (previewIframe.contentWindow) {
    previewIframe.contentWindow.postMessage({ type: 'loadMenu', url: url }, '*');
  }

  const byteSize = url.length;

  sizeDisplay.textContent = `${byteSize} characters`;
  sizeWarning.hidden = byteSize <= QR_PAYLOAD_LIMIT;

  if (menuData.sections.length > 0 && byteSize <= QR_PAYLOAD_LIMIT) {
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
  if (menuData.sections.length === 0 && !menuData.title) {
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
    v: 2, // Add a version number for future compatibility
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
  return `${viewerUrl}#data=${urlSafeBase64}`;
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
  menuData.sections.push(newSection);
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
        menuData.sections = menuData.sections.filter((section) => section.id !== sectionId);
        renderMenuEditor();
        updatePreview();
      },
      { once: true }
    );
  }

  if (button.classList.contains('add-item-btn')) {
    const sectionId = button.closest('.menu-section').dataset.sectionId;
    const section = menuData.sections.find((s) => s.id === sectionId);
    const newItem = {
      id: `item-${nextItemId++}`,
      name: '',
      price: '',
      description: '',
      image: null,
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

        const section = menuData.sections.find((s) => s.id === sectionId);
        section.items = section.items.filter((item) => item.id !== itemId);

        itemEl.remove(); // Remove from DOM
        updatePreview();
      },
      { once: true }
    );
  }

  if (button.classList.contains('remove-image-btn')) {
    const itemEl = button.closest('.menu-item');
    const sectionEl = button.closest('.menu-section');
    const sectionId = sectionEl.dataset.sectionId;
    const itemId = itemEl.dataset.itemId;
    const section = menuData.sections.find((s) => s.id === sectionId);
    const item = section.items.find((i) => i.id === itemId);

    item.image = null;
    // Re-render just this item's preview
    const previewContainer = itemEl.querySelector('.item-image-preview');
    previewContainer.innerHTML = '<span>No Image</span>';
    updatePreview();
  }
});

menuSectionsContainer.addEventListener('input', (e) => {
  const target = e.target;
  const sectionEl = target.closest('.menu-section');
  if (!sectionEl) return;
  const sectionId = sectionEl.dataset.sectionId;
  const section = menuData.sections.find((s) => s.id === sectionId);

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

menuSectionsContainer.addEventListener('change', async (e) => {
  if (e.target.classList.contains('item-image-input')) {
    const file = e.target.files[0];
    if (!file) return;

    const MAX_SIZE_KB = 100;
    if (file.size > MAX_SIZE_KB * 1024) {
      alert(
        `Image is too large. Please select an image smaller than ${MAX_SIZE_KB}KB.`
      );
      e.target.value = ''; // Reset file input
      return;
    }

    const itemEl = e.target.closest('.menu-item');
    const sectionEl = e.target.closest('.menu-section');
    const sectionId = sectionEl.dataset.sectionId;
    const itemId = itemEl.dataset.itemId;
    const section = menuData.sections.find((s) => s.id === sectionId);
    const item = section.items.find((i) => i.id === itemId);

    // Read and encode the file
    try {
      const base64String = await readFileAsBase64(file);
      item.image = base64String;

      // Update the preview
      const previewContainer = itemEl.querySelector('.item-image-preview');
      previewContainer.innerHTML = `<img src="${base64String}" alt="Preview"><button class="remove-image-btn" title="Remove Image">&times;</button>`;
      updatePreview();
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Could not read the image file.');
    }
  }
});

menuTitleInput.addEventListener('input', (e) => {
  menuData.title = e.target.value;
  updatePreview();
});

saveJsonBtn.addEventListener('click', () => {
  if (menuData.sections.length === 0) {
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
        typeof data === 'object' &&
        data.title !== undefined &&
        Array.isArray(data.sections)
      ) {
        menuData = data;
        // Ensure next IDs are higher than any in the loaded file to prevent collisions
        const allSections = data.sections || [];
        const maxSectionId = Math.max(
          0,
          ...allSections.map((s) => parseInt(s.id.split('-')[1] || 0))
        );
        const allItems = allSections.flatMap((s) => s.items);
        const maxItemId = Math.max(
          0,
          ...allItems.map((i) => parseInt(i.id.split('-')[1] || 0))
        );
        nextSectionId = maxSectionId + 1;
        nextItemId = maxItemId + 1;

        // Populate the title input
        menuTitleInput.value = menuData.title;

        renderMenuEditor();
        updatePreview();
      } else {
        alert('Invalid or corrupted v2 JSON file.');
      }
    } catch (err) {
      alert('Error reading JSON file: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // Reset for next load
});

// --- UTILITY FUNCTIONS ---

/**
 * Reads a File object and converts it to a Base64 encoded string.
 * @param {File} file - The file to read.
 * @returns {Promise<string>} The Base64 encoded string.
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

// --- INITIALIZATION ---

function init() {
  // Set the initial source of the iframe
  previewIframe.src = 'menu.html';
  renderMenuEditor();
  updatePreview();
}

init();
