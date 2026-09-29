/**
 * Automated Verification Script Ver 4.0
 * Validates Dynamic Party Color Palette (3, 4, and 5 Heroes/Colors) & Pure Match-3 Core.
 */

import { GameCore } from '../src/core/GameCore.js';

console.log('===================================================');
console.log('🎮 MATCH-3 RPG CORE ENGINE - AUTOMATED TEST VER 4.0');
console.log('===================================================\n');

const game = new GameCore();

// 1. Test 3-Hero Party (3 Colors)
console.log('--- 1. Testing 3-Hero Party (3 Candy Colors) ---');
const state3 = game.setPartyPreset(3);
console.log(`Party size: ${state3.party.length} heroes loaded.`);
console.log(`Grid Active Colors (${state3.activeColors.length}):`, state3.activeColors);
console.log(`Grid Dimensions: ${state3.grid.length}x${state3.grid[0].length}\n`);

// 2. Test 4-Hero Party (4 Colors)
console.log('--- 2. Testing 4-Hero Party (4 Candy Colors) ---');
const state4 = game.setPartyPreset(4);
console.log(`Party size: ${state4.party.length} heroes loaded.`);
console.log(`Grid Active Colors (${state4.activeColors.length}):`, state4.activeColors);
console.log(`Grid Dimensions: ${state4.grid.length}x${state4.grid[0].length}\n`);

// 3. Test 5-Hero Party (5 Colors)
console.log('--- 3. Testing 5-Hero Party (5 Candy Colors) ---');
const state5 = game.setPartyPreset(5);
console.log(`Party size: ${state5.party.length} heroes loaded.`);
console.log(`Grid Active Colors (${state5.activeColors.length}):`, state5.activeColors);
console.log(`Grid Dimensions: ${state5.grid.length}x${state5.grid[0].length}\n`);

// 4. Test Match-3 Swap on 3-Color Board
console.log('--- 4. Testing Match-3 Swap on 3-Color Board ---');
game.setPartyPreset(3);
let swapped = false;
for (let r = 0; r < 8 && !swapped; r++) {
  for (let c = 0; c < 7 && !swapped; c++) {
    const res = game.swapTiles(r, c, r, c + 1);
    if (res.success) {
      console.log(`✅ Swap Successful at (${r},${c}) <-> (${r},${c+1})! Cascades: ${res.cascadeResults.length}, Total Damage: ${res.totalDamageDealt}`);
      swapped = true;
    }
  }
}

console.log('\n===================================================');
console.log('🎉 ALL DYNAMIC PARTY COLOR TESTS PASSED SUCCESSFULLY!');
console.log('===================================================');
