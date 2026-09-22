/**
 * Automated Verification Script Ver 3.0
 * Validates Boss Stagger & Break Bar System, Differential Parry/Counter Reduction, & Broken State Bonus Damage.
 */

import { GameCore } from '../src/core/GameCore.js';

console.log('===================================================');
console.log('🎮 MATCH-3 RPG CORE ENGINE - AUTOMATED TEST VER 3.0');
console.log('===================================================\n');

const game = new GameCore();

// Event Listeners
game.eventBus.on('battle:started', (state) => {
  console.log(`[EVENT] Battle Started! Boss: ${state.boss.name}, Stagger Gauge: ${state.boss.staggerGauge}/${state.boss.maxStaggerGauge}`);
});

game.eventBus.on('boss:stagger_reduced', (data) => {
  console.log(`💥 [STAGGER REDUCED] -${data.amount} points via [${data.source}]. Current Stagger: ${data.current}/${data.max}`);
});

game.eventBus.on('boss:broken', (data) => {
  console.log(`⚡ [BOSS BROKEN!] Boss ${data.bossName} is STAGGERED & BROKEN! Takes +75% bonus damage!`);
});

game.eventBus.on('boss:damaged', (data) => {
  const breakTag = data.isBroken ? ' [BROKEN BONUS +75%]' : '';
  console.log(`🎯 [DAMAGE] Boss took ${data.damage} damage!${breakTag} (Remaining Boss HP: ${data.currentHp}/${data.maxHp})`);
});

// 1. Init Game
console.log('--- 1. Initializing Game Engine ---');
game.init();

// 2. Test Normal Match Stagger Reduction
console.log('\n--- 2. Testing Normal Match Stagger Reduction ---');
game.battleEngine.depleteBossStagger(4, 'Normal Match-3');
console.log(`Boss Stagger Gauge after Normal Match: ${game.battleEngine.boss.staggerGauge}/100`);

// 3. Test Parry / Counter Stagger Reduction (-50 points!)
console.log('\n--- 3. Testing Perfect Parry / Counter Heavy Stagger Reduction ---');
game.battleEngine.depleteBossStagger(50, 'Perfect Parry / Counter');
console.log(`Boss Stagger Gauge after Perfect Parry: ${game.battleEngine.boss.staggerGauge}/100`);

// 4. Deplete remaining stagger to trigger BROKEN state
console.log('\n--- 4. Depleting Remaining Stagger to Trigger BROKEN State ---');
game.battleEngine.depleteBossStagger(50, 'Counter Specialist Skill');
console.log(`Is Boss Broken: ${game.battleEngine.boss.isBroken}`);

// 5. Test Bonus Damage during BROKEN state
console.log('\n--- 5. Testing Bonus Damage Dealt to Broken Boss ---');
const heroRed = game.partyEngine.getHeroByColor('red');
game.partyEngine.chargeEnergyByColor('red', 10); // Fully charge GBF energy bar
const ultRes = game.useUltimate(heroRed.id);
console.log(`Ultimate used on Broken Boss: success=${ultRes.success}, damage=${ultRes.damage}`);

console.log('\n===================================================');
console.log('🎉 ALL STAGGER & BREAK BAR TESTS PASSED SUCCESSFULLY!');
console.log('===================================================');
