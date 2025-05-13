// gfar_simulation_three.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- DOM Elements ---
const automatonStateEl = document.getElementById('automatonState');
const currentNodeEl = document.getElementById('currentNode');
const stepCountEl = document.getElementById('stepCount');
const stepButton = document.getElementById('stepButton');
const lastRuleEl = document.getElementById('lastRule');

// --- Scene Setup ---
let scene, camera, renderer, controls;
let graphNodes = {}; // Store graph node objects (mesh, data)
let graphEdges = []; // Store edge line objects
let automatonMarker; // A visual marker for the automaton's current node
let stepCounter = 0;

// --- GFAR Definition ---
class GFAR {
    constructor(states, initialState, acceptingStates, transitionRules) {
        this.states = new Set(states);
        if (!this.states.size) throw new Error("Set of states Q cannot be empty.");
        if (!this.states.has(initialState)) throw new Error(`Initial state ${initialState} must be in Q.`);
        this.initialState = initialState;
        if (![...acceptingStates].every(s => this.states.has(s))) throw new Error("All accepting states in F must be in Q.");
        this.acceptingStates = new Set(acceptingStates);
        this.transitionRules = transitionRules; // Array of rule objects
        this._validateRules();
    }

    _validateRules() {
        this.transitionRules.forEach((rule, i) => {
            if (typeof rule !== 'object' || rule === null ||
                !this.states.has(rule.q_curr) ||
                typeof rule.p_u_static !== 'function' ||
                typeof rule.p_u_dynamic !== 'function' ||
                typeof rule.p_e !== 'function' ||
                typeof rule.p_v_static !== 'function' ||
                typeof rule.p_v_dynamic !== 'function' ||
                !this.states.has(rule.q_next) ||
                typeof rule.action_on_v !== 'function' ||
                typeof rule.id !== 'string' // Added rule ID for display
            ) {
                throw new Error(`Rule ${i} (ID: ${rule.id || 'N/A'}) has incorrect structure or invalid states/predicates/action.`);
            }
        });
    }
}

// --- Simulation Engine ---
class SimulationEngine {
    constructor(gfarInstance, initialGraphNodes, initialGraphEdges, initialAutomatonNodeId) {
        this.gfar = gfarInstance;
        this.currentAutomatonState = gfarInstance.initialState;
        this.currentAutomatonNodeId = initialAutomatonNodeId;
        
        // Initialize graph nodes in the scene
        initialGraphNodes.forEach(nodeData => this.createNodeMesh(nodeData));
        // Initialize graph edges in the scene
        initialGraphEdges.forEach(edgeData => this.createEdgeMesh(edgeData));

        this.updateAutomatonMarker();
        this.updateUI();
    }

    createNodeMesh(nodeData) {
        const geometry = new THREE.SphereGeometry(0.5, 32, 32); // Node size
        const material = new THREE.MeshStandardMaterial({ color: 0xcccccc }); // Default color
        const mesh = new THREE.Mesh(geometry, material);
        
        mesh.position.set(nodeData.position.x, nodeData.position.y, nodeData.position.z);
        mesh.userData = {
            id: nodeData.id,
            staticLabel: nodeData.staticLabel,
            dynamicState: nodeData.initialDynamicState,
            originalColor: material.color.clone() // Store for non-dynamic state color
        };
        graphNodes[nodeData.id] = mesh;
        scene.add(mesh);
        this.updateNodeVisuals(nodeData.id); // Apply initial dynamic state color
    }
    
    createEdgeMesh(edgeData) {
        const sourceNode = graphNodes[edgeData.source];
        const targetNode = graphNodes[edgeData.target];
        if (!sourceNode || !targetNode) {
            console.warn(`Edge (${edgeData.source} -> ${edgeData.target}) skipped: node not found.`);
            return;
        }
        const points = [sourceNode.position.clone(), targetNode.position.clone()];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0x555555, linewidth: 2 }); // Edge color
        const line = new THREE.Line(geometry, material);
        line.userData = {
            id: `${edgeData.source}_to_${edgeData.target}`,
            label: edgeData.label
        };
        graphEdges.push(line);
        scene.add(line);
    }


    updateNodeVisuals(nodeId) {
        const nodeMesh = graphNodes[nodeId];
        if (!nodeMesh) return;

        const dynamicState = nodeMesh.userData.dynamicState;
        // Define colors based on dynamic states
        let color = nodeMesh.userData.originalColor; // Default
        if (dynamicState === "ON") color = new THREE.Color(0x00ff00); // Green
        else if (dynamicState === "OFF") color = new THREE.Color(0xff0000); // Red
        else if (dynamicState === "PROCESSING") color = new THREE.Color(0xffff00); // Yellow
        else if (dynamicState === "READY") color = new THREE.Color(0x0000ff); // Blue
        else if (dynamicState === "IDLE") color = new THREE.Color(0x808080); // Grey
        else if (dynamicState === "FINISHED") color = new THREE.Color(0xffa500); // Orange
        else if (dynamicState === "EMPTY") color = new THREE.Color(0xffffff); // White
        
        nodeMesh.material.color.set(color);
    }

    updateAutomatonMarker() {
        if (!automatonMarker) {
            const markerGeometry = new THREE.TorusGeometry(0.7, 0.05, 8, 32); // Ring around the node
            const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide });
            automatonMarker = new THREE.Mesh(markerGeometry, markerMaterial);
            scene.add(automatonMarker);
        }
        const currentNodeMesh = graphNodes[this.currentAutomatonNodeId];
        if (currentNodeMesh) {
            automatonMarker.position.copy(currentNodeMesh.position);
            automatonMarker.visible = true;
        } else {
            automatonMarker.visible = false;
        }
    }
    
    step() {
        const currentNode = graphNodes[this.currentAutomatonNodeId];
        if (!currentNode) {
            console.warn("Automaton is on a non-existent node:", this.currentAutomatonNodeId);
            lastRuleEl.textContent = "Error: Current node not found.";
            return false; // Cannot proceed
        }

        const u_static_label = currentNode.userData.staticLabel;
        const u_dynamic_state = currentNode.userData.dynamicState;
        let ruleApplied = false;

        for (const rule of this.gfar.transitionRules) {
            if (rule.q_curr === this.currentAutomatonState) {
                // Find neighbors and edges
                const potentialTransitions = [];
                graphEdges.forEach(edgeMesh => {
                    const edgeSourceId = edgeMesh.userData.id.split('_to_')[0];
                    const edgeTargetId = edgeMesh.userData.id.split('_to_')[1];

                    if (edgeSourceId === this.currentAutomatonNodeId) {
                        const neighborNode = graphNodes[edgeTargetId];
                        if (neighborNode) {
                            potentialTransitions.push({
                                edgeLabel: edgeMesh.userData.label,
                                targetNode: neighborNode,
                                targetNodeId: edgeTargetId
                            });
                        }
                    }
                });

                for (const transition of potentialTransitions) {
                    const v_static_label = transition.targetNode.userData.staticLabel;
                    const v_dynamic_state_old = transition.targetNode.userData.dynamicState;

                    try {
                        const cond_u_static = rule.p_u_static(u_static_label);
                        const cond_u_dynamic = rule.p_u_dynamic(u_dynamic_state);
                        const cond_e = rule.p_e(transition.edgeLabel);
                        const cond_v_static = rule.p_v_static(v_static_label);
                        const cond_v_dynamic = rule.p_v_dynamic(v_dynamic_state_old);

                        if (cond_u_static && cond_u_dynamic && cond_e && cond_v_static && cond_v_dynamic) {
                            // Rule applies!
                            const new_v_dynamic_state = rule.action_on_v(v_dynamic_state_old, v_static_label);
                            transition.targetNode.userData.dynamicState = new_v_dynamic_state;
                            this.updateNodeVisuals(transition.targetNodeId);

                            this.currentAutomatonState = rule.q_next;
                            this.currentAutomatonNodeId = transition.targetNodeId;
                            
                            this.updateAutomatonMarker();
                            lastRuleEl.textContent = `Rule ID: ${rule.id}`;
                            ruleApplied = true;
                            break; // Apply only the first matching rule for simplicity
                        }
                    } catch (e) {
                        console.error(`Error evaluating predicates/action for rule ${rule.id}:`, e);
                        lastRuleEl.textContent = `Error in rule ${rule.id}`;
                    }
                }
            }
            if (ruleApplied) break;
        }

        if (!ruleApplied) {
            lastRuleEl.textContent = "No applicable rule found.";
        }
        
        stepCounter++;
        this.updateUI();
        return ruleApplied;
    }

    updateUI() {
        automatonStateEl.textContent = this.currentAutomatonState;
        currentNodeEl.textContent = this.currentAutomatonNodeId;
        stepCountEl.textContent = stepCounter;
        
        if (this.gfar.acceptingStates.has(this.currentAutomatonState)) {
            currentNodeEl.innerHTML += ' <strong style="color: lightgreen;">(ACCEPTING)</strong>';
        }
    }
}

// --- Initialization and Main Logic ---
let simulationEngine;

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222); // Dark grey background
    scene.fog = new THREE.Fog(0x222222, 10, 50); // Add fog for depth

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10); // Adjusted camera position

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xaaaaaa); // Softer ambient
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Brighter directional
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 2;
    controls.maxDistance = 50;

    // --- Define Graph Data ---
    const nodesData = [
        { id: "v1", staticLabel: { type: "source" }, initialDynamicState: "READY", position: { x: -4, y: 0, z: 0 } },
        { id: "v2", staticLabel: { type: "router" }, initialDynamicState: "OFF", position: { x: 0, y: 2, z: 0 } },
        { id: "v3", staticLabel: { type: "processor" }, initialDynamicState: "IDLE", position: { x: 4, y: 0, z: 0 } },
        { id: "v4", staticLabel: { type: "sink" }, initialDynamicState: "EMPTY", position: { x: 0, y: -2, z: 2 } },
        { id: "v5", staticLabel: { type: "aux" }, initialDynamicState: "STANDBY", position: { x: -2, y: -2, z: -2 } }
    ];
    const edgesData = [
        { source: "v1", target: "v2", label: { type: "link", capacity: 10 } },
        { source: "v2", target: "v3", label: { type: "link", latency: 1 } },
        { source: "v2", target: "v5", label: { type: "control_link" } },
        { source: "v3", target: "v4", label: { type: "final_link" } },
        { source: "v5", target: "v2", label: { type: "feedback_link" } } // Cycle
    ];

    // --- Define Predicates ---
    const s_is_type = (typeName) => (staticLabel) => staticLabel && staticLabel.type === typeName;
    const d_is_state = (stateName) => (dynamicState) => dynamicState === stateName;
    const d_is_not_state = (stateName) => (dynamicState) => dynamicState !== stateName;
    const any_static = () => true;
    const any_dynamic = () => true;
    const any_edge = () => true;

    // --- Define Actions ---
    const turn_on_action = (old_v_dyn, v_static) => "ON";
    const process_action = (old_v_dyn, v_static) => "PROCESSING";
    const finish_action = (old_v_dyn, v_static) => "FINISHED";
    const no_change_action = (old_v_dyn, v_static) => old_v_dyn;
    const set_idle_action = () => "IDLE";


    // --- Define GFAR Instance ---
    const gfarStates = ["Q_START", "Q_ROUTING", "Q_PROCESSING", "Q_AUX_CHECK", "Q_ACCEPTED", "Q_HALTED"];
    const gfarInitial = "Q_START";
    const gfarAccepting = ["Q_ACCEPTED"];
    const gfarTransitionRules = [
        { id: "R1", q_curr: "Q_START", p_u_static: s_is_type("source"), p_u_dynamic: d_is_state("READY"), p_e: any_edge, p_v_static: s_is_type("router"), p_v_dynamic: d_is_state("OFF"), q_next: "Q_ROUTING", action_on_v: turn_on_action },
        { id: "R2", q_curr: "Q_ROUTING", p_u_static: s_is_type("router"), p_u_dynamic: d_is_state("ON"), p_e: (e) => e.type === "link", p_v_static: s_is_type("processor"), p_v_dynamic: d_is_state("IDLE"), q_next: "Q_PROCESSING", action_on_v: process_action },
        { id: "R3", q_curr: "Q_PROCESSING", p_u_static: s_is_type("processor"), p_u_dynamic: d_is_state("PROCESSING"), p_e: (e) => e.type === "final_link", p_v_static: s_is_type("sink"), p_v_dynamic: any_dynamic, q_next: "Q_ACCEPTED", action_on_v: finish_action },
        { id: "R4", q_curr: "Q_ROUTING", p_u_static: s_is_type("router"), p_u_dynamic: d_is_state("ON"), p_e: (e) => e.type === "control_link", p_v_static: s_is_type("aux"), p_v_dynamic: d_is_state("STANDBY"), q_next: "Q_AUX_CHECK", action_on_v: no_change_action },
        { id: "R5", q_curr: "Q_AUX_CHECK", p_u_static: s_is_type("aux"), p_u_dynamic: d_is_state("STANDBY"), p_e: (e) => e.type === "feedback_link", p_v_static: s_is_type("router"), p_v_dynamic: d_is_state("ON"), q_next: "Q_ROUTING", action_on_v: no_change_action }, // Cycle back
        { id: "R6_Halt", q_curr: "Q_START", p_u_static: any_static, p_u_dynamic: d_is_state("ERROR"), p_e: any_edge, p_v_static: any_static, p_v_dynamic: any_dynamic, q_next: "Q_HALTED", action_on_v: no_change_action }, // Halt rule
    ];
    
    const gfar = new GFAR(gfarStates, gfarInitial, gfarAccepting, gfarTransitionRules);
    
    // --- Create Simulation Engine ---
    simulationEngine = new SimulationEngine(gfar, nodesData, edgesData, "v1"); // Start automaton at v1

    // Event Listeners
    stepButton.addEventListener('click', () => {
        if (simulationEngine) {
            simulationEngine.step();
        }
    });
    window.addEventListener('resize', onWindowResize);

    animate(); // Start animation loop
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update(); // Only required if controls.enableDamping or controls.autoRotate are set to true
    renderer.render(scene, camera);
}

// --- Start ---
init();
