 // Setup Three.js scene
 const scene = new THREE.Scene();
 //Fog setup
 //const fogColor = new THREE.Color(0x110011); // Dark purple fog
 //const fogNear = 30; // Distance at which fog starts
 //const fogFar = 190; // Distance at which fog is at its densest
 //scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);

 const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.2, 5700);
 camera.position.set(300, 300, 300);
 camera.lookAt(0, 0, 200); // Look at the center of the scene
 camera.far = 18000; // Set far plane distance
 camera.updateProjectionMatrix(); // Update the projection matrix to apply the new far plane distance


 let newBodyVelocityScale = 0.0; // variable for new body velocity

 const renderer = new THREE.WebGLRenderer({preserveDrawingBuffer: true,alpha: true, antialiasing: false});
 renderer.autoClearColor = false;
 renderer.setClearColor(0x000000, 1); // Set background color to black
 //const renderer = new THREE.WebGLRenderer();
 renderer.setPixelRatio(window.devicePixelRatio);
 //renderer.setClearColor(0x000000, 1); // Set background color to black
 renderer.setSize(window.innerWidth, window.innerHeight);
 document.body.appendChild(renderer.domElement);

 // Orbit Controls
 const controls = new THREE.OrbitControls(camera, renderer.domElement);
 controls.enableZoom = true; // Enable zooming
 controls.enablePan = true; // Enable panning
 controls.autoRotate = true; // Disable auto-rotation
 controls.autoRotateSpeed = 1.1; // Set auto-rotation speed
 controls.update();
 // Lights
 const ambientLight = new THREE.AmbientLight(0x304060, 8); // Soft white light
 scene.add(ambientLight);
 const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
 directionalLight.position.set(-4, -1, -3).normalize();
 directionalLight.castShadow = true;
 directionalLight.shadow.mapSize.width = 64;
 directionalLight.shadow.mapSize.height = 64;
 directionalLight.shadow.camera.near = 0.1;
 scene.add(directionalLight);
 

 // Constants
 const G = 90; // Gravitational constant (arbitrary)
 const dt = 0.0055; // Time step per frame
 let r = 0;
 let p = 0;
 let t = 0;
 let xp = 0;
 let yp = 0;
 let zp = 0;
 const bodies = []; // Store celestial bodies
 const universeSize = 10000; // Size of the wrapping universe (toroidal world)
 let isAddingBody = false;

 // Function to create a celestial body
 function createBody(position, velocity, mass, radius, color) {
     const geometry = new THREE.SphereGeometry(radius, 32,32);
     const material = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 5.1 });
     //const material = new THREE.MeshBasicMaterial({ color });
     const mesh = new THREE.Mesh(geometry, material);
     mesh.position.copy(position);
     scene.add(mesh);

     // Trail
     const trailMaterial = new THREE.LineBasicMaterial({ color });
     const trailGeometry = new THREE.BufferGeometry();
     const trail = new THREE.Line(trailGeometry, trailMaterial);
     scene.add(trail);

     return { position: position.clone(), velocity: velocity.clone(), mass, mesh, trail, history: [] };
 }

 // Function to create random values
 function getRandomInRange(min, max) {
     return Math.random() * (max - min) + min;
 }

         /**
  * Converts rectangular (Cartesian) coordinates to spherical coordinates.
  * 
  * @param {number} x - The x-coordinate
  * @param {number} y - The y-coordinate
  * @param {number} z - The z-coordinate
  * @returns {Object} An object containing rho (ρ), theta (θ), and phi (φ) in radians
  */
 function rectangularToSpherical(x, y, z) {
     // Calculate rho (radial distance)
     const rho = Math.sqrt(x * x + y * y + z * z);
     
     // Handle the special case where rho is zero (at origin)
     if (rho === 0) {
         return { rho: 0, theta: 0, phi: 0 };
     }
     
     // Calculate theta (azimuthal angle in x-y plane)
     // Math.atan2 returns a value in the range [-π, π]
     const theta = Math.atan2(y, x);
     
     // Calculate phi (polar angle from z-axis)
     const phi = Math.acos(z / rho);
     
     return  {rho: rho, theta: theta, phi: phi };
 }


         /**
  * Converts spherical coordinates to rectangular (Cartesian) coordinates.
  * 
  * @param {number} rho - The radial distance from the origin (ρ)
  * @param {number} theta - The azimuthal angle in the x-y plane from the x-axis (θ), in radians
  * @param {number} phi - The polar angle from the z-axis (φ), in radians
  * @returns {Object} An object containing the x, y, and z coordinates
  */
 function sphericalToRectangular(rho, theta, phi) {
     // Calculate the rectangular coordinates
     const x = rho * Math.sin(phi) * Math.cos(theta);
     const y = rho * Math.sin(phi) * Math.sin(theta);
     const z = rho * Math.cos(phi);
     
     return {x: x ,y:  y, z: z};
 }


 //Create initial bodies, now with randomness
 const initialBodies = 270;
 for(let i = 0; i < initialBodies; i++){
     let temp = sphericalToRectangular(
         600,
         -i*0.53,
         i*0.83,
     );
     const position = new THREE.Vector3(
         temp.x,
         temp.y,
         temp.z
     );
     let temp2 = sphericalToRectangular(
         -0.001,
         0,
         0
     );
     const velocity = new THREE.Vector3(
         temp2.x,
         temp2.y,
         temp2.z
     );
     const mass = 10**(getRandomInRange(0, 3))*getRandomInRange(0, 20); 
     const radius = 0.5*Math.sqrt(mass) * getRandomInRange(0.2, 0.3); //Radius based on mass
     const color = Math.random() * 0x333333+0x554433; //Random colors
     
     bodies.push(createBody(position, velocity, mass, radius, color));
 }

 // Update function for physics
 function update() { 
    let a = bodies[0].position.x;
    let b = bodies[0].position.y;
    let c = bodies[0].position.z;
     directionalLight.position.set(a, b, c).normalize();
     const accelerations = bodies.map(() => new THREE.Vector3());

     // Compute gravitational accelerations
     for (let i = 0; i < bodies.length; i++) {
         for (let j = i + 1; j < bodies.length; j++) {
             const body1 = bodies[i];
             const body2 = bodies[j];
             const delta = body2.position.clone().sub(body1.position);
             const r = delta.length();
             if (r > 0.01) { // Prevent singularities
                 const factor = G / (r ** 3);
                 const acc1 = delta.clone().multiplyScalar(factor * body2.mass);
                 const acc2 = delta.clone().multiplyScalar(-factor * body1.mass);
                 accelerations[i].add(acc1);
                 accelerations[j].add(acc2);
             }
         }
     }

     // Apply updates
     bodies.forEach((body, i) => {
         body.velocity.add(accelerations[i].clone().multiplyScalar(dt));
         body.position.add(body.velocity.clone().multiplyScalar(dt));
         body.mesh.position.copy(body.position);
         // Function to wrap a coordinate within the universe size
         function wrapCoordinate(coord, size) {
             coord = coord % size;
             if (coord < -size / 2) coord += size;
             if (coord > size / 2) coord -= size;
             return coord;
         }

         temp = rectangularToSpherical(
                 body.position.x,
                 body.position.y,
                 body.position.z
         );
         let temp2 = sphericalToRectangular(
                 temp.rho,
                 temp.theta,
                 temp.phi
         );
         body.position.set(
                 temp2.x,
                 temp2.y,
                 temp2.z
         );

         // Update trails

         if (!body.history.length) {
             body.history.push(body.position.clone());
         } else {
             const distance = body.history[body.history.length - 1].distanceTo(body.position);
             if (distance > universeSize / 2) {
                 body.history = [];
             } else
             if (body.history.length > 0) {
                 if (distance < 80) return;
             }
             body.history.push(body.position.clone());
             
             if (body.history.length > 5000) body.history.shift();
             
             body.trail.geometry.setFromPoints(body.history);
             body.trail.geometry.attributes.position.needsUpdate = true;
         }


     });
 }

 // Animation loop
 function animate() {
     requestAnimationFrame(animate);
     update();
     controls.update();
     renderer.render(scene, camera);
 }
 animate();

 // Add new bodies on key press and click
 document.addEventListener('keydown', (event) => {
     if (event.key === 'n') {
         isAddingBody = true;
     }
 });

 document.addEventListener('keyup', (event) => {
     if (event.key === 'n') {
         isAddingBody = false;
     }
 });

 document.addEventListener('keydown', (event) => {
     if (event.key === 's') {
         bodies.forEach( (body, i) => {
             body.mesh.position.copy(body.position);
             temp = rectangularToSpherical(
                 body.position.x,
                 body.position.y,
                 body.position.z
             );
             temp = sphericalToRectangular(
                 100,
                 (temp.theta+temp.rho)/Math.PI,
                 (temp.phi+temp.rho)%(2*Math.PI)-Math.PI
             );
             body.position.set(
                 temp.x,
                 temp.y,
                 temp.z
             );
         }); 
     }
 });
 document.addEventListener('keydown', (event) => {
     if (event.key === 'ArrowUp') {
         bodies.forEach( (body, i) => {
             body.mesh.position.copy(body.position);
             temp = rectangularToSpherical(
                 body.position.x,
                 body.position.y,
                 body.position.z
             );
             temp = sphericalToRectangular(
                 temp.rho-10,
                 temp.theta+temp.rho,
                 (temp.phi+temp.rho)%2*Math.PI-Math.PI
             );
             body.position.set(
                 temp.x,
                 temp.y,
                 temp.z
             );
         }); 
     }
 });
 document.addEventListener('keydown', (event) => {
     if (event.key === 'ArrowDown') {
         bodies.forEach( (body, i) => {
             body.mesh.position.copy(body.position);
             temp = rectangularToSpherical(
                 body.position.x,
                 body.position.y,
                 body.position.z
             );
             temp = sphericalToRectangular(
                 temp.rho,
                 temp.theta,
                 temp.phi+10
             );
             body.position.set(
                 temp.x+10,
                 temp.y,
                 temp.z
             );
         }); 
     }
 });
 document.addEventListener('keydown', (event) => {
     if (event.key === 'ArrowLeft') {
         bodies.forEach( (body, i) => {
             body.mesh.position.copy(body.position);
             temp = rectangularToSpherical(
                     body.position.x,
                     body.position.y,
                     body.position.z);                       
             temp = sphericalToRectangular(
                     temp.rho,
                     temp.theta-Math.PI/6,
                     temp.phi);
             body.position.set(
                 temp.x,
                 temp.y,
                 temp.z);
         });
     }
 });

 renderer.domElement.addEventListener('click', (event) => {
     if (isAddingBody) {
         const mouse = new THREE.Vector2();
         mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
         mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
         const raycaster = new THREE.Raycaster();
         raycaster.setFromCamera(mouse, camera);
         const clickPoint = raycaster.ray.at(5);

         const position = new THREE.Vector3(
             clickPoint.x + getRandomInRange(-0.5, 0.5),
             clickPoint.y + getRandomInRange(-0.5, 0.5),
             clickPoint.z + getRandomInRange(-0.5, 0.5)
         );
         const velocity = new THREE.Vector3(
             getRandomInRange(-0.5, 0.5),
             getRandomInRange(-0.5, 0.5),
             getRandomInRange(-0.5, 0.5)
         ).multiplyScalar(newBodyVelocityScale); //Adjusted
         const mass = getRandomInRange(0.01, 0.1);
         const radius = Math.sqrt(mass) * getRandomInRange(0.5, 1.5); //Radius based on mass
         const color = Math.random() * 0xffffff;
         bodies.push(createBody(position, velocity, mass, radius, color));
     }
 });

 // Resize handling
 window.addEventListener('resize', () => {
     camera.aspect = window.innerWidth / window.innerHeight;
     camera.updateProjectionMatrix();
     renderer.setSize(window.innerWidth, window.innerHeight);
 });