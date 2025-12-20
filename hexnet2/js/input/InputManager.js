export class InputManager {
    constructor(session, viewport) {
        this.session = session;
        this.viewport = viewport;

        this.bindEvents();
    }

    bindEvents() {
        // Keyboard
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // UI Controls
        document.getElementById('new-game-btn').addEventListener('click', () => this.handleNewGame());
        document.getElementById('solve-btn').addEventListener('click', () => this.handleSolve());
        document.getElementById('size-select').addEventListener('change', () => this.handleNewGame());
        document.getElementById('rotate-left-btn').addEventListener('click', () => this.handleRotate(-1));
        document.getElementById('rotate-right-btn').addEventListener('click', () => this.handleRotate(1));
        document.getElementById('lock-tile-btn').addEventListener('click', () => this.handleLock());
        document.getElementById('win-message').addEventListener('click', () => {
            document.getElementById('win-message').style.display = 'none';
            this.handleNewGame();
        });

        // Board Interaction (Delegation)
        this.viewport.svg.addEventListener('click', (e) => this.handleBoardClick(e));
    }

    handleKeyDown(e) {
        // Prevent default scrolling for arrows/space
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
            e.preventDefault();
        }

        const AXIAL_DIRS = [
            { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
            { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }
        ];

        // Mapping Arrows to Axial Directions (Approximation)
        // Right: +q (0), Down: +r (1), Left: -q (3), Up: -r (4)
        // Note: This is a simplified 4-way mapping on a 6-way grid, but standard for hex games
        if (e.key === 'ArrowRight') this.session.moveCursor(1, 0);
        else if (e.key === 'ArrowDown') this.session.moveCursor(0, 1);
        else if (e.key === 'ArrowLeft') this.session.moveCursor(-1, 0);
        else if (e.key === 'ArrowUp') this.session.moveCursor(0, -1);
        else if (e.key === 'Enter') {
            const dir = e.shiftKey ? -1 : 1;
            this.handleRotate(dir);
        }
        else if (e.key === ' ') this.handleLock();

        this.viewport.updateState();
    }

    handleBoardClick(e) {
        const group = e.target.closest('.hex-group');
        if (!group) return;

        const q = parseInt(group.dataset.q);
        const r = parseInt(group.dataset.r);

        // If clicking the ALREADY selected cursor tile -> Rotate
        if (q === this.session.cursor.q && r === this.session.cursor.r) {
            const dir = e.shiftKey ? -1 : 1;
            this.handleRotate(dir);
        } else {
            // Otherwise just select it
            this.session.setCursor(q, r);
            this.viewport.updateState(); // Cursor move update
        }
    }

    handleRotate(direction) {
        const { q, r } = this.session.cursor;
        const changed = this.session.rotateTile(q, r, direction);
        if (changed) {
            // Pass specific tile to animate
            this.viewport.updateState(q, r);
            this.checkWin();
        }
    }

    handleLock() {
        const { q, r } = this.session.cursor;
        const changed = this.session.toggleLock(q, r);
        if (changed) {
            this.viewport.updateState(q, r);
        }
    }

    handleSolve() {
        const changed = this.session.solve();
        if (changed) {
            // Full update, no specific tile
            this.viewport.updateState();
            this.checkWin(); // Will trigger SOLVED state
        }
    }

    handleNewGame() {
        const size = parseInt(document.getElementById('size-select').value);
        // We need to re-initialize the grid with new size if it changed, 
        // or just re-generate if size is same. 
        // For simplicity, let's create a new grid or re-gen.
        // Since Session manages grid instance, we might need a method "reset(size)".
        // BUT, Session ctor takes size.
        // Let's reboot the session cleanly in main.js ideally, OR update session here.
        // We'll trust main.js to expose a reboot method or we handle it here by modifying session directly.

        // Actually, cleaner is to reload page or just re-generate grid in place.
        // Our Session class assumes fixed size on construction, but `grid` prop is public-ish.

        // Let's assume we can replace the grid.
        document.getElementById('win-message').style.display = 'none';

        // Re-construct the grid?
        // Ideally we'd trigger a "restart" event.
        // For this MVP, let's do a dirty reload of the grid object:
        import('../core/Grid.js').then(({ HexGrid }) => {
            this.session.grid = new HexGrid(size, size);
            this.session.start();
            // Re-initialize viewport because grid dimensions changed
            this.viewport.initialize();
        });
    }

    checkWin() {
        if (this.session.state === 'SOLVED') {
            document.getElementById('win-message').style.display = 'block';
        }
    }
}
