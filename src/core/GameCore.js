/**
 * GameCore - Unified Engine Facade with Dynamic Party Palette (3 to 5 Colors) & Pure Match-3 Core.
 */

import { EventBus } from './EventBus.js';
import { PartyEngine, HERO_CLASSES, ELEMENT_COLORS, EQUIP_SLOTS, EQUIP_SETS } from './PartyEngine.js';
import { GridEngine, MATCH_TYPES } from './GridEngine.js';
import { SkillBuffEngine } from './SkillBuffEngine.js';
import { ParryBlockEngine } from './ParryBlockEngine.js';
import { BattleEngine } from './BattleEngine.js';

export class GameCore {
  constructor() {
    this.eventBus = new EventBus();
    this.partyEngine = new PartyEngine(this.eventBus);
    this.gridEngine = new GridEngine(this.eventBus);
    this.parryBlockEngine = new ParryBlockEngine(this.eventBus, this.partyEngine);
    this.skillBuffEngine = new SkillBuffEngine(this.eventBus, this.partyEngine, this.parryBlockEngine);
    this.battleEngine = new BattleEngine(
      this.eventBus,
      this.partyEngine,
      this.skillBuffEngine,
      this.parryBlockEngine
    );
  }

  /**
   * Initialize battle with dynamic party size (3, 4, or 5 heroes)
   * The grid palette automatically configures to match the active hero element colors!
   */
  init(partyConfig = null, bossConfig = null) {
    const defaultParty = partyConfig || [
      {
        id: 'hero_red',
        name: 'Ignis the Berserker',
        classType: HERO_CLASSES.ATTACKER,
        elementColor: ELEMENT_COLORS.RED,
        icon: '⚔️',
        baseStats: { maxHp: 1200, hp: 1200, atk: 190, def: 45, critRate: 0.15, critDmg: 1.6 },
        equipment: {
          [EQUIP_SLOTS.WEAPON]: { name: 'Flame Sword', set: EQUIP_SETS.MATCH_UP_SET, stats: { atk: 40, critRate: 0.05 } },
          [EQUIP_SLOTS.ARMOR]: { name: 'Flame Armor', set: EQUIP_SETS.MATCH_UP_SET, stats: { maxHp: 200, def: 20 } },
        }
      },
      {
        id: 'hero_blue',
        name: 'Aegis the Vanguard',
        classType: HERO_CLASSES.GUARD,
        elementColor: ELEMENT_COLORS.BLUE,
        icon: '🛡️',
        baseStats: { maxHp: 1800, hp: 1800, atk: 110, def: 95, critRate: 0.05, critDmg: 1.4 },
        equipment: {
          [EQUIP_SLOTS.ARMOR]: { name: 'Guardian Plate', set: EQUIP_SETS.GUARDIAN_SET, stats: { maxHp: 300, def: 35 } },
          [EQUIP_SLOTS.RUNE]: { name: 'Guardian Rune', set: EQUIP_SETS.GUARDIAN_SET, stats: { def: 25 } }
        }
      },
      {
        id: 'hero_green',
        name: 'Sylph the Druid',
        classType: HERO_CLASSES.SUPPORT,
        elementColor: ELEMENT_COLORS.GREEN,
        icon: '🌿',
        baseStats: { maxHp: 1100, hp: 1100, atk: 130, def: 50, critRate: 0.1, critDmg: 1.5 },
        equipment: {
          [EQUIP_SLOTS.ACCESSORY]: { name: 'Emerald Pendant', stats: { maxHp: 150, atk: 20 } }
        }
      },
      {
        id: 'hero_yellow',
        name: 'Lux the Archmage',
        classType: HERO_CLASSES.MAGE,
        elementColor: ELEMENT_COLORS.YELLOW,
        icon: '⚡',
        baseStats: { maxHp: 950, hp: 950, atk: 220, def: 40, critRate: 0.2, critDmg: 1.8 },
        equipment: {
          [EQUIP_SLOTS.ARTIFACT]: { name: 'Orb of Radiance', set: EQUIP_SETS.DEBUFF_AMP_SET, stats: { atk: 50 } },
          [EQUIP_SLOTS.RUNE]: { name: 'Hex Rune', set: EQUIP_SETS.DEBUFF_AMP_SET, stats: { atk: 30 } }
        }
      }
    ];

    this.partyEngine.setParty(defaultParty);
    
    // Automatically get active element colors from party composition
    const activeColors = this.partyEngine.getActiveElementColors();
    this.gridEngine.initGrid(activeColors);
    this.battleEngine.startBattle(bossConfig);

    return this.getFullState();
  }

  /**
   * Helper to set custom 3, 4, or 5 hero party and auto-adjust board colors
   */
  setPartyPreset(heroCount = 3) {
    const allPresets = [
      { id: 'hero_red', name: 'Ignis (Attacker)', classType: HERO_CLASSES.ATTACKER, elementColor: ELEMENT_COLORS.RED, icon: '⚔️' },
      { id: 'hero_blue', name: 'Aegis (Guard)', classType: HERO_CLASSES.GUARD, elementColor: ELEMENT_COLORS.BLUE, icon: '🛡️' },
      { id: 'hero_green', name: 'Sylph (Support)', classType: HERO_CLASSES.SUPPORT, elementColor: ELEMENT_COLORS.GREEN, icon: '🌿' },
      { id: 'hero_yellow', name: 'Lux (Archmage)', classType: HERO_CLASSES.MAGE, elementColor: ELEMENT_COLORS.YELLOW, icon: '⚡' },
      { id: 'hero_purple', name: 'Valerie (Counter)', classType: HERO_CLASSES.COUNTER_SPECIALIST, elementColor: ELEMENT_COLORS.PURPLE, icon: '🗡️' }
    ];

    const selectedParty = allPresets.slice(0, Math.max(3, Math.min(5, heroCount)));
    this.partyEngine.setParty(selectedParty);

    const activeColors = this.partyEngine.getActiveElementColors();
    this.gridEngine.initGrid(activeColors);
    this.battleEngine.startBattle();

    return this.getFullState();
  }

  swapTiles(r1, c1, r2, c2) {
    if (this.battleEngine.state !== 'PLAYER_TURN') {
      return { success: false, reason: 'Not player turn' };
    }

    if (this.parryBlockEngine.isBlocking) {
      return { success: false, reason: 'Cannot move puzzle while BLOCK mode is active' };
    }

    const swapResult = this.gridEngine.swapTiles(r1, c1, r2, c2);
    if (!swapResult.success) {
      return swapResult;
    }

    let parryInfo = null;
    if (this.parryBlockEngine.parryWindowActive || this.parryBlockEngine.hasAutoParryStance) {
      const firstMatchColor = swapResult.cascadeResults[0]?.matchDetails[0]?.color;
      parryInfo = this.parryBlockEngine.attemptParry(firstMatchColor);
    }

    const totalDamageDealt = this.processMatchCascades(swapResult.cascadeResults);
    this.battleEngine.consumeMove();

    return {
      success: true,
      swap: swapResult.swap,
      cascadeResults: swapResult.cascadeResults,
      parryInfo,
      totalDamageDealt,
      battleState: this.battleEngine.getBattleState()
    };
  }

  processMatchCascades(cascadeSequence) {
    let totalDamage = 0;

    cascadeSequence.forEach(cascade => {
      cascade.matchDetails.forEach(match => {
        // Charge GBF energy
        this.partyEngine.chargeEnergyByColor(match.color, match.count);

        // Deplete Boss Stagger Bar: Normal match (-4), Match 4/2x2 (-12), Match 5 (-25)
        let staggerReduction = 4;
        if (match.matchType === MATCH_TYPES.MATCH_5 || match.count >= 5) staggerReduction = 25;
        else if (match.matchType === MATCH_TYPES.MATCH_4 || match.matchType === MATCH_TYPES.MATCH_2X2 || match.count === 4) staggerReduction = 12;

        this.battleEngine.depleteBossStagger(staggerReduction, `Tile Match (${match.matchType || match.count})`);

        // Resolve skill damage & buff/debuff
        const skillResults = this.skillBuffEngine.resolveMatchSkills([match], this.battleEngine.boss);
        skillResults.forEach(res => {
          totalDamage += res.damage;
          this.battleEngine.damageBoss(res.damage, res.isCrit);
        });
      });
    });

    return totalDamage;
  }

  useUltimate(heroId) {
    if (this.battleEngine.state !== 'PLAYER_TURN') {
      return { success: false, reason: 'Not player turn' };
    }

    const ultRes = this.partyEngine.useUltimate(heroId);
    if (!ultRes.success) return ultRes;

    const stats = this.partyEngine.getHeroEffectiveStats(heroId);
    let rawDamage = stats.atk * ultRes.multiplier;
    const isCrit = Math.random() < stats.critRate;
    if (isCrit) rawDamage *= stats.critDmg;

    this.battleEngine.depleteBossStagger(20, 'GBF Burst Ultimate');

    const damageAfterDef = Math.max(1, Math.round(rawDamage * (100 / (100 + this.battleEngine.boss.def))));
    this.battleEngine.damageBoss(damageAfterDef, isCrit);

    return {
      success: true,
      heroId,
      skillName: ultRes.skillName,
      damage: damageAfterDef,
      isCrit,
      bossHp: this.battleEngine.boss.hp
    };
  }

  toggleBlock() {
    return this.battleEngine.toggleBlockMode();
  }

  equipItem(heroId, slot, item) {
    return this.partyEngine.equipItem(heroId, slot, item);
  }

  getFullState() {
    return {
      battle: this.battleEngine.getBattleState(),
      grid: this.gridEngine.getGridState(),
      activeColors: this.gridEngine.availableColors,
      party: this.partyEngine.getPartyState(),
      bossDebuffs: [...this.skillBuffEngine.bossBuffs],
      autoParryStance: this.parryBlockEngine.hasAutoParryStance
    };
  }

  loadState(snapshot) {
    if (!snapshot) return;
    if (snapshot.grid) this.gridEngine.grid = snapshot.grid;
    if (snapshot.party) this.partyEngine.heroes = snapshot.party;
    if (snapshot.battle) {
      this.battleEngine.boss = snapshot.battle.boss;
      this.battleEngine.state = snapshot.battle.state;
      this.battleEngine.movesLeft = snapshot.battle.movesLeft;
      this.battleEngine.turnCount = snapshot.battle.turnCount;
    }
    if (this.eventBus) {
      this.eventBus.emit('game:state_loaded', this.getFullState());
    }
  }
}
