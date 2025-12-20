export class Viewport {
    constructor(svgElement, session) {
        this.svg = svgElement;
        this.session = session;
        this.hexSize = 30; // Base size, will be scaled
        this.svgNS = "http://www.w3.org/2000/svg";
    }

    initialize() {
        this.calculateScale();
        this.renderGrid();

        // Handle window resize
        window.addEventListener('resize', () => {
            this.calculateScale();
            this.updateViewBox();
            // We could re-render here, but just scaling viewBox matches our vector needs typically
        });
    }

    calculateScale() {
        const container = this.svg.parentElement;
        const width = container.clientWidth;
        // Estimate board dimensions
        const gridW = this.session.grid.width;
        const gridH = this.session.grid.height;

        // Width roughly: (W + H/2) * sqrt(3) * size
        const boardLayoutWidth = (gridW + gridH / 2) * Math.sqrt(3);

        // Calculate ideal hex size to fit width
        // This is a naive heuristic from original code, improved slightly
        let estimatedSize = (width / boardLayoutWidth) * 0.9;
        this.hexSize = Math.max(10, estimatedSize);
        if (this.hexSize > 40) this.hexSize = 40; // Cap max size
    }

    updateViewBox() {
        const gridW = this.session.grid.width;
        const gridH = this.session.grid.height;
        const boardPixelWidth = (gridW + gridH / 2) * this.hexSize * Math.sqrt(3);
        const boardPixelHeight = gridH * this.hexSize * 1.5;

        this.svg.setAttribute('viewBox',
            `${-this.hexSize * 2} ${-this.hexSize * 2} ${boardPixelWidth + this.hexSize * 4} ${boardPixelHeight + this.hexSize * 4}`
        );
    }

    axialToPixel(q, r) {
        const x = this.hexSize * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
        const y = this.hexSize * (1.5 * r);
        return { x, y };
    }

    renderGrid() {
        this.svg.innerHTML = '';
        this.updateViewBox();

        this.session.grid.tiles.forEach(tile => {
            const { x, y } = this.axialToPixel(tile.q, tile.r);

            const group = document.createElementNS(this.svgNS, 'g');
            group.setAttribute('class', 'hex-group');
            group.setAttribute('transform', `translate(${x}, ${y})`);
            group.dataset.q = tile.q;
            group.dataset.r = tile.r;

            // Hexagon
            const hex = document.createElementNS(this.svgNS, 'polygon');
            hex.setAttribute('class', 'hex-tile');
            hex.setAttribute('points', this.getHexCorners());
            group.appendChild(hex);

            // Lines
            const lines = document.createElementNS(this.svgNS, 'path');
            lines.setAttribute('class', 'hex-lines');
            lines.setAttribute('d', this.getLinePathData(tile.connections));
            group.appendChild(lines);

            this.svg.appendChild(group);
        });

        this.updateState(); // Apply colors/rotations/cursor
    }

    updateState(activeQ = null, activeR = null) {
        // 1. Immediate Phase: Handle Rotation Animation & Cursor
        this.session.grid.tiles.forEach(tile => {
            const group = this.svg.querySelector(`.hex-group[data-q="${tile.q}"][data-r="${tile.r}"]`);
            if (!group) return;

            // Cursor Update (Instant)
            group.dataset.locked = tile.isLocked;
            if (tile.q === this.session.cursor.q && tile.r === this.session.cursor.r) {
                group.classList.add('cursor');
                this.svg.appendChild(group);
            } else {
                group.classList.remove('cursor');
            }

            // If this is the ACTIVE tile being rotated, handle animation immediately
            if (activeQ !== null && tile.q === activeQ && tile.r === activeR) {
                const lines = group.querySelector('.hex-lines');

                // Continuous Rotation Logic (Instant Update for Animation)
                const targetMod = tile.rotation * 60;
                let currentRaw = parseFloat(lines.dataset.rotation || targetMod);
                const norm = (deg) => (deg % 360 + 360) % 360;

                let targetRaw;
                if (norm(currentRaw + 60) === targetMod) targetRaw = currentRaw + 60;
                else if (norm(currentRaw - 60) === targetMod) targetRaw = currentRaw - 60;
                else {
                    const diff = targetMod - norm(currentRaw);
                    let adjustedDiff = diff;
                    if (diff > 180) adjustedDiff -= 360;
                    if (diff < -180) adjustedDiff += 360;
                    targetRaw = currentRaw + adjustedDiff;
                }

                lines.style.transform = `rotate(${targetRaw}deg)`;
                lines.dataset.rotation = targetRaw;

                // INSTANTLY Dim the active tile during rotation
                lines.style.stroke = `var(--line-color)`;
            }
        });

        // 2. Delayed Phase: Full Color Sync & Sparks
        // We debounce this to wait for the rotation (approx 200-300ms)
        if (this.updateTimer) clearTimeout(this.updateTimer);

        // If no specific tile was passed (e.g. New Game or Solve), run instantly?
        // Or keep delay for consistency/Solver animation? 
        // Let's use small delay/instant for global, long for rotate.
        const delay = (activeQ !== null) ? 250 : 50;

        this.updateTimer = setTimeout(() => {
            this.syncVisuals();
            this.renderSparks();
        }, delay);
    }

    syncVisuals() {
        this.session.grid.tiles.forEach(tile => {
            const group = this.svg.querySelector(`.hex-group[data-q="${tile.q}"][data-r="${tile.r}"]`);
            if (!group) return;

            // Update Hex Color (Background)
            const hex = group.querySelector('.hex-tile');
            let colorVar = '--unconnected-color';
            if (tile.isSource) colorVar = '--source-color';
            else if (tile.isConnected) colorVar = '--connected-color';
            hex.style.fill = `var(${colorVar})`;

            // Update Lines (Stroke) - NOW we apply the connectivity color after rotation
            const lines = group.querySelector('.hex-lines');
            let lineColorVar = tile.isConnected ? '--connected-line-color' : '--line-color';
            lines.style.stroke = `var(${lineColorVar})`;

            // Ensure rotation is synced for non-active tiles (e.g. Solve)
            if (!lines.dataset.rotation) {
                lines.style.transform = `rotate(${tile.rotation * 60}deg)`;
                lines.dataset.rotation = tile.rotation * 60;
            }
        });
    }

    renderSparks() {
        // We do NOT clear existing sparks immediately if we want them to finish animating.
        // Instead, we let CSS remove them or handle cleanup.
        // Actually, safer to clean up 'finished' sparks.

        // Use a set to calculate CURRENT edges
        const currentEdges = new Set();
        const newSparks = [];

        this.session.grid.tiles.forEach(tile => {
            const { x: x1, y: y1 } = this.axialToPixel(tile.q, tile.r);
            for (let i = 0; i < 6; i++) {
                if (tile.hasConnection(i)) {
                    const neighbor = this.session.grid.getNeighbor(tile, i);
                    if (neighbor) {
                        const reciprocalDir = (i + 3) % 6;
                        if (neighbor.hasConnection(reciprocalDir)) {
                            // Valid connection
                            const k1 = tile.key;
                            const k2 = neighbor.key;
                            const edgeKey = k1 < k2 ? `${k1}-${k2}` : `${k2}-${k1}`;

                            if (currentEdges.has(edgeKey)) continue;
                            currentEdges.add(edgeKey);

                            // Detect if this is NEW
                            if (!this.previousEdges || !this.previousEdges.has(edgeKey)) {
                                const { x: x2, y: y2 } = this.axialToPixel(neighbor.q, neighbor.r);
                                const midX = (x1 + x2) / 2;
                                const midY = (y1 + y2) / 2;
                                newSparks.push({ x: midX, y: midY });

                                // Trigger 'Backflow' Surge on both tiles WITH propagation
                                const waveId = Date.now();
                                const visited = new Set();
                                this.propagateSurge(tile, i, visited);
                                this.propagateSurge(neighbor, reciprocalDir, visited);
                            }
                        }
                    }
                }
            }
        });

        // Spawn sparks for new edges
        newSparks.forEach(pos => {
            const circle = document.createElementNS(this.svgNS, 'circle');
            circle.setAttribute('cx', pos.x);
            circle.setAttribute('cy', pos.y);
            circle.setAttribute('r', 2);
            circle.setAttribute('class', 'spark');

            // Auto-remove after animation
            circle.addEventListener('animationend', () => circle.remove());

            this.svg.appendChild(circle);
        });

        // Update history
        this.previousEdges = currentEdges;
    }

    /**
     * Propagates a surge WAVE through the grid.
     * @param {HexTile} tile - The tile receiving the surge
     * @param {number} fromDirection - The local direction (0-5) the surge entered FROM.
     * @param {Set<string>} visited - Set of tile keys visited in this wave.
     */
    propagateSurge(tile, fromDirection, visited) {
        if (visited.has(tile.key)) return;
        visited.add(tile.key);

        const group = this.svg.querySelector(`.hex-group[data-q="${tile.q}"][data-r="${tile.r}"]`);
        if (!group) return;

        // 1. Inward Surge (Edge -> Center)
        // 'fromDirection' is the side of the tile the surge enters.
        // We draw M Edge L Center
        this.spawnSurge(group, fromDirection, false);

        // 2. Schedule Outward Surges
        // Wait for Inward to reach center (approx 200ms?)
        setTimeout(() => {
            // Find all connected directions EXCEPT the one we came from
            for (let i = 0; i < 6; i++) {
                if (i === fromDirection) continue; // Don't go back

                if (tile.hasConnection(i)) {
                    // Outward Surge (Center -> Edge)
                    this.spawnSurge(group, i, true);

                    // Propagate to Neighbor
                    const neighbor = this.session.grid.getNeighbor(tile, i);
                    if (neighbor) {
                        const reciprocalDir = (i + 3) % 6;
                        // Only propagate if neighbor connects back (it should if 'hasConnection' is true for valid grid)
                        // But strictly checking:
                        if (neighbor.hasConnection(reciprocalDir)) {
                            this.propagateSurge(neighbor, reciprocalDir, visited);
                        }
                    }
                }
            }
        }, 200); // 200ms delay for visual flow
    }

    spawnSurge(group, direction, isOutward) {
        const angle = Math.PI / 180 * (60 * direction);
        const x = this.hexSize * Math.cos(angle) * 0.7;
        const y = this.hexSize * Math.sin(angle) * 0.7;

        const path = document.createElementNS(this.svgNS, 'path');
        if (isOutward) {
            // Center -> Edge
            path.setAttribute('d', `M 0,0 L ${x.toFixed(3)},${y.toFixed(3)}`);
        } else {
            // Edge -> Center
            path.setAttribute('d', `M ${x.toFixed(3)},${y.toFixed(3)} L 0,0`);
        }

        path.setAttribute('class', 'surge');
        path.addEventListener('animationend', () => path.remove());
        group.appendChild(path);
    }

    getHexCorners() {
        let points = [];
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 180 * (60 * i + 30);
            points.push(`${(this.hexSize * Math.cos(angle)).toFixed(3)},${(this.hexSize * Math.sin(angle)).toFixed(3)}`);
        }
        return points.join(' ');
    }

    getLinePathData(connections) {
        let d = '';
        for (let i = 0; i < 6; i++) {
            if ((connections & (1 << i))) {
                const angle = Math.PI / 180 * (60 * i);
                const x = this.hexSize * Math.cos(angle) * 0.7; // 0.7 reach
                const y = this.hexSize * Math.sin(angle) * 0.7;
                d += ` M 0,0 L ${x.toFixed(3)},${y.toFixed(3)}`;
            }
        }
        return d;
    }
}
