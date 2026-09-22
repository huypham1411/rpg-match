/**
 * ParryBlockEngine - Handles Auto-Parry Stance, Real-Time Parry Windows & Turn Block Mode.
 */

export const PARRY_RATING = {
  PERFECT: 'PERFECT',
  GOOD: 'GOOD',
  MISS: 'MISS'
};

export class ParryBlockEngine {
  constructor(eventBus, partyEngine) {
    this.eventBus = eventBus;
    this.partyEngine = partyEngine;

    this.isBlocking = false;
    this.hasAutoParryStance = false;
    this.autoParrySource = null;

    this.parryWindowActive = false;
    this.parryStartTime = 0;
    this.parryDurationMs = 1500;
    this.parryTargetElement = null;
  }

  setBlockMode(active) {
    if (active) {
      if (!this.partyEngine.hasGuardHero()) {
        return {
          success: false,
          reason: 'Cannot Block: Party has no living Guard/Counter hero!'
        };
      }
      this.isBlocking = true;
    } else {
      this.isBlocking = false;
    }

    if (this.eventBus) {
      this.eventBus.emit('block:state_changed', { isBlocking: this.isBlocking });
    }

    return {
      success: true,
      isBlocking: this.isBlocking,
      movePenalty: this.isBlocking ? 'All puzzle moves forfeited for this turn' : null
    };
  }

  /**
   * Activate Auto-Parry Stance (Triggered by Match-5 or Counter Specialist skills)
   */
  triggerAutoParry(heroName = 'Counter Specialist') {
    this.hasAutoParryStance = true;
    this.autoParrySource = heroName;

    if (this.eventBus) {
      this.eventBus.emit('parry:auto_stance_activated', { heroName });
    }
  }

  startParryWindow(durationMs = 1500, targetElement = null) {
    this.parryWindowActive = true;
    this.parryStartTime = Date.now();
    this.parryDurationMs = durationMs;
    this.parryTargetElement = targetElement;

    if (this.eventBus) {
      this.eventBus.emit('parry:window_started', {
        durationMs,
        targetElement,
        startTime: this.parryStartTime
      });
    }

    setTimeout(() => {
      if (this.parryWindowActive) {
        this.closeParryWindow(false);
      }
    }, durationMs);
  }

  attemptParry(matchColor = null) {
    // 1. Check Auto-Parry Stance
    if (this.hasAutoParryStance) {
      this.hasAutoParryStance = false; // Consumed
      const result = {
        rating: PARRY_RATING.PERFECT,
        progress: 100,
        damageReduction: 1.0,
        counterMultiplier: 3.0,
        isAutoParry: true,
        source: this.autoParrySource
      };

      if (this.eventBus) {
        this.eventBus.emit('parry:evaluated', result);
      }
      return result;
    }

    // 2. Check Timing Window
    if (!this.parryWindowActive) {
      return { rating: PARRY_RATING.MISS, damageReduction: 0, counterMultiplier: 0 };
    }

    const elapsed = Date.now() - this.parryStartTime;
    const progress = elapsed / this.parryDurationMs;

    let rating = PARRY_RATING.MISS;
    let damageReduction = 0;
    let counterMultiplier = 0;

    if (progress >= 0.20 && progress <= 0.75) {
      if (!this.parryTargetElement || matchColor === this.parryTargetElement) {
        rating = PARRY_RATING.PERFECT;
        damageReduction = 1.0;
        counterMultiplier = 2.5;
      } else {
        rating = PARRY_RATING.GOOD;
        damageReduction = 0.6;
        counterMultiplier = 1.2;
      }
    } else if (progress > 0 && progress <= 0.95) {
      rating = PARRY_RATING.GOOD;
      damageReduction = 0.5;
      counterMultiplier = 1.0;
    }

    this.closeParryWindow(true);

    const result = {
      rating,
      progress: Math.round(progress * 100),
      damageReduction,
      counterMultiplier,
      matchColor
    };

    if (this.eventBus) {
      this.eventBus.emit('parry:evaluated', result);
    }

    return result;
  }

  closeParryWindow(wasTriggered = false) {
    this.parryWindowActive = false;
    if (this.eventBus) {
      this.eventBus.emit('parry:window_closed', { wasTriggered });
    }
  }

  resetTurnState() {
    this.isBlocking = false;
    this.parryWindowActive = false;
    // Auto-parry stance persists until consumed by boss attack
  }
}
