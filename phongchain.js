// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({
  preserveDrawingBuffer: true,
  alpha: true,
});
renderer.autoClearColor = false;
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Camera position
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.rotateSpeed = 9.0;

controls.enableDamping = true;

controls.dampingFactor = 0.25;
controls.autoRotate = true;
controls.autoRotateSpeed = 90.0;
controls.enableScreenPan = true;
controls.enableZoom = true;

controls.enableKeys = true;
controls.update();



// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 5, 5);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

// Floor (for collisions)
const floorGeometry = new THREE.PlaneGeometry(20, 20);
const floorMaterial = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0.011,
  color: 0xaaaaaa,
  side: THREE.DoubleSide,
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = Math.PI / 2;
floor.position.y = -2;
scene.add(floor);

// Toroidal link class
class ToroidalLink {
    constructor(position, R = 0.9, r = 0.03, mass = 2) {
        this.R = R; // Major radius
        this.r = r; // Minor radius
        this.mass = mass;
        
        // Create torus geometry and mesh
        const geometry = new THREE.TorusGeometry(R, r, 16, 32);
        const material = new THREE.MeshPhongMaterial({
          transparent: true,
          opacity: 0.11,
          color: 0x00ff00,
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        scene.add(this.mesh);

        // Physics properties
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.angularVelocity = new THREE.Vector3(0, 2, 0); // Simplified as Euler rates for now
        this.acceleration = new THREE.Vector3(0, 0, 0);
    }

    applyForce(force) {
        this.acceleration.addScaledVector(force, 1 / this.mass);
    }

    update(dt) {
        // Update velocity and position
        this.velocity.addScaledVector(this.acceleration, dt);
        this.mesh.position.addScaledVector(this.velocity, dt);

        // Update rotation (simplified)
        this.mesh.rotation.x += this.angularVelocity.x * dt;
        this.mesh.rotation.y += this.angularVelocity.y * dt;
        this.mesh.rotation.z += this.angularVelocity.z * dt;

        // Reset acceleration
        this.acceleration.set(0, 0, 0);
    }

    checkCollisionWithFloor() {
        const bottom = this.mesh.position.y - (this.R + this.r);
        if (bottom < floor.position.y) {
            // Elastic collision: reverse y-velocity
            this.velocity.y = -this.velocity.y;
            this.mesh.position.y = floor.position.y + (this.R + this.r); // Correct position
        }
    }
}

// Chain setup
const links = [];
const numLinks = 30;
const spacing = 2.5; // Rough interlock distance
for (let i = 0; i < numLinks; i++) {
    const pos = new THREE.Vector3(0, 2 + i * spacing, 0);
    links.push(new ToroidalLink(pos));
}

// Physics parameters
const gravity = new THREE.Vector3(0, -2.2, 0);
const k = 90; // Spring constant for tension
const equilibriumDist = spacing;

// Animation loop
let lastTime = 0;
function animate(time) {
    requestAnimationFrame(animate);
    const dt = (time - lastTime) / 1000; // Convert to seconds
    lastTime = time;

    // Apply forces and update each link
    for (let i = 0; i < links.length; i++) {
        const link = links[i];

        // Gravity
        link.applyForce(gravity.clone().multiplyScalar(link.mass));

        // Tension from neighbors
        if (i > 0) { // Previous neighbor
            const prev = links[i - 1];
            const delta = link.mesh.position.clone().sub(prev.mesh.position);
            const dist = delta.length();
            const stretch = dist - equilibriumDist;
            const forceMag = k * stretch;
            const force = delta.normalize().multiplyScalar(-forceMag);
            link.applyForce(force);
            prev.applyForce(force.negate()); // Equal and opposite
        }
        if (i < links.length - 1) { // Next neighbor
            const next = links[i + 1];
            const delta = link.mesh.position.clone().sub(next.mesh.position);
            const dist = delta.length();
            const stretch = dist - equilibriumDist;
            const forceMag = k * stretch;
            const force = delta.normalize().multiplyScalar(-forceMag*0.9);
            link.applyForce(force);
            next.applyForce(force.negate());
        }

        // Update physics
        link.update(dt);
        link.checkCollisionWithFloor();
    }

    renderer.render(scene, camera);
}

// Start animation
animate(0);

// Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});