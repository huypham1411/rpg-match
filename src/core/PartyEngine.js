/**
 * PartyEngine - Manages Heroes, 5-Slot Equipment Sets, GBF Charge Gauge, and Stats Pipeline.
 */

export const HERO_CLASSES = {
  GUARD: 'Guard',                   // High DEF, enables team Block mode
  ATTACKER: 'Attacker',             // High ATK, direct physical damage
  MAGE: 'Mage',                     // High AOE magic damage & elemental debuffs
  SUPPORT: 'Support',                // Healer & team buff provider
  COUNTER_SPECIALIST: 'Counter'     // Auto-parry, team counter buffs, utility debuffer
};

export const ELEMENT_COLORS = {
  RED: 'red',       // Fire - Attacker
  BLUE: 'blue',     // Water - Guard
  GREEN: 'green',   // Wind - Support
  YELLOW: 'yellow', // Light - Mage
  PURPLE: 'purple'  // Dark - Counter Specialist
};

export const EQUIP_SLOTS = {
  WEAPON: 'weapon',
  ARMOR: 'armor',
  ACCESSORY: 'accessory',
  ARTIFACT: 'artifact',
  RUNE: 'rune'       // 5th Equipment Slot!
};

export const EQUIP_SETS = {
  COUNTER_SET: 'COUNTER_SET',        // 2-pc: +20% Counter Dmg, 4-pc: Auto-parry grants team ATK +25%
  MATCH_UP_SET: 'MATCH_UP_SET',      // 2-pc: +20% Energy Charge Speed, 4-pc: Match 4+ has 30% chance for +1 Move
  DEBUFF_AMP_SET: 'DEBUFF_AMP_SET',  // 2-pc: +25% Debuff Duration, 4-pc: Debuffs reduce Boss ATK by 20%
  GUARDIAN_SET: 'GUARDIAN_SET'       // 2-pc: +25% DEF, 4-pc: Blocking reflects 30% damage
};

export class PartyEngine {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.heroes = [];
  }

  setParty(heroConfigs) {
    if (heroConfigs.length > 4) {
      throw new Error('Party cannot exceed 4 heroes.');
    }

    this.heroes = heroConfigs.map((config, index) => ({
      id: config.id || `hero_${index + 1}`,
      name: config.name,
      classType: config.classType || HERO_CLASSES.ATTACKER,
      elementColor: config.elementColor || ELEMENT_COLORS.RED,
      icon: config.icon || '⚔️',
      baseStats: {
        maxHp: config.baseStats?.maxHp || 1000,
        hp: config.baseStats?.hp || config.baseStats?.maxHp || 1000,
        atk: config.baseStats?.atk || 120,
        def: config.baseStats?.def || 50,
        critRate: config.baseStats?.critRate || 0.1,
        critDmg: config.baseStats?.critDmg || 1.5,
      },
      energy: 0, // GBF Charge Bar (0 -> 100)
      maxEnergy: 100,
      skills: {
        basicSkill: config.skills?.basicSkill || { name: 'Basic Strike', multiplier: 1.0, type: 'DMG' },
        match4Skill: config.skills?.match4Skill || { name: 'Empowered Strike', multiplier: 1.8, type: 'ENHANCE_BUFF' },
        specialSkill: config.skills?.specialSkill || { name: 'Counter Stance', multiplier: 2.2, type: 'AUTO_PARRY' },
        ultimateSkill: config.skills?.ultimateSkill || { name: 'GBF Burst Ultimate', multiplier: 3.8, type: 'ULTIMATE' }
      },
      equipment: {
        [EQUIP_SLOTS.WEAPON]: config.equipment?.[EQUIP_SLOTS.WEAPON] || null,
        [EQUIP_SLOTS.ARMOR]: config.equipment?.[EQUIP_SLOTS.ARMOR] || null,
        [EQUIP_SLOTS.ACCESSORY]: config.equipment?.[EQUIP_SLOTS.ACCESSORY] || null,
        [EQUIP_SLOTS.ARTIFACT]: config.equipment?.[EQUIP_SLOTS.ARTIFACT] || null,
        [EQUIP_SLOTS.RUNE]: config.equipment?.[EQUIP_SLOTS.RUNE] || null,
      },
      buffs: []
    }));

    if (this.eventBus) {
      this.eventBus.emit('party:updated', this.getPartyState());
    }
  }

  /**
   * Evaluate Active Set Bonuses for a Hero (2-piece and 4-piece bonuses)
   */
  getActiveSetBonuses(heroId) {
    const hero = this.getHero(heroId);
    if (!hero) return [];

    const setCounts = {};
    Object.values(hero.equipment).forEach(item => {
      if (item && item.set) {
        setCounts[item.set] = (setCounts[item.set] || 0) + 1;
      }
    });

    const activeBonuses = [];
    Object.entries(setCounts).forEach(([setName, count]) => {
      if (count >= 2) activeBonuses.push({ set: setName, pieces: 2 });
      if (count >= 4) activeBonuses.push({ set: setName, pieces: 4 });
    });

    return activeBonuses;
  }

  /**
   * Calculate effective stats considering equipment, 5-slots, set bonuses & buffs
   */
  getHeroEffectiveStats(heroId) {
    const hero = this.getHero(heroId);
    if (!hero) return null;

    let stats = { ...hero.baseStats };

    // Equipment Flat & Percentage Bonuses
    Object.values(hero.equipment).forEach(item => {
      if (!item || !item.stats) return;
      if (item.stats.maxHp) stats.maxHp += item.stats.maxHp;
      if (item.stats.atk) stats.atk += item.stats.atk;
      if (item.stats.def) stats.def += item.stats.def;
      if (item.stats.critRate) stats.critRate += item.stats.critRate;
      if (item.stats.critDmg) stats.critDmg += item.stats.critDmg;
    });

    // Set Bonuses Stat Modifiers
    const setBonuses = this.getActiveSetBonuses(heroId);
    let setAtkMult = 1.0;
    let setDefMult = 1.0;

    setBonuses.forEach(b => {
      if (b.set === EQUIP_SETS.GUARDIAN_SET && b.pieces === 2) setDefMult += 0.25;
      if (b.set === EQUIP_SETS.COUNTER_SET && b.pieces === 2) stats.critRate += 0.10;
    });

    // Active Buffs
    let buffAtkMult = 1.0;
    let buffDefMult = 1.0;
    hero.buffs.forEach(buff => {
      if (buff.type === 'ATK_UP') buffAtkMult += buff.value || 0.25;
      if (buff.type === 'DEF_UP') buffDefMult += buff.value || 0.35;
    });

    stats.atk = Math.round(stats.atk * setAtkMult * buffAtkMult);
    stats.def = Math.round(stats.def * setDefMult * buffDefMult);

    return stats;
  }

  equipItem(heroId, slot, item) {
    const hero = this.getHero(heroId);
    if (!hero || !Object.values(EQUIP_SLOTS).includes(slot)) return false;

    hero.equipment[slot] = item;
    if (this.eventBus) {
      this.eventBus.emit('hero:equipped', { heroId, slot, item, setBonuses: this.getActiveSetBonuses(heroId) });
      this.eventBus.emit('party:updated', this.getPartyState());
    }
    return true;
  }

  unequipItem(heroId, slot) {
    const hero = this.getHero(heroId);
    if (!hero || !hero.equipment[slot]) return null;

    const removed = hero.equipment[slot];
    hero.equipment[slot] = null;
    if (this.eventBus) {
      this.eventBus.emit('hero:unequipped', { heroId, slot, item: removed });
      this.eventBus.emit('party:updated', this.getPartyState());
    }
    return removed;
  }

  /**
   * Charge GBF-Style Charge Gauge (0 to 100)
   */
  chargeEnergyByColor(color, matchCount) {
    const chargedHeroes = [];
    const baseEnergyPerTile = 10;
    const energyGained = matchCount * baseEnergyPerTile;

    this.heroes.forEach(hero => {
      const setBonuses = this.getActiveSetBonuses(hero.id);
      const hasMatchUp2pc = setBonuses.some(b => b.set === EQUIP_SETS.MATCH_UP_SET && b.pieces === 2);
      const setBonusMult = hasMatchUp2pc ? 1.20 : 1.0;

      let gain = 0;
      if (hero.elementColor === color) {
        gain = Math.round(energyGained * setBonusMult);
      } else {
        gain = Math.round((energyGained * 0.3) * setBonusMult);
      }

      if (gain > 0) {
        const oldEnergy = hero.energy;
        hero.energy = Math.min(hero.maxEnergy, hero.energy + gain);
        chargedHeroes.push({ heroId: hero.id, gained: hero.energy - oldEnergy, current: hero.energy });
      }
    });

    if (this.eventBus && chargedHeroes.length > 0) {
      this.eventBus.emit('party:energy_charged', chargedHeroes);
    }
    return chargedHeroes;
  }

  useUltimate(heroId) {
    const hero = this.getHero(heroId);
    if (!hero) return { success: false, reason: 'Hero not found' };
    if (hero.energy < hero.maxEnergy) {
      return { success: false, reason: `GBF Charge Bar not full (${hero.energy}/100)` };
    }

    hero.energy = 0; // Reset GBF Charge Bar
    const stats = this.getHeroEffectiveStats(heroId);
    const ultimateInfo = hero.skills.ultimateSkill;

    const result = {
      success: true,
      heroId: hero.id,
      heroName: hero.name,
      skillName: ultimateInfo.name,
      multiplier: ultimateInfo.multiplier,
      baseAtk: stats.atk,
      critRate: stats.critRate,
      critDmg: stats.critDmg
    };

    if (this.eventBus) {
      this.eventBus.emit('hero:ultimate_used', result);
      this.eventBus.emit('party:updated', this.getPartyState());
    }

    return result;
  }

  hasGuardHero() {
    return this.heroes.some(h => (h.classType === HERO_CLASSES.GUARD || h.classType === HERO_CLASSES.COUNTER_SPECIALIST) && h.baseStats.hp > 0);
  }

  getHero(heroId) {
    return this.heroes.find(h => h.id === heroId);
  }

  getHeroByColor(color) {
    return this.heroes.find(h => h.elementColor === color);
  }

  healParty(amount) {
    this.heroes.forEach(h => {
      const stats = this.getHeroEffectiveStats(h.id);
      h.baseStats.hp = Math.min(stats.maxHp, h.baseStats.hp + amount);
    });
  }

  takeTeamDamage(totalDamage) {
    const aliveHeroes = this.heroes.filter(h => h.baseStats.hp > 0);
    if (aliveHeroes.length === 0) return 0;

    const damagePerHero = Math.ceil(totalDamage / aliveHeroes.length);
    let totalTaken = 0;

    aliveHeroes.forEach(hero => {
      const stats = this.getHeroEffectiveStats(hero.id);
      const damageAfterDef = Math.max(1, Math.round(damagePerHero * (100 / (100 + stats.def))));
      hero.baseStats.hp = Math.max(0, hero.baseStats.hp - damageAfterDef);
      totalTaken += damageAfterDef;

      // Taking damage grants GBF Charge Energy (+10%)
      hero.energy = Math.min(hero.maxEnergy, hero.energy + 10);
    });

    if (this.eventBus) {
      this.eventBus.emit('party:damage_taken', { totalDamage, actualDamage: totalTaken });
      this.eventBus.emit('party:updated', this.getPartyState());
    }

    return totalTaken;
  }

  getPartyState() {
    return this.heroes.map(h => ({
      ...h,
      effectiveStats: this.getHeroEffectiveStats(h.id),
      activeSetBonuses: this.getActiveSetBonuses(h.id)
    }));
  }
}
