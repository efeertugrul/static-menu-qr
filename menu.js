import pako from 'pako';

// --- UTILITY FUNCTIONS ---

function base64ToUint8Array(base64) {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(
    /[&<>"']/g,
    (match) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[match]
  );
}

// --- MENU RENDERING ---

function renderMenu(sections) {
  const menuContent = document.getElementById('menu-content');
  menuContent.innerHTML = '';

  if (!sections || sections.length === 0) {
    menuContent.innerHTML = '<p class="no-items">This menu is currently empty.</p>';
    return;
  }

  sections.forEach((section) => {
    if (!section.name && (!section.items || section.items.length === 0)) return;

    const sectionEl = document.createElement('div');
    sectionEl.className = 'section';

    let itemsHtml = '';
    section.items.forEach((item) => {
      if (!item.name && !item.price) return;
      const imageHtml = item.image
        ? `<img src="${item.image}" alt="${item.name}" class="menu-item-image">`
        : '';
      itemsHtml += `
                <div class="item">
                    <div class="item-details">
                        <b>${escapeHTML(item.name)}</b>
                        ${item.description ? `<p>${escapeHTML(item.description)}</p>` : ''}
                    </div>
                    <div class="item-price">${escapeHTML(item.price)}</div>
                    ${imageHtml}
                </div>
            `;
    });

    sectionEl.innerHTML = `
            <h2>${escapeHTML(section.name)}</h2>
            ${itemsHtml}
        `;
    menuContent.appendChild(sectionEl);
  });
}

// --- INITIALIZATION ---

function initialize() {
  let data;
  const fragment = window.location.hash.substring(1); // Get fragment and remove '#'
  if (fragment.startsWith('data=')) {
    data = fragment.substring(5); // Get data from fragment
  } else {
    // Fallback for old links using query params
    const params = new URLSearchParams(window.location.search);
    data = params.get('data');
  }

  if (data) {
    try {
      // 1. URL-safe base64 to regular base64
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
      // 2. Base64 to bytes
      const padding = '='.repeat((4 - (base64.length % 4)) % 4);
      const bytes = base64ToUint8Array(base64 + padding);

      // 3. Decompress
      const jsonString = pako.inflate(bytes, { to: 'string' });

      // 4. Parse JSON
      const payload = JSON.parse(jsonString);
      const menuTitleEl = document.getElementById('menu-title');

      // Check for the new v2 data structure, otherwise assume old structure
      if (payload.v === 2 && payload.menu) {
        // Set the menu title, with a fallback
        menuTitleEl.textContent = payload.menu.title || 'Our Menu';
        renderMenu(payload.menu.sections);
      } else {
        // Handle old v1 data structure (with or without meta)
        const menuData = payload.menu || payload;
        menuTitleEl.textContent = 'Our Menu'; // V1 has no title
        renderMenu(menuData);
      }

      // Handle metadata (works for both v1 and v2)
      if (payload.meta) {
        // Populate the hidden footer for inspection
        const generationDateEl = document.getElementById('generation-date');
        const referenceIdEl = document.getElementById('reference-id');

        if (generationDateEl && referenceIdEl && payload.meta.ts) {
          generationDateEl.textContent = payload.meta.ts;
          referenceIdEl.textContent = payload.meta.eid || '';
        }
      }
    } catch (error) {
      console.error('Failed to load or render menu:', error);
      const menuContent = document.getElementById('menu-content');
      menuContent.innerHTML = `<p class="error">Could not load menu. The link may be invalid.</p>`;
    }
  } else {
    const menuContent = document.getElementById('menu-content');
    menuContent.innerHTML = `<p class="error">No menu data found in the URL.</p>`;
  }

  // --- MODAL LOGIC ---
  const modal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-image');
  const closeBtn = document.querySelector('.modal-close');

  document
    .getElementById('menu-content')
    .addEventListener('click', function (e) {
      if (e.target.classList.contains('menu-item-image')) {
        modal.style.display = 'flex';
        modalImg.src = e.target.src;
      }
    });

  function closeModal() {
    modal.style.display = 'none';
  }

  closeBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', function (e) {
    if (e.target === modal) {
      closeModal();
    }
  });
}

// Listen for messages from the parent window (the editor)
window.addEventListener('message', (event) => {
  // Basic security check: ensure the message is from a trusted origin if known
  // For example: if (event.origin !== 'http://expected-origin.com') return;

  if (event.data && event.data.type === 'loadMenu') {
    const url = event.data.url;
    // Use the URL to populate the hash and re-initialize
    window.location.hash = new URL(url).hash;
    initialize();
  }
});

// Initial load
initialize();
