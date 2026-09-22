/**
 * SkillBuffEngine - Handles Match 3/4/5 Skill Hierarchy, Stackable Buffs/Debuffs, and Auto-Parry Triggers.
 */

import { MATCH_TYPES } from './GridEngine.js';
import { HERO_CLASSES, EQUIP_SETS } from './PartyEngine.js';

export const BUFF_TYPES = {
  ATK_UP: 'ATK_UP',
  DEF_UP: 'DEF_UP',
  COUNTER_STANCE: 'COUNTER_STANCE', // Auto-Parry next boss attack
  REGEN: 'REGEN'
};

export const DEBUFF_TYPES = {
  BURN: 'BURN',
  ARMOR_SHATTER: 'ARMOR_SHATTER',
  STUN: 'STUN',
  WEAKNESS: 'WEAKNESS'
};

export class SkillBuffEngine {
  constructor(eventBus, partyEngine, parryBlockEngine) {
    this.eventBus = eventBus;
    this.partyEngine = partyEngine;
    this.parryBlockEngine = parryBlockEngine;
    this.bossBuffs = [];
  }

  /**
   * Resolve tile matches into character skills based on Match 3 / 4 / 5 hierarchy
   */
  resolveMatchSkills(matches, bossStats) {
    const results = [];

    matches.forEach(match => {
      const hero = this.partyEngine.getHeroByColor(match.color);
      const isMatch5 = match.matchType === MATCH_TYPES.MATCH_5 || match.count >= 5;
      const isMatch4 = match.matchType === MATCH_TYPES.MATCH_4 || match.matchType === MATCH_TYPES.MATCH_2X2 || match.count === 4;

      if (!hero || hero.baseStats.hp <= 0) {
        results.push({
          color: match.color,
          heroId: null,
          matchType: match.matchType,
          damage: Math.round(40 * match.count * (match.comboMultiplier || 1.0)),
          isCrit: false,
          skillName: 'Basic Elemental Burst',
          effects: []
        });
        return;
      }

      const effectiveStats = this.partyEngine.getHeroEffectiveStats(hero.id);
      const setBonuses = this.partyEngine.getActiveSetBonuses(hero.id);
      const hasDebuffAmp = setBonuses.some(b => b.set === EQUIP_SETS.DEBUFF_AMP_SET && b.pieces === 2);
      const debuffDurationBonus = hasDebuffAmp ? 1 : 0;

      let skillInfo = hero.skills.basicSkill;
      let durationBonus = 0;
      let stackCount = 1;

      if (isMatch5) {
        skillInfo = hero.skills.specialSkill || hero.skills.match4Skill;
        durationBonus = 2; // Match 5 extends duration by 2 turns
        stackCount = 2;   // Grants double stack

        // Match 5 Triggers Auto-Parry Stance!
        if (this.parryBlockEngine) {
          this.parryBlockEngine.triggerAutoParry(hero.name);
        }
      } else if (isMatch4) {
        skillInfo = hero.skills.match4Skill;
        durationBonus = 1; // Match 4 extends duration by 1 turn
      }

      // Calculate Damage
      const comboMult = match.comboMultiplier || 1.0;
      let rawDamage = effectiveStats.atk * skillInfo.multiplier * comboMult;

      // Counter Specialist Role Balance: Utility over raw burst damage
      if (hero.classType === HERO_CLASSES.COUNTER_SPECIALIST) {
        rawDamage *= 0.65; // Utility character deals lower direct DMG but heavy buffs/debuffs
      }

      const isCrit = Math.random() < effectiveStats.critRate;
      if (isCrit) rawDamage *= effectiveStats.critDmg;

      // Defense Reduction Formula
      let effectiveBossDef = bossStats ? bossStats.def : 0;
      const shatterDebuff = this.bossBuffs.find(b => b.type === DEBUFF_TYPES.ARMOR_SHATTER);
      if (shatterDebuff) {
        effectiveBossDef *= (1 - (shatterDebuff.value || 0.4));
      }

      const defMultiplier = 100 / (100 + effectiveBossDef);
      const finalDamage = Math.max(1, Math.round(rawDamage * defMultiplier));

      // Side Effects (Buffs / Debuffs based on Match Level)
      const effectsApplied = [];

      if (match.color === 'red') {
        // Red / Attacker: ATK Buff / Burn
        this.applyBuffToHero(hero.id, { type: BUFF_TYPES.ATK_UP, value: 0.25 * stackCount, duration: 2 + durationBonus });
        effectsApplied.push(`ATK +${25 * stackCount}% (${2 + durationBonus} Turns)`);
      } else if (match.color === 'blue') {
        // Blue / Guard: DEF Buff & Armor Shatter
        this.applyBuffToHero(hero.id, { type: BUFF_TYPES.DEF_UP, value: 0.35 * stackCount, duration: 2 + durationBonus });
        this.applyDebuffToBoss({ type: DEBUFF_TYPES.ARMOR_SHATTER, value: 0.35, duration: 2 + durationBonus + debuffDurationBonus });
        effectsApplied.push(`DEF +35% & Boss Armor Shattered`);
      } else if (match.color === 'green') {
        // Green / Support: Team Heal & Regen
        const healAmt = Math.round(effectiveStats.atk * (isMatch5 ? 1.0 : (isMatch4 ? 0.7 : 0.4)));
        this.partyEngine.healParty(healAmt);
        effectsApplied.push(`Party Healed by ${healAmt} HP`);
      } else if (match.color === 'purple') {
        // Purple / Counter Specialist: Auto-Parry Stance & Boss Weakness
        this.applyDebuffToBoss({ type: DEBUFF_TYPES.WEAKNESS, value: 0.3, duration: 2 + durationBonus + debuffDurationBonus });
        if (this.parryBlockEngine) {
          this.parryBlockEngine.triggerAutoParry(hero.name);
        }
        effectsApplied.push(`AUTO-PARRY STANCE ACTIVATED & Boss Weakened (-30% ATK)`);
      }

      results.push({
        color: match.color,
        heroId: hero.id,
        heroName: hero.name,
        skillName: skillInfo.name,
        matchType: match.matchType,
        damage: finalDamage,
        isCrit,
        comboMultiplier: comboMult,
        effects: effectsApplied
      });
    });

    if (this.eventBus) {
      this.eventBus.emit('skills:resolved', results);
    }

    return results;
  }

  applyBuffToHero(heroId, buff) {
    const hero = this.partyEngine.getHero(heroId);
    if (!hero) return;
    hero.buffs.push(buff);
    if (this.eventBus) {
      this.eventBus.emit('buff:applied_hero', { heroId, buff });
    }
  }

  applyDebuffToBoss(debuff) {
    this.bossBuffs.push(debuff);
    if (this.eventBus) {
      this.eventBus.emit('debuff:applied_boss', debuff);
    }
  }

  tickTurnEnd() {
    this.partyEngine.heroes.forEach(hero => {
      hero.buffs = hero.buffs.map(b => ({ ...b, duration: b.duration - 1 })).filter(b => b.duration > 0);
    });

    let dotDamage = 0;
    this.bossBuffs.forEach(debuff => {
      if (debuff.type === DEBUFF_TYPES.BURN) {
        dotDamage += debuff.value || 0;
      }
    });

    this.bossBuffs = this.bossBuffs.map(b => ({ ...b, duration: b.duration - 1 })).filter(b => b.duration > 0);

    return { dotDamage, activeBossDebuffs: [...this.bossBuffs] };
  }
}
