// 4D Hyperspherical Gravity Simulation
document.addEventListener('DOMContentLoaded', () => {
    // Create container element if it doesn't exist
    let container = document.getElementById('3d-container');
    if (!container) {
        container = document.createElement('div');
        container.id = '3d-container';
        container.style.width = '100%';
        container.style.height = '400px';
        container.style.margin = '0 auto';
        document.querySelector('.content').appendChild(container);
    }

    // --- Constants and Configuration ---
    const NUM_SPHERES = 407;
    const G = 0.2;                  // Gravitational constant
    const MIN_MASS = 5.0;
    const MAX_MASS = 300.0;
    const MAX_INITIAL_R = 2000.0;
    const TIME_STEP = 0.16;
    const A = Math.random();
    const B = Math.random();
    const C = Math.random();
    
    const TWO_PI = 2 * Math.PI;

    // --- Global Variables ---
    let scene, camera, renderer, controls;
    let orbiters = [];
    let clock = new THREE.Clock();
    let rabbit = true;

    // --- Helper Functions ---
    function hypersphericalTo4DCartesian(r, theta1, theta2, theta3) {
        const sinTheta1 = Math.sin(theta1);
        const sinTheta2 = Math.sin(theta2);

        const w = r * Math.cos(theta1);
        const z = r * sinTheta1 * Math.cos(theta2);
        const y = r * sinTheta1 * sinTheta2 * Math.cos(theta3);
        const x = r * sinTheta1 * sinTheta2 * Math.sin(theta3);

        return new THREE.Vector4(x, y, z, w);
    }

    function cartesian4DToHyperspherical(vec4) {
        const { x, y, z, w } = vec4;
        const r = vec4.length();

        if (r < 1e-6) {
            return { r: 0, theta1: 0, theta2: 0, theta3: 0 };
        }

        const theta1 = Math.acos(THREE.MathUtils.clamp(w / r, -1, 1));
        const r_xyz = r * Math.sin(theta1);
        let theta2 = 0;
        let theta3 = 0;

        if (r_xyz > 1e-6) {
            theta2 = Math.acos(THREE.MathUtils.clamp(z / r_xyz, -1, 1));
            const r_xy = r_xyz * Math.sin(theta2);

            if (r_xy > 1e-6) {
                theta3 = Math.atan2(x, y);
                if (theta3 < 0) {
                    theta3 += TWO_PI;
                }
            }
        }

        return { r, theta1, theta2, theta3 };
    }

    // --- Orbiter Class ---
    class Orbiter {
        constructor(mass, initial4DPosition, initial4DVelocity) {
            this.mass = mass;
            this.position = initial4DPosition || new THREE.Vector4();
            this.velocity = initial4DVelocity || new THREE.Vector4();
            this.acceleration = new THREE.Vector4();

            const radius = Math.pow(this.mass, 1/2) * 0.7;
            const geometry = new THREE.SphereGeometry(radius, 16, 12);
            
            // Create material - use basic material if texture loading fails
            let material;
            try {
                const loader = new THREE.TextureLoader();
                const texture = loader.load('https://jrwood.dev/images/johnface.jpg');
                material = new THREE.MeshPhysicalMaterial({
                    transparent: true,
                    opacity: 1,
                    map: texture,
                    depthWrite: true,
                    depthTest: true,
                    metalness: 0.9,
                    roughness: 0.1,
                    transmission: 0.8,
                });
            } catch (e) {
                console.warn("Texture loading failed, using basic material", e);
                material = new THREE.MeshPhysicalMaterial({
                    transparent: true,
                    opacity: 1,
                    color: 0x5588ff,
                    depthWrite: true,
                    depthTest: true,
                    metalness: 0.9,
                    roughness: 0.1,
                    transmission: 0.8,
                });
            }

            const initialHyperspherical = cartesian4DToHyperspherical(this.position);
            const initialHue = 0.6;
            material.color.setHSL(initialHue, 1.0, 0.5);
            
            this.mesh = new THREE.Mesh(geometry, material);
            this.mesh.position.set(this.position.x, this.position.y, this.position.z);
        }
    }

    // --- Initialization Function ---
    const shift = new THREE.Vector4(4, -20, 19, 5);
    const shift2 = new THREE.Vector4(-4, 20, -8, -5);
    
    function init() {
        console.log("Initializing 4D Cartesian simulation...");
        try {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x050505);

            // Set up camera
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;
            camera = new THREE.PerspectiveCamera(75, containerWidth / containerHeight, 0.1, 1000);
            camera.position.set(50, 40, 30);

            // Set up renderer
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
            renderer.autoClearColor = false;
            renderer.setSize(containerWidth, containerHeight);
            container.appendChild(renderer.domElement);

            // Add lights
            const pointLight = new THREE.PointLight(0xffffff, 30);
            const pointLight2 = new THREE.PointLight(0xffffff, 30);
            const pointLight3 = new THREE.PointLight(0xffffff, 30);
            const pointLight4 = new THREE.PointLight(0xffffff, 30);
            const pointLight5 = new THREE.PointLight(0xffffff, 30);
            const pointLight6 = new THREE.PointLight(0xffffff, 20);
            
            pointLight.position.set(0, 0, 0);
            scene.add(pointLight);
            pointLight2.position.set(0, -10, -15);
            scene.add(pointLight2);
            pointLight3.position.set(0, -10, -15);
            scene.add(pointLight3);
            pointLight4.position.set(0, -10, -15);
            scene.add(pointLight4);
            pointLight5.position.set(0, -10, -15);
            scene.add(pointLight5);
            pointLight6.position.set(0, -10, -15);
            scene.add(pointLight6);

            // Set up controls
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.025;
            controls.rotateSpeed = 2.0;
            controls.screenSpacePanning = false;
            controls.minDistance = 5;
            controls.maxDistance = 100;
            controls.enableZoom = true;
            controls.enablePan = true;
            controls.autoRotate = true;
            controls.autoRotateSpeed = 6.91;
            controls.update();

            // Create orbiters
            orbiters = [];
            for (let i = 0; i < NUM_SPHERES/2; i++) {
                const mass = i*(MAX_MASS - MIN_MASS)/NUM_SPHERES + MIN_MASS;
                const r = MAX_INITIAL_R;
                const theta1 = i%(A*Math.PI);
                const theta2 = B*i%(Math.PI);
                const theta3 = Math.random() * TWO_PI;

                const initialPos4D = hypersphericalTo4DCartesian(r, theta1, theta2, theta3);
                const initialVel4D = new THREE.Vector4(0, 0, 0, 0);

                const orbiter = new Orbiter(mass, initialPos4D, initialVel4D);
                orbiters.push(orbiter);
                scene.add(orbiter.mesh);
            }

            for (let i = NUM_SPHERES/2; i < NUM_SPHERES; i++) {
                const mass = i*(MAX_MASS - MIN_MASS)/NUM_SPHERES + MIN_MASS;
                const r = MAX_INITIAL_R;
                const theta1 = i%(B*Math.PI);
                const theta2 = A*i%(Math.PI);
                const theta3 = Math.random() * TWO_PI;

                const initialPos4D = hypersphericalTo4DCartesian(r, theta1, theta2, theta3);
                const initialVel4D = new THREE.Vector4(0, 0, 0, 0);

                const orbiter = new Orbiter(mass, initialPos4D, initialVel4D);
                orbiters.push(orbiter);
                scene.add(orbiter.mesh);
            }
            
            window.addEventListener('resize', onWindowResize, false);
            console.log("Initialization complete.");
        } catch (error) {
            console.error("Error during initialization:", error);
            const errorDiv = document.createElement('div');
            errorDiv.style.position = 'absolute';
            errorDiv.style.top = '10px';
            errorDiv.style.left = '10px';
            errorDiv.style.color = 'red';
            errorDiv.style.backgroundColor = 'white';
            errorDiv.style.padding = '10px';
            errorDiv.style.zIndex = '1000';
            errorDiv.textContent = 'An error occurred during initialization. Check the console (F12).';
            container.appendChild(errorDiv);
        }
    }

    // --- Physics Update Function ---
    function updatePhysics(deltaTime) {
        if (!orbiters || orbiters.length === 0) return;

        // Reset accelerations
        for (const orbiter of orbiters) {
            if (orbiter?.acceleration) {
                orbiter.acceleration.set(0, 0, 0, 0);
            }
        }

        // Update light positions
        if (orbiters.length > 24) {
            const pointLights = scene.children.filter(child => child instanceof THREE.PointLight);
            if (pointLights.length >= 6) {
                pointLights[0].position.set(orbiters[0].position.x, orbiters[0].position.y, orbiters[0].position.z);
                pointLights[1].position.set(orbiters[19].position.x, orbiters[0].position.y, orbiters[0].position.z);
                pointLights[2].position.set(orbiters[20].position.x, orbiters[0].position.y, orbiters[0].position.z);
                pointLights[3].position.set(orbiters[21].position.x, orbiters[0].position.y, orbiters[0].position.z);
                pointLights[4].position.set(orbiters[22].position.x, orbiters[0].position.y, orbiters[0].position.z);
                pointLights[5].position.set(orbiters[24].position.x, orbiters[0].position.y, orbiters[0].position.z);
            }
        }

        // Calculate gravitational forces
        for (let i = 0; i < orbiters.length; i++) {
            for (let j = i + 1; j < orbiters.length; j++) {
                const orbiterA = orbiters[i];
                const orbiterB = orbiters[j];

                if (!orbiterA || !orbiterB || !orbiterA.position || !orbiterB.position) continue;

                const deltaPos = new THREE.Vector4().subVectors(orbiterB.position, orbiterA.position);
                const distSq = deltaPos.lengthSq();
                const dist = Math.sqrt(distSq);

                if (dist > 0.00001 && orbiterA.mass > 0 && orbiterB.mass > 0) {
                    const forceMag = (G * orbiterA.mass * orbiterB.mass) / (distSq);
                    const forceScale = (dist > 1e-16) ? (forceMag) : 0;
                    const forceVec = deltaPos.clone().multiplyScalar(forceScale);

                    if (orbiterA.acceleration && orbiterB.acceleration) {
                        orbiterA.acceleration.add(forceVec.clone().divideScalar(orbiterA.mass));
                        orbiterB.acceleration.sub(forceVec.clone().divideScalar(orbiterB.mass));
                    }
                }
            }
        }

        // Update positions
        for (const orbiter of orbiters) {
            if (!orbiter?.velocity || !orbiter?.acceleration || !orbiter?.position || !orbiter?.mesh) {
                continue;
            }

            orbiter.velocity.add(orbiter.acceleration.clone().multiplyScalar(deltaTime));
            orbiter.position.add(orbiter.velocity.clone().multiplyScalar(deltaTime));

            if (orbiter.position && rabbit) {
                const projectedPosition = new THREE.Vector3(
                    orbiter.position.x + shift.x,
                    orbiter.position.y + shift.y,
                    orbiter.position.z + shift.z
                );
                orbiter.mesh.position.copy(projectedPosition);
            } else if (orbiter.position) {
                const projectedPosition = new THREE.Vector3(
                    orbiter.position.x + shift2.x,
                    orbiter.position.y + shift2.y,
                    orbiter.position.z + shift2.z
                );
                orbiter.mesh.position.copy(projectedPosition);
            }
            
            if (Math.random() < 0.5) rabbit = !rabbit;
            
            // Update color based on position
            const currentHyperspherical = cartesian4DToHyperspherical(orbiter.position);
            const currentHue = (currentHyperspherical.theta3) / Math.PI;

            if (!isNaN(currentHue) && orbiter.mesh.material) {
                orbiter.mesh.material.color.setHSL(55, 5.0, 0.9);
            }
        }
    }

    // --- Animation Loop ---
    function animate() {
        try {
            requestAnimationFrame(animate);
            const deltaTime = Math.min(clock.getDelta(), 0.01);

            let accumulatedTime = deltaTime;
            while (accumulatedTime >= TIME_STEP) {
                updatePhysics(TIME_STEP);
                accumulatedTime -= TIME_STEP;
            }
            if (accumulatedTime > 0) {
                updatePhysics(accumulatedTime);
            }

            if (controls) controls.update();
            if (renderer && scene && camera) renderer.render(scene, camera);
        } catch (error) {
            console.error("Error during animation loop:", error);
        }
    }

    // --- Window Resize Handler ---
    function onWindowResize() {
        if (camera && renderer && container) {
            const width = container.clientWidth;
            const height = container.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        }
    }

    // --- Start ---
    // Load Three.js dependencies dynamically
    const loadScript = (url) => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    };

    Promise.all([
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'),
        loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js')
    ]).then(() => {
        init();
        animate();
    }).catch(err => {
        console.error("Failed to load required scripts:", err);
        container.innerHTML = '<p style="color:red">Failed to load Three.js libraries. Check your internet connection.</p>';
    });
});