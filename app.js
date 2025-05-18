// === Configuration ===
// Base path to the directory containing your hypercard files.
const REPO_BASE_URL = "./cards/";
// Name of the file listing all available card IDs.
const CARD_INDEX_FILE = "cardlist.txt"; // Or 'index.json'
// The ID of the card to load if none is specified in the URL.
const DEFAULT_CARD_ID = "Welcome";
// The file extension used for your hypercard files.
const CARD_EXTENSION = ".json"; // Or '.md', '.txt'
// Link syntax: How links to other cards are written in the content.
const LINK_REGEX = /\[\[([^\]]+)\]\]/g; // Matches [[Card Name]]

// === Global State ===
// Holds the list of valid card IDs fetched from the index file.
let cardIds = [];
// Optional: Cache fetched card data to avoid refetching.
let cardCache = {};
// Reference to the main container div in the HTML.
const tabElement = document.getElementById("tab");

// === Utility Functions ===

/**
 * Escapes HTML special characters to prevent XSS.
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
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\//g, "&#x2F;"); // Forward slash
}

/**
 * Validates if a cardId exists in the loaded list of card IDs.
 * @param {string} cardId The card ID to validate.
 * @returns {boolean} True if the card ID is valid, false otherwise.
 */
function isValidCardId(cardId) {
  return cardIds.includes(cardId);
}

// === Initialization ===
// This function runs when the script loads.
async function initialize() {
  // Show initial loading message (using textContent for safety)
  const loadingMessage = document.createElement('p');
  loadingMessage.style.padding = "20px";
  loadingMessage.style.fontFamily = "sans-serif";
  loadingMessage.style.textAlign = "center";
  loadingMessage.textContent = "Initializing Hypercard App...";
  tabElement.innerHTML = ''; // Clear previous content
  tabElement.appendChild(loadingMessage);

  try {
    // 1. Fetch the list/index of available card IDs.
    console.log(`Fetching card index: ${CARD_INDEX_FILE}`);
    const indexResponse = await fetch(CARD_INDEX_FILE);
    if (!indexResponse.ok) {
      throw new Error(
        `Failed to fetch card index '${CARD_INDEX_FILE}' (Status: ${indexResponse.status})`
      );
    }

    const indexText = await indexResponse.text();
    cardIds = indexText
      .split(/\r?\n/)
      .map((id) => id.trim())
      .filter((id) => id !== "");
    console.log(`Loaded ${cardIds.length} card IDs:`, cardIds);
    if (cardIds.length === 0) {
      console.warn("Warning: No card IDs found in the index file.");
    }

    // 2. Determine the initial card ID to display.
    const urlParams = new URLSearchParams(window.location.search);
    let initialCardId = urlParams.get("card") || DEFAULT_CARD_ID;

    if (!isValidCardId(initialCardId)) {
      console.warn(
        `Initial card ID "${initialCardId}" from URL not found in index. Using default "${DEFAULT_CARD_ID}".`
      );
      initialCardId = DEFAULT_CARD_ID;
    }

    if (
      initialCardId === DEFAULT_CARD_ID &&
      !cardIds.includes(DEFAULT_CARD_ID)
    ) {
      throw new Error(
        `Default card "${DEFAULT_CARD_ID}" is not listed in the index file.`
      );
    }

    console.log(`Loading initial card: ${initialCardId}`);

    // 3. Fetch and render the initial card.
    const initialCardData = await fetchCard(initialCardId);
    // initialCardId is validated, but we escape it when creating the element for display consistency
    const initialCardElement = createCardElement(
      initialCardId,
      initialCardData
    );

    const initialStyle = `left: 20px; top: 20px; position: absolute; z-index: 1;`;
    initialCardElement.setAttribute("style", initialStyle);

    tabElement.innerHTML = ""; // Clear loading message
    tabElement.appendChild(initialCardElement);

    // 4. Set up the initial browser history state.
    history.replaceState(
      { cardId: initialCardId, style: initialStyle, zIndex: 1 },
      "",
      `?card=${encodeURIComponent(initialCardId)}` // Ensure cardId in URL is also encoded
    );

    // 5. Add event listeners for navigation AFTER initial setup.
    tabElement.addEventListener("click", handleTabClick);
    window.addEventListener("popstate", handlePopState);

    console.log("Initialization complete.");
  } catch (err) {
    console.error("Initialization failed:", err);
    const errorMessageElement = document.createElement("p");
    errorMessageElement.style.color = "red";
    errorMessageElement.style.padding = "20px";
    errorMessageElement.style.fontFamily = "sans-serif";
    // Use textContent for error messages to prevent XSS from error content itself.
    errorMessageElement.textContent = `Error initializing application: ${err.message}`;
    tabElement.innerHTML = "";
    tabElement.appendChild(errorMessageElement);
  }
}

// === Data Fetching ===
// Fetches the content of a specific card by its ID.
async function fetchCard(cardId) {
  if (cardCache[cardId]) {
    console.log(`Using cached data for card: ${cardId}`);
    return cardCache[cardId];
  }

  console.log(`Fetching card data for: ${cardId}`);
  // Card ID for URL should be safe if it comes from our validated list.
  // If cardId could contain special characters that affect URL structure,
  // it might need encoding here, but typically IDs are simple.
  const cardUrl = `${REPO_BASE_URL}${cardId}${CARD_EXTENSION}`;
  try {
    const response = await fetch(cardUrl);
    if (!response.ok) {
      throw new Error(
        `Card "${escapeHtml(cardId)}" not found or failed to load (Status: ${response.status})`
      );
    }

    const cardData = await response.json();
    cardCache[cardId] = cardData;
    return cardData;
  } catch (error) {
    console.error(`Error fetching card "${escapeHtml(cardId)}":`, error);
    throw error;
  }
}

// === Rendering ===
/**
 * Creates the DOM element for a card.
 * @param {string} cardId The ID of the card (expected to be validated).
 * @param {object} cardData The data object for the card.
 * @returns {HTMLElement} The created card div element.
 */
function createCardElement(cardId, cardData) {
  const escapedCardId = escapeHtml(cardId); // Escape ID for use in attributes and default title
  cardData = cardData || {};
  const cardDiv = document.createElement("div");
  cardDiv.className = "hypercard";
  cardDiv.dataset.cardid = escapedCardId; // Use escaped ID for data attribute for consistency
  // The renderCardContent function is responsible for escaping dynamic content from cardData
  cardDiv.innerHTML = renderCardContent(escapedCardId, cardData);
  return cardDiv;
}

/**
 * Generates the inner HTML content for a card, ensuring data is escaped.
 * @param {string} escapedCardId The pre-escaped card ID (used as a fallback title).
 * @param {object} cardData The data object for the card.
 * @returns {string} The HTML string for the card's content.
 */
function renderCardContent(escapedCardId, cardData) {
  let title;
  let contentHtml = "<p><em>Content not available.</em></p>"; // Default content

  if (CARD_EXTENSION === ".json" && cardData) {
    // If title exists in cardData, escape it. Otherwise, use the pre-escaped cardId.
    title = cardData.title ? escapeHtml(cardData.title) : escapedCardId;
    // Process the main text content for internal links, ensuring all parts are escaped.
    contentHtml = processTextForLinks(cardData.text || "");
  } else {
    // Fallback for non-JSON or missing cardData
    title = escapedCardId; // Already escaped
  }

  // Construct the final inner HTML. All dynamic parts are now escaped.
  return `
    <h1>${title}</h1>
    <div class="content">
      ${contentHtml}
    </div>
  `;
}

/**
 * Processes text containing [[link syntax]], converting it to safe HTML <a> tags.
 * All surrounding text and link text itself is HTML-escaped.
 * @param {string} text The raw text to process.
 * @returns {string} HTML string with links processed and all content escaped.
 */
function processTextForLinks(text) {
  if (typeof text !== 'string' || !text) return "";

  let resultHtml = "";
  let lastIndex = 0;
  let match;

  // LINK_REGEX must have the 'g' flag for exec to work in a loop.
  while ((match = LINK_REGEX.exec(text)) !== null) {
    const targetCardIdRaw = match[1]; // Content between [[ and ]]
    const matchStartIndex = match.index;
    const matchEndIndex = matchStartIndex + match[0].length;

    // 1. Append the text segment before the current link, properly escaped.
    resultHtml += escapeHtml(text.substring(lastIndex, matchStartIndex));

    const targetCardId = targetCardIdRaw.trim();
    const escapedTargetCardIdForDisplay = escapeHtml(targetCardId); // For display text and title attribute

    // 2. Create the link or broken link span.
    if (isValidCardId(targetCardId)) {
      // Use raw targetCardId for encodeURIComponent, as it expects unencoded string.
      // Use escapedTargetCardIdForDisplay for the visible link text and data attribute.
      resultHtml += `<a href="?card=${encodeURIComponent(
        targetCardId
      )}" class="internal-link" data-target-cardid="${escapedTargetCardIdForDisplay}">${escapedTargetCardIdForDisplay}</a>`;
    } else {
      console.warn(`Broken link detected: [[${targetCardId}]]`);
      resultHtml += `<span class="broken-link" title="Card not found: ${escapedTargetCardIdForDisplay}">[[${escapedTargetCardIdForDisplay}]]</span>`;
    }
    lastIndex = matchEndIndex;
  }

  // 3. Append any remaining text after the last link, properly escaped.
  resultHtml += escapeHtml(text.substring(lastIndex));

  return resultHtml;
}


// === Event Handling ===
async function handleTabClick(event) {
  const link = event.target.closest("a.internal-link");

  if (link && link.dataset.targetCardid) { // targetCardid in dataset is already escaped
    event.preventDefault();
    // For actual navigation and fetching, we need the raw (unescaped) ID.
    // However, link.dataset.targetCardid stores the *escaped* version.
    // We need to find the original card ID. A bit tricky if IDs can contain HTML entities naturally.
    // Assuming card IDs are simple and don't naturally contain '&amp;', '&lt;', etc.
    // For robustness, it's better if data-target-cardid stores the *raw* ID and we escape it only for display.
    // Let's adjust processTextForLinks to store raw ID in data attribute for simplicity here.
    // For now, we'll assume we need to find a matching raw ID.
    // This part is tricky: if link.dataset.targetCardid is "A&amp;B", the original was "A&B".
    // The current `isValidCardId` check would fail if cardIds has "A&B" and dataset has "A&amp;B".
    // Simplification: Assume card IDs are simple enough not to need "unescaping" from dataset.
    // Or, better: Store the raw ID in data-target-cardid.
    // Let's modify processTextForLinks to store the raw, unescaped targetCardId in the data attribute.

    // Re-evaluating: The data-target-cardid should ideally store the *actual, raw* card ID
    // to avoid issues with double-escaping or needing to unescape.
    // I'll adjust processTextForLinks to store the raw ID.
    const targetCardId = link.dataset.targetCardid; // This should be the raw ID.

    if (!isValidCardId(targetCardId)) {
      alert(`Invalid card ID: ${escapeHtml(targetCardId)}`); // Escape for display in alert
      return;
    }
    console.log(`Internal link clicked for card: ${targetCardId}`);

    try {
      const cardData = await fetchCard(targetCardId);
      const newCardElement = createCardElement(targetCardId, cardData);

      const clickX = event.pageX;
      const clickY = event.pageY;
      let maxZ = 0;
      tabElement.querySelectorAll(".hypercard").forEach((card) => {
        const z = parseInt(card.style.zIndex || "0", 10);
        if (z > maxZ) maxZ = z;
      });
      const newZ = maxZ + 1;
      const newStyle = `left: ${clickX}px; top: ${clickY}px; position: absolute; z-index: ${newZ};`;
      newCardElement.setAttribute("style", newStyle);
      tabElement.appendChild(newCardElement);

      history.pushState(
        { cardId: targetCardId, style: newStyle, zIndex: newZ },
        "",
        `?card=${encodeURIComponent(targetCardId)}`
      );
    } catch (err) {
      console.error(`Error loading card "${escapeHtml(targetCardId)}" on click:`, err);
      alert(`Could not load card: ${escapeHtml(targetCardId)}\n${escapeHtml(err.message)}`);
    }
  } else {
    const clickedCard = event.target.closest(".hypercard");
    if (clickedCard) {
      const cardIdFromDataset = clickedCard.dataset.cardid; // This is escaped
      console.log(`Clicked inside card (dataset ID): ${cardIdFromDataset}`);
      // To interact with history, we need the raw card ID.
      // This requires a way to map back from escaped dataset ID or ensure history also uses escaped.
      // For now, assume history.state.cardId is the raw ID.
      // The logic below for bringing card to front:

      const currentZ = parseInt(clickedCard.style.zIndex || "0", 10);
      let cardRemoved = false;
      tabElement.querySelectorAll(".hypercard").forEach((card) => {
        if (parseInt(card.style.zIndex || "0", 10) > currentZ) {
          card.remove();
          cardRemoved = true;
        }
      });

      if (cardRemoved) {
        // Find the raw cardId associated with clickedCard.
        // This is tricky if dataset.cardid is escaped and history uses raw.
        // Assuming we can get the raw ID for history state.
        // For simplicity, let's find the raw ID from cardIds that matches the escaped dataset ID.
        // This is not perfectly robust if IDs can be ambiguous once escaped.
        // A better approach is to consistently use raw IDs in logic and escape only for display/attributes.
        let rawCardIdForHistory = "";
        for (const id of cardIds) {
            if (escapeHtml(id) === cardIdFromDataset) {
                rawCardIdForHistory = id;
                break;
            }
        }

        if (rawCardIdForHistory) {
            const style = clickedCard.getAttribute("style");
            history.replaceState(
              { cardId: rawCardIdForHistory, style, zIndex: currentZ }, // Use raw ID for history state
              "",
              `?card=${encodeURIComponent(rawCardIdForHistory)}`
            );
            console.log(`History state replaced after bringing card ${rawCardIdForHistory} forward.`);
        } else {
            console.warn("Could not determine raw card ID for history update from clicked card:", cardIdFromDataset);
        }
      }
    }
  }
}
/*
Correction for handleTabClick regarding data-target-cardid:
To ensure `targetCardId` from `link.dataset.targetCardid` is the raw, unescaped ID for reliable use
in `isValidCardId` and `fetchCard`, `processTextForLinks` needs to be adjusted.
The `escapedTargetCardIdForDisplay` should be used for the link's text content,
but the `data-target-cardid` attribute should store the raw `targetCardId`.
*/

// --- REVISED processTextForLinks to store RAW ID in data attribute ---
function processTextForLinks(text) { // Note: This function is redefined for clarity. In a real file, you'd replace the old one.
  if (typeof text !== 'string' || !text) return "";

  let resultHtml = "";
  let lastIndex = 0;
  let match;

  while ((match = LINK_REGEX.exec(text)) !== null) {
    const targetCardIdRaw = match[1];
    const matchStartIndex = match.index;
    const matchEndIndex = matchStartIndex + match[0].length;

    resultHtml += escapeHtml(text.substring(lastIndex, matchStartIndex));

    const targetCardId = targetCardIdRaw.trim(); // This is the RAW ID
    const escapedTargetCardIdForDisplay = escapeHtml(targetCardId);

    if (isValidCardId(targetCardId)) { // Check raw ID
      resultHtml += `<a href="?card=${encodeURIComponent(
        targetCardId // Use raw ID for URL
      )}" class="internal-link" data-target-cardid="${targetCardId}">${escapedTargetCardIdForDisplay}</a>`; // Store RAW ID in data-target-cardid
    } else {
      console.warn(`Broken link detected: [[${targetCardId}]]`);
      resultHtml += `<span class="broken-link" title="Card not found: ${escapedTargetCardIdForDisplay}">[[${escapedTargetCardIdForDisplay}]]</span>`;
    }
    lastIndex = matchEndIndex;
  }
  resultHtml += escapeHtml(text.substring(lastIndex));
  return resultHtml;
}
// Ensure the global LINK_REGEX is reset if exec is called multiple times outside a loop on the same string.
// However, here it's used in a loop which handles its lastIndex property correctly.

// === PopState Handling ===
async function handlePopState(event) {
  console.log("Popstate event:", event.state);

  if (event.state && event.state.cardId) {
    const { cardId, style, zIndex } = event.state; // cardId here is raw
    const escapedCardIdForDisplay = escapeHtml(cardId);

    if (!isValidCardId(cardId)) {
      tabElement.innerHTML = `<p style="color: red; padding: 20px;">Invalid card ID (${escapedCardIdForDisplay}) in navigation state.</p>`;
      return;
    }

    tabElement.querySelectorAll(".hypercard").forEach((card) => {
      if (parseInt(card.style.zIndex || "0", 10) > zIndex) {
        card.remove();
      }
    });

    // data-cardid attribute stores escaped ID, so we need to compare with escaped version
    let cardElement = tabElement.querySelector(
      `.hypercard[data-cardid='${escapeHtml(cardId)}']` // Query using escaped ID
    );
    let needsAdding = true;

    if (
      cardElement &&
      parseInt(cardElement.style.zIndex || "0", 10) === zIndex
    ) {
      console.log(
        `Popstate: Card ${escapedCardIdForDisplay} found at correct z-index ${zIndex}. Applying style.`
      );
      cardElement.setAttribute("style", style);
      needsAdding = false;
    } else if (cardElement) {
      cardElement.remove();
    }

    if (needsAdding) {
      console.log(
        `Popstate: Card ${escapedCardIdForDisplay} not found or removed. Fetching and adding.`
      );
      try {
        const cardData = await fetchCard(cardId); // Fetch using raw ID
        const newCardElement = createCardElement(cardId, cardData); // Create using raw ID
        newCardElement.setAttribute("style", style);
        tabElement.appendChild(newCardElement);
      } catch (err) {
        console.error(
          `Popstate: Error reloading card "${escapedCardIdForDisplay}" from history:`,
          err
        );
        tabElement.innerHTML = `<p style="color: red; padding: 20px;">Error restoring state for card ${escapedCardIdForDisplay}. ${escapeHtml(err.message)}</p>`;
      }
    }
  } else {
    console.log("Popstate event with no state object. Determining action...");
    const urlParams = new URLSearchParams(window.location.search);
    const cardIdFromUrl = urlParams.get("card"); // Raw from URL
    if (!cardIdFromUrl && cardIds.length > 0 && isValidCardId(DEFAULT_CARD_ID)) {
      console.log("Attempting to reload default card state.");
      // Clear tab and re-initialize (or a more targeted reload)
      // For simplicity, a full re-initialize might be too much.
      // Let's load the default card.
      try {
        const defaultCardData = await fetchCard(DEFAULT_CARD_ID);
        const defaultCardElement = createCardElement(DEFAULT_CARD_ID, defaultCardData);
        const defaultStyle = `left: 20px; top: 20px; position: absolute; z-index: 1;`;
        defaultCardElement.setAttribute("style", defaultStyle);
        tabElement.innerHTML = "";
        tabElement.appendChild(defaultCardElement);
        history.replaceState( // replace current (empty) state
          { cardId: DEFAULT_CARD_ID, style: defaultStyle, zIndex: 1 },
          "",
          `?card=${encodeURIComponent(DEFAULT_CARD_ID)}`
        );
      } catch (err) {
          tabElement.innerHTML = `<p style="padding: 20px;">Could not load default card. ${escapeHtml(err.message)}</p>`;
      }
    } else if (cardIdFromUrl && isValidCardId(cardIdFromUrl)) {
        // URL has a card, but no state. Try to load this card as if it's the first load.
        console.log(`Popstate: Attempting to load card ${cardIdFromUrl} from URL.`);
         try {
            const cardData = await fetchCard(cardIdFromUrl);
            const cardElement = createCardElement(cardIdFromUrl, cardData);
            const style = `left: 20px; top: 20px; position: absolute; z-index: 1;`; // Default position
            cardElement.setAttribute("style", style);
            tabElement.innerHTML = "";
            tabElement.appendChild(cardElement);
            history.replaceState(
              { cardId: cardIdFromUrl, style: style, zIndex: 1 },
              "",
              `?card=${encodeURIComponent(cardIdFromUrl)}`
            );
        } catch (err) {
            tabElement.innerHTML = `<p style="padding: 20px;">Could not load card ${escapeHtml(cardIdFromUrl)} from URL. ${escapeHtml(err.message)}</p>`;
        }
    } else {
      tabElement.innerHTML =
        '<p style="padding: 20px;">Navigation state unclear. Please click a link or refresh.</p>';
    }
  }
}

// --- Start the application ---
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}