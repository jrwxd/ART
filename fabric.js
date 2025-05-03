if (typeof THREE === "undefined") {
  console.error("Three.js is not loaded. Please include the Three.js library.");
}

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";

// --- Configuration ---
let PARTICLE_COUNT = 55; // Total number of particles
let GRAPH_DENSITY = 0.3; // Probability of edge creation (0-1)
let GRID_SPACING = 30; // Initial distance between particles
let PARTICLE_MASS = 100.0; // Mass of each particle
let SPRING_K_BASE = 60; // Base spring constant (stiffness)
let DAMPING = 1.0; // Reduces oscillations
let GRAVITY = new THREE.Vector3(0, 0, 0); // Acceleration due to gravity
let TIME_STEP = 0.10; // Simulation time step
let PINNED_PARTICLES = [0, 10]; // Indices of pinned particles
let STEPS_PER_FRAME = 1; // Physics steps per frame
let TRAIL_FADE = 0.5; // How much the previous frames fade (0-1)
let UPDATE_FREQUENCY = 30; // Update cell states every N frames
let frameCounter = 0; // To track when to update cell states

// --- Global Variables ---
let scene, camera, renderer, controls;
let particles = []; // Array to hold physics particles
let constraints = []; // Array to hold springs
let particleMeshes = []; // Array to hold the visual THREE.Mesh objects
let lineSegments; // To visualize springs
let uiVisible = true; // UI visibility state
let uiContainer; // UI container element
let animationId; // To store animation frame ID for cancellation
let fadePass; // For trail effect
let adjacencyMatrix = []; // Triangular adjacency matrix for graph structure

// --- Initialization ---
function init() {
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x00a00a);

  // Camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.011,
    10000000
  );
  camera.position.set(100, 100, 100);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  // Renderer - MODIFIED for trail effect
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: true,

    pixelRatio: window.devicePixelRatio,
  });

  renderer.autoClearColor = false;
  renderer.setClearColor(0x000000, 0); // Transparent background
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false; // Don't clear the renderer automatically
  document.body.appendChild(renderer.domElement);

  // Setup fade pass for trail effect
  setupFadePass();

  // Lights
  const ambientLight = new THREE.AmbientLight(0xcc99cc, 0.5);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xeeeeee, 0.8);
  directionalLight.position.set(1, 1, 0.5).normalize();
  scene.add(directionalLight);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.update();
  controls.keys = {
    LEFT: 'ArrowLeft',
    UP: 'ArrowUp',
    RIGHT: 'ArrowRight',
    BOTTOM: 'ArrowDown',
  };
  controls.enablePan = true;
  controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
  controls.dampingFactor = 0.25;
  controls.screenSpacePanning = false;
  controls.maxPolarAngle = Math.PI / 2; // Limit vertical rotation
  controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
  controls.enableZoom = true;
  controls.zoomSpeed = 1.0;
  controls.panSpeed = 5.0;
  controls.minDistance = 1.0; // Minimum zoom distance
  controls.enableRotate = true;
  controls.target.set(0, 0, 0);
  controls.update();

  // Create particles and graph structure
  createGraphBasedSystem();

  // Handle window resize
  window.addEventListener("resize", onWindowResize, false);

  // Add keyboard listener for UI toggle and trail clearing
  window.addEventListener("keydown", (e) => {
    if (e.key === "h" || e.key === "H") {
      toggleUI();
    } else if (e.key === "r" || e.key === "R") {
      // Reset simulation with R key
      resetSimulation();
    } else if (e.key === "f" || e.key === "F") {
      // Toggle fade effect with F key
      TRAIL_FADE = TRAIL_FADE === 0 ? 0.05 : 0;
      fadePass.material.opacity = TRAIL_FADE;
    } else if (e.key === "g" || e.key === "G") {  
      // Regenerate graph with G key
      createGraphBasedSystem();
    } else if (e.key === "u" || e.key === "U") {  
      // Toggle UI visibility with U key
      uiVisible = !uiVisible;
      uiContainer.style.opacity = uiVisible ? "1" : "0";
      uiContainer.style.pointerEvents = uiVisible ? "all" : "none";
    } else if (e.key === "s" || e.key === "S") {  
      // Save current state with S key
      const state = particles.map(p => p.state);
      console.log("Current state saved:", state);
    } else if (e.key === "l" || e.key === "L") {
      // Load saved state with L key
      const savedState = [/* ... */]; // Replace with actual saved state
      particles.forEach((p, index) => {
        p.state = savedState[index] || STATES.WHITE; // Default to white if not defined
        updateParticleColor(p);
      });
    } else if (e.key === "c" || e.key === "C") {
      // set length cf all constraints to 1 with C key
      setAllConstraintsToTargetLength(1);
    }

  });

  // Start animation loop
  animate();
}

// --- Create Adjacency Matrix ---
function createAdjacencyMatrix(nodeCount, density) {
  // Initialize an empty adjacency matrix (triangular)
  const matrix = Array(nodeCount);

  for (let i = 0; i < nodeCount; i++) {
    matrix[i] = Array(i + 1).fill(null);
  }

  // Track the number of edges for each node
  const edgeCounts = Array(nodeCount).fill(0);

  // Populate with random connections based on density and edge limit
  for (let i = 1; i < nodeCount; i++) {
    for (let j = 0; j < i; j++) {
      // Check if both nodes have fewer than 7 edges
      if (edgeCounts[i] < 7 && edgeCounts[j] < 7 && Math.random() < density) {
        const restLength = GRID_SPACING * (0.8 + Math.random() * 0.4); // Some variation
        const k = SPRING_K_BASE * (0.9 + Math.random() * 0.2); // Some variation
        matrix[i][j] = { restLength, k };
            
        // Increment edge counts for both nodes
        edgeCounts[i]++;
        edgeCounts[j]++;
      } else {
        matrix[i][j] = null; // No edge
      }
    }
  }

  return matrix;
}

// --- Create Particles and Graph Structure ---
function createGraphBasedSystem() {
  // Clear existing objects if any
  clearScene();

  // Create the adjacency matrix
  adjacencyMatrix = createAdjacencyMatrix(PARTICLE_COUNT, GRAPH_DENSITY);

  // Create particles in a scattered pattern
  const particleGeo = new THREE.SphereGeometry(0.15, 16, 8);
  const whiteMat = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    emissive: 0x555555,
    transparent: true,
    opacity: 0.08,
  });

  const blackMat = new THREE.MeshPhongMaterial({
    color: 0xaa0000,
    emissive: 0x005500,
    transparent: true,
    opacity: 0.08,
  });

  // Create particles in an interesting pattern (spiral or random)
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Position particles in a spiral
    //const angle = i * 0.5;
      ////  const radius = i * 0.4;
      //const posX = radius * Math.cos(angle);
      //const posY = radius * Math.sin(angle);
      //const posZ = Math.sin(i * 0.2) * 3;
    const posX = Math.random()*10;
    const posY = Math.random() * 10;
    const posZ = Math.random() * 10;

    // Randomly assign initial state (black or white)
    const state = Math.random() < 0.3 ? (Math.random() < 0.5 ? 2 : 0) : 1;

    // Create visual mesh with appropriate material
    const mesh = new THREE.Mesh(
      particleGeo,
      state ? blackMat.clone() : whiteMat.clone()
    );
    mesh.position.set(posX, posY, posZ);
    scene.add(mesh);
    particleMeshes.push(mesh);

    // Create physics particle
    const particle = {
      position: new THREE.Vector3(posX, posY, posZ),
      previousPosition: new THREE.Vector3(posX, posY, posZ),
      velocity: new THREE.Vector3(0, 0, 0),
      acceleration: new THREE.Vector3(0, 0, 0),
      mass: PARTICLE_MASS * (0.8 + Math.random() * 0.4),
      invMass: 1.0 / (PARTICLE_MASS * (0.8 + Math.random() * 0.4)),
      mesh: mesh,
      pinned: PINNED_PARTICLES.includes(i),
      state: state, // Store state
      neighborIndices: [], // Will store neighbor indices
    };

    if (particle.pinned) {
      particle.mesh.material = new THREE.MeshPhongMaterial({
        color: 0xff0000,
        emissive: 0x550000,
      });
    }

    particles.push(particle);
  }

  // Create constraints from adjacency matrix and collect neighbors
  const linePositions = [];

  for (let i = 1; i < adjacencyMatrix.length; i++) {
    for (let j = 0; j < i; j++) {
      if (adjacencyMatrix[i][j]) {
        // Create constraint
        constraints.push({
          p1_idx: i,
          p2_idx: j,
          restLength: adjacencyMatrix[i][j].restLength,
          k: adjacencyMatrix[i][j].k,
        });

        // Store neighbors for cellular automaton logic
        particles[i].neighborIndices.push(j);
        particles[j].neighborIndices.push(i);

        // Add line segments for visualization
        linePositions.push(
          particles[i].position.x,
          particles[i].position.y,
          particles[i].position.z,
          particles[j].position.x,
          particles[j].position.y,
          particles[j].position.z
        );
      }
    }
  }

  // Create line geometry for visualizing springs
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x646567,
    transparent: true,
    opacity: 0.1,
    linewidth: 1,
  });

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(linePositions, 3)
  );
  lineSegments = new THREE.LineSegments(lineGeo, lineMat);
  scene.add(lineSegments);
}

// --- Totalistic Cellular Automaton System ---

// Define state values
const STATES = {
  WHITE: 0,
  GRAY: 1,
  BLACK: 2
};

// Totalistic rule function - determines new state based on sum of neighbor states
function getNextState(currentState, neighbors) {
  // Calculate the total sum of all neighbor states
  const neighborSum = neighbors.reduce((sum, index) => sum + particles[index].state, 0);
  
  switch(currentState) {
    case STATES.WHITE:
      if (neighborSum <= 5) return STATES.WHITE;      // Few active neighbors, stay white
      else if (neighborSum <= 10) return STATES.BLACK;  // Medium activity, become gray
      else return STATES.BLACK;                       // High activity, become black
      
    case STATES.GRAY:
      if (neighborSum <= 1) return STATES.WHITE;      // Very little activity, become white
      else if (neighborSum <= 10) return STATES.GRAY;  // Medium activity, stay gray
      else return STATES. GRAY;                       // High activity, become black
      
    case STATES.BLACK:
      if (neighborSum <= 7) return STATES.GRAY;
      else if (neighborSum <= 10) return STATES.BLACK;  // Medium activity, become gray
      else return STATES.GRAY;                       // High activity, become white
  }
  
  return currentState; // Default fallback
}

// --- Update Cell States Based on Neighbors ---
function updateCellStates() {
  // Create array to hold new states (don't update immediately to avoid cascade effects)
  const newStates = [];

  // Check each particle's neighbors and determine new state
  for (let i = 0; i < particles.length; i++) {
    const particle = particles[i];

    // Skip pinned particles
    if (particle.pinned) {
      newStates.push(particle.state);
      continue;
    }
    
    // Get next state using totalistic rule



    const nextState = getNextState(particle.state, particle.neighborIndices);
    newStates.push(nextState);
  }

  // Apply new states and update visual appearance
  for (let i = 0; i < particles.length; i++) {
    if (particles[i].pinned) continue;
    
    particles[i].state = newStates[i];

    // Update visual appearance based on state
    switch(newStates[i]) {
      case STATES.BLACK:
        particles[i].mesh.material.color.set(0x00cc00);
        particles[i].mesh.material.emissive.set(0x0cc000);
        break;
      case STATES.GRAY:
        particles[i].mesh.material.color.set(0x888888);
        particles[i].mesh.material.emissive.set(0x222222);
        break;
      case STATES.WHITE:
        particles[i].mesh.material.color.set(0xffffff);
        particles[i].mesh.material.emissive.set(0x5cc5555);
        break;
    }
  }
}

function updateParticleColor(particle) {
  switch (particle.state) {
    case STATES.BLACK:
      particle.mesh.material.color.set(0x000000);
      particle.mesh.material.emissive.set(0x000000);
      break;
    case STATES.GRAY:
      particle.mesh.material.color.set(0x888888);
      particle.mesh.material.emissive.set(0x222222);
      break;
    case STATES.WHITE:
      particle.mesh.material.color.set(0xffffff);
      particle.mesh.material.emissive.set(0x5cc5555);
      break;
  }
}
// --- Function to make all constraints the same target length --
function setAllConstraintsToTargetLength(targetLength) {
  constraints.forEach((constraint) => {
    constraint.restLength = targetLength;
  });
}
// --- Physics Simulation Step ---
function simulate(deltaTime) {
  // 1. Apply global forces and reset acceleration
  particles.forEach((p) => {
    if (p.pinned) {
      p.acceleration.set(0, 0, 0);
      p.velocity.set(0, 0, 0);
      return;
    }

    // Reset acceleration
    p.acceleration.set(0, 0, 0);

    // Apply gravity
    p.acceleration.add(GRAVITY);

    // Apply damping
    const dampingForce = p.velocity.clone().multiplyScalar(-DAMPING);
    p.acceleration.addScaledVector(dampingForce, p.invMass);
  });

  // 2. Apply spring forces from constraints
  constraints.forEach((c) => {
    const p1 = particles[c.p1_idx];
    const p2 = particles[c.p2_idx];

    // Calculate direction vector
    const direction = p2.position.clone().sub(p1.position);
    const currentLength = direction.length();

    if (currentLength === 0) return;

    // Calculate spring force
    const displacement = currentLength - c.restLength;
    const force = c.k * displacement;

    // Normalize direction vector
    direction.normalize();

    // Adjust rest length based on both particles' states
    const stateSum = p1.state + p2.state;

    // Black-black connections expand
    if (p1.state === STATES.BLACK && p2.state === STATES.GRAY) {
      c.restLength = c.restLength + stateSum * 0.2;
    }
    // White-white connections contract
    else if (p1.state === STATES.WHITE && p2.state === STATES.GRAY) {
      c.restLength = c.restLength - stateSum * 0.2;
    }
    // Mixed connections maintain length with slight variation
    else {
      c.restLength = c.restLength;
    }

    // Ensure minimum spring length
    c.restLength = Math.max(0.1, c.restLength);
    // Ensure maximum spring length
    c.restLength = Math.min(100.0, c.restLength);

    if (c.restLength > 2.0) {
      p1.pinned = true;
      p2.pinned = true;
    }

    // Apply forces to particles
    if (!p1.pinned) {
      p1.acceleration.addScaledVector(direction, force * p1.invMass);
    }

    if (!p2.pinned) {
      p2.acceleration.addScaledVector(direction, -force * p2.invMass);
    }
  });

  // 3. Update positions and velocities
  particles.forEach((p) => {
    if (p.pinned) return;

    // Update velocity
    p.velocity.addScaledVector(p.acceleration, deltaTime);

    // Update position
    p.position.addScaledVector(p.velocity, deltaTime);
  });
}

// --- Update Mesh Positions ---
function updateMeshes() {
  // Update sphere positions
  for (let i = 0; i < particles.length; i++) {
    particles[i].mesh.position.copy(particles[i].position);
  }

  // Update line segment positions
  const positions = lineSegments.geometry.attributes.position.array;
  let posIndex = 0;

  for (let i = 0; i < constraints.length; i++) {
    const p1 = particles[constraints[i].p1_idx];
    const p2 = particles[constraints[i].p2_idx];

    positions[posIndex++] = p1.position.x;
    positions[posIndex++] = p1.position.y;
    positions[posIndex++] = p1.position.z;
    positions[posIndex++] = p2.position.x;
    positions[posIndex++] = p2.position.y;
    positions[posIndex++] = p2.position.z;
  }

  lineSegments.geometry.attributes.position.needsUpdate = true;
}

// --- Animation Loop ---
function animate() {
  animationId = requestAnimationFrame(animate);

  // Apply fade effect for trails
  fadePass.material.opacity = TRAIL_FADE;
  renderer.render(fadePass.scene, fadePass.camera);

  // Run physics simulation
  for (let i = 0; i < STEPS_PER_FRAME; i++) {
    simulate(TIME_STEP / STEPS_PER_FRAME);
  }

  // Update cellular automaton every UPDATE_FREQUENCY frames
  frameCounter++;
  if (frameCounter >= UPDATE_FREQUENCY) {
    updateCellStates();
    frameCounter = 0;
  }

  // Update mesh positions
  updateMeshes();

  // Update controls
  controls.update();

  // Render scene
  renderer.render(scene, camera);
}

// --- Window Resize Handler ---
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Clear Scene ---
function clearScene() {
  // Remove all particles
  particles.forEach((p) => {
    scene.remove(p.mesh);
  });
  particles = [];
  particleMeshes = [];

  // Remove line segments
  if (lineSegments) {
    scene.remove(lineSegments);
    lineSegments = null;
  }

  constraints = [];

  // Clear renderer
  renderer.clear();
}

// --- Reset Simulation ---
function resetSimulation() {
  // Stop animation loop
  cancelAnimationFrame(animationId);

  // Clear the scene
  clearScene();

  // Create new grid
  createGraphBasedSystem();

  // Restart animation
  animate();
}

// --- Create Mobile-Friendly UI ---
function createUI() {
  // Remove existing UI if any
  if (uiContainer) {
    document.body.removeChild(uiContainer);
  }

  // Create UI container (drawer)
  uiContainer = document.createElement("div");
  uiContainer.style.position = "fixed";
  uiContainer.style.top = "0";
  uiContainer.style.right = "-300px"; // Hidden by default
  uiContainer.style.width = "300px";
  uiContainer.style.height = "100%";
  uiContainer.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
  uiContainer.style.padding = "15px";
  uiContainer.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.5)";
  uiContainer.style.transition = "right 0.3s ease";
  uiContainer.style.zIndex = "100";

  // Create title
  const title = document.createElement("h3");
  title.textContent = "Simulation Controls";
  title.style.color = "white";
  title.style.margin = "0 0 15px 0";
  uiContainer.appendChild(title);

  // Helper function to create sliders
  function createSlider(label, min, max, value, step, onChange) {
    const container = document.createElement("div");
    container.style.marginBottom = "15px";

    const labelElement = document.createElement("label");
    labelElement.textContent = `${label}: ${value}`;
    labelElement.style.color = "white";
    labelElement.style.display = "block";
    labelElement.style.marginBottom = "5px";
    container.appendChild(labelElement);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = min;
    slider.max = max;
    slider.value = value;
    slider.step = step;
    slider.style.width = "100%";
    slider.style.marginBottom = "5px";
    slider.style.height = "30px"; // Larger slider for mobile
    slider.style.cursor = "pointer";
    container.appendChild(slider);

    slider.addEventListener("input", () => {
      const newValue = parseFloat(slider.value);
      labelElement.textContent = `${label}: ${newValue}`;
      onChange(newValue);
    });

    return container;
  }

  // Add sliders for parameters
  uiContainer.appendChild(
    createSlider("Particle Count", 5, 100, PARTICLE_COUNT, 1, (value) => {
      PARTICLE_COUNT = value;
    })
  );

  uiContainer.appendChild(
    createSlider("Graph Density", 0.1, 1.0, GRAPH_DENSITY, 0.05, (value) => {
      GRAPH_DENSITY = value;
    })
  );

  uiContainer.appendChild(
    createSlider("Grid Spacing", 0.1, 10, GRID_SPACING, 0.1, (value) => {
      GRID_SPACING = value;
    })
  );

  uiContainer.appendChild(
    createSlider("Spring Stiffness", 1, 1000, SPRING_K_BASE, 1, (value) => {
      SPRING_K_BASE = value;
    })
  );

  uiContainer.appendChild(
    createSlider("Damping", 0, 8, DAMPING, 0.01, (value) => {
      DAMPING = value;
    })
  );

  uiContainer.appendChild(
    createSlider("Gravity", -20, 20, GRAVITY.y, 0.1, (value) => {
      GRAVITY.y = value;
    })
  );

  // Add UI to the page
  document.body.appendChild(uiContainer);

  // Create a floating button to toggle the drawer
  const toggleButton = document.createElement("button");
  toggleButton.textContent = "☰";
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
  toggleButton.style.zIndex = "101";

  toggleButton.addEventListener("click", () => {
    const isOpen = uiContainer.style.right === "0px";
    uiContainer.style.right = isOpen ? "-300px" : "0px";
  });

  // Add the toggle button to the page
  document.body.appendChild(toggleButton);
}

// --- Toggle UI Visibility ---
function toggleUI() {
  uiVisible = !uiVisible;
  uiContainer.style.opacity = uiVisible ? "1" : "0";
  uiContainer.style.pointerEvents = uiVisible ? "all" : "none";
}

// --- Setup Fade Pass for Trails ---
function setupFadePass() {
  // Create an orthographic camera for rendering the fade quad
  const fadeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Create a scene with a quad that covers the entire screen
  const fadeScene = new THREE.Scene();
  const fadeMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000, // Black color for fading
    transparent: true,
    opacity: TRAIL_FADE, // Use the configurable fade amount
  });

  const fadeGeometry = new THREE.PlaneGeometry(2, 2);
  const fadeMesh = new THREE.Mesh(fadeGeometry, fadeMaterial);
  fadeScene.add(fadeMesh);

  // Store references to the fade pass components
  fadePass = {
    scene: fadeScene,
    camera: fadeCamera,
    material: fadeMaterial,
  };
}

// --- Start ---

// Initialize the simulation and UI
init();
createUI();

function validateParameters() {
  PARTICLE_COUNT = Math.max(5, Math.min(100, PARTICLE_COUNT));
  GRAPH_DENSITY = Math.max(0.1, Math.min(1.0, GRAPH_DENSITY));
  GRID_SPACING = Math.max(0.1, Math.min(10, GRID_SPACING));
  SPRING_K_BASE = Math.max(1, Math.min(1000, SPRING_K_BASE));
  DAMPING = Math.max(0, Math.min(8, DAMPING));
}

function initializeStates(pattern = "random") {
  particles.forEach((particle, index) => {
    switch (pattern) {
      case "checkerboard":
        particle.state = (index % 2 === 0) ? STATES.BLACK : STATES.WHITE;
        break;
      case "random":
      default:
        particle.state = Math.random() < 0.3 ? STATES.BLACK : STATES.WHITE;
        break;
    }
    updateParticleColor(particle);
  });
}
