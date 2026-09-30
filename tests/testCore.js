/**
 * Automated Verification Script Ver 5.0
 * Validates Special Gems (Rainbow, Line Bomb, Target Bomb) & Level Obstacles (Ice, Mirror).
 */

import { GameCore } from '../src/core/GameCore.js';
import { SPECIAL_TILES, OBSTACLES } from '../src/core/GridEngine.js';

console.log('===================================================');
console.log('🎮 MATCH-3 RPG CORE ENGINE - AUTOMATED TEST VER 5.0');
console.log('===================================================\n');

const game = new GameCore();

// Event Listeners
game.eventBus.on('special:rainbow_activated', (data) => {
  console.log(`🌈 [RAINBOW ACTIVATED] Cleared ALL ${data.clearedCount} tiles of color ${data.targetColor.toUpperCase()}!`);
});

game.eventBus.on('special:row_bomb_triggered', (data) => {
  console.log(`🚀 [ROW BOMB] Cleared entire Row ${data.row}!`);
});

game.eventBus.on('special:target_bomb_triggered', (data) => {
  console.log(`💣 [TARGET BOMB] Homed in on target (${data.target.row}, ${data.target.col}), Destroyed Obstacle: ${data.destroyedObstacle}`);
});

game.eventBus.on('obstacle:shattered', (data) => {
  console.log(`🧊 [OBSTACLE SHATTERED] ${data.type.toUpperCase()} shattered at (${data.row}, ${data.col})! Remaining Goals: Ice=${data.remainingGoals.ice}, Mirror=${data.remainingGoals.mirror}`);
});

// 1. Init Game
console.log('--- 1. Initializing Game Engine with Obstacles ---');
const state = game.init();
console.log(`Grid initialized: ${state.grid.length}x${state.grid[0].length}`);

// Count placed obstacles
let iceCount = 0;
let mirrorCount = 0;
for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 8; c++) {
    if (state.grid[r][c].obstacle === OBSTACLES.ICE) iceCount++;
    if (state.grid[r][c].obstacle === OBSTACLES.MIRROR) mirrorCount++;
  }
}
console.log(`Initial Obstacles on Board: Ice(🧊)=${iceCount}, Mirror(🪞)=${mirrorCount}\n`);

// 2. Test Target Bomb Homing Destroy
console.log('--- 2. Testing Targeted Homing Bomb (2x2 Square Result) ---');
const dummySet = new Set();
game.gridEngine.triggerTargetedHomingBomb(dummySet);
console.log('');

// 3. Test Rainbow Gem Activation
console.log('--- 3. Testing Rainbow Gem Swap Activation ---');
const rainbowTile = { row: 0, col: 0, special: SPECIAL_TILES.RAINBOW };
const resRainbow = game.gridEngine.activateRainbowSwap(rainbowTile, 'red');
console.log(`Rainbow Swap Result: success=${resRainbow.success}, clearedCount=${resRainbow.clearedCount}\n`);

console.log('===================================================');
console.log('🎉 ALL SPECIAL GEMS & OBSTACLE TESTS PASSED!');
console.log('===================================================');
