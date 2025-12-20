import { HexGrid } from './Grid.js';

export const GameState = {
    PLAYING: 'PLAYING',
    SOLVED: 'SOLVED'
};

export class Session {
    constructor(gridSize) {
        this.grid = new HexGrid(gridSize, gridSize);
        this.state = GameState.PLAYING;
        this.startTime = Date.now();
        this.moveCount = 0;

        // Initial Cursor Position will be set after generation
        this.cursor = { q: 0, r: 0 };
    }

    start() {
        this.grid.generate();
        this.cursor.q = this.grid.sourceTile.q;
        this.cursor.r = this.grid.sourceTile.r;
        this.state = GameState.PLAYING;
        this.checkWinCondition(); // Should be false initially unless astronomically lucky
    }

    rotateTile(q, r, direction) {
        if (this.state === GameState.SOLVED) return;

        const tile = this.grid.getTile(q, r);
        if (tile && !tile.isLocked) {
            tile.rotate(direction);
            this.moveCount++;
            this.checkWinCondition();
            return true; // Action successful
        }
        return false;
    }

    toggleLock(q, r) {
        if (this.state === GameState.SOLVED) return;

        const tile = this.grid.getTile(q, r);
        if (tile) {
            tile.toggleLock();
            return true;
        }
        return false;
    }

    solve() {
        if (this.state === GameState.SOLVED) return false;

        // Reset all tiles to rotation 0 (the generated state)
        this.grid.tiles.forEach(tile => {
            tile.rotation = 0;
            tile.isLocked = true; // Optional: Lock them to show it's done
        });

        this.checkWinCondition();
        return true;
    }

    moveCursor(dq, dr) {
        const newQ = this.cursor.q + dq;
        const newR = this.cursor.r + dr;
        if (this.grid.getTile(newQ, newR)) {
            this.cursor.q = newQ;
            this.cursor.r = newR;
            return true;
        }
        return false;
    }

    setCursor(q, r) {
        if (this.grid.getTile(q, r)) {
            this.cursor.q = q;
            this.cursor.r = r;
            return true;
        }
        return false;
    }

    checkWinCondition() {
        const isConnected = this.grid.updateConnectivity();
        if (isConnected) {
            this.state = GameState.SOLVED;
            return true;
        }
        return false;
    }
}
