/**
 * GridEngine - Match-3 Board Engine with Dynamic Color Palette (3 to 5 Colors).
 */

import { ELEMENT_COLORS } from './PartyEngine.js';

export const MATCH_TYPES = {
  MATCH_3: 'MATCH_3',
  MATCH_4: 'MATCH_4',
  MATCH_2X2: 'MATCH_2X2',
  MATCH_5: 'MATCH_5'
};

export const SPECIAL_TILES = {
  NORMAL: 'normal',
  LINE_BOMB: 'line_bomb',
  RAINBOW: 'rainbow'
};

export class GridEngine {
  constructor(eventBus, rows = 8, cols = 8) {
    this.eventBus = eventBus;
    this.rows = rows;
    this.cols = cols;
    this.availableColors = [
      ELEMENT_COLORS.RED,
      ELEMENT_COLORS.BLUE,
      ELEMENT_COLORS.GREEN
    ];
    this.grid = [];
  }

  /**
   * Initialize grid with dynamic color palette (3 to 5 colors)
   */
  initGrid(customColors = null) {
    if (customColors && Array.isArray(customColors) && customColors.length >= 3) {
      this.availableColors = [...customColors];
    } else if (!customColors) {
      this.availableColors = [
        ELEMENT_COLORS.RED,
        ELEMENT_COLORS.BLUE,
        ELEMENT_COLORS.GREEN,
        ELEMENT_COLORS.YELLOW,
        ELEMENT_COLORS.PURPLE
      ];
    }

    this.grid = Array(this.rows).fill(null).map(() => Array(this.cols).fill(null));

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        let validColors = [...this.availableColors];
        
        // Avoid creating horizontal 3-in-a-row on init
        if (c >= 2 && this.grid[r][c - 1] && this.grid[r][c - 2]) {
          if (this.grid[r][c - 1].color === this.grid[r][c - 2].color) {
            validColors = validColors.filter(color => color !== this.grid[r][c - 1].color);
          }
        }

        // Avoid creating vertical 3-in-a-row on init
        if (r >= 2 && this.grid[r - 1][c] && this.grid[r - 2][c]) {
          if (this.grid[r - 1][c].color === this.grid[r - 2][c].color) {
            validColors = validColors.filter(color => color !== this.grid[r - 1][c].color);
          }
        }

        // Avoid creating 2x2 square on init
        if (r >= 1 && c >= 1 && this.grid[r-1][c] && this.grid[r][c-1] && this.grid[r-1][c-1]) {
          if (this.grid[r-1][c].color === this.grid[r][c-1].color && this.grid[r-1][c].color === this.grid[r-1][c-1].color) {
            validColors = validColors.filter(color => color !== this.grid[r-1][c].color);
          }
        }

        const chosenColor = validColors.length > 0 ? validColors[Math.floor(Math.random() * validColors.length)] : this.availableColors[0];
        this.grid[r][c] = {
          id: `tile_${r}_${c}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          row: r,
          col: c,
          color: chosenColor,
          type: SPECIAL_TILES.NORMAL
        };
      }
    }

    if (this.eventBus) {
      this.eventBus.emit('grid:initialized', {
        grid: this.getGridState(),
        activeColors: [...this.availableColors]
      });
    }

    return this.getGridState();
  }

  swapTiles(r1, c1, r2, c2) {
    if (!this.isAdjacent(r1, c1, r2, c2)) {
      return { success: false, reason: 'Tiles are not adjacent' };
    }

    this.executeSwap(r1, c1, r2, c2);
    const matches = this.findAllMatches();

    if (matches.length === 0) {
      this.executeSwap(r1, c1, r2, c2); // Revert
      if (this.eventBus) {
        this.eventBus.emit('grid:swap_invalid', { r1, c1, r2, c2 });
      }
      return { success: false, reason: 'No match created' };
    }

    if (this.eventBus) {
      this.eventBus.emit('grid:swapped', { r1, c1, r2, c2, grid: this.getGridState() });
    }

    const cascadeResults = this.processCascades();

    return {
      success: true,
      swap: { r1, c1, r2, c2 },
      cascadeResults
    };
  }

  processCascades() {
    const cascadeSequence = [];
    let comboMultiplier = 1.0;
    let hasMatches = true;

    while (hasMatches) {
      const matches = this.findAllMatches();
      if (matches.length === 0) {
        hasMatches = false;
        break;
      }

      const matchDetails = [];
      const tilesToClear = new Set();

      matches.forEach(match => {
        matchDetails.push({
          color: match.color,
          matchType: match.matchType,
          count: match.tiles.length,
          tiles: match.tiles,
          comboMultiplier
        });

        match.tiles.forEach(t => tilesToClear.add(`${t.row}_${t.col}`));
      });

      const clearedTilesArray = [];
      tilesToClear.forEach(coordKey => {
        const [r, c] = coordKey.split('_').map(Number);
        if (this.grid[r][c]) {
          clearedTilesArray.push({ ...this.grid[r][c] });
          this.grid[r][c] = null;
        }
      });

      const drops = this.applyGravity();
      const refills = this.refillTop();

      cascadeSequence.push({
        combo: comboMultiplier,
        matchDetails,
        clearedCount: clearedTilesArray.length,
        drops,
        refills,
        gridState: this.getGridState()
      });

      comboMultiplier += 0.25;
    }

    if (this.eventBus) {
      this.eventBus.emit('grid:cascaded', { cascadeSequence });
    }

    return cascadeSequence;
  }

  findAllMatches() {
    const matchedGroups = [];
    const matchedCoordsSet = new Set();

    // 1. Check 2x2 Squares
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < this.cols - 1; c++) {
        const t1 = this.grid[r][c];
        const t2 = this.grid[r][c + 1];
        const t3 = this.grid[r + 1][c];
        const t4 = this.grid[r + 1][c + 1];

        if (t1 && t2 && t3 && t4) {
          if (t1.color === t2.color && t1.color === t3.color && t1.color === t4.color) {
            matchedGroups.push({
              color: t1.color,
              matchType: MATCH_TYPES.MATCH_2X2,
              tiles: [
                { row: r, col: c },
                { row: r, col: c + 1 },
                { row: r + 1, col: c },
                { row: r + 1, col: c + 1 }
              ]
            });
            matchedCoordsSet.add(`${r}_${c}`);
            matchedCoordsSet.add(`${r}_${c+1}`);
            matchedCoordsSet.add(`${r+1}_${c}`);
            matchedCoordsSet.add(`${r+1}_${c+1}`);
          }
        }
      }
    }

    // 2. Horizontal Line Matches
    for (let r = 0; r < this.rows; r++) {
      let matchLength = 1;
      for (let c = 0; c < this.cols; c++) {
        const current = this.grid[r][c];
        const next = c < this.cols - 1 ? this.grid[r][c + 1] : null;

        if (current && next && current.color === next.color) {
          matchLength++;
        } else {
          if (matchLength >= 3) {
            const matchTiles = [];
            for (let i = 0; i < matchLength; i++) {
              matchTiles.push({ row: r, col: c - i, color: this.grid[r][c - i].color });
            }
            const color = this.grid[r][c - matchLength + 1].color;
            let matchType = MATCH_TYPES.MATCH_3;
            if (matchLength >= 5) matchType = MATCH_TYPES.MATCH_5;
            else if (matchLength === 4) matchType = MATCH_TYPES.MATCH_4;

            matchedGroups.push({ color, matchType, tiles: matchTiles });
          }
          matchLength = 1;
        }
      }
    }

    // 3. Vertical Line Matches
    for (let c = 0; c < this.cols; c++) {
      let matchLength = 1;
      for (let r = 0; r < this.rows; r++) {
        const current = this.grid[r][c];
        const next = r < this.rows - 1 ? this.grid[r + 1][c] : null;

        if (current && next && current.color === next.color) {
          matchLength++;
        } else {
          if (matchLength >= 3) {
            const matchTiles = [];
            for (let i = 0; i < matchLength; i++) {
              matchTiles.push({ row: r - i, col: c, color: this.grid[r - i][c].color });
            }
            const color = this.grid[r - matchLength + 1][c].color;
            let matchType = MATCH_TYPES.MATCH_3;
            if (matchLength >= 5) matchType = MATCH_TYPES.MATCH_5;
            else if (matchLength === 4) matchType = MATCH_TYPES.MATCH_4;

            matchedGroups.push({ color, matchType, tiles: matchTiles });
          }
          matchLength = 1;
        }
      }
    }

    return matchedGroups;
  }

  applyGravity() {
    const drops = [];
    for (let c = 0; c < this.cols; c++) {
      for (let r = this.rows - 1; r >= 0; r--) {
        if (this.grid[r][c] === null) {
          for (let rAbove = r - 1; rAbove >= 0; rAbove--) {
            if (this.grid[rAbove][c] !== null) {
              this.grid[r][c] = this.grid[rAbove][c];
              this.grid[r][c].row = r;
              this.grid[rAbove][c] = null;
              drops.push({ fromRow: rAbove, toRow: r, col: c });
              break;
            }
          }
        }
      }
    }
    return drops;
  }

  refillTop() {
    const refills = [];
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        if (this.grid[r][c] === null) {
          const color = this.availableColors[Math.floor(Math.random() * this.availableColors.length)];
          const newTile = {
            id: `tile_${r}_${c}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            row: r,
            col: c,
            color,
            type: SPECIAL_TILES.NORMAL
          };
          this.grid[r][c] = newTile;
          refills.push({ row: r, col: c, tile: newTile });
        }
      }
    }
    return refills;
  }

  executeSwap(r1, c1, r2, c2) {
    const temp = this.grid[r1][c1];
    this.grid[r1][c1] = this.grid[r2][c2];
    this.grid[r2][c2] = temp;

    if (this.grid[r1][c1]) {
      this.grid[r1][c1].row = r1;
      this.grid[r1][c1].col = c1;
    }
    if (this.grid[r2][c2]) {
      this.grid[r2][c2].row = r2;
      this.grid[r2][c2].col = c2;
    }
  }

  isAdjacent(r1, c1, r2, c2) {
    const rowDiff = Math.abs(r1 - r2);
    const colDiff = Math.abs(c1 - c2);
    return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
  }

  getGridState() {
    return this.grid.map(row => row.map(tile => tile ? { ...tile } : null));
  }
}
