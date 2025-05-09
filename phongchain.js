// --- Configuration Constants ---
const NUM_LINKS = 400; // Increased number of links for a better chain effect
const LINK_SPACING = 1 // Adjusted spacing for closer links
const LINK_MAJOR_RADIUS = 4;
const LINK_MINOR_RADIUS = 1; // Made links thicker
const LINK_MASS_BASE = 10;
const LINK_COLOR_START = 0xCCCfff; // Cyan start
const LINK_COLOR_END = 0x00FfCC; // Magenta end
const TIME_STEP = 0.0016; // Fixed time step for physics simulation


const FLOOR_Y = -5000; // Lowered the floor
const GRAVITY = new THREE.Vector3(0, 0 ,0); // Stronger gravity
const SPRING_CONSTANT = 40; // Adjusted spring constant
const DAMPING_FACTOR = 0.7; // Added damping to reduce oscillations
const RESTITUTION = 0.0; // Bounciness factor for floor collision

// --- Scene Setup ---
// THREE will be available globally from the <script> tag
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
const renderer = new THREE.WebGLRenderer({
    antialias: true, // Enable anti-aliasing for smoother edges
    alpha: true,
});
// renderer.preserveDrawingBuffer = true; // Usually not needed unless taking screenshots
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
// renderer.autoClearColor = false; // Keep default unless specific layering needed
document.body.appendChild(renderer.domElement);

// --- Camera and Controls ---
camera.position.set(NUM_LINKS * LINK_SPACING * 0.5, NUM_LINKS * LINK_SPACING * 0.3, NUM_LINKS * LINK_SPACING * 1.2); // Adjusted initial camera position
camera.lookAt(0, 0, 0); // Look at the center

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enableZoom = true; // Allow zoomin
controls.dampingFactor = 0.1; // Smoother damping
controls.rotateSpeed = 0.5;
controls.panSpeed = 0.5; // Adjusted pan speed
// controls.autoRotate = true; // Disable auto-rotate for manual control focus
// controls.autoRotateSpeed = 0.5;

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0x606060); // Softer ambient light
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Slightly less intense directional
directionalLight.position.set(50, 100, 50);
directionalLight.castShadow = true; // Enable shadows if needed (requires setup)
scene.add(directionalLight);

// --- Floor ---
const floorGeometry = new THREE.PlaneGeometry(200, 200); // Larger floor
const floorMaterial = new THREE.MeshStandardMaterial({ // Use StandardMaterial for better lighting
    color: 0x888888,
    roughness: 0.38,
    metalness: 1.0,
    side: THREE.DoubleSide,
    transparent: true, // Make floor opaque unless needed
    opacity: 0.0005,
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2; // Correct rotation for plane facing up
floor.position.y = FLOOR_Y;
floor.receiveShadow = true; // Allow floor to receive shadows
scene.add(floor);

// --- Toroidal Link Class ---
class ToroidalLink {
    constructor(position, R, r, mass, color) {
        this.R = R; // Major radius
        this.r = r; // Minor radius
        this.mass = mass;
        this.invMass = 1 / this.mass; // Store inverse mass for efficiency

        const geometry = new THREE.TorusGeometry(R, r, 16, 32);
        const material = new THREE.MeshPhongMaterial({
            color: color,
            shininess: 100, // Add some shininess
            transparent: true, // Keep opaque unless needed
            opacity: 0.1,
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        this.mesh.castShadow = true; // Allow links to cast shadows
        scene.add(this.mesh);

        // Physics properties
        this.velocity = new THREE.Vector3();
        this.acceleration = new THREE.Vector3();
        //Angular velocity simulation is complex; keeping it simple for now
        this.angularVelocity = new THREE.Vector3(0, 4, 0);
        this.angularAcceleration = new THREE.Vector3(); // Added angular acceleration
    }

    applyForce(force, point = this.mesh.position) {
        // F = ma => a = F/m = F * invMass
        this.acceleration.addScaledVector(force, this.invMass);

        // Calculate torque: τ = r × F (cross product of lever arm and force)
        const leverArm = new THREE.Vector3().subVectors(point, this.mesh.position); // r = point - center
        const torque = new THREE.Vector3().crossVectors(leverArm, force);

        // Update angular acceleration: α = τ / I (simplified as τ * invMass for uniform density)
        this.angularAcceleration.addScaledVector(torque, this.invMass);
    }

    update(dt) {
        // Apply gravity (constant acceleration)
        this.acceleration.add(GRAVITY);

        // Update velocity: v = v0 + a * dt
        this.velocity.addScaledVector(this.acceleration, dt);

        // Apply damping: v = v * dampingFactor
        this.velocity.multiplyScalar(DAMPING_FACTOR);

        // Update position: p = p0 + v * dt
        this.mesh.position.addScaledVector(this.velocity, dt);

        // Update angular velocity: ω = ω0 + α * dt
        this.angularVelocity.addScaledVector(this.angularAcceleration, dt);

        // Apply damping to angular velocity
        this.angularVelocity.multiplyScalar(DAMPING_FACTOR);

        // Update rotation: θ = θ0 + ω * dt
        this.mesh.rotation.x += this.angularVelocity.x * dt;
        this.mesh.rotation.y += this.angularVelocity.y * dt;
        this.mesh.rotation.z += this.angularVelocity.z * dt;

        // Reset acceleration and angular acceleration for the next frame
        this.acceleration.set(0, 0, 0);
        this.angularAcceleration.set(0, 0, 0);
    }

    checkCollisionWithFloor() {
        // Approximate bottom point of the torus
        const bottomY = this.mesh.position.y - this.r; // Use minor radius for collision check
        if (bottomY < FLOOR_Y) {
            // Move the link back above the floor
            this.mesh.position.y = FLOOR_Y + this.r;

            // Reflect and dampen the y-velocity (bounce)
            if (this.velocity.y < 0) { // Only bounce if moving downwards
                this.velocity.y *= -RESTITUTION;
            }

            // Optional: Apply friction by reducing x/z velocity
            this.velocity.x *= 0.99;
            this.velocity.z *= 0.99;
        }
    }
}

// --- Chain Creation ---
const links = [];
const startColor = new THREE.Color(LINK_COLOR_START);
const endColor = new THREE.Color(LINK_COLOR_END);

for (let i = 0; i < NUM_LINKS; i++) {
    const t = i / (NUM_LINKS - 1 || 1); // Normalized position in chain (0 to 1)
    const pos = new THREE.Vector3(0, 50 - i * LINK_SPACING * 0.5, 0); // Start vertically
    const mass = LINK_MASS_BASE; // Slightly increasing mass down the chain
    const color = startColor.clone().lerp(endColor, t); // Interpolate color
    links.push(new ToroidalLink(pos, LINK_MAJOR_RADIUS, LINK_MINOR_RADIUS, mass, color));
}

// --- Physics Calculation Variables (Pre-allocate to avoid GC) ---
const delta = new THREE.Vector3();
const force = new THREE.Vector3();
const equilibriumDist = LINK_MAJOR_RADIUS * 0.91; // Adjusted equilibrium based on R


// --- Animation Loop ---
const clock = new THREE.Clock();
clock.start();
let lastTime = 0; // Store last time for fixed time step

function animate() {
    // --- Fixed Time Step ---
    const currentTime = clock.getElapsedTime();
    let dt = currentTime - lastTime; // Calculate delta time
    if (dt < TIME_STEP) return; // Skip frame if too fast
    dt = Math.min(dt, TIME_STEP); // Clamp dt to fixed time step
    lastTime = currentTime; // Update lastTime for the next frame

    // --- Physics Update ---
    for (let i = 0; i < links.length; i++) {
        const link = links[i];

        // Apply spring forces between adjacent links
        if (i > 0) { // Link above
            const prev = links[i - 1];
            delta.subVectors(link.mesh.position, prev.mesh.position); // Reuse delta vector
            const dist = delta.length();
            if (dist > 1e-6) { // Avoid division by zero if links overlap perfectly
                const stretch = dist - equilibriumDist;
                const forceMag = SPRING_CONSTANT * stretch;
                force.copy(delta).normalize().multiplyScalar(-forceMag); // Reuse force vector
                link.applyForce(force);
                // Apply equal and opposite force to the previous link
                prev.applyForce(force.negate()); // Negate in-place is efficient
            }
        }
    }

    // --- Update and Collision Check ---
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        link.update(dt); // Pass dt
        link.checkCollisionWithFloor();
    }

    // --- Rendering ---
    controls.update(); // Update controls if damping is enabled
    renderer.render(scene, camera);
}

// Use renderer's animation loop
renderer.setAnimationLoop(animate);

// --- Resize Handler ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});