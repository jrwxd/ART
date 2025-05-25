// === Configuration ===
// Base path to the directory containing your hypercard files.
const REPO_BASE_URL = "./cards/";
// Name of the file listing all available card IDs.
const CARD_INDEX_FILE = "cardlist.txt";
// The ID of the card to load if none is specified in the URL.
const DEFAULT_CARD_ID = "Welcome";
// The file extension used for your hypercard files.
const CARD_EXTENSION = ".json";
// Link syntax: How links to other cards are written in the content.
const LINK_REGEX = /\[\[([^\]]+)\]\]/g; // Matches [[Card Name]]

// Security configuration
const MAX_CARD_ID_LENGTH = 100;
const MAX_CONTENT_LENGTH = 50000;
const ALLOWED_CARD_ID_PATTERN = /^[a-zA-Z0-9_\-\s]+$/;
const MAX_CARDS_IN_VIEW = 20;

// === Global State ===
let cardIds = [];
let cardCache = {};
const tabElement = document.getElementById("tab");

// === Security Functions ===

/**
 * Sanitizes and validates card IDs to prevent path traversal and injection attacks.
 * @param {string} cardId The card ID to validate.
 * @returns {string|null} The sanitized card ID or null if invalid.
 */
function sanitizeCardId(cardId) {
  if (typeof cardId !== 'string') return null;
  
  // Remove any potential path traversal attempts
  cardId = cardId.replace(/\.\./g, '').replace(/[\/\\]/g, '');
  
  // Trim and check length
  cardId = cardId.trim();
  if (cardId.length === 0 || cardId.length > MAX_CARD_ID_LENGTH) return null;
  
  // Check against allowed pattern
  if (!ALLOWED_CARD_ID_PATTERN.test(cardId)) return null;
  
  return cardId;
}

/**
 * Enhanced HTML escaping for security.
 * @param {string} unsafe The string to escape.
 * @returns {string} The escaped string.
 */
function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') {
    if (unsafe === null || typeof unsafe === 'undefined') {
      return '';
    }
    unsafe = String(unsafe);
  }
  
  // Limit content length to prevent DoS
  if (unsafe.length > MAX_CONTENT_LENGTH) {
    unsafe = unsafe.substring(0, MAX_CONTENT_LENGTH) + '...';
  }
  
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\//g, "&#x2F;")
    .replace(/\\/g, "&#x5C;")
    .replace(/`/g, "&#x60;");
}

/**
 * Validates if a cardId exists in the loaded list of card IDs.
 * @param {string} cardId The card ID to validate.
 * @returns {boolean} True if the card ID is valid, false otherwise.
 */
function isValidCardId(cardId) {
  const sanitized = sanitizeCardId(cardId);
  return sanitized !== null && cardIds.includes(sanitized);
}

/**
 * Rate limiting for fetch requests to prevent abuse.
 */
const fetchRateLimit = {
  requests: [],
  maxRequests: 10,
  timeWindow: 60000, // 1 minute
  
  canMakeRequest() {
    const now = Date.now();
    // Remove old requests outside time window
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    
    this.requests.push(now);
    return true;
  }
};

// === Initialization ===
async function initialize() {
  const loadingMessage = document.createElement('p');
  loadingMessage.style.cssText = "padding: 20px; font-family: sans-serif; text-align: center;";
  loadingMessage.textContent = "Initializing Hypercard App...";
  tabElement.innerHTML = '';
  tabElement.appendChild(loadingMessage);

  try {
    if (!fetchRateLimit.canMakeRequest()) {
      throw new Error("Rate limit exceeded. Please wait before retrying.");
    }

    console.log(`Fetching card index: ${CARD_INDEX_FILE}`);
    const indexResponse = await fetch(CARD_INDEX_FILE, {
      method: 'GET',
      cache: 'no-cache',
      headers: {
        'Accept': 'text/plain'
      }
    });
    
    if (!indexResponse.ok) {
      throw new Error(`Failed to fetch card index '${CARD_INDEX_FILE}' (Status: ${indexResponse.status})`);
    }

    const indexText = await indexResponse.text();
    
    // Validate and sanitize card IDs from index
    const rawCardIds = indexText.split(/\r?\n/)
      .map(id => id.trim())
      .filter(id => id !== "");
    
    cardIds = [];
    for (const rawId of rawCardIds) {
      const sanitized = sanitizeCardId(rawId);
      if (sanitized !== null) {
        cardIds.push(sanitized);
      } else {
        console.warn(`Invalid card ID in index: ${rawId}`);
      }
    }
    
    console.log(`Loaded ${cardIds.length} valid card IDs`);
    if (cardIds.length === 0) {
      throw new Error("No valid card IDs found in the index file.");
    }

    // Determine initial card ID with security validation
    const urlParams = new URLSearchParams(window.location.search);
    let initialCardId = urlParams.get("card");
    
    if (initialCardId) {
      initialCardId = sanitizeCardId(initialCardId);
    }
    
    if (!initialCardId || !isValidCardId(initialCardId)) {
      console.warn(`Invalid initial card ID. Using default "${DEFAULT_CARD_ID}".`);
      initialCardId = DEFAULT_CARD_ID;
    }

    if (!isValidCardId(initialCardId)) {
      throw new Error(`Default card "${DEFAULT_CARD_ID}" is not valid or not in index.`);
    }

    console.log(`Loading initial card: ${initialCardId}`);

    const initialCardData = await fetchCard(initialCardId);
    const initialCardElement = createCardElement(initialCardId, initialCardData);

    const initialStyle = `left: 20px; top: 20px; position: absolute; z-index: 1;`;
    initialCardElement.style.cssText = initialStyle;

    tabElement.innerHTML = "";
    tabElement.appendChild(initialCardElement);

    // Use replaceState to avoid exposing sensitive data in history
    history.replaceState(
      { cardId: initialCardId, style: initialStyle, zIndex: 1 },
      "",
      `?card=${encodeURIComponent(initialCardId)}`
    );

    tabElement.addEventListener("click", handleTabClick);
    window.addEventListener("popstate", handlePopState);

    console.log("Initialization complete.");
  } catch (err) {
    console.error("Initialization failed:", err);
    const errorMessageElement = document.createElement("p");
    errorMessageElement.style.cssText = "color: red; padding: 20px; font-family: sans-serif;";
    errorMessageElement.textContent = `Error initializing application: ${err.message}`;
    tabElement.innerHTML = "";
    tabElement.appendChild(errorMessageElement);
  }
}

// === Data Fetching ===
async function fetchCard(cardId) {
  const sanitizedCardId = sanitizeCardId(cardId);
  if (!sanitizedCardId || !isValidCardId(sanitizedCardId)) {
    throw new Error(`Invalid card ID: ${cardId}`);
  }

  if (cardCache[sanitizedCardId]) {
    console.log(`Using cached data for card: ${sanitizedCardId}`);
    return cardCache[sanitizedCardId];
  }

  if (!fetchRateLimit.canMakeRequest()) {
    throw new Error("Rate limit exceeded. Please wait before making more requests.");
  }

  console.log(`Fetching card data for: ${sanitizedCardId}`);
  
  // Construct URL safely
  const cardUrl = `${REPO_BASE_URL}${encodeURIComponent(sanitizedCardId)}${CARD_EXTENSION}`;
  
  try {
    const response = await fetch(cardUrl, {
      method: 'GET',
      cache: 'no-cache',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Card "${sanitizedCardId}" not found (Status: ${response.status})`);
    }

    // Check content type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Invalid content type for card "${sanitizedCardId}"`);
    }

    const cardData = await response.json();
    
    // Validate and sanitize card data
    const sanitizedCardData = sanitizeCardData(cardData);
    cardCache[sanitizedCardId] = sanitizedCardData;
    return sanitizedCardData;
  } catch (error) {
    console.error(`Error fetching card "${sanitizedCardId}":`, error);
    throw error;
  }
}

/**
 * Sanitizes card data to prevent XSS and other attacks.
 * @param {object} cardData Raw card data from JSON.
 * @returns {object} Sanitized card data.
 */
function sanitizeCardData(cardData) {
  if (!cardData || typeof cardData !== 'object') {
    return { title: 'Invalid Card', text: 'Card data is invalid.' };
  }

  const sanitized = {};
  
  // Sanitize title
  if (typeof cardData.title === 'string') {
    sanitized.title = cardData.title.substring(0, 200); // Limit title length
  } else {
    sanitized.title = 'Untitled Card';
  }
  
  // Sanitize text content
  if (typeof cardData.text === 'string') {
    sanitized.text = cardData.text.substring(0, MAX_CONTENT_LENGTH);
  } else {
    sanitized.text = 'No content available.';
  }
  
  return sanitized;
}

// === Rendering ===
function createCardElement(cardId, cardData) {
  const sanitizedCardId = sanitizeCardId(cardId);
  if (!sanitizedCardId) {
    throw new Error('Invalid card ID for element creation');
  }
  
  const escapedCardId = escapeHtml(sanitizedCardId);
  const sanitizedCardData = sanitizeCardData(cardData);
  
  const cardDiv = document.createElement("div");
  cardDiv.className = "hypercard";
  cardDiv.dataset.cardid = escapedCardId;
  
  // Use textContent and createElement for safer DOM manipulation
  const titleElement = document.createElement('h1');
  titleElement.textContent = sanitizedCardData.title || escapedCardId;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'content';
  contentDiv.innerHTML = processTextForLinks(sanitizedCardData.text || '');
  
  cardDiv.appendChild(titleElement);
  cardDiv.appendChild(contentDiv);
  
  return cardDiv;
}

function processTextForLinks(text) {
  if (typeof text !== 'string' || !text) return "";

  let resultHtml = "";
  let lastIndex = 0;
  let match;
  let linkCount = 0;
  const maxLinks = 50; // Prevent DoS from too many links

  LINK_REGEX.lastIndex = 0;

  while ((match = LINK_REGEX.exec(text)) !== null && linkCount < maxLinks) {
    const targetCardIdRaw = match[1];
    const matchStartIndex = match.index;
    const matchEndIndex = matchStartIndex + match[0].length;

    resultHtml += escapeHtml(text.substring(lastIndex, matchStartIndex));

    const sanitizedTargetCardId = sanitizeCardId(targetCardIdRaw);
    
    if (sanitizedTargetCardId && isValidCardId(sanitizedTargetCardId)) {
      const escapedTargetCardId = escapeHtml(sanitizedTargetCardId);
      resultHtml += `<a href="?card=${encodeURIComponent(sanitizedTargetCardId)}" class="internal-link" data-target-cardid="${escapedTargetCardId}">${escapedTargetCardId}</a>`;
    } else {
      const escapedTargetCardId = escapeHtml(targetCardIdRaw);
      resultHtml += `<span class="broken-link" title="Card not found">[[${escapedTargetCardId}]]</span>`;
    }
    
    lastIndex = matchEndIndex;
    linkCount++;
  }
  
  resultHtml += escapeHtml(text.substring(lastIndex));
  return resultHtml;
}

// === Event Handling ===
async function handleTabClick(event) {
  // Check if we've hit the maximum number of cards
  const currentCards = tabElement.querySelectorAll(".hypercard").length;
  if (currentCards >= MAX_CARDS_IN_VIEW) {
    alert("Maximum number of cards reached. Close some cards before opening new ones.");
    return;
  }

  const link = event.target.closest("a.internal-link");

  if (link && link.dataset.targetCardid) {
    event.preventDefault();
    
    const targetCardId = sanitizeCardId(link.dataset.targetCardid);
    if (!targetCardId || !isValidCardId(targetCardId)) {
      alert(`Invalid card ID: ${escapeHtml(link.dataset.targetCardid)}`);
      return;
    }
    
    console.log(`Internal link clicked for card: ${targetCardId}`);

    try {
      const cardData = await fetchCard(targetCardId);
      const newCardElement = createCardElement(targetCardId, cardData);

      // Sanitize click coordinates
      const clickX = Math.max(0, Math.min(event.pageX || 20, window.innerWidth - 300));
      const clickY = Math.max(0, Math.min(event.pageY || 20, window.innerHeight - 200));
      
      let maxZ = 0;
      tabElement.querySelectorAll(".hypercard").forEach((card) => {
        const z = parseInt(card.style.zIndex || "0", 10);
        if (z > maxZ) maxZ = z;
      });
      
      const newZ = Math.min(maxZ + 1, 9999); // Prevent z-index overflow
      const newStyle = `left: ${clickX}px; top: ${clickY}px; position: absolute; z-index: ${newZ};`;
      newCardElement.style.cssText = newStyle;
      tabElement.appendChild(newCardElement);

      history.pushState(
        { cardId: targetCardId, style: newStyle, zIndex: newZ },
        "",
        `?card=${encodeURIComponent(targetCardId)}`
      );
    } catch (err) {
      console.error(`Error loading card "${targetCardId}" on click:`, err);
      alert(`Could not load card: ${escapeHtml(err.message)}`);
    }
  } else {
    const clickedCard = event.target.closest(".hypercard");
    if (clickedCard) {
      const cardIdFromDataset = clickedCard.dataset.cardid;
      console.log(`Clicked inside card: ${cardIdFromDataset}`);

      const currentZ = parseInt(clickedCard.style.zIndex || "0", 10);
      let cardRemoved = false;
      
      tabElement.querySelectorAll(".hypercard").forEach((card) => {
        if (parseInt(card.style.zIndex || "0", 10) > currentZ) {
          card.remove();
          cardRemoved = true;
        }
      });

      if (cardRemoved) {
        const sanitizedCardId = sanitizeCardId(cardIdFromDataset);
        if (sanitizedCardId && isValidCardId(sanitizedCardId)) {
          const style = clickedCard.style.cssText;
          history.replaceState(
            { cardId: sanitizedCardId, style, zIndex: currentZ },
            "",
            `?card=${encodeURIComponent(sanitizedCardId)}`
          );
        }
      }
    }
  }
}

// === PopState Handling ===
async function handlePopState(event) {
  console.log("Popstate event:", event.state);

  if (event.state && event.state.cardId) {
    const { cardId, style, zIndex } = event.state;
    const sanitizedCardId = sanitizeCardId(cardId);
    
    if (!sanitizedCardId || !isValidCardId(sanitizedCardId)) {
      tabElement.innerHTML = `<p style="color: red; padding: 20px;">Invalid card ID in navigation state.</p>`;
      return;
    }

    // Remove cards with higher z-index
    tabElement.querySelectorAll(".hypercard").forEach((card) => {
      if (parseInt(card.style.zIndex || "0", 10) > zIndex) {
        card.remove();
      }
    });

    const escapedCardId = escapeHtml(sanitizedCardId);
    let cardElement = tabElement.querySelector(`.hypercard[data-cardid='${escapedCardId}']`);
    let needsAdding = true;

    if (cardElement && parseInt(cardElement.style.zIndex || "0", 10) === zIndex) {
      cardElement.style.cssText = style;
      needsAdding = false;
    } else if (cardElement) {
      cardElement.remove();
    }

    if (needsAdding) {
      try {
        const cardData = await fetchCard(sanitizedCardId);
        const newCardElement = createCardElement(sanitizedCardId, cardData);
        newCardElement.style.cssText = style;
        tabElement.appendChild(newCardElement);
      } catch (err) {
        console.error(`Popstate: Error reloading card "${sanitizedCardId}":`, err);
        tabElement.innerHTML = `<p style="color: red; padding: 20px;">Error restoring state for card. ${escapeHtml(err.message)}</p>`;
      }
    }
  } else {
    // Handle navigation without state
    const urlParams = new URLSearchParams(window.location.search);
    const cardIdFromUrl = urlParams.get("card");
    const sanitizedCardId = sanitizeCardId(cardIdFromUrl);
    
    if (sanitizedCardId && isValidCardId(sanitizedCardId)) {
      try {
        const cardData = await fetchCard(sanitizedCardId);
        const cardElement = createCardElement(sanitizedCardId, cardData);
        const style = `left: 20px; top: 20px; position: absolute; z-index: 1;`;
        cardElement.style.cssText = style;
        tabElement.innerHTML = "";
        tabElement.appendChild(cardElement);
        history.replaceState(
          { cardId: sanitizedCardId, style: style, zIndex: 1 },
          "",
          `?card=${encodeURIComponent(sanitizedCardId)}`
        );
      } catch (err) {
        tabElement.innerHTML = `<p style="padding: 20px;">Could not load card. ${escapeHtml(err.message)}</p>`;
      }
    } else if (isValidCardId(DEFAULT_CARD_ID)) {
      // Fallback to default card
      try {
        const defaultCardData = await fetchCard(DEFAULT_CARD_ID);
        const defaultCardElement = createCardElement(DEFAULT_CARD_ID, defaultCardData);
        const defaultStyle = `left: 20px; top: 20px; position: absolute; z-index: 1;`;
        defaultCardElement.style.cssText = defaultStyle;
        tabElement.innerHTML = "";
        tabElement.appendChild(defaultCardElement);
        history.replaceState(
          { cardId: DEFAULT_CARD_ID, style: defaultStyle, zIndex: 1 },
          "",
          `?card=${encodeURIComponent(DEFAULT_CARD_ID)}`
        );
      } catch (err) {
        tabElement.innerHTML = `<p style="padding: 20px;">Could not load default card. ${escapeHtml(err.message)}</p>`;
      }
    } else {
      tabElement.innerHTML = '<p style="padding: 20px;">Navigation state unclear. Please refresh the page.</p>';
    }
  }
}

// --- Start the application ---
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}