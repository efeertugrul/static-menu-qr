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

function renderMenu(menuData) {
  const container = document.getElementById('menu-content');
  container.innerHTML = ''; // Clear loading message

  if (!menuData || menuData.length === 0) {
    container.innerHTML = '<p class="error">No menu data found.</p>';
    return;
  }

  menuData.forEach((section) => {
    if (!section.name && (!section.items || section.items.length === 0)) return;

    const sectionEl = document.createElement('div');
    sectionEl.className = 'section';

    let itemsHtml = '';
    section.items.forEach((item) => {
      if (!item.name && !item.price) return;
      itemsHtml += `
                <div class="item">
                    <div class="item-details">
                        <b>${escapeHTML(item.name)}</b>
                        ${item.description ? `<p>${escapeHTML(item.description)}</p>` : ''}
                    </div>
                    <div class="item-price">${escapeHTML(item.price)}</div>
                </div>
            `;
    });

    sectionEl.innerHTML = `
            <h2>${escapeHTML(section.name)}</h2>
            ${itemsHtml}
        `;
    container.appendChild(sectionEl);
  });
}

// --- INITIALIZATION ---

function init() {
  const container = document.getElementById('menu-content');
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const data = urlParams.get('data');

    if (!data) {
      throw new Error("No 'data' parameter found in URL.");
    }

    // 1. Decode URL-safe Base64 back to standard Base64
    let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding back
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const compressed = base64ToUint8Array(base64 + padding);

    // 2. Decompress
    const jsonString = pako.inflate(compressed, { to: 'string' });

    // 3. Parse JSON
    const menuData = JSON.parse(jsonString);

    // 4. Render
    renderMenu(menuData);
  } catch (error) {
    console.error('Failed to load or render menu:', error);
    container.innerHTML = `<p class="error">Error: Could not display the menu. The link may be corrupted. <br/>(${error.message})</p>`;
  }
}

init();
