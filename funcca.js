import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
// Assuming you might use lil-gui later, but the original UI is custom DOM
// import { GUI } from "three/addons/libs/lil-gui.module.min.js";

// --- Constants and Enums ---
const STATES = Object.freeze({
  WHITE: 0,
  GRAY: 1,
  BLACK: 2,
});

// --- Configuration (Could be part of initial state) ---
const initialConfig = Object.freeze({
  PARTICLE_COUNT: 25,
  GRAPH_DENSITY: 0.3,
  GRID_SPACING: 30,
  PARTICLE_MASS_BASE: 100.0,
  SPRING_K_BASE: 60,
  DAMPING: 1.0,
  GRAVITY: new THREE.Vector3(0, 0, 0), // THREE.Vector3 is mutable, use with care or clone
  TIME_STEP: 0.16,
  PINNED_PARTICLES: [0, 5],
  STEPS_PER_FRAME: 1,
  TRAIL_FADE_INITIAL: 0.05,
  UPDATE_FREQUENCY: 30,
});

// --- Core Logic Functions (Aiming for Purity where possible) ---

/**
 * Creates a triangular adjacency matrix representing the graph connections.
 * @param {number} nodeCount
 * @param {number} density - Probability of edge creation (0-1)
 * @param {number} baseRestLength
 * @param {number} baseK
 * @returns {Array<Array<null|{restLength: number, k: number}>>} The adjacency matrix.
 */
function createAdjacencyMatrix(nodeCount, density, baseRestLength, baseK) {
  const matrix = Array(nodeCount)
    .fill(null)
    .map((_, i) => Array(i + 1).fill(null)); // Initialize rows

  const edgeCounts = Array(nodeCount).fill(0);

  for (let i = 1; i < nodeCount; i++) {
    for (let j = 0; j < i; j++) {
      if (edgeCounts[i] < 7 && edgeCounts[j] < 7 && Math.random() < density) {
        const restLength = baseRestLength * (0.8 + Math.random() * 0.4);
        const k = baseK * (0.9 + Math.random() * 0.2);
        matrix[i][j] = { restLength, k };
        edgeCounts[i]++;
        edgeCounts[j]++;
      }
    }
  }
  return matrix;
}

/**
 * Creates the initial state for particles based on the count and configuration.
 * @param {number} count
 * @param {number} baseMass
 * @param {number[]} pinnedIndices
 * @returns {Array<object>} Array of particle state objects.
 */
function createInitialParticles(count, baseMass, pinnedIndices) {
  // Using map to generate particles based on index
  return Array.from({ length: count }, (_, i) => {
    // Position particles randomly (could use other strategies)
    const posX = Math.random() * 10;
    const posY = Math.random() * 10;
    const posZ = Math.random() * 10;

    // Random initial state
    const state =
      Math.random() < 0.3
        ? Math.random() < 0.5
          ? STATES.BLACK
          : STATES.GRAY
        : STATES.WHITE;
    const mass = baseMass * (0.8 + Math.random() * 0.4);
    const isPinned = pinnedIndices.includes(i);

    return {
      id: i, // Useful for keying if using frameworks
      position: new THREE.Vector3(posX, posY, posZ),
      previousPosition: new THREE.Vector3(posX, posY, posZ), // For Verlet-like integration
      velocity: new THREE.Vector3(0, 0, 0),
      acceleration: new THREE.Vector3(0, 0, 0),
      mass: isPinned ? Infinity : mass, // Pinned particles have infinite mass
      invMass: isPinned ? 0 : 1.0 / mass,
      pinned: isPinned,
      state: state,
      neighborIndices: [], // To be populated later
    };
  });
}

/**
 * Creates constraints and populates neighbor indices based on the adjacency matrix.
 * @param {Array<Array<null|{restLength: number, k: number}>>} adjacencyMatrix
 * @param {Array<object>} particles - The particle array (will be mutated to add neighborIndices)
 * @returns {Array<object>} Array of constraint objects.
 */
function createConstraintsFromMatrix(adjacencyMatrix, particles) {
  const constraints = [];
  // Clear existing neighbors first if regenerating
  particles.forEach((p) => (p.neighborIndices = []));

  for (let i = 1; i < adjacencyMatrix.length; i++) {
    for (let j = 0; j < i; j++) {
      const conniection = adjacencyMatrix[i][j];
      if (connection) {
        constraints.push({
          p1_idx: i,
          p2_idx: j,
          restLength: connection.restLength, // Initial rest length from matrix generation
          currentRestLength: connection.restLength, // Rest length that can change dynamically
          k: connection.k,
        });
        // Side effect: Mutating particle objects to store graph structure
        particles[i].neighborIndices.push(j);
        particles[j].neighborIndices.push(i);
      }
    }
  }
  return constraints;
}

/**
 * Determines the next state of a particle based on its current state and neighbors. (Pure function)
 * @param {number} currentState - The particle's current state (STATES enum).
 * @param {Array<number>} neighborStates - Array of states of neighboring particles.
 * @returns {number} The calculated next state.
 */
function calculateNextState(currentState, neighborStates) {
  const neighborSum = neighborStates.reduce((sum, state) => sum + state, 0);

  switch (currentState) {
    case STATES.WHITE:
      if (neighborSum <= 2) return STATES.WHITE;
      if (neighborSum <= 5) return STATES.GRAY;
      return STATES.BLACK;
    case STATES.GRAY:
      if (neighborSum <= 1) return STATES.WHITE;
      if (neighborSum <= 8) return STATES.GRAY;
      return STATES.BLACK;
    case STATES.BLACK:
      if (neighborSum <= 3) return STATES.BLACK;
      if (neighborSum <= 7) return STATES.GRAY;
      return STATES.WHITE;
    default:
      return currentState; // Should not happen
  }
}

/**
 * Calculates the next states for all non-pinned particles. (Pure function relative to input state)
 * @param {Array<object>} currentParticles - The current array of particle states.
 * @returns {Array<number>} An array containing the next state for each particle.
 */
function calculateAllNextStates(currentParticles) {
  return currentParticles.map((p, i) => {
    if (p.pinned) {
      return p.state; // Pinned particles don't change state
    }
    const neighborStates = p.neighborIndices.map(
      (idx) => currentParticles[idx].state
    );
    return calculateNextState(p.state, neighborStates);
  });
}

/**
 * Updates the physics state of particles over a single time step.
 * This function *mutates* the particles array for performance reasons.
 * A purer version would return a new particles array, but likely be too slow.
 * It also mutates constraint.currentRestLength based on particle states.
 * @param {Array<object>} particles - Array of particle objects (will be mutated).
 * @param {Array<object>} constraints - Array of constraint objects (currentRestLength will be mutated).
 * @param {THREE.Vector3} gravity - Global gravity vector.
 * @param {number} damping - Damping factor.
 * @param {number} deltaTime - Simulation time step.
 */
function simulateStep(particles, constraints, gravity, damping, deltaTime) {
  // --- 1. Apply forces and calculate acceleration ---
  particles.forEach((p) => {
    if (p.pinned) {
      p.acceleration.set(0, 0, 0); // Reset acceleration for pinned
      p.velocity.set(0, 0, 0); // Ensure pinned particles don't move
      return;
    }
    // Reset acceleration
    p.acceleration.copy(gravity); // Start with gravity

    // Apply damping force: F_damping = -damping * velocity
    // a_damping = F_damping / mass = -damping * velocity * invMass
    p.acceleration.addScaledVector(p.velocity, -damping * p.invMass); // Use invMass
  });

  // --- 2. Apply spring forces and update dynamic rest length ---
  constraints.forEach((c) => {
    const p1 = particles[c.p1_idx];
    const p2 = particles[c.p2_idx];

    const delta = p2.position.clone().sub(p1.position);
    const currentLength = delta.length();

    if (currentLength === 0) return; // Avoid division by zero

    // Calculate dynamic rest length based on states
    const state1 = p1.state;
    const state2 = p2.state;
    let targetRestLength = c.currentRestLength; // Start with current dynamic length

    // Apply state-based changes scaled by deltaTime
    if (state1 === STATES.BLACK && state2 === STATES.BLACK) {
      targetRestLength += 0.2 * deltaTime; // Expand
    } else if (state1 === STATES.WHITE && state2 === STATES.WHITE) {
      targetRestLength -= 0.2 * deltaTime; // Contract
    } else {
      targetRestLength += (Math.random() * 0.1 - 0.05) * deltaTime; // Slight drift
    }
    c.currentRestLength = Math.max(0.1, targetRestLength); // Update and clamp

    // Calculate spring force: F = k * (L - L_rest)
    const displacement = currentLength - c.currentRestLength; // Use dynamic length
    const forceMagnitude = c.k * displacement;

    // Calculate acceleration: a = F / m = (F_normalized * forceMagnitude) * invMass
    const forceVector = delta.normalize().multiplyScalar(forceMagnitude); // Reuse delta as normalized direction

    if (!p1.pinned) {
      p1.acceleration.addScaledVector(forceVector, p1.invMass);
    }
    if (!p2.pinned) {
      p2.acceleration.addScaledVector(forceVector, -p2.invMass); // Apply force in opposite direction
    }
  });

  // --- 3. Integrate: Update velocities and positions (Simple Euler) ---
  particles.forEach((p) => {
    if (p.pinned) return;

    // Update velocity: v_new = v_old + a * dt
    p.velocity.addScaledVector(p.acceleration, deltaTime);
    // Update position: p_new = p_old + v_new * dt
    p.position.addScaledVector(p.velocity, deltaTime);

    // (Verlet alternative commented out for simplicity matching original)
  });
}

// --- Side Effect Functions (Interacting with Three.js / DOM) ---

/** Sets up the basic Three.js environment. (Side Effects: DOM, THREE object creation) */
function setupThreeEnvironment() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x00a00a);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.011,
    10000000
  );
  camera.position.set(0, 0, 100);

  // Renderer setup for potential trail effect
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true, // Needed for trails
    alpha: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0); // Transparent background for base
  renderer.autoClear = false; // Manual control for layering/trails
  document.body.appendChild(renderer.domElement);

  // Lights
  const ambientLight = new THREE.AmbientLight(0xcc99cc, 0.5);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xeeeeee, 0.8);
  directionalLight.position.set(1, 1, 0.5).normalize();
  scene.add(directionalLight);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.25;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  controls.maxPolarAngle = Math.PI / 2;
  controls.enableZoom = true;
  controls.zoomSpeed = 1.0;
  controls.panSpeed = 5.0; // Adjusted from original
  controls.minDistance = 1.0;
  controls.enableRotate = true;
  controls.target.set(0, 0, 0);
  controls.keys = {
    // Keep original keys if needed
    LEFT: "ArrowLeft",
    UP: "ArrowUp",
    RIGHT: "ArrowRight",
    BOTTOM: "ArrowDown",
  };
  controls.update();

  // Fade pass setup (for trails)
  const fadeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fadeScene = new THREE.Scene();
  const fadeMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: initialConfig.TRAIL_FADE_INITIAL, // Use initial value
  });
  const fadeGeometry = new THREE.PlaneGeometry(2, 2);
  const fadeMesh = new THREE.Mesh(fadeGeometry, fadeMaterial);
  fadeScene.add(fadeMesh);

  const fadePass = {
    scene: fadeScene,
    camera: fadeCamera,
    material: fadeMaterial,
  };

  return { scene, camera, renderer, controls, fadePass };
}

/** Creates Three.js mesh objects for particles. (Side Effect: THREE object creation) */
function createParticleMeshes(particles) {
  const particleGeo = new THREE.SphereGeometry(0.15, 16, 8); // Reusable geometry

  // Base materials (clone before use)
  const whiteMatBase = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    emissive: 0x5cc5555,
    transparent: true,
    opacity: 0.8,
  });
  const grayMatBase = new THREE.MeshPhongMaterial({
    color: 0x888888,
    emissive: 0x222222,
    transparent: true,
    opacity: 0.8,
  });
  const blackMatBase = new THREE.MeshPhongMaterial({
    color: 0x00cc00,
    emissive: 0x0cc000,
    transparent: true,
    opacity: 0.8,
  });
  const pinnedMat = new THREE.MeshPhongMaterial({
    color: 0xff0000,
    emissive: 0x550000,
  });

  return particles.map((p) => {
    let material;
    if (p.pinned) {
      material = pinnedMat.clone();
    } else {
      switch (p.state) {
        case STATES.GRAY:
          material = grayMatBase.clone();
          break;
        case STATES.BLACK:
          material = blackMatBase.clone();
          break;
        case STATES.WHITE:
        default:
          material = whiteMatBase.clone();
          break;
      }
    }
    const mesh = new THREE.Mesh(particleGeo, material);
    mesh.position.copy(p.position); // Set initial position
    return mesh;
  });
}

/** Creates or updates the line segments for constraints. (Side Effects: THREE object creation/update) */
function createOrUpdateLineSegments(
  constraints,
  particles,
  existingLineSegments,
  scene
) {
  const linePositions = [];
  constraints.forEach((c) => {
    const p1 = particles[c.p1_idx];
    const p2 = particles[c.p2_idx];
    // Ensure particles exist before accessing position
    if (p1 && p2) {
      linePositions.push(
        p1.position.x,
        p1.position.y,
        p1.position.z,
        p2.position.x,
        p2.position.y,
        p2.position.z
      );
    }
  });

  if (existingLineSegments) {
    // Update existing geometry
    existingLineSegments.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(linePositions, 3)
    );
    existingLineSegments.geometry.attributes.position.needsUpdate = true;
    return existingLineSegments;
  } else {
    // Create new geometry and line segments
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x666666,
      transparent: true,
      opacity: 0.3,
      linewidth: 1,
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(linePositions, 3)
    );
    const lineSegments = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(lineSegments); // Add to scene
    return lineSegments;
  }
}

/** Updates the visual representation based on the current state. (Side Effects: THREE object mutation) */
function updateVisuals(particles, particleMeshes, constraints, lineSegments) {
  // Update sphere positions
  particles.forEach((p, i) => {
    if (particleMeshes[i]) {
      // Check if mesh exists
      particleMeshes[i].position.copy(p.position);
    }
  });

  // Update line segment positions
  if (lineSegments && lineSegments.geometry.attributes.position) {
    // Ensure geometry and position attribute exist
    const positions = lineSegments.geometry.attributes.position.array;
    let posIndex = 0;
    constraints.forEach((c) => {
      const p1 = particles[c.p1_idx];
      const p2 = particles[c.p2_idx];
      // Ensure particles exist before accessing position
      if (p1 && p2) {
        positions[posIndex++] = p1.position.x;
        positions[posIndex++] = p1.position.y;
        positions[posIndex++] = p1.position.z;
        positions[posIndex++] = p2.position.x;
        positions[posIndex++] = p2.position.y;
        positions[posIndex++] = p2.position.z;
      }
    });
    // Make sure the array length matches the expected length based on constraints processed
    lineSegments.geometry.attributes.position.count = constraints.length * 2; // Update count
    lineSegments.geometry.attributes.position.needsUpdate = true;
    lineSegments.geometry.computeBoundingSphere(); // Update bounds after vertex changes
  }
}

/** Updates particle mesh materials based on state. (Side Effects: THREE material mutation) */
function updateParticleMaterials(particles, particleMeshes) {
  // Base materials (could be cached) - Ensure these match createParticleMeshes
  const whiteMatBase = {
    color: new THREE.Color(0xffffff),
    emissive: new THREE.Color(0x5cc5555),
  };
  const grayMatBase = {
    color: new THREE.Color(0x888888),
    emissive: new THREE.Color(0x222222),
  };
  const blackMatBase = {
    color: new THREE.Color(0x00cc00),
    emissive: new THREE.Color(0x0cc000),
  };
  // Pinned material doesn't change based on state

  particles.forEach((p, i) => {
    if (p.pinned || !particleMeshes[i] || !particleMeshes[i].material) return; // Safety checks

    const material = particleMeshes[i].material;
    let targetMaterial;

    switch (p.state) {
      case STATES.GRAY:
        targetMaterial = grayMatBase;
        break;
      case STATES.BLACK:
        targetMaterial = blackMatBase;
        break;
      case STATES.WHITE:
      default:
        targetMaterial = whiteMatBase;
        break;
    }

    // Avoid unnecessary updates if color/emissive are already correct
    if (!material.color.equals(targetMaterial.color)) {
      material.color.copy(targetMaterial.color);
    }
    if (!material.emissive.equals(targetMaterial.emissive)) {
      material.emissive.copy(targetMaterial.emissive);
    }
  });
}

/** Clears Three.js objects from the scene. (Side Effects: THREE scene mutation) */
function clearThreeScene(scene, particleMeshes, lineSegments) {
  particleMeshes.forEach((mesh) => {
    if (mesh) {
      scene.remove(mesh);
      // Optional: Dispose geometry and material to free GPU memory
      // if (mesh.geometry) mesh.geometry.dispose();
      // if (mesh.material) mesh.material.dispose();
    }
  });
  if (lineSegments) {
    scene.remove(lineSegments);
    // if (lineSegments.geometry) lineSegments.geometry.dispose();
    // if (lineSegments.material) lineSegments.material.dispose();
  }
}

/** Creates the DOM-based UI Panel. (Side Effects: DOM manipulation) */
function createUIPanel(config, onUpdate, onReset, onRegenerate) {
  // Remove existing UI if any (simple check)
  const existingContainer = document.getElementById("simulation-ui-container");
  if (existingContainer) {
    existingContainer.remove();
  }
  const existingButton = document.getElementById("simulation-ui-toggle");
  if (existingButton) {
    existingButton.remove();
  }

  // Create UI container (drawer)
  const uiContainer = document.createElement("div");
  uiContainer.id = "simulation-ui-container"; // Add ID for easier removal
  uiContainer.style.position = "fixed";
  uiContainer.style.top = "0";
  uiContainer.style.right = "-300px"; // Hidden by default
  uiContainer.style.width = "300px";
  uiContainer.style.height = "100%";
  uiContainer.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
  uiContainer.style.padding = "15px";
  uiContainer.style.boxSizing = "border-box"; // Include padding in width/height
  uiContainer.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.5)";
  uiContainer.style.transition = "right 0.3s ease";
  uiContainer.style.zIndex = "100";
  uiContainer.style.overflowY = "auto"; // Add scroll for many controls
  uiContainer.style.color = "white"; // Default text color

  // Create title
  const title = document.createElement("h3");
  title.textContent = "Simulation Controls";
  title.style.margin = "0 0 15px 0";
  title.style.textAlign = "center";
  uiContainer.appendChild(title);

  // Helper function to create sliders (Adapted)
  function createSlider(label, key, min, max, value, step, onChange) {
    const container = document.createElement("div");
    container.style.marginBottom = "15px";

    const labelElement = document.createElement("label");
    // Format value for display (e.g., limit decimal places)
    const displayValue = Number.isInteger(step) ? value : value.toFixed(2);
    labelElement.textContent = `${label}: ${displayValue}`;
    labelElement.style.display = "block";
    labelElement.style.marginBottom = "5px";
    labelElement.style.fontSize = "14px";
    container.appendChild(labelElement);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = min;
    slider.max = max;
    slider.value = value;
    slider.step = step;
    slider.style.width = "100%";
    slider.style.marginBottom = "5px";
    slider.style.height = "20px"; // Slightly smaller than original
    slider.style.cursor = "pointer";
    container.appendChild(slider);

    slider.addEventListener("input", () => {
      const newValue = parseFloat(slider.value);
      const displayValue = Number.isInteger(step)
        ? newValue
        : newValue.toFixed(2);
      labelElement.textContent = `${label}: ${displayValue}`;
      onChange(key, newValue); // Pass key and value
    });

    return container;
  }

  // --- Add Sliders ---
  uiContainer.appendChild(
    createSlider(
      "Particle Count",
      "PARTICLE_COUNT",
      5,
      100,
      config.PARTICLE_COUNT,
      1,
      onUpdate
    )
  );
  uiContainer.appendChild(
    createSlider(
      "Graph Density",
      "GRAPH_DENSITY",
      0.1,
      1.0,
      config.GRAPH_DENSITY,
      0.05,
      onUpdate
    )
  );
  uiContainer.appendChild(
    createSlider(
      "Grid Spacing",
      "GRID_SPACING",
      1,
      50,
      config.GRID_SPACING,
      1,
      onUpdate
    ) // Adjusted range/step from original
  );
  uiContainer.appendChild(
    createSlider(
      "Spring Stiffness",
      "SPRING_K_BASE",
      1,
      1000,
      config.SPRING_K_BASE,
      1,
      onUpdate
    )
  );
  uiContainer.appendChild(
    createSlider("Damping", "DAMPING", 0, 8, config.DAMPING, 0.01, onUpdate)
  );
  uiContainer.appendChild(
    createSlider(
      "Gravity Y",
      "GRAVITY_Y",
      -20,
      20,
      config.GRAVITY.y,
      0.1,
      (key, value) => onUpdate("GRAVITY", new THREE.Vector3(0, value, 0))
    ) // Update Vector3
  );
  uiContainer.appendChild(
    createSlider(
      "Trail Fade",
      "TRAIL_FADE",
      0,
      0.2,
      config.TRAIL_FADE_INITIAL,
      0.01,
      onUpdate
    ) // Added Trail Fade Control
  );
  uiContainer.appendChild(
    createSlider(
      "Update Freq",
      "UPDATE_FREQUENCY",
      1,
      120,
      config.UPDATE_FREQUENCY,
      1,
      onUpdate
    ) // Added CA Update Freq Control
  );

  // --- Add Buttons ---
  function createButton(text, onClick) {
    const button = document.createElement("button");
    button.textContent = text;
    button.style.display = "block";
    button.style.width = "100%";
    button.style.padding = "10px";
    button.style.marginTop = "10px";
    button.style.backgroundColor = "#4CAF50";
    button.style.color = "white";
    button.style.border = "none";
    button.style.borderRadius = "4px";
    button.style.cursor = "pointer";
    button.onclick = onClick;
    return button;
  }

  uiContainer.appendChild(createButton("Reset (R)", onReset));
  uiContainer.appendChild(createButton("Regenerate Graph (G)", onRegenerate));

  // Add UI to the page
  document.body.appendChild(uiContainer);

  // --- Create Toggle Button ---
  const toggleButton = document.createElement("button");
  toggleButton.id = "simulation-ui-toggle"; // Add ID
  toggleButton.textContent = "☰"; // Hamburger icon
  toggleButton.style.position = "fixed";
  toggleButton.style.top = "10px";
  toggleButton.style.right = "10px";
  toggleButton.style.width = "50px";
  toggleButton.style.height = "50px";
  toggleButton.style.border = "none";
  toggleButton.style.borderRadius = "50%";
  toggleButton.style.backgroundColor = "#4CAF50";
  toggleButton.style.color = "white";
  toggleButton.style.fontSize = "24px";
  toggleButton.style.cursor = "pointer";
  toggleButton.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.3)";
  toggleButton.style.zIndex = "101"; // Ensure it's above the panel

  toggleButton.addEventListener("click", () => {
    const isOpen = uiContainer.style.right === "0px";
    uiContainer.style.right = isOpen ? "-300px" : "0px";
  });

  // Add the toggle button to the page
  document.body.appendChild(toggleButton);

  // Return references to the created elements
  return { uiContainer, toggleButton };
}

// --- Main Application Setup and Loop ---

function main() {
  // --- Mutable Application State ---
  let appState = {
    config: { ...initialConfig }, // Make a mutable copy
    particles: [],
    constraints: [],
    adjacencyMatrix: [],
    frameCounter: 0,
    uiVisible: true, // Controls if UI *should* be open, style controls actual visibility
    trailFade: initialConfig.TRAIL_FADE_INITIAL,
    simulationRunning: true,
    animationId: null,
  };

  // --- Three.js Objects ---
  const { scene, camera, renderer, controls, fadePass } =
    setupThreeEnvironment();
  let particleMeshes = [];
  let lineSegments = null;
  let uiElements = null; // Will hold { uiContainer, toggleButton }

  // --- Core Simulation Setup Function ---
  function setupSimulation(currentConfig) {
    // 1. Clear previous visuals
    clearThreeScene(scene, particleMeshes, lineSegments);
    particleMeshes = [];
    lineSegments = null;

    // 2. Create new logical structure
    const matrix = createAdjacencyMatrix(
      currentConfig.PARTICLE_COUNT,
      currentConfig.GRAPH_DENSITY,
      currentConfig.GRID_SPACING,
      currentConfig.SPRING_K_BASE
    );
    const particles = createInitialParticles(
      currentConfig.PARTICLE_COUNT,
      currentConfig.PARTICLE_MASS_BASE,
      currentConfig.PINNED_PARTICLES
    );
    const constraints = createConstraintsFromMatrix(matrix, particles); // Mutates particles for neighbors

    // 3. Create new visuals
    particleMeshes = createParticleMeshes(particles);
    particleMeshes.forEach((mesh) => scene.add(mesh));
    lineSegments = createOrUpdateLineSegments(
      constraints,
      particles,
      null,
      scene
    );

    // 4. Return the new simulation state parts
    return {
      particles,
      constraints,
      adjacencyMatrix: matrix,
      frameCounter: 0, // Reset frame counter on setup
    };
  }

  // --- Update Handlers ---
  function handleUIUpdate(key, value) {
    let requiresRegen = false;
    let newConfig = { ...appState.config }; // Copy current config

    // Update specific key and apply validation/parsing
    switch (key) {
      case "PARTICLE_COUNT":
        newConfig.PARTICLE_COUNT = Math.max(
          5,
          Math.min(100, Math.floor(value))
        );
        requiresRegen = true;
        break;
      case "GRAPH_DENSITY":
        newConfig.GRAPH_DENSITY = Math.max(0.1, Math.min(1.0, value));
        requiresRegen = true;
        break;
      case "GRID_SPACING":
        newConfig.GRID_SPACING = Math.max(1, Math.min(50, value));
        requiresRegen = true; // Affects initial spring lengths
        break;
      case "SPRING_K_BASE":
        newConfig.SPRING_K_BASE = Math.max(1, Math.min(1000, value));
        // Apply stiffness change dynamically? Or require regen?
        // Let's require regen for simplicity as it affects initial setup.
        requiresRegen = true;
        break;
      case "PARTICLE_MASS_BASE": // Added Mass control possibility
        newConfig.PARTICLE_MASS_BASE = Math.max(1, Math.min(1000, value));
        requiresRegen = true;
        break;
      case "DAMPING":
        newConfig.DAMPING = Math.max(0, Math.min(8, value));
        break;
      case "GRAVITY": // Comes in as a Vector3 already
        newConfig.GRAVITY = value;
        break;
      case "TRAIL_FADE":
        newConfig.TRAIL_FADE_INITIAL = Math.max(0, Math.min(0.2, value)); // Store initial/target fade
        appState.trailFade = newConfig.TRAIL_FADE_INITIAL; // Apply immediately
        break;
      case "UPDATE_FREQUENCY":
        newConfig.UPDATE_FREQUENCY = Math.max(
          1,
          Math.min(120, Math.floor(value))
        );
        break;
      default:
        console.warn(`Unknown config key updated: ${key}`);
        return; // Don't update state if key is unknown
    }

    appState.config = newConfig; // Update the state config

    if (requiresRegen) {
      console.log(
        `Config ${key} updated. Regenerate (G) or Reset (R) required for full effect.`
      );
    }
  }

  function handleReset() {
    console.log("Resetting simulation...");
    appState.config = { ...initialConfig }; // Reset config to defaults
    const newState = setupSimulation(appState.config);
    appState = { ...appState, ...newState }; // Update sim state
    // Recreate UI to reflect default config values
    if (uiElements) {
      // Remove old UI first
      if (uiElements.uiContainer) uiElements.uiContainer.remove();
      if (uiElements.toggleButton) uiElements.toggleButton.remove();
    }
    uiElements = createUIPanel(
      appState.config,
      handleUIUpdate,
      handleReset,
      handleRegenerate
    );
    // Ensure UI visibility state matches appState
    if (uiElements && uiElements.uiContainer) {
      uiElements.uiContainer.style.right = appState.uiVisible
        ? "0px"
        : "-300px";
    }
  }

  function handleRegenerate() {
    console.log("Regenerating graph...");
    // Regenerate using current config values stored in appState.config
    const newState = setupSimulation(appState.config);
    appState = { ...appState, ...newState }; // Update sim state
  }

  // --- Initialize ---
  const initialState = setupSimulation(appState.config);
  appState = { ...appState, ...initialState };
  // Create UI after initial state is set
  uiElements = createUIPanel(
    appState.config,
    handleUIUpdate,
    handleReset,
    handleRegenerate
  );
  // Set initial UI visibility based on appState
  if (uiElements && uiElements.uiContainer) {
    uiElements.uiContainer.style.right = appState.uiVisible ? "0px" : "-300px";
  }

  // --- Animation Loop ---
  function animate() {
    if (!appState.simulationRunning) return;
    appState.animationId = requestAnimationFrame(animate);

    // --- Update Step ---

    // 1. Apply Trail Effect (Side Effect)
    fadePass.material.opacity = appState.trailFade; // Use state value
    renderer.render(fadePass.scene, fadePass.camera);

    // 2. Run Physics Simulation Steps
    const deltaTimePerStep =
      appState.config.TIME_STEP / appState.config.STEPS_PER_FRAME;
    for (let i = 0; i < appState.config.STEPS_PER_FRAME; i++) {
      // This function mutates appState.particles and appState.constraints
      simulateStep(
        appState.particles,
        appState.constraints,
        appState.config.GRAVITY, // Pass config values
        appState.config.DAMPING,
        deltaTimePerStep
      );
    }

    // 3. Update Cellular Automaton Periodically
    appState.frameCounter++;
    if (appState.frameCounter >= appState.config.UPDATE_FREQUENCY) {
      appState.frameCounter = 0;
      const nextStates = calculateAllNextStates(appState.particles);
      // Apply the new states (Mutates particle state)
      const statesChanged = appState.particles.some(
        (p, i) => !p.pinned && p.state !== nextStates[i]
      );
      if (statesChanged) {
        appState.particles.forEach((p, i) => {
          if (!p.pinned) p.state = nextStates[i];
        });
        // Update visuals based on new states (Side Effect)
        updateParticleMaterials(appState.particles, particleMeshes);
      }
    }

    // 4. Update Visuals (Side Effect: Mutates THREE objects)
    updateVisuals(
      appState.particles,
      particleMeshes,
      appState.constraints,
      lineSegments
    );

    // 5. Update Controls (Side Effect: Mutates controls internal state)
    controls.update();

    // 6. Render Scene (Side Effect)
    renderer.render(scene, camera);
  }

  // --- Event Listeners (Side Effects) ---
  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onWindowResize, false);

  window.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") handleReset();
    if (e.key === "g" || e.key === "G") handleRegenerate();
    if (e.key === "f" || e.key === "F") {
      // Toggle fade using the config value as the 'on' amount
      appState.trailFade =
        appState.trailFade === 0 ? appState.config.TRAIL_FADE_INITIAL : 0;
      console.log("Trail Fade:", appState.trailFade === 0 ? "Off" : "On");
    }
    if (e.key === "u" || e.key === "U") {
      // Toggle UI visibility state
      appState.uiVisible = !appState.uiVisible;
      if (uiElements && uiElements.uiContainer) {
        // Use the drawer slide effect matching the toggle button
        uiElements.uiContainer.style.right = appState.uiVisible
          ? "0px"
          : "-300px";
      }
      console.log("UI Visibility Toggled:", appState.uiVisible);
    }
    if (e.key === "c" || e.key === "C") {
      console.log("Setting constraints currentRestLength to 1");
      // Set the *dynamic* rest length. The base restLength from setup remains.
      appState.constraints.forEach((c) => (c.currentRestLength = 1));
    }
    // Add S (Save) and L (Load) key logic if needed
    if (e.key === "s" || e.key === "S") {
      // Example save: Log particle states
      const stateToSave = appState.particles.map((p) => p.state);
      console.log("Current Particle States:", JSON.stringify(stateToSave));
    }
    if (e.key === "l" || e.key === "L") {
      // Example load: Prompt user for state array (replace with actual loading method)
      try {
        const savedStateJSON = prompt("Paste saved state array (JSON):");
        if (savedStateJSON) {
          const savedStates = JSON.parse(savedStateJSON);
          if (
            Array.isArray(savedStates) &&
            savedStates.length === appState.particles.length
          ) {
            appState.particles.forEach((p, index) => {
              if (!p.pinned && savedStates[index] !== undefined) {
                p.state = savedStates[index];
              }
            });
            updateParticleMaterials(appState.particles, particleMeshes); // Update visuals
            console.log("State loaded.");
          } else {
            console.error("Invalid or mismatched state data.");
          }
        }
      } catch (error) {
        console.error("Failed to parse or load state:", error);
      }
    }
  });

  // --- Start ---
  animate(); // Start the loop
}

// Run the application
main();
