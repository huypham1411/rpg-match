import { GameCore } from '../core/GameCore.js';
import { EQUIP_SLOTS } from '../core/PartyEngine.js';

document.addEventListener('DOMContentLoaded', () => {
  const game = new GameCore();
  window.gameCore = game;

  let selectedTile = null;
  let parryAnimationId = null;

  // DOM Elements
  const gridBoard = document.getElementById('gridBoard');
  const bossHpFill = document.getElementById('bossHpFill');
  const bossHpText = document.getElementById('bossHpText');
  const bossStaggerFill = document.getElementById('bossStaggerFill');
  const bossStaggerText = document.getElementById('bossStaggerText');
  const bossChargeFill = document.getElementById('bossChargeFill');
  const bossChargeText = document.getElementById('bossChargeText');
  const bossBrokenBadge = document.getElementById('bossBrokenBadge');
  const movesText = document.getElementById('movesText');
  const turnText = document.getElementById('turnText');
  const partyList = document.getElementById('partyList');
  const combatLog = document.getElementById('combatLog');
  const btnBlock = document.getElementById('btnBlock');
  const btnExport = document.getElementById('btnExport');
  const parryBox = document.getElementById('parryBox');
  const parryPointer = document.getElementById('parryPointer');
  const autoParryBadge = document.getElementById('autoParryBadge');

  const ELEMENT_ICONS = {
    red: '⚔️',
    blue: '🛡️',
    green: '🌿',
    yellow: '⚡',
    purple: '🗡️'
  };

  function addLog(msg, className = '') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${className}`;
    entry.innerHTML = `[${new Date().toLocaleTimeString().split(' ')[0]}] ${msg}`;
    combatLog.appendChild(entry);
    combatLog.scrollTop = combatLog.scrollHeight;
  }

  // Event Subscriptions
  game.eventBus.on('battle:started', (state) => {
    addLog(`⚔️ Battle Started against ${state.boss.name}!`, 'log-crit');
    renderAll();
  });

  game.eventBus.on('grid:swapped', () => renderGrid());
  game.eventBus.on('grid:cascaded', () => renderGrid());

  game.eventBus.on('boss:damaged', (data) => {
    const critText = data.isCrit ? '🔥 CRITICAL HIT! ' : '';
    const breakText = data.isBroken ? '⚡ [BROKEN BONUS +75%] ' : '';
    addLog(`${critText}${breakText}Boss took ${data.damage} damage!`, data.isBroken || data.isCrit ? 'log-crit' : '');
    renderBossInfo();
  });

  game.eventBus.on('boss:stagger_reduced', (data) => {
    addLog(`💥 Boss Stagger -${data.amount} (${data.source}) -> ${data.current}/${data.max}`, 'log-parry');
    renderBossInfo();
  });

  game.eventBus.on('boss:broken', (data) => {
    addLog(`⚡ BOSS BROKEN! Boss is STAGGERED and takes +75% BONUS DAMAGE for 1 turn!`, 'log-crit');
    renderBossInfo();
  });

  game.eventBus.on('boss:break_recovered', () => {
    addLog(`🛡️ Boss recovered from BROKEN state! Stagger Bar reset.`, '');
    renderBossInfo();
  });

  game.eventBus.on('boss:break_skipped', () => {
    addLog(`⚡ Boss is BROKEN and cannot attack this turn!`, 'log-parry');
  });

  game.eventBus.on('party:energy_charged', () => renderParty());

  game.eventBus.on('hero:ultimate_used', (ult) => {
    addLog(`✨ ${ult.heroName} UNLEASHED GBF ULTIMATE: ${ult.skillName}!`, 'log-crit');
    renderAll();
  });

  game.eventBus.on('party:damage_taken', (data) => {
    addLog(`💥 Party took ${data.actualDamage} damage from Boss! (+10% GBF Charge Bar)`, 'log-crit');
    renderParty();
  });

  game.eventBus.on('block:state_changed', (data) => {
    if (data.isBlocking) {
      addLog(`🛡️ BLOCK MODE ACTIVATED! Moves locked for turn. Incoming damage -65%.`, 'log-parry');
    }
    renderControls();
  });

  game.eventBus.on('parry:auto_stance_activated', (data) => {
    addLog(`🛡️ AUTO-PARRY STANCE ACTIVATED by ${data.heroName}! Next attack will auto-counter!`, 'log-parry');
    renderAutoParryBadge();
  });

  game.eventBus.on('boss:telegraph_heavy', (data) => {
    addLog(`⚠️ WARNING: Boss preparing [${data.skillName}]! PARRY WINDOW OPEN!`, 'log-crit');
    startParryMeterAnimation(data.windowDurationMs);
  });

  game.eventBus.on('parry:evaluated', (res) => {
    if (res.rating === 'PERFECT') {
      const autoText = res.isAutoParry ? '(AUTO-PARRY TRIGGERED) ' : '';
      addLog(`🌟 ${autoText}PERFECT PARRY! 100% Damage Negated & Heavy Counter (-50 Boss Stagger)!`, 'log-parry');
    } else if (res.rating === 'GOOD') {
      addLog(`⚡ GOOD PARRY! 60% Damage Reduced (-20 Boss Stagger)!`, 'log-parry');
    } else {
      addLog(`❌ PARRY MISSED! Took full attack.`, 'log-crit');
    }
    stopParryMeterAnimation();
    renderAutoParryBadge();
  });

  game.eventBus.on('battle:turn_started', () => {
    addLog(`🔄 Player Turn Started!`, '');
    renderAll();
  });

  game.eventBus.on('battle:victory', () => {
    addLog(`🎉 VICTORY! Boss defeated!`, 'log-parry');
    alert('🎉 VICTORY! Boss defeated!');
  });

  game.eventBus.on('battle:defeat', () => {
    addLog(`☠️ DEFEAT! All party members have fallen.`, 'log-crit');
    alert('☠️ DEFEAT! All party members have fallen.');
  });

  function renderAll() {
    renderBossInfo();
    renderBoardHeader();
    renderGrid();
    renderParty();
    renderControls();
    renderAutoParryBadge();
  }

  function renderBossInfo() {
    const boss = game.battleEngine.boss;
    const hpPct = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));
    bossHpFill.style.width = `${hpPct}%`;
    bossHpText.textContent = `${boss.hp} / ${boss.maxHp} (${Math.round(hpPct)}%)`;

    const staggerPct = Math.max(0, Math.min(100, (boss.staggerGauge / boss.maxStaggerGauge) * 100));
    bossStaggerFill.style.width = `${staggerPct}%`;
    bossStaggerText.textContent = `Stagger Bar: ${boss.staggerGauge} / ${boss.maxStaggerGauge} (${Math.round(staggerPct)}%)`;

    const chargePct = Math.max(0, Math.min(100, (boss.chargeGauge / boss.maxCharge) * 100));
    bossChargeFill.style.width = `${chargePct}%`;
    bossChargeText.textContent = `Attack Charge: ${chargePct}%`;

    bossBrokenBadge.style.display = boss.isBroken ? 'inline-block' : 'none';
  }

  function renderBoardHeader() {
    movesText.textContent = game.battleEngine.movesLeft;
    turnText.textContent = game.battleEngine.turnCount;
  }

  function renderGrid() {
    gridBoard.innerHTML = '';
    const grid = game.gridEngine.getGridState();

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const tile = grid[r][c];
        const div = document.createElement('div');
        div.className = `tile tile-${tile.color}`;
        div.dataset.row = r;
        div.dataset.col = c;
        div.textContent = ELEMENT_ICONS[tile.color] || '💎';

        if (selectedTile && selectedTile.row === r && selectedTile.col === c) {
          div.classList.add('selected');
        }

        div.addEventListener('click', () => handleTileClick(r, c));
        gridBoard.appendChild(div);
      }
    }
  }

  function handleTileClick(r, c) {
    if (game.battleEngine.state !== 'PLAYER_TURN') return;

    if (!selectedTile) {
      selectedTile = { row: r, col: c };
      renderGrid();
    } else {
      const r1 = selectedTile.row;
      const c1 = selectedTile.col;
      selectedTile = null;

      if (r1 === r && c1 === c) {
        renderGrid();
        return;
      }

      const res = game.swapTiles(r1, c1, r, c);
      if (!res.success) {
        addLog(`❌ Move invalid: ${res.reason}`, '');
      }
      renderAll();
    }
  }

  function renderParty() {
    partyList.innerHTML = '';
    const party = game.partyEngine.getPartyState();

    party.forEach(hero => {
      const card = document.createElement('div');
      card.className = 'hero-card';

      const hpPct = Math.max(0, Math.min(100, (hero.baseStats.hp / hero.effectiveStats.maxHp) * 100));
      const energyPct = Math.max(0, Math.min(100, (hero.energy / hero.maxEnergy) * 100));
      const ultReady = hero.energy >= hero.maxEnergy;

      const setBadges = hero.activeSetBonuses.map(b => `<span class="badge-set">${b.set} (${b.pieces}-pc)</span>`).join(' ');

      card.innerHTML = `
        <div class="hero-header">
          <div class="hero-name">${hero.icon} ${hero.name} <span class="badge-class">${hero.classType}</span></div>
          <button class="ult-btn ${ultReady ? 'ready' : ''}" data-id="${hero.id}" ${!ultReady ? 'disabled' : ''}>
            GBF BURST (${hero.energy}/100%)
          </button>
        </div>
        <div class="bar-container">
          <div class="bar-fill hp-fill" style="width: ${hpPct}%"></div>
          <div class="bar-text">HP: ${hero.baseStats.hp} / ${hero.effectiveStats.maxHp}</div>
        </div>
        <div class="bar-container">
          <div class="bar-fill energy-fill" style="width: ${energyPct}%"></div>
          <div class="bar-text">GBF Charge Bar: ${hero.energy}%</div>
        </div>
        ${setBadges ? `<div style="font-size: 0.7rem; color: var(--accent-gold); margin-bottom: 0.2rem;">${setBadges}</div>` : ''}
        <div class="equip-row">
          ${renderEquipSlot(hero, EQUIP_SLOTS.WEAPON, '⚔️')}
          ${renderEquipSlot(hero, EQUIP_SLOTS.ARMOR, '🛡️')}
          ${renderEquipSlot(hero, EQUIP_SLOTS.ACCESSORY, '💍')}
          ${renderEquipSlot(hero, EQUIP_SLOTS.ARTIFACT, '🔮')}
          ${renderEquipSlot(hero, EQUIP_SLOTS.RUNE, '📜')}
        </div>
      `;

      const ultBtn = card.querySelector('.ult-btn');
      ultBtn.addEventListener('click', () => {
        const ultRes = game.useUltimate(hero.id);
        if (!ultRes.success) {
          addLog(`❌ Cannot use Ult: ${ultRes.reason}`);
        }
        renderAll();
      });

      partyList.appendChild(card);
    });
  }

  function renderEquipSlot(hero, slot, icon) {
    const item = hero.equipment[slot];
    const filledClass = item ? 'filled' : '';
    const nameStr = item ? `${item.name} (${item.set || 'No Set'})` : `Empty ${slot}`;
    return `<div class="equip-slot ${filledClass}" title="${nameStr}">${item ? icon : '➕'}</div>`;
  }

  function renderControls() {
    const isBlocking = game.parryBlockEngine.isBlocking;
    btnBlock.classList.toggle('active', isBlocking);
    btnBlock.textContent = isBlocking ? '🛡️ BLOCKING ACTIVE (Moves Forfeited)' : '🛡️ ACTIVATE BLOCK MODE';
  }

  function renderAutoParryBadge() {
    const hasStance = game.parryBlockEngine.hasAutoParryStance;
    if (autoParryBadge) {
      autoParryBadge.style.display = hasStance ? 'inline-block' : 'none';
    }
  }

  function startParryMeterAnimation(durationMs) {
    parryBox.classList.add('active');
    const startTime = Date.now();

    if (parryAnimationId) cancelAnimationFrame(parryAnimationId);

    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1.0, elapsed / durationMs);
      parryPointer.style.left = `${progress * 100}%`;

      if (progress < 1.0) {
        parryAnimationId = requestAnimationFrame(animate);
      } else {
        stopParryMeterAnimation();
      }
    }

    parryAnimationId = requestAnimationFrame(animate);
  }

  function stopParryMeterAnimation() {
    parryBox.classList.remove('active');
    if (parryAnimationId) cancelAnimationFrame(parryAnimationId);
    parryPointer.style.left = '0%';
  }

  btnBlock.addEventListener('click', () => {
    const res = game.toggleBlock();
    if (!res.success) {
      addLog(`❌ Block error: ${res.reason}`);
    }
    renderAll();
  });

  btnExport.addEventListener('click', () => {
    const jsonState = JSON.stringify(game.getFullState(), null, 2);
    console.log('[GameCore JSON Snapshot]:', jsonState);
    alert('JSON Engine State snapshot exported to Console! Size: ' + jsonState.length + ' bytes');
  });

  game.init();
});
