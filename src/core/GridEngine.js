/**
 * GridEngine - Match-3 Physics, Special Gems (Rainbow, Line Bombs, Target Bombs) & Level Obstacles (Ice, Mirror).
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
  RAINBOW: 'rainbow',         // Match 5 (🌈): Swapping clears all tiles of target color
  ROW_BOMB: 'row_bomb',       // Match 4 Horizontal (🚀): Clears entire row
  COL_BOMB: 'col_bomb',       // Match 4 Vertical (⚡): Clears entire column
  TARGET_BOMB: 'target_bomb'  // Match 2x2 Square (💣): Destroys random obstacle (Ice/Mirror)
};

export const OBSTACLES = {
  NONE: 'none',
  ICE: 'ice',                 // 🧊 Shatters in 1 hit
  MIRROR: 'mirror'            // 🪞 Shatters in 2 hits
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
    this.goals = { ice: 5, mirror: 5 };
  }

  /**
   * Initialize grid with dynamic colors and random level obstacles (Ice & Mirror)
   */
  initGrid(customColors = null, goals = { ice: 5, mirror: 5 }) {
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

    this.goals = { ...goals };
    this.grid = Array(this.rows).fill(null).map(() => Array(this.cols).fill(null));

    // Place Initial Obstacles randomly on grid
    const obstacleCoords = new Set();
    let icePlaced = 0;
    let mirrorPlaced = 0;

    while (icePlaced < goals.ice || mirrorPlaced < goals.mirror) {
      const r = Math.floor(Math.random() * this.rows);
      const c = Math.floor(Math.random() * this.cols);
      const key = `${r}_${c}`;

      if (!obstacleCoords.has(key)) {
        obstacleCoords.add(key);
        if (icePlaced < goals.ice) icePlaced++;
        else mirrorPlaced++;
      }
    }

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        let validColors = [...this.availableColors];
        
        if (c >= 2 && this.grid[r][c - 1] && this.grid[r][c - 2]) {
          if (this.grid[r][c - 1].color === this.grid[r][c - 2].color) {
            validColors = validColors.filter(clr => clr !== this.grid[r][c - 1].color);
          }
        }

        if (r >= 2 && this.grid[r - 1][c] && this.grid[r - 2][c]) {
          if (this.grid[r - 1][c].color === this.grid[r - 2][c].color) {
            validColors = validColors.filter(clr => clr !== this.grid[r - 1][c].color);
          }
        }

        const chosenColor = validColors.length > 0 ? validColors[Math.floor(Math.random() * validColors.length)] : this.availableColors[0];
        
        let obstacle = OBSTACLES.NONE;
        let hp = 0;
        const key = `${r}_${c}`;
        if (obstacleCoords.has(key)) {
          if (goals.ice > 0 && Math.random() < 0.5) {
            obstacle = OBSTACLES.ICE;
            hp = 1;
          } else {
            obstacle = OBSTACLES.MIRROR;
            hp = 2;
          }
        }

        this.grid[r][c] = {
          id: `tile_${r}_${c}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          row: r,
          col: c,
          color: chosenColor,
          special: SPECIAL_TILES.NORMAL,
          obstacle,
          obstacleHp: hp
        };
      }
    }

    if (this.eventBus) {
      this.eventBus.emit('grid:initialized', {
        grid: this.getGridState(),
        activeColors: [...this.availableColors],
        goals: { ...this.goals }
      });
    }

    return this.getGridState();
  }

  /**
   * Swap tiles and resolve Rainbow, Special Gem, and Obstacle activations
   */
  swapTiles(r1, c1, r2, c2) {
    if (!this.isAdjacent(r1, c1, r2, c2)) {
      return { success: false, reason: 'Tiles are not adjacent' };
    }

    const t1 = this.grid[r1][c1];
    const t2 = this.grid[r2][c2];

    // Check Rainbow Gem Activation
    if (t1.special === SPECIAL_TILES.RAINBOW || t2.special === SPECIAL_TILES.RAINBOW) {
      const rainbowTile = t1.special === SPECIAL_TILES.RAINBOW ? t1 : t2;
      const targetTile = t1.special === SPECIAL_TILES.RAINBOW ? t2 : t1;
      const targetColor = targetTile.color;

      return this.activateRainbowSwap(rainbowTile, targetColor);
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

    const cascadeResults = this.processCascades(matches);

    return {
      success: true,
      swap: { r1, c1, r2, c2 },
      cascadeResults,
      goals: { ...this.goals }
    };
  }

  /**
   * Activate Rainbow Gem Swap (Clears all tiles matching target color across entire board)
   */
  activateRainbowSwap(rainbowTile, targetColor) {
    const clearedTiles = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] && (this.grid[r][c].color === targetColor || (r === rainbowTile.row && c === rainbowTile.col))) {
          clearedTiles.push({ row: r, col: c });
          this.damageObstacleAt(r, c);
          this.grid[r][c] = null;
        }
      }
    }

    if (this.eventBus) {
      this.eventBus.emit('special:rainbow_activated', { targetColor, clearedCount: clearedTiles.length });
    }

    this.applyGravity();
    this.refillTop();
    const cascadeResults = this.processCascades(this.findAllMatches());

    return {
      success: true,
      isRainbow: true,
      targetColor,
      clearedCount: clearedTiles.length,
      cascadeResults,
      goals: { ...this.goals }
    };
  }

  /**
   * Process Match Cascades & Special Gem Creation / Triggering
   */
  processCascades(initialMatches = null) {
    const cascadeSequence = [];
    let comboMultiplier = 1.0;
    let currentMatches = initialMatches || this.findAllMatches();

    while (currentMatches.length > 0) {
      const matchDetails = [];
      const tilesToClear = new Set();
      const newSpecialGems = [];

      currentMatches.forEach(match => {
        // 1. Generate Special Gem based on Match Type
        const primaryTile = match.tiles[0];
        let createdSpecial = SPECIAL_TILES.NORMAL;

        if (match.matchType === MATCH_TYPES.MATCH_5 || match.count >= 5) {
          createdSpecial = SPECIAL_TILES.RAINBOW;
        } else if (match.matchType === MATCH_TYPES.MATCH_2X2) {
          createdSpecial = SPECIAL_TILES.TARGET_BOMB;
        } else if (match.matchType === MATCH_TYPES.MATCH_4 || match.count === 4) {
          createdSpecial = match.isHorizontal ? SPECIAL_TILES.ROW_BOMB : SPECIAL_TILES.COL_BOMB;
        }

        if (createdSpecial !== SPECIAL_TILES.NORMAL) {
          newSpecialGems.push({ row: primaryTile.row, col: primaryTile.col, color: match.color, special: createdSpecial });
        }

        matchDetails.push({
          color: match.color,
          matchType: match.matchType,
          count: match.tiles.length,
          tiles: match.tiles,
          createdSpecial,
          comboMultiplier
        });

        match.tiles.forEach(t => tilesToClear.add(`${t.row}_${t.col}`));
      });

      // 2. Trigger Existing Special Gem Effects
      tilesToClear.forEach(coordKey => {
        const [r, c] = coordKey.split('_').map(Number);
        const tile = this.grid[r][c];
        if (tile && tile.special !== SPECIAL_TILES.NORMAL) {
          this.triggerSpecialTileEffect(tile, tilesToClear);
        }
      });

      // 3. Clear Tiles & Damage Obstacles
      const clearedTilesArray = [];
      tilesToClear.forEach(coordKey => {
        const [r, c] = coordKey.split('_').map(Number);
        if (this.grid[r][c]) {
          clearedTilesArray.push({ ...this.grid[r][c] });
          this.damageObstacleAt(r, c);
          this.damageAdjacentObstacles(r, c);
          this.grid[r][c] = null;
        }
      });

      // 4. Place newly created Special Gems
      newSpecialGems.forEach(spec => {
        this.grid[spec.row][spec.col] = {
          id: `tile_${spec.row}_${spec.col}_${Date.now()}_special`,
          row: spec.row,
          col: spec.col,
          color: spec.color,
          special: spec.special,
          obstacle: OBSTACLES.NONE,
          obstacleHp: 0
        };
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
      currentMatches = this.findAllMatches();
    }

    if (this.eventBus) {
      this.eventBus.emit('grid:cascaded', { cascadeSequence, goals: { ...this.goals } });
    }

    return cascadeSequence;
  }

  /**
   * Trigger Special Tile Effects (Row Bomb, Col Bomb, Target Bomb)
   */
  triggerSpecialTileEffect(tile, tilesToClearSet) {
    if (tile.special === SPECIAL_TILES.ROW_BOMB) {
      // Clear entire Row
      for (let c = 0; c < this.cols; c++) tilesToClearSet.add(`${tile.row}_${c}`);
      if (this.eventBus) this.eventBus.emit('special:row_bomb_triggered', { row: tile.row });
    } else if (tile.special === SPECIAL_TILES.COL_BOMB) {
      // Clear entire Column
      for (let r = 0; r < this.rows; r++) tilesToClearSet.add(`${r}_${tile.col}`);
      if (this.eventBus) this.eventBus.emit('special:col_bomb_triggered', { col: tile.col });
    } else if (tile.special === SPECIAL_TILES.TARGET_BOMB) {
      // Targeted Homing Bomb: Destroys random obstacle (Ice/Mirror) or tile
      this.triggerTargetedHomingBomb(tilesToClearSet);
    }
  }

  /**
   * Targeted Homing Bomb (Match 2x2 Square Result): Seeks out and destroys random Level Obstacle (Ice/Mirror)
   */
  triggerTargetedHomingBomb(tilesToClearSet) {
    const obstacleTiles = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] && this.grid[r][c].obstacle !== OBSTACLES.NONE) {
          obstacleTiles.push({ row: r, col: c });
        }
      }
    }

    if (obstacleTiles.length > 0) {
      const target = obstacleTiles[Math.floor(Math.random() * obstacleTiles.length)];
      tilesToClearSet.add(`${target.row}_${target.col}`);
      this.damageObstacleAt(target.row, target.col, true); // Instant destroy obstacle
      if (this.eventBus) {
        this.eventBus.emit('special:target_bomb_triggered', { target, destroyedObstacle: true });
      }
    } else {
      // Destroy random tile if no obstacles left
      const r = Math.floor(Math.random() * this.rows);
      const c = Math.floor(Math.random() * this.cols);
      tilesToClearSet.add(`${r}_${c}`);
      if (this.eventBus) {
        this.eventBus.emit('special:target_bomb_triggered', { target: { row: r, col: c }, destroyedObstacle: false });
      }
    }
  }

  /**
   * Damage Obstacle at (r, c)
   */
  damageObstacleAt(r, c, instantDestroy = false) {
    const tile = this.grid[r][c];
    if (!tile || tile.obstacle === OBSTACLES.NONE) return;

    if (instantDestroy) tile.obstacleHp = 0;
    else tile.obstacleHp--;

    if (tile.obstacleHp <= 0) {
      const type = tile.obstacle;
      tile.obstacle = OBSTACLES.NONE;
      if (type === OBSTACLES.ICE && this.goals.ice > 0) this.goals.ice--;
      if (type === OBSTACLES.MIRROR && this.goals.mirror > 0) this.goals.mirror--;

      if (this.eventBus) {
        this.eventBus.emit('obstacle:shattered', { row: r, col: c, type, remainingGoals: { ...this.goals } });
      }
    }
  }

  /**
   * Damage Adjacent Obstacles surrounding a matched tile
   */
  damageAdjacentObstacles(r, c) {
    const adjacents = [
      { r: r - 1, c }, { r: r + 1, c },
      { r, c: c - 1 }, { r, c: c + 1 }
    ];

    adjacents.forEach(adj => {
      if (adj.r >= 0 && adj.r < this.rows && adj.c >= 0 && adj.c < this.cols) {
        this.damageObstacleAt(adj.r, adj.c);
      }
    });
  }

  findAllMatches() {
    const matchedGroups = [];

    // 1. Check 2x2 Squares
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < this.cols - 1; c++) {
        const t1 = this.grid[r][c];
        const t2 = this.grid[r][c + 1];
        const t3 = this.grid[r + 1][c];
        const t4 = this.grid[r + 1][c + 1];

        if (t1 && t2 && t3 && t4 && t1.color === t2.color && t1.color === t3.color && t1.color === t4.color) {
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
        }
      }
    }

    // 2. Horizontal Matches
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

            matchedGroups.push({ color, matchType, isHorizontal: true, tiles: matchTiles });
          }
          matchLength = 1;
        }
      }
    }

    // 3. Vertical Matches
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

            matchedGroups.push({ color, matchType, isHorizontal: false, tiles: matchTiles });
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
            special: SPECIAL_TILES.NORMAL,
            obstacle: OBSTACLES.NONE,
            obstacleHp: 0
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
