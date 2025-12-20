import { Session } from './core/Session.js';
import { Viewport } from './view/Viewport.js';
import { InputManager } from './input/InputManager.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial Config
    const initialSize = 5;

    // 2. Initialize Core
    const session = new Session(initialSize);
    session.start();

    // 3. Initialize View
    const svgElement = document.getElementById('game-board');
    const viewport = new Viewport(svgElement, session);
    viewport.initialize();

    // 4. Initialize Input
    const inputManager = new InputManager(session, viewport);

    // Global access for debugging (optional)
    window.hexnet = { session, viewport, inputManager };
});
