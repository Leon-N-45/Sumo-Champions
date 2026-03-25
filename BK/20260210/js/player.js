/**
 * Player Class
 * 力士のデータ、ステータス、状態管理を行うクラス
 */
class Player {
  constructor(id, x, keys) {
    this.id = id; 
    this.initialX = x; 
    this.controls = keys; 
    this.x = x; 
    this.baseStats = {}; 

    // --- 1. ステータスとスタミナ管理 ---
    this.stamina = CONFIG.STAMINA.INIT || 100; 
    this.maxStamina = this.stamina;          // 現在の回復上限（かち合いで減る）
    this.initialMaxStamina = this.stamina;     // 試合開始時の最大値（リセット用）
    this.recoveryDelay = 0;                 // 回復が始まるまでの待ち時間
    
    // --- 2. アクション状態 ---
    this.charge = 0;
    this.chargeLock = 0;   // スタミナ切れ時のチャージ禁止タイマー
    this.stun = 0;         // スタン（硬直）時間
    this.lastParry = 0;    // パリィ成功フラグ等
    this.miss = 0;         // 空振りペナルティ

    // --- 3. 物理・移動 ---
    this.rebound = 0;      // はじき飛ばされる速度
    this.cooldown = 0;     // 再衝突・操作不能時間
    this.wantsFwd = false; // 前進しようとしている意志（いなし判定に使用）

    // --- 4. フラグ管理 ---
    this.isDefeated = false;
    this.isThrown = false;
    this.isPushing = false;
    this.isCharging = false;
    this.isCPU = false;    // CPUかどうか
    this.cpuLevel = 3;     // CPUの強さ

    // --- 5. いなし・特殊行動 ---
    this.inashiTimer = 0;    // いなし受付時間
    this.inashiStumble = 0;  // いなされた時のよろけ時間
    this.stumbleDir = 0;     // よろける方向

    // --- 6. 表示 ---
    this.el = document.getElementById(`player${this.id}`);

    // DOM要素の生成
    this.el = document.createElement('div');
    this.el.className = 'rikishi';
    this.el.id = id;
    
    this.elBody = document.createElement('div');
    this.elBody.className = 'rikishi-body';
    
    this.imgBody = document.createElement('img');
    this.imgBody.src = `assets/img/rikishi${id}.png`; 
    this.imgBody.className = 'body-img';
    
    this.elHead = document.createElement('div');
    this.elHead.className = 'head';

    this.elBody.appendChild(this.imgBody);
    this.elBody.appendChild(this.elHead);
    this.el.appendChild(this.elBody);
    
    const stage = document.getElementById('stage');
    if(stage) stage.appendChild(this.el);

    // DOM要素の紐付け
    this.initDOM();
  }

  // UI要素を探してキャッシュする
  initDOM() {
      const id = this.id;
      const getEl = (ids) => {
          for (const i of ids) {
              const el = document.getElementById(i);
              if (el) return el;
          }
          return null;
      };

      this.dom = {
          bar: getEl([`${id}-hp-bar`, `${id}-bar`, `${id}_hp`]),
          charge: getEl([`${id}-charge-bar`, `${id}-charge`]),
          chargeOuter: getEl([`${id}-charge-container`, `${id}-charge-outer`]),
          max: getEl([`${id}-hp-max`, `${id}-max-bar`]), // 古い要素（非表示用）
          stunMark: getEl([`${id}-stun-mark`])
      };
  }

  get name() {
      return this.baseStats.name || "Unknown";
  }

  setData(data) {
      this.baseStats = data;
      if(this.elHead) {
          this.elHead.style.backgroundImage = `url('${data.img}')`;
      }
      this.updateSize();
  }

  updateSize() {
      const scale = this.getPhysiqueScale();
      let scaleY = 1.0;
      if (scale <= 0.75) scaleY = 0.8;
      else if (scale <= 0.88) scaleY = 0.85;
      else if (scale <= 1.0) scaleY = 0.9;
      else if (scale <= 1.2) scaleY = 0.95;
      else scaleY = 1.0;

      this.imgBody.style.transform = `scale(${scale}, ${scaleY})`;
      this.imgBody.style.transformOrigin = "bottom center";

      const baseHeight = 160; 
      const baseTop = -45;
      const gap = baseHeight * (1 - scaleY);
      this.elHead.style.top = (baseTop + gap) + 'px';
  }

  getStats(opponent) {
      let pwr = this.baseStats.power || 5;
      let tech = this.baseStats.tech || 5;
      let spd = this.baseStats.speed || 5;
      
      const hpRate = this.stamina / this.initialMaxStamina;

      // 1. 根性 (Spirit) の修正
      // HPが30%未満の時
      if (hpRate < 0.3) {
           const spirit = this.baseStats.spirit || 5;
           
           // ★修正ポイント: (spirit - 5) にすることで、5未満ならマイナスになる
           const spiritDiff = spirit - 5; 
           
           // 係数をかける (HPが減るほど効果大)
           // (1.0 - hpRate) だと最大0.3以下の係数になるので、少し弱いかも？
           // わかりやすく「固定値 + 割合」でも良いですが、今のままでも機能はします
           const buff = (1.0 - hpRate) * spiritDiff * CONFIG.STATUS.SPIRIT_BUFF_RATE;
           
           pwr += buff;
      }
      
      // 2. 逆転 (Reversal) の修正
      const edgeWidth = (CONFIG.GAME_RULES && CONFIG.GAME_RULES.EDGE_ZONE_WIDTH) ? CONFIG.GAME_RULES.EDGE_ZONE_WIDTH : 150;
      const stageW = (CONFIG.SYSTEM && CONFIG.SYSTEM.STAGE_WIDTH) ? CONFIG.SYSTEM.STAGE_WIDTH : 1200;
      const isPinch = (this.x < edgeWidth || this.x > (stageW - edgeWidth));
      
      if (isPinch) {
          this.reversalActive = true;
          const rev = this.baseStats.reversal || 5;
          
          // ★修正ポイント: ここも (rev - 5) にする
          const revDiff = rev - 5;
          const buff = revDiff * CONFIG.STATUS.REV_BUFF_RATE;
          
          pwr += buff; 
          tech += buff;
      } else {
          this.reversalActive = false;
      }

      // 下限ガード（念のため、ステータスが1未満にならないように）
      pwr = Math.max(1, pwr);
      tech = Math.max(1, tech);
      spd = Math.max(1, spd);

      return { power: pwr, tech: tech, speed: spd };
  }

  getPhysiqueScale() {
      const phys = this.baseStats.physique || 3;
      const key = `SCALE_${phys}`;
      if (CONFIG.PHYSICS && CONFIG.PHYSICS[key]) {
          return CONFIG.PHYSICS[key];
      }
      return 1.0;
  }

  resetState(){ 
      this.x = this.initialX; 
      
      // スタミナ計算: 基準100 + (ステータス差分 * 係数)
      const baseS = this.baseStats.stamina || 5;
      const bonus = (baseS - 5) * CONFIG.STATUS.HP_PER_STAMINA;
      this.maxStamina = CONFIG.STAMINA.INIT + bonus;
      
      this.initialMaxStamina = this.maxStamina;
      this.stamina = this.maxStamina;
      
      this.charge = 0;
      this.isDefeated = false; 
      this.isThrown = false;
      this.isPushing = false;
      this.isCharging = false;
      this.rebound = 0; 
      this.cooldown = 0;
      this.miss = 0;
      this.stun = 0;
      this.chargeLock = 0;
      this.el.classList.remove('stunned');
      this.elBody.style.transform = 'rotate(0deg)';
      
      this.updateSize();
  }
}