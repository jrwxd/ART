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

// === Initialization ===
// This function runs when the script loads.
async function initialize() {
  // Show initial loading message
  tabElement.innerHTML =
    '<p style="padding: 20px; font-family: sans-serif; text-align: center;">Initializing Hypercard App...</p>';

  try {
    // 1. Fetch the list/index of available card IDs.
    console.log(`Fetching card index: ${CARD_INDEX_FILE}`);
    const indexResponse = await fetch(CARD_INDEX_FILE);
    if (!indexResponse.ok) {
      throw new Error(
        `Failed to fetch card index '${CARD_INDEX_FILE}' (Status: ${indexResponse.status})`
      );
    }

    // Process the index file based on its format (assuming text list here).
    const indexText = await indexResponse.text();
    cardIds = indexText
      .split(/\r?\n/)
      .map((id) => id.trim())
      .filter((id) => id !== ""); // Get IDs, remove empty lines/whitespace
    console.log(`Loaded ${cardIds.length} card IDs:`, cardIds);
    if (cardIds.length === 0) {
      console.warn("Warning: No card IDs found in the index file.");
    }

    // 2. Determine the initial card ID to display.
    const urlParams = new URLSearchParams(window.location.search);
    let initialCardId = urlParams.get("card") || DEFAULT_CARD_ID;

    // Validate the initial card ID.
    if (!cardIds.includes(initialCardId)) {
      console.warn(
        `Initial card ID "${initialCardId}" from URL not found in index. Using default "${DEFAULT_CARD_ID}".`
      );
      initialCardId = DEFAULT_CARD_ID;
      // Optionally, update URL to reflect the default card if the requested one was invalid
      // window.history.replaceState(null, '', `?card=${initialCardId}`);
    }

    // Check if the default card itself exists if we fall back to it
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
    const initialCardElement = createCardElement(
      initialCardId,
      initialCardData
    );

    // Set initial position for the first card.
    const initialStyle = `left: 20px; top: 20px; position: absolute; z-index: 1;`;
    initialCardElement.setAttribute("style", initialStyle);

    // Clear loading message and add the first card.
    tabElement.innerHTML = "";
    tabElement.appendChild(initialCardElement);

    // 4. Set up the initial browser history state.
    // Use replaceState so the user doesn't have to click back past the initial empty/loading state.
    history.replaceState(
      { cardId: initialCardId, style: initialStyle, zIndex: 1 },
      "",
      `?card=${initialCardId}`
    );

    // 5. Add event listeners for navigation AFTER initial setup.
    tabElement.addEventListener("click", handleTabClick);
    window.addEventListener("popstate", handlePopState);

    console.log("Initialization complete.");
  } catch (err) {
    // Display error if initialization fails.
    console.error("Initialization failed:", err);
    const errorMessage = document.createElement("p");
    errorMessage.style.color = "red";
    errorMessage.style.padding = "20px";
    errorMessage.style.fontFamily = "sans-serif";
    errorMessage.textContent = `Error initializing application: ${err.message}`;
    tabElement.innerHTML = "";
    tabElement.appendChild(errorMessage);
  }
}

// === Data Fetching ===
// Fetches the content of a specific card by its ID.
async function fetchCard(cardId) {
  // Return cached data if available
  if (cardCache[cardId]) {
    console.log(`Using cached data for card: ${cardId}`);
    return cardCache[cardId];
  }

  console.log(`Fetching card data for: ${cardId}`);
  const cardUrl = `${REPO_BASE_URL}${cardId}${CARD_EXTENSION}`;
  try {
    const response = await fetch(cardUrl);
    if (!response.ok) {
      throw new Error(
        `Card "${cardId}" not found or failed to load (Status: ${response.status})`
      );
    }

    // Process based on expected card format (JSON assumed here).
    const cardData = await response.json();
    // const cardData = await response.text(); // Use if Markdown/Text

    cardCache[cardId] = cardData; // Cache the fetched data
    return cardData;
  } catch (error) {
    console.error("Error fetching card %s:", cardId, error);
    throw error; // Re-throw error to be handled by caller
  }
}

// === Rendering ===
// Creates the DOM element for a card.
function createCardElement(cardId, cardData) {
  const cardDiv = document.createElement("div");
  cardDiv.className = "hypercard";
  cardDiv.dataset.cardid = cardId; // Store ID for reference
  cardDiv.innerHTML = renderCardContent(cardId, cardData); // Use helper for inner HTML
  return cardDiv;
}

// Generates the inner HTML content for a card.
function renderCardContent(cardId, cardData) {
  // Adapt based on your card data format (JSON assumed).
  let title = escapeHtml(cardId); // Default title is the ID, escaped to prevent XSS
  let contentHtml = "<p><em>Content not available.</em></p>"; // Default content

  if (CARD_EXTENSION === ".json" && cardData) {
    title = cardData.title || cardId; // Use title from JSON if available
    // Process the main text content for internal links.
    contentHtml = processTextForLinks(cardData.text || "");
  }

  // Construct the final inner HTML.
  return `
    <h1>${title}</h1>
    <div class="content">
      ${contentHtml}
    </div>
    `;
}

// Utility function to escape HTML special characters
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- Link Processing ---
// Finds link syntax (e.g., [[Target Card]]) in text and converts it to HTML <a> tags.
function processTextForLinks(text) {
  if (!text) return ""; // Handle null or empty text

  // Replace link syntax with actual anchor tags.
  return text.replace(LINK_REGEX, (match, targetCardIdRaw) => {
    const targetCardId = targetCardIdRaw.trim(); // Remove leading/trailing whitespace

    // Check if the linked card ID is valid (exists in our list).
    if (cardIds.includes(targetCardId)) {
      // Create a valid internal link.
      return `<a href="?card=${encodeURIComponent(
        targetCardId
      )}" class="internal-link" data-target-cardid="${targetCardId}">${targetCardId}</a>`;
    } else {
      // Handle broken links: display differently, maybe make non-clickable.
      console.warn(`Broken link detected: [[${targetCardId}]]`);
      return `<span class="broken-link" title="Card not found: ${targetCardId}">[[${targetCardId}]]</span>`;
    }
  });
}

// === Event Handling ===

// Handles clicks within the main #tab container.
async function handleTabClick(event) {
  // Check if the click was on an internal link.
  const link = event.target.closest("a.internal-link");

  if (link && link.dataset.targetCardid) {
    event.preventDefault(); // Stop browser from navigating normally.
    const targetCardId = link.dataset.targetCardid;
    console.log(`Internal link clicked for card: ${targetCardId}`);

    try {
      // Fetch the data for the target card.
      const cardData = await fetchCard(targetCardId);
      const newCardElement = createCardElement(targetCardId, cardData);

      // --- Positioning and Stacking ---
      // Calculate position based on click coordinates.
      const clickX = event.pageX;
      const clickY = event.pageY;

      // Find the highest current z-index.
      let maxZ = 0;
      tabElement.querySelectorAll(".hypercard").forEach((card) => {
        const z = parseInt(card.style.zIndex || "0", 10);
        if (z > maxZ) maxZ = z;
      });
      const newZ = maxZ + 1; // Place new card on top.

      // Apply style for position and stacking order.
      const newStyle = `left: ${clickX}px; top: ${clickY}px; position: absolute; z-index: ${newZ};`;
      newCardElement.setAttribute("style", newStyle);

      // Add the new card to the DOM.
      tabElement.appendChild(newCardElement);

      // Update browser history.
      history.pushState(
        { cardId: targetCardId, style: newStyle, zIndex: newZ },
        "",
        `?card=${targetCardId}`
      );
    } catch (err) {
      console.error(`Error loading card "${targetCardId}" on click:`, err);
      alert(`Could not load card: ${targetCardId}\n${err.message}`); // Simple error feedback
    }
  } else {
    // If the click was *not* on an internal link, but *inside* any card...
    const clickedCard = event.target.closest(".hypercard");
    if (clickedCard) {
      console.log(`Clicked inside card: ${clickedCard.dataset.cardid}`);
      // Bring this card to the front by removing cards visually stacked "on top" of it (higher z-index).
      const currentZ = parseInt(clickedCard.style.zIndex || "0", 10);
      let cardRemoved = false;
      tabElement.querySelectorAll(".hypercard").forEach((card) => {
        if (parseInt(card.style.zIndex || "0", 10) > currentZ) {
          console.log(
            `Removing card ${card.dataset.cardid} (z=${card.style.zIndex})`
          );
          card.remove();
          cardRemoved = true;
        }
      });

      // If we removed cards, update history to reflect the new top card state.
      // This prevents broken back/forward navigation.
      if (cardRemoved) {
        const cardId = clickedCard.dataset.cardid;
        const style = clickedCard.getAttribute("style");
        const zIndex = currentZ;
        // Use replaceState to correct the current history entry without adding a new one.
        history.replaceState({ cardId, style, zIndex }, "", `?card=${cardId}`);
        console.log(
          `History state replaced after bringing card ${cardId} forward.`
        );
      }
    }
  }
}

// Handles browser back/forward button clicks.
async function handlePopState(event) {
  console.log("Popstate event:", event.state);

  if (event.state && event.state.cardId) {
    const { cardId, style, zIndex } = event.state;

    // --- Restore View ---
    // 1. Remove any cards that are "newer" (higher z-index) than the state we are restoring.
    tabElement.querySelectorAll(".hypercard").forEach((card) => {
      if (parseInt(card.style.zIndex || "0", 10) > zIndex) {
        console.log(
          `Popstate: Removing card ${card.dataset.cardid} (z=${card.style.zIndex}) as it's newer than state (z=${zIndex})`
        );
        card.remove();
      }
    });

    // 2. Check if the target card from the state already exists at the correct z-index.
    let cardElement = tabElement.querySelector(
      `.hypercard[data-cardid='${cardId}']`
    );
    let needsAdding = true;

    if (
      cardElement &&
      parseInt(cardElement.style.zIndex || "0", 10) === zIndex
    ) {
      // Card exists and is at the correct stack level. Ensure its style matches history.
      console.log(
        `Popstate: Card ${cardId} found at correct z-index ${zIndex}. Applying style.`
      );
      cardElement.setAttribute("style", style); // Re-apply style just in case
      needsAdding = false;
    } else if (cardElement) {
      // Card exists but at wrong z-index? This shouldn't happen with the removal logic above.
      console.warn(
        `Popstate: Card ${cardId} exists but at wrong z-index? Removing it.`
      );
      cardElement.remove();
    }

    // 3. If the card wasn't found (or was removed), fetch and add it.
    if (needsAdding) {
      console.log(
        `Popstate: Card ${cardId} not found or removed. Fetching and adding.`
      );
      try {
        const cardData = await fetchCard(cardId);
        const newCardElement = createCardElement(cardId, cardData);
        newCardElement.setAttribute("style", style); // Apply the style from history state
        tabElement.appendChild(newCardElement);
      } catch (err) {
        console.error(
          `Popstate: Error reloading card "${cardId}" from history:`,
          err
        );
        // Handle error - maybe show message or redirect to default
        tabElement.innerHTML = `<p style="color: red; padding: 20px;">Error restoring state for card ${cardId}.</p>`;
      }
    }
  } else {
    // No state - might be the very first page load or navigation outside the app's control.
    // Potentially reload the initial state based on the current URL?
    console.log("Popstate event with no state object. Determining action...");
    const urlParams = new URLSearchParams(window.location.search);
    const cardIdFromUrl = urlParams.get("card");
    if (!cardIdFromUrl && cardIds.length > 0) {
      // If URL is back to base and we have cards, reload default?
      console.log("Attempting to reload default card state.");
      // This might cause loops if not handled carefully. Simplest might be to do nothing
      // or show a message asking the user to click a link.
      // For now, let's clear the tab and show a message.
      tabElement.innerHTML =
        '<p style="padding: 20px;">Navigation state unclear. Please click a link or refresh.</p>';
    } else {
      // Or maybe just let the browser handle it if it's truly outside the app history
      console.log("Letting browser handle navigation outside app state.");
    }
  }
}

// --- Start the application ---
// Wait for the DOM to be fully loaded before initializing.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize(); // DOMContentLoaded has already fired
}
