/**
 * BattleEngine - Handles Turn Cycle, Boss AI, Move Limits, and Boss Stagger / Break Bar System.
 */

export const BATTLE_STATE = {
  NOT_STARTED: 'NOT_STARTED',
  PLAYER_TURN: 'PLAYER_TURN',
  ENEMY_TURN: 'ENEMY_TURN',
  PARRY_PHASE: 'PARRY_PHASE',
  VICTORY: 'VICTORY',
  DEFEAT: 'DEFEAT'
};

export class BattleEngine {
  constructor(eventBus, partyEngine, skillBuffEngine, parryBlockEngine) {
    this.eventBus = eventBus;
    this.partyEngine = partyEngine;
    this.skillBuffEngine = skillBuffEngine;
    this.parryBlockEngine = parryBlockEngine;

    this.state = BATTLE_STATE.NOT_STARTED;
    this.turnCount = 0;
    this.maxMovesPerTurn = 3;
    this.movesLeft = 3;

    this.boss = {
      name: 'Demon Lord Overlord',
      maxHp: 25000,
      hp: 25000,
      atk: 350,
      def: 80,
      elementColor: 'red',
      chargeGauge: 0,
      maxCharge: 100,
      // Stagger / Break Bar System
      staggerGauge: 100,
      maxStaggerGauge: 100,
      isBroken: false,
      breakTurns: 0,
      breakDamageMult: 1.75 // +75% damage bonus when broken
    };
  }

  startBattle(bossConfig = null) {
    if (bossConfig) {
      this.boss = {
        name: bossConfig.name || 'Demon Lord',
        maxHp: bossConfig.maxHp || 25000,
        hp: bossConfig.hp || bossConfig.maxHp || 25000,
        atk: bossConfig.atk || 350,
        def: bossConfig.def || 80,
        elementColor: bossConfig.elementColor || 'red',
        chargeGauge: 0,
        maxCharge: 100,
        staggerGauge: bossConfig.maxStaggerGauge || 100,
        maxStaggerGauge: bossConfig.maxStaggerGauge || 100,
        isBroken: false,
        breakTurns: 0,
        breakDamageMult: 1.75
      };
    }

    this.turnCount = 1;
    this.state = BATTLE_STATE.PLAYER_TURN;
    this.movesLeft = this.maxMovesPerTurn;
    this.parryBlockEngine.resetTurnState();

    if (this.eventBus) {
      this.eventBus.emit('battle:started', this.getBattleState());
    }

    return this.getBattleState();
  }

  /**
   * Deplete Boss Stagger / Break Bar
   */
  depleteBossStagger(amount, source = 'Normal Attack') {
    if (this.boss.isBroken) return;

    this.boss.staggerGauge = Math.max(0, this.boss.staggerGauge - amount);

    if (this.eventBus) {
      this.eventBus.emit('boss:stagger_reduced', {
        amount,
        current: this.boss.staggerGauge,
        max: this.boss.maxStaggerGauge,
        source
      });
    }

    // Trigger Break State when gauge hits 0!
    if (this.boss.staggerGauge === 0) {
      this.boss.isBroken = true;
      this.boss.breakTurns = 1; // Boss broken for 1 full turn

      if (this.eventBus) {
        this.eventBus.emit('boss:broken', {
          bossName: this.boss.name,
          damageMultiplier: this.boss.breakDamageMult
        });
      }
    }
  }

  consumeMove() {
    if (this.state !== BATTLE_STATE.PLAYER_TURN) return false;
    if (this.parryBlockEngine.isBlocking) {
      if (this.eventBus) {
        this.eventBus.emit('battle:action_blocked', 'Team is currently in BLOCK mode!');
      }
      return false;
    }

    this.movesLeft--;

    if (this.eventBus) {
      this.eventBus.emit('battle:move_consumed', { movesLeft: this.movesLeft });
    }

    if (this.movesLeft <= 0) {
      this.endPlayerTurn();
    }

    return true;
  }

  toggleBlockMode() {
    if (this.state !== BATTLE_STATE.PLAYER_TURN) return false;
    const res = this.parryBlockEngine.setBlockMode(!this.parryBlockEngine.isBlocking);

    if (res.success && this.parryBlockEngine.isBlocking) {
      this.movesLeft = 0;
      if (this.eventBus) {
        this.eventBus.emit('battle:moves_forfeited', 'Block activated: Forfeited puzzle moves for this turn.');
      }
      this.endPlayerTurn();
    }

    return res;
  }

  damageBoss(amount, isCrit = false) {
    if (amount <= 0) return 0;

    // Apply Break Bonus Damage if Boss is in BROKEN state (+75%)
    let finalDamage = amount;
    if (this.boss.isBroken) {
      finalDamage = Math.round(amount * this.boss.breakDamageMult);
    }

    this.boss.hp = Math.max(0, this.boss.hp - finalDamage);

    if (this.eventBus) {
      this.eventBus.emit('boss:damaged', {
        damage: finalDamage,
        isCrit,
        isBroken: this.boss.isBroken,
        currentHp: this.boss.hp,
        maxHp: this.boss.maxHp
      });
    }

    if (this.boss.hp <= 0) {
      this.state = BATTLE_STATE.VICTORY;
      if (this.eventBus) {
        this.eventBus.emit('battle:victory', { turnCount: this.turnCount });
      }
    }

    return this.boss.hp;
  }

  endPlayerTurn() {
    if (this.state === BATTLE_STATE.VICTORY || this.state === BATTLE_STATE.DEFEAT) return;

    this.state = BATTLE_STATE.ENEMY_TURN;
    if (this.eventBus) {
      this.eventBus.emit('battle:state_changed', { state: this.state });
    }

    // Process turn end DoT
    const dotResult = this.skillBuffEngine.tickTurnEnd();
    if (dotResult.dotDamage > 0) {
      this.damageBoss(dotResult.dotDamage, false);
    }

    if (this.boss.hp <= 0) return;

    // If Boss is BROKEN, skip attack phase and recover!
    if (this.boss.isBroken) {
      if (this.eventBus) {
        this.eventBus.emit('boss:break_skipped', 'Boss is BROKEN and cannot attack this turn!');
      }

      setTimeout(() => {
        this.boss.breakTurns--;
        if (this.boss.breakTurns <= 0) {
          this.boss.isBroken = false;
          this.boss.staggerGauge = this.boss.maxStaggerGauge; // Reset Stagger Bar
          if (this.eventBus) {
            this.eventBus.emit('boss:break_recovered', 'Boss recovered from BROKEN state!');
          }
        }

        // Start Next Player Turn
        this.turnCount++;
        this.movesLeft = this.maxMovesPerTurn;
        this.parryBlockEngine.resetTurnState();
        this.state = BATTLE_STATE.PLAYER_TURN;

        if (this.eventBus) {
          this.eventBus.emit('battle:turn_started', this.getBattleState());
        }
      }, 800);
      return;
    }

    // Execute Boss Action
    setTimeout(() => {
      this.executeBossAction();
    }, 600);
  }

  executeBossAction() {
    this.boss.chargeGauge += 35;
    const isHeavyAttack = this.boss.chargeGauge >= this.boss.maxCharge;

    if (isHeavyAttack) {
      this.boss.chargeGauge = 0;
      this.state = BATTLE_STATE.PARRY_PHASE;
      if (this.eventBus) {
        this.eventBus.emit('boss:telegraph_heavy', {
          skillName: 'Cataclysmic Annihilation',
          targetElement: this.boss.elementColor,
          windowDurationMs: 2000
        });
      }

      this.parryBlockEngine.startParryWindow(2000, this.boss.elementColor);

      setTimeout(() => {
        this.resolveBossAttack(true);
      }, 2100);
    } else {
      this.resolveBossAttack(false);
    }
  }

  resolveBossAttack(isHeavy = false) {
    if (this.state === BATTLE_STATE.VICTORY || this.state === BATTLE_STATE.DEFEAT) return;

    let baseBossDamage = isHeavy ? Math.round(this.boss.atk * 2.2) : Math.round(this.boss.atk * 1.0);
    let damageReduction = 0;
    let parryRating = null;

    if (isHeavy) {
      const parryRes = this.parryBlockEngine.attemptParry();
      parryRating = parryRes.rating;
      damageReduction = parryRes.damageReduction;

      if (parryRating === 'PERFECT') {
        const counterDamage = Math.round(this.boss.atk * parryRes.counterMultiplier * 4.0);
        this.damageBoss(counterDamage, true);

        // PERFECT PARRY / AUTO-PARRY REDUCES 50 STAGGER POINTS!
        this.depleteBossStagger(50, 'Perfect Parry / Counter');

        if (this.eventBus) {
          this.eventBus.emit('parry:perfect_counter', { counterDamage });
        }
      } else if (parryRating === 'GOOD') {
        // GOOD PARRY REDUCES 20 STAGGER POINTS!
        this.depleteBossStagger(20, 'Good Parry');
      }
    }

    if (this.parryBlockEngine.isBlocking) {
      damageReduction = Math.max(damageReduction, 0.65);
    }

    const finalDamage = Math.round(baseBossDamage * (1 - damageReduction));

    if (finalDamage > 0) {
      this.partyEngine.takeTeamDamage(finalDamage);
    }

    const aliveHeroes = this.partyEngine.heroes.filter(h => h.baseStats.hp > 0);
    if (aliveHeroes.length === 0) {
      this.state = BATTLE_STATE.DEFEAT;
      if (this.eventBus) {
        this.eventBus.emit('battle:defeat', { turnCount: this.turnCount });
      }
      return;
    }

    this.turnCount++;
    this.movesLeft = this.maxMovesPerTurn;
    this.parryBlockEngine.resetTurnState();
    this.state = BATTLE_STATE.PLAYER_TURN;

    if (this.eventBus) {
      this.eventBus.emit('battle:turn_started', this.getBattleState());
    }
  }

  getBattleState() {
    return {
      state: this.state,
      turnCount: this.turnCount,
      movesLeft: this.movesLeft,
      maxMovesPerTurn: this.maxMovesPerTurn,
      isBlocking: this.parryBlockEngine.isBlocking,
      boss: { ...this.boss },
      party: this.partyEngine.getPartyState()
    };
  }
}
