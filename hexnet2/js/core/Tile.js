export class HexTile {
    constructor(q, r) {
        this.q = q;
        this.r = r;
        this.key = `${q},${r}`;
        this.rotation = 0; // 0 to 5
        this.connections = 0; // Bitmask 0-63
        this.isSource = false;
        this.isLocked = false;
        this.isConnected = false;
    }

    /**
     * Checks if the tile has a connection in a specific direction,
     * accounting for current rotation.
     * @param {number} direction - 0 to 5 (0 is E, 1 is SE, etc.)
     * @returns {boolean}
     */
    hasConnection(direction) {
        /*
          The connection mask is static relative to the tile's local frame.
          If rotation is R, then looking in global direction D maps to
          checking local connection at (D - R) % 6.
          
          Example:
          - Tile has connection at local 0 (East).
          - Tile is rotated 1 (60 deg CW).
          - Now that connection points SE (Global 1).
          - Checking global direction 1: (1 - 1) = 0. Mask bit 0 is checked. TRUE.
        */
        const localDir = (direction - this.rotation + 6) % 6;
        return (this.connections & (1 << localDir)) !== 0;
    }

    /**
     * Rotates the tile.
     * @param {number} direction - 1 for CW, -1 for CCW
     */
    rotate(direction) {
        if (this.isLocked) return;
        this.rotation = (this.rotation + direction + 6) % 6;
    }

    /**
     * Toggles the lock state.
     */
    toggleLock() {
        this.isLocked = !this.isLocked;
    }
}
