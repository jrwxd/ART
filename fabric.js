import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";

// --- Configuration ---
let PARTICLE_COUNT = 25; // Total number of particles
let GRAPH_DENSITY = 0.3; // Probability of edge creation (0-1)
let GRID_SPACING = 3; // Initial distance between particles
let PARTICLE_MASS = 100.0; // Mass of each particle
let SPRING_K_BASE = 60; // Base spring constant (stiffness)
let DAMPING = 1.0; // Reduces oscillations
let GRAVITY = new THREE.Vector3(0, 0, 0); // Acceleration due to gravity
let TIME_STEP = 0.0016; // Simulation time step
let PINNED_PARTICLES = [0, 5]; // Indices of pinned particles
let STEPS_PER_FRAME = 1; // Physics steps per frame
let TRAIL_FADE = 0.05; // How much the previous frames fade (0-1)
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
  scene.background = new THREE.Color(0x111111);

  // Camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.011,
    10000000
  );
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  // Renderer - MODIFIED for trail effect
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: true,
  });

  renderer.autoClearColor = false;
  renderer.setClearColor(0x000000, 0); // Transparent background
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false; // Don't clear the renderer automatically
  document.body.appendChild(renderer.domElement);

  // Setup fade pass for trail effect
  setupFadePass();

  // Lights
  const ambientLight = new THREE.AmbientLight(0xcccccc, 0.5);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 1, 0.5).normalize();
  scene.add(directionalLight);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.update();

  // Create particles and graph structure
  createGraphBasedSystem();

  // Create UI
  createUI();

  // Handle window resize
  window.addEventListener("resize", onWindowResize, false);

  // Add keyboard listener for UI toggle and trail clearing
  window.addEventListener("keydown", (e) => {
    if (e.key === "h" || e.key === "H") {
      toggleUI();
    } else if (e.key === "c" || e.key === "C") {
      // Clear trails with C key
      renderer.clear();
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

  // Populate with random connections based on density
  for (let i = 1; i < nodeCount; i++) {
    for (let j = 0; j < i; j++) {
      // Random probability check for creating an edge
      if (Math.random() < density) {
        const restLength = GRID_SPACING * (0.8 + Math.random() * 0.4); // Some variation
        const k = SPRING_K_BASE * (0.9 + Math.random() * 0.2); // Some variation
        matrix[i][j] = { restLength, k };
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
    opacity: 0.8,
  });

  const blackMat = new THREE.MeshPhongMaterial({
    color: 0x000000,
    emissive: 0x000000,
    transparent: true,
    opacity: 0.8,
  });

  // Create particles in an interesting pattern (spiral or random)
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Position particles in a spiral
    const angle = i * 0.5;
    const radius = i * 0.4;
    const posX = radius * Math.cos(angle);
    const posY = radius * Math.sin(angle);
    const posZ = Math.sin(i * 0.2) * 3;

    // Randomly assign initial state (black or white)
    const isBlack = Math.random() < 0.5;

    // Create visual mesh with appropriate material
    const mesh = new THREE.Mesh(
      particleGeo,
      isBlack ? blackMat.clone() : whiteMat.clone()
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
      isBlack: isBlack, // Store state
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
    color: 0x666666,
    transparent: true,
    opacity: 0.4,
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

// --- Update Cell States Based on Neighbors ---
function updateCellStates() {
  // Create array to hold new states (don't update immediately to avoid cascade effects)
  const newStates = [];

  // Check each particle's neighbors and determine new state
  for (let i = 0; i < particles.length; i++) {
    const particle = particles[i];

    // Skip pinned particles
    if (particle.pinned) {
      newStates.push(particle.isBlack);
      continue;
    }

    // Count black neighbors
    let blackNeighborCount = 0;
    let totalNeighbors = particle.neighborIndices.length;

    for (let j = 0; j < particle.neighborIndices.length; j++) {
      const neighborIndex = particle.neighborIndices[j];
      if (particles[neighborIndex].isBlack) {
        blackNeighborCount++;
      }
    }

    // Apply rules:
    // 1. If a black particle has mostly black neighbors, it becomes white
    // 2. If a white particle has 2+ black neighbors, it becomes black  
    let newState = particle.isBlack;

    if (particle.isBlack) {
      // Black cell with majority black neighbors becomes white
      if (blackNeighborCount > totalNeighbors / 2) {
        newState = false;
      }
    } else {
      // White cell with 3+ black neighbors becomes black
      if (blackNeighborCount >= 2) {
        newState = true;
      }
    }

    newStates.push(newState);
  }

  // Apply new states
  for (let i = 0; i < particles.length; i++) {
    particles[i].isBlack = newStates[i];

    // Update visual appearance
    if (particles[i].pinned) continue;

    if (newStates[i]) {
      // Black
      particles[i].mesh.material.color.set(0x000000);
      particles[i].mesh.material.emissive.set(0x000000);
    } else {
      // White
      particles[i].mesh.material.color.set(0xffffff);
      particles[i].mesh.material.emissive.set(0x555555);
    }
  }
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
    if (p1.isBlack && p2.isBlack) {
      c.restLength = c.restLength + 0.1;
    }
    
    if (!p1.isBlack && !p2.isBlack) {
      c.restLength = c.restLength - 0.1;
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

// --- Create UI ---
function createUI() {
  // Remove existing UI if any
  if (uiContainer) {
    document.body.removeChild(uiContainer);
  }

  // Create UI container
  uiContainer = document.createElement("div");
  uiContainer.style.position = "absolute";
  uiContainer.style.top = "10px";
  uiContainer.style.left = "10px";
  uiContainer.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
  uiContainer.style.padding = "15px";
  uiContainer.style.borderRadius = "5px";
  uiContainer.style.color = "white";
  uiContainer.style.fontFamily = "Arial, sans-serif";
  uiContainer.style.transition = "opacity 0.3s ease";
  uiContainer.style.zIndex = "100";

  // Create title
  const title = document.createElement("h3");
  title.textContent = "Cloth Simulation Controls";
  title.style.margin = "0 0 10px 0";
  uiContainer.appendChild(title);

  // Create hide/show tip
  const hideTip = document.createElement("div");
  hideTip.textContent = "Press H to hide/show controls";
  hideTip.style.fontSize = "10px";
  hideTip.style.marginBottom = "15px";
  hideTip.style.opacity = "0.7";
  uiContainer.appendChild(hideTip);

  // Helper function to create sliders
  function createSlider(label, min, max, value, step, onChange) {
    const container = document.createElement("div");
    container.style.marginBottom = "10px";

    const labelElement = document.createElement("label");
    labelElement.textContent = `${label}: ${value}`;
    labelElement.style.display = "block";
    labelElement.style.marginBottom = "5px";
    container.appendChild(labelElement);

    const sliderContainer = document.createElement("div");
    sliderContainer.style.display = "flex";
    sliderContainer.style.alignItems = "center";
    container.appendChild(sliderContainer);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = min;
    slider.max = max;
    slider.value = value;
    slider.step = step;
    slider.style.flexGrow = "1";
    slider.style.marginRight = "10px";
    sliderContainer.appendChild(slider);

    const valueDisplay = document.createElement("span");
    valueDisplay.textContent = value;
    valueDisplay.style.width = "40px";
    valueDisplay.style.textAlign = "right";
    sliderContainer.appendChild(valueDisplay);

    slider.addEventListener("input", () => {
      const newValue = parseFloat(slider.value);
      valueDisplay.textContent = newValue;
      labelElement.textContent = `${label}: ${newValue}`;
      onChange(newValue);
    });

    return container;
  }

  // Create checkbox helper
  function createCheckbox(label, checked, onChange) {
    const container = document.createElement("div");
    container.style.marginBottom = "10px";
    container.style.display = "flex";
    container.style.alignItems = "center";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.style.marginRight = "10px";
    container.appendChild(checkbox);

    const labelElement = document.createElement("label");
    labelElement.textContent = label;
    container.appendChild(labelElement);

    checkbox.addEventListener("change", () => {
      onChange(checkbox.checked);
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
      // Update all constraints to use the new spring constant
      constraints.forEach(
        (c) => (c.k = value * (c.k === SPRING_K_BASE * 0.7 ? 0.7 : 1))
      );
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

  uiContainer.appendChild(
    createSlider("Mass", 1, 500, PARTICLE_MASS, 1, (value) => {
      PARTICLE_MASS = value;
      // Update all particles to use the new mass
      particles.forEach((p) => {
        p.mass = value;
        p.invMass = 1.0 / value;
      });
    })
  );

  uiContainer.appendChild(
    createSlider("Physics Steps", 1, 20, STEPS_PER_FRAME, 1, (value) => {
      STEPS_PER_FRAME = value;
    })
  );

  // Add checkbox for pinned corners
  uiContainer.appendChild(
    createCheckbox("Pin Corners", PINNED_PARTICLES.length > 0, (value) => {
      PINNED_PARTICLES = value ? [0, 5] : [];
      // Reset simulation when this changes
      resetSimulation();
    })
  );

  // Create button helper
  function createButton(label, onClick) {
    const button = document.createElement("button");
    button.textContent = label;
    button.style.padding = "8px 16px";
    button.style.margin = "5px";
    button.style.backgroundColor = "#4CAF50";
    button.style.border = "none";
    button.style.borderRadius = "4px";
    button.style.color = "white";
    button.style.cursor = "pointer";
    button.addEventListener("click", onClick);

    // Hover effect
    button.addEventListener("mouseover", () => {
      button.style.backgroundColor = "#45a049";
    });
    button.addEventListener("mouseout", () => {
      button.style.backgroundColor = "#4CAF50";
    });

    return button;
  }

  // Add reset and redraw buttons
  const buttonContainer = document.createElement("div");
  buttonContainer.style.display = "flex";
  buttonContainer.style.justifyContent = "space-between";
  buttonContainer.style.marginTop = "15px";

  buttonContainer.appendChild(
    createButton("Reset", () => {
      // Reset particle positions but keep current parameters
      particles.forEach((p) => {
        const idx = particles.indexOf(p);
        const x = idx % GRID_WIDTH;
        const y = Math.floor(idx / GRID_WIDTH);

        p.position.set(
          x * GRID_SPACING,
          y * GRID_SPACING,
          Math.sin(x * 0.5) * Math.cos(y * 0.5) * 0.5
        );
        p.velocity.set(0, 0, 0);
        p.acceleration.set(0, 0, 0);
      });
    })
  );

  buttonContainer.appendChild(
    createButton("Redraw", () => {
      resetSimulation();
    })
  );

  // Add a button to regenerate the graph
  buttonContainer.appendChild(
    createButton("Regenerate Graph", () => {
      createGraphBasedSystem();
    })
  );

  uiContainer.appendChild(buttonContainer);

  // Add UI to the page
  document.body.appendChild(uiContainer);
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
init();
