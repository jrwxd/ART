import { HexTile } from './Tile.js';

export class HexGrid {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.tiles = new Map(); // Key: "q,r", Value: HexTile
        this.sourceTile = null;

        this.AXIAL_DIRECTIONS = [
            { q: 1, r: 0 },   // 0: East
            { q: 0, r: 1 },   // 1: SouthEast
            { q: -1, r: 1 },  // 2: SouthWest
            { q: -1, r: 0 },  // 3: West
            { q: 0, r: -1 },  // 4: NorthWest
            { q: 1, r: -1 }   // 5: NorthEast
        ];
    }

    generate() {
        this.tiles.clear();

        // 1. Create Tiles in a hexagonal shape
        for (let r = 0; r < this.height; r++) {
            const r_offset = Math.floor(r / 2); // standard odd-r handling converted to axial?
            // Actually, for a diamond/rectangular storage of axial:
            // Let's stick to the logic from the original hexdemo which worked well:
            // "for (let r = 0; r < GRID_HEIGHT; r++) { const r_offset = Math.floor(r / 2); for (let q = -r_offset; q < GRID_WIDTH - r_offset; q++) { ... } }"
            // This loop structure creates a skewed rectangular grid in axial coordinates which looks roughly hexagonal/rhombic on screen.

            for (let q = -r_offset; q < this.width - r_offset; q++) {
                const tile = new HexTile(q, r);
                this.tiles.set(tile.key, tile);
            }
        }

        // 2. Pick a Source
        // Center-ish tile
        const sourceQ = Math.floor((this.width - Math.floor(this.height / 2)) / 2);
        const sourceR = Math.floor(this.height / 2);
        this.sourceTile = this.tiles.get(`${sourceQ},${sourceR}`) || this.tiles.values().next().value;
        this.sourceTile.isSource = true;

        // 3. Generate Connections (Spanning Tree DFS)
        this.generateSpanningTree(this.sourceTile);

        // 4. Randomize Rotations
        this.tiles.forEach(tile => {
            tile.rotation = Math.floor(Math.random() * 6);
        });

        // 5. Initial Connectivity Calculation
        this.updateConnectivity();
    }

    generateSpanningTree(startNode) {
        const visited = new Set([startNode.key]);
        const frontier = [];

        // Initial neighbors
        for (let i = 0; i < 6; i++) {
            const neighbor = this.getNeighbor(startNode, i);
            if (neighbor) frontier.push({ from: startNode, to: neighbor, dir: i });
        }

        while (frontier.length > 0) {
            // Pick random edge
            const index = Math.floor(Math.random() * frontier.length);
            const { from, to, dir } = frontier.splice(index, 1)[0];

            if (visited.has(to.key)) continue;

            // Connect
            from.connections |= (1 << dir);
            const reciprocalDir = (dir + 3) % 6;
            to.connections |= (1 << reciprocalDir);

            visited.add(to.key);

            // Add new neighbors
            for (let i = 0; i < 6; i++) {
                const newNeighbor = this.getNeighbor(to, i);
                if (newNeighbor && !visited.has(newNeighbor.key)) {
                    frontier.push({ from: to, to: newNeighbor, dir: i });
                }
            }
        }
    }

    updateConnectivity() {
        // Reset
        let totalTiles = 0;
        this.tiles.forEach(tile => {
            tile.isConnected = false;
            totalTiles++;
        });

        if (!this.sourceTile) return false;

        // BFS from Source
        const queue = [this.sourceTile];
        const visited = new Set([this.sourceTile.key]);
        this.sourceTile.isConnected = true;
        let connectedCount = 0;

        while (queue.length > 0) {
            const current = queue.shift();
            connectedCount++;

            for (let i = 0; i < 6; i++) {
                // If current tile has a pipe pointing in direction i
                if (current.hasConnection(i)) {
                    const neighbor = this.getNeighbor(current, i);

                    // And neighbor exists, and hasn't been visited...
                    if (neighbor && !visited.has(neighbor.key)) {
                        // And neighbor has a pipe pointing back (reciprocal direction)
                        const reciprocalDir = (i + 3) % 6;
                        if (neighbor.hasConnection(reciprocalDir)) {
                            visited.add(neighbor.key);
                            neighbor.isConnected = true;
                            queue.push(neighbor);
                        }
                    }
                }
            }
        }

        return connectedCount === totalTiles;
    }

    getNeighbor(tile, direction) {
        const dir = this.AXIAL_DIRECTIONS[direction];
        const newQ = tile.q + dir.q;
        const newR = tile.r + dir.r;
        return this.tiles.get(`${newQ},${newR}`);
    }

    getTile(q, r) {
        return this.tiles.get(`${q},${r}`);
    }
}
