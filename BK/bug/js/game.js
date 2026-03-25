/**
 * GameManager Class
 * ゲーム進行、物理演算、入力管理を担当
 */
class GameManager {
  constructor() {
    this.state = { 
        active: false, 
        matches: 2, 
        current: 1, 
        wins: {p1:0, p2:0}, 
        chars: {p1:null, p2:null}, 
        deuce: true, 
        inDecider: false, 
        deciderRound: 0, 
        tachiai: false, 
        processingEnd: false, 
        paused: false,
        isTransitioning: false 
    };
    this.grapple = { active: false, master: null, slave: null };
    this.lastHit = null; 
    this.deciderVoicePlayed = false; 
    
    // 重複対策
    document.querySelectorAll('.rikishi').forEach(el => el.remove());

    if (typeof Player === 'undefined' || typeof AIController === 'undefined' || typeof UIManager === 'undefined') {
        alert("エラー: 必要なファイル(player.js, ai.js, ui.js)が読み込まれていません。");
        return;
    }

    this.ui = new UIManager(this);
    const controls = settings.current.controls;
    
    // SYSTEM_START_POS を適用
    const centerX = (CONFIG.SYSTEM && CONFIG.SYSTEM.CENTER_X) ? CONFIG.SYSTEM.CENTER_X : 600;
    const offset = (CONFIG.SYSTEM && CONFIG.SYSTEM.START_OFFSET) ? CONFIG.SYSTEM.START_OFFSET : 250;

    const startP1 = centerX - offset;
    const startP2 = centerX + (offset - 130);

    this.p1 = new Player('p1', startP1, settings.current.controls.p1);
    this.p2 = new Player('p2', startP2, settings.current.controls.p2);
    
    this.aiP1 = new AIController();
    this.aiP2 = new AIController();
    this.keys = new Set();
    this.autoAdvanceTimer = null;
    this.finalAdvanceTimer = null;
    
    this.setupInputListeners();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  setupInputListeners() {
    window.addEventListener('keydown', e=>{ 
        if (settings.handleKeyDown(e)) return;
        if (e.code === 'Escape') { this.togglePauseMenu(); }
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
        this.keys.add(e.code); 
        if(this.state.active && !this.state.paused && !e.repeat){ 
            if(this.grapple.active) { this.handleGrappleInput(e.code); } 
            else { 
                if(e.code===this.p1.controls.u) this.handleInashi(this.p1, this.p2); 
                if(e.code===this.p2.controls.u) this.handleInashi(this.p2, this.p1); 
            } 
        } 
    });
    window.addEventListener('keyup', e=>this.keys.delete(e.code));
    window.addEventListener('blur', () => { 
        this.keys.clear(); 
        this.p1.isCharging = false; this.p2.isCharging = false; 
        SoundFX.updateCharge('p1', false, 0); SoundFX.updateCharge('p2', false, 0); 
        SoundFX.updateInashi('p1', false); SoundFX.updateInashi('p2', false); 
    });
    window.addEventListener('resize', ()=>this.ui.resize());
  }

  togglePauseMenu() {
      const wrapper = document.getElementById('game-wrapper');
      if (!wrapper || wrapper.style.display === 'none') return;
      const resOverlay = document.getElementById('result-overlay');
      if (resOverlay && resOverlay.classList.contains('final-mode')) return;
      const menu = document.getElementById('pause-menu');
      this.state.paused = !this.state.paused;
      if(this.state.paused) {
          menu.classList.add('active');
          SoundFX.updateCharge('p1', false, 0); SoundFX.updateCharge('p2', false, 0); 
          SoundFX.updateInashi('p1', false); SoundFX.updateInashi('p2', false);
      } else {
          menu.classList.remove('active');
      }
  }

  async waitForPause() {
      if (!this.state.paused) return;
      while (this.state.paused) await new Promise(r => setTimeout(r, 100));
  }

  goToCharSelect(m){ 
      if(this.state.isTransitioning) return;
      this.state.isTransitioning = true;
      const sounds = ['dosukoi', 'gottyan', 'maninonrei'];
      const selected = sounds[Math.floor(Math.random() * sounds.length)];
      const audio = new Audio(`assets/se/${selected}.mp3`);
      if (typeof SoundFX !== 'undefined') audio.volume = SoundFX.masterVolume;
      audio.play().catch(()=>{});
      const curtain = document.getElementById('transition-curtain');
      if(curtain) {
          curtain.classList.add('active');
          setTimeout(() => { this.ui.showCharSelect(m); }, 1500 * 0.45); 
          setTimeout(() => { curtain.classList.remove('active'); this.state.isTransitioning = false; }, 1500);
      } else {
          this.ui.showCharSelect(m); 
          this.state.isTransitioning = false;
      }
  }

   selectChar(playerId, charId) {
      this.state.chars[playerId] = charId;
      document.querySelectorAll('.char-select-icon').forEach(icon => {
          const id = parseInt(icon.dataset.id); 
          if (playerId === 'p1') icon.classList.remove('p1-active'); 
          if (playerId === 'p2') icon.classList.remove('p2-active');
      });
      document.querySelectorAll('.char-select-icon').forEach(icon => {
          const id = parseInt(icon.dataset.id); 
          if (this.state.chars.p1 === id) icon.classList.add('p1-active'); 
          if (this.state.chars.p2 === id) icon.classList.add('p2-active');
      });
      if (charId !== null) { const data = RIKISHI_DATA.find(d => d.id === charId); if (data && data.voice) SoundFX.playVoice(data.voice); }
      this.ui.updatePreview(playerId, charId);
      const p1Ready = this.state.chars.p1 !== null; const p2Ready = this.state.chars.p2 !== null;
      const btnContainer = document.getElementById('start-btn-container');
      if (p1Ready && p2Ready) btnContainer.style.display = 'flex'; else btnContainer.style.display = 'none';
  }

  toggleP1CPU(isCPU) {
      const container = document.getElementById('preview-p1');
      if (isCPU) container.classList.add('cpu-active'); else container.classList.remove('cpu-active');
      this.ui.updatePreview('p1', this.state.chars.p1);
  }
  toggleP2CPU(isCPU) {
      const container = document.getElementById('preview-p2');
      if (isCPU) container.classList.add('cpu-active'); else container.classList.remove('cpu-active');
      this.ui.updatePreview('p2', this.state.chars.p2);
  }

  kyujo() { 
      if(this.autoAdvanceTimer) clearInterval(this.autoAdvanceTimer);
      if(this.finalAdvanceTimer) clearInterval(this.finalAdvanceTimer);
      const audio = new Audio('assets/se/denaoshitekoi.mp3'); 
      if (typeof SoundFX !== 'undefined') audio.volume = SoundFX.masterVolume;
      audio.play().then(() => { audio.onended = () => { location.reload(); }; }).catch(() => { location.reload(); }); 
  }

  rematch(){ 
      if(this.finalAdvanceTimer) clearInterval(this.finalAdvanceTimer);
      if(this.autoAdvanceTimer) clearInterval(this.autoAdvanceTimer);
      this.startGame(); 
  }

  startGame(){
    if (this.state.chars.p1 === null || this.state.chars.p2 === null) return;
    this.p1.controls = settings.current.controls.p1;
    this.p2.controls = settings.current.controls.p2;
    this.ui.updateControlsDisplay();
    this.state.matches = parseInt(document.getElementById('match-count-select').value);
    this.state.deuce = document.getElementById('deuce-check').checked;
    const p1IsCPU = document.getElementById('cpu-toggle-p1')?.checked || false;
    const p2IsCPU = document.getElementById('cpu-toggle-p2')?.checked || false;
    const p1Level = parseInt(document.getElementById('cpu-level-p1')?.value || 3);
    const p2Level = parseInt(document.getElementById('cpu-level-p2')?.value || 3);
    const p1Data = RIKISHI_DATA.find(d=>d.id===this.state.chars.p1);
    const p2Data = RIKISHI_DATA.find(d=>d.id===this.state.chars.p2);
    // 画像パスの補正
    const getImg = (img) => this.ui.getImagePath(img);
    const p1DataFixed = { ...p1Data, img: getImg(p1Data.img) };
    const p2DataFixed = { ...p2Data, img: getImg(p2Data.img) };

    this.p1.setData(p1DataFixed);
    this.p2.setData(p2DataFixed);
    this.p1.isCPU = p1IsCPU;
    this.p2.isCPU = p2IsCPU;
    this.p1.cpuLevel = p1Level;
    this.p2.cpuLevel = p2Level;
    this.state.current=1; this.state.wins={p1:0,p2:0}; this.state.inDecider = false;
    this.state.deciderRound = 0;
    this.state.paused = false;
    this.deciderVoicePlayed = false;
    document.getElementById('p1-cpu-badge').style.display = p1IsCPU ? 'inline-block' : 'none';
    document.getElementById('p2-cpu-badge').style.display = p2IsCPU ? 'inline-block' : 'none';
    document.getElementById('p1-controls').style.opacity = p1IsCPU ? '0.3' : '1';
    document.getElementById('p2-controls').style.opacity = p2IsCPU ? '0.3' : '1';
    if(p1IsCPU) { document.querySelector('#p1 .body-img').src = 'assets/img/rikishiCPU.png'; } else { document.querySelector('#p1 .body-img').src = 'assets/img/rikiship1.png'; }
    if(p2IsCPU) { document.querySelector('#p2 .body-img').src = 'assets/img/rikishiCPU.png'; } else { document.querySelector('#p2 .body-img').src = 'assets/img/rikiship2.png'; }
    this.ui.showGameScreen();
    SoundFX.init();
    this.startMatch(true); 
  }

  // game.js : startMatch

  async startMatch(skipFadeIn = false){
    if(this.autoAdvanceTimer) { clearInterval(this.autoAdvanceTimer); this.autoAdvanceTimer = null; }
    
    // エフェクト削除
    const stage = document.getElementById('stage');
    if(stage) stage.classList.remove('danger-left', 'danger-right');
    
    [this.p1, this.p2].forEach(p => {
        if(p.el) p.el.classList.remove('aura-yellow', 'aura-blue', 'stunned', 'is-defeated', 'fall-left', 'fall-right');
        const body = p.el.querySelector('.rikishi-body');
        if(body) { body.style.filter = ''; body.style.transform = ''; }
    });

    this.ui.resetVisuals(this.p1, this.p2);
    this.p1.resetState(); this.p2.resetState(); 

    // ★修正: 立ち位置リセット
    const centerX = (CONFIG.SYSTEM && CONFIG.SYSTEM.CENTER_X) ? CONFIG.SYSTEM.CENTER_X : 600;
    const offset = (CONFIG.SYSTEM && CONFIG.SYSTEM.START_OFFSET) ? CONFIG.SYSTEM.START_OFFSET : 250;
    this.p1.x = centerX - offset;
    this.p2.x = centerX + (offset - 130);
    
    // ★追加: 前の試合の「ピンチ判定フラグ」を強制リセット
    // これをやらないと、ui.js が「まだピンチだ」と勘違いしてオーラを描画してしまいます
    this.p1.reversalActive = false;
    this.p2.reversalActive = false;

    this.p1.inashiStumble = 0; this.p1.stumbleDir = 0;
    this.p2.inashiStumble = 0; this.p2.stumbleDir = 0;
    this.p1.inashiTimer = 0; this.p2.inashiTimer = 0;
    SoundFX.updateInashi('p1', false); SoundFX.updateInashi('p2', false);
    
    this.grapple = { active: false, master: null, slave: null };
    this.state.processingEnd = false;
    this.lastHit = null; 
    this.keys.clear(); 
    
    this.aiP1.reset(); this.aiP2.reset();
    this.aiP1.aiKeys.clear(); this.aiP2.aiKeys.clear();

    // (以下、変更なし)
    this.ui.els.grappleInd.style.display = 'none';
    this.ui.els.p1Wins.textContent=this.state.wins.p1+'勝'; 
    this.ui.els.p2Wins.textContent=this.state.wins.p2+'勝';
    
    const resOverlay = document.getElementById('result-overlay'); 
    resOverlay.classList.remove('final-mode', 'visible');
    document.getElementById('match-info').innerHTML = ''; 
    document.getElementById('kimarite-display').textContent = ''; 
    document.getElementById('win-message').textContent = '';
    
    const nextBtn = document.getElementById('next-btn'); 
    nextBtn.style.display = 'inline-block'; nextBtn.disabled = false;

    this.ui.els.call.style.display='block'; this.ui.els.call.textContent = ''; 
    this.ui.setGyojiImage('hakkeyoi');
    this.ui.els.gyoji.classList.remove('flipped');
    this.ui.els.gyoji.style.transform = 'scaleX(1)';

    const roundName = this.getRoundName();
    if (!skipFadeIn) { 
        this.ui.els.dayOverlay.textContent = roundName; 
        this.ui.els.dayOverlay.classList.add('visible'); 
    }
    
    if (roundName === "初日") { 
        const audio = new Audio('assets/se/hyoshigi.mp3'); 
        if (typeof SoundFX !== 'undefined') audio.volume = SoundFX.masterVolume;
        audio.play().catch(()=>{}); await wait(2500); 
    } 
    else if (roundName === "中日") { await this.playRoundVoice('nakabi.mp3', 2000); } 
    else if (roundName.startsWith("優勝決定戦")) { 
        if (!this.deciderVoicePlayed) { await this.playRoundVoice('yuusyouketteisen.mp3', 2000); this.deciderVoicePlayed = true; } 
        else { await wait(2000); }
    } 
    else if (roundName === "千秋楽") { await this.playRoundVoice('sennsyuuraku.mp3', 2000); } 
    else { await wait(2000); }
    
    await this.waitForPause();
    this.ui.els.dayOverlay.classList.remove('visible'); await wait(500);
    await this.waitForPause();
    
    const startCalls = [ { id: 'mattanashi', text: '待ったなし！' }, { id: 'kamaete', text: '構えて！' }, { id: 'tewotuite', text: '手を着いて！' }, { id: 'koshiwooroshite', text: '腰を下ろして！' } ];
    const selectedCall = startCalls[Math.floor(Math.random() * startCalls.length)];
    this.ui.els.call.innerHTML = selectedCall.text; 
    this.keys.clear(); 
    await SoundFX.playVoice(selectedCall.id);
    
    await this.waitForPause();

    this.state.tachiai = true; 
    this.state.active = false; 
    this.ui.draw(this.p1, this.p2);
  }
  async playRoundVoice(file, waitTime) {
      const audio = new Audio(`assets/se/${file}`); 
      try { 
          await new Promise((resolve) => { audio.onended = resolve; audio.onerror = resolve; audio.play().catch(resolve); }); 
      } catch (e) { await wait(waitTime); }
  }

  getRoundName() {
      if (this.state.inDecider) {
          if (this.state.deciderRound > 1) {
              return `優勝決定戦：${this.state.deciderRound}戦目`;
          }
          return "優勝決定戦";
      }
      const cur = this.state.current; const max = this.state.matches;
      if (max === 1) return "千秋楽"; 
      if (cur === max) return "千秋楽"; 
      if (cur === 1) return "初日"; 
      if (max >= 3 && max % 2 !== 0 && cur === Math.ceil(max / 2)) return "中日"; 
      return `${cur}日目`;
  }

  // game.js : loop() 修正版
  // アニメーション処理を描画の「後」に移動させました

  // game.js : loop() 修正版

  // game.js : loop

  loop(){
    requestAnimationFrame(this.loop);

    if (this.state.paused) { 
        this.ui.draw(this.p1, this.p2); 
        if (this.p1.animClass) this.p1.el.classList.add(this.p1.animClass);
        if (this.p2.animClass) this.p2.el.classList.add(this.p2.animClass);
        return; 
    }

    if (this.state.tachiai) {
        let p1Ready = [...this.keys].some(k => Object.values(this.p1.controls).includes(k));
        if(this.p1.isCPU) p1Ready = true;
        let p2Ready = [...this.keys].some(k => Object.values(this.p2.controls).includes(k));
        if(this.p2.isCPU) p2Ready = true;

        if (p1Ready && p2Ready) {
            this.state.tachiai = false; 
            this.state.active = true; 
            this.ui.setGyojiImage('nokotta');
            this.ui.els.call.textContent = 'のこった！'; 
            SoundFX.playVoice('nokotta'); 
            this.ui.startGyojiCalls(() => this.state.active && !this.state.paused);
            setTimeout(() => this.ui.els.call.style.display = 'none', 800);
        } else return;
    }

    if(!this.state.active){ 
        SoundFX.updateCharge('p1',0); SoundFX.updateCharge('p2',0); 
        this.ui.draw(this.p1, this.p2); 
        this.updateVisualEffects(); // 試合後も判定
        
        if (this.p1.animClass) this.p1.el.classList.add(this.p1.animClass);
        if (this.p2.animClass) this.p2.el.classList.add(this.p2.animClass);
        return; 
    }

    // --- ゲーム進行 ---
    const staminaMaxDecay = CONFIG.STAMINA ? CONFIG.STAMINA.MAX_DECAY : 0.02;

    this.p1.maxStamina = Math.max(1, this.p1.maxStamina - staminaMaxDecay);
    this.p2.maxStamina = Math.max(1, this.p2.maxStamina - staminaMaxDecay);
    this.p1.stamina = Math.min(this.p1.stamina, this.p1.maxStamina); 
    this.p2.stamina = Math.min(this.p2.stamina, this.p2.maxStamina);
    
    let p1AIKeys = null;
    let p2AIKeys = null;
    if(this.p1.isCPU) p1AIKeys = this.aiP1.think(this.p1, this.p2, this.grapple);
    if(this.p2.isCPU) p2AIKeys = this.aiP2.think(this.p2, this.p1, this.grapple);

    if (this.grapple.active) {
        this.updateGrappleState(p1AIKeys, p2AIKeys); 
    } else { 
        this.updatePlayer(this.p1, this.p2, this.p1.controls, p1AIKeys); 
        this.updatePlayer(this.p2, this.p1, this.p2.controls, p2AIKeys); 
        this.physics(); 
    }
    
    this.checkStaminaEvents();
    
    // 描画更新
    this.ui.draw(this.p1, this.p2); 

    // ★追加: 試合中もオーラ判定を常に行う（これが抜けていました）
    this.updateVisualEffects();

    if (this.p1.animClass) this.p1.el.classList.add(this.p1.animClass);
    if (this.p2.animClass) this.p2.el.classList.add(this.p2.animClass);

    this.checkWin();
  }

  checkStaminaEvents() {
      // スタミナ回復待ち時間のカウントダウン
      if (this.p1.recoveryDelay > 0) this.p1.recoveryDelay--;
      if (this.p2.recoveryDelay > 0) this.p2.recoveryDelay--;
      
      // チャージロック（技後の硬直）のカウントダウン
      if (this.p1.chargeLock > 0) this.p1.chargeLock--;
      if (this.p2.chargeLock > 0) this.p2.chargeLock--;
  }

  // game.js : updatePlayer

  // game.js : updatePlayer

  updatePlayer(p, opp, k, aiKeys) {
    if (p.stun > 0) {
        p.stun--; p.el.classList.add('stunned'); SoundFX.updateCharge(p.id, 0); return;
    } else { p.el.classList.remove('stunned'); }

    const stats = p.getStats(opp);
    const hitDist = (CONFIG.GAME_RULES && CONFIG.GAME_RULES.HIT_DIST) ? CONFIG.GAME_RULES.HIT_DIST : 100;
    const isTouching = Math.abs(p.x - opp.x) <= hitDist;
    const facingRight = p.x < opp.x;
    const dir = facingRight ? 1 : -1;

    if (p.cooldown > 0) {
        const friction = (CONFIG.PHYSICS && CONFIG.PHYSICS.FRICTION) ? CONFIG.PHYSICS.FRICTION : 0.85;
        p.x += p.rebound;
        p.rebound *= friction;
        p.cooldown--;
        SoundFX.updateCharge(p.id, 0);
        if (Math.abs(p.rebound) < 0.1) p.rebound = 0;
        return;
    }

    if (p.isCPU && p.inashiStumble > 0) {
        p.inashiStumble--;
        p.x += (2.8 * 1.5) * p.stumbleDir;
        p.el.classList.add('stunned'); return;
    }
    
    // --- いなし中の処理 ---
    if (p.inashiTimer > 0) {
        // 失敗判定
        if (p.inashiTimer === 1) {
            // 設定値(スプシ優先、なければ10)を取得
            const missPenalty = (CONFIG.STAMINA && CONFIG.STAMINA.MISS_PENALTY) ? CONFIG.STAMINA.MISS_PENALTY : 10;
            
            // 自殺防止（最低1残す）
            p.stamina = Math.max(1, p.stamina - missPenalty);
            
            this.ui.showDamage(p, missPenalty); 
            
            // 回復遅延
            const recoveryWait = (CONFIG.STAMINA && CONFIG.STAMINA.RECOVERY_DELAY) ? CONFIG.STAMINA.RECOVERY_DELAY : 200;
            p.recoveryDelay = recoveryWait;
        }

        p.inashiTimer--;
        SoundFX.updateInashi(p.id, true); 
        return; 
    } else { 
        SoundFX.updateInashi(p.id, false); 
    }

    const press = code => p.isCPU ? aiKeys?.has(code) : this.keys.has(code);
    let wantsFwd = false; let wantsBack = false;
    if (p.isCPU) {
        const keyFwd = facingRight ? k.r : k.l; const keyBack = facingRight ? k.l : k.r;
        wantsFwd = press(keyFwd); wantsBack = press(keyBack);
    } else {
        const inputR = press(k.r); const inputL = press(k.l);
        if (facingRight) { wantsFwd = inputR; wantsBack = inputL; } else { wantsFwd = inputL; wantsBack = inputR; }
    }
    p.wantsFwd = wantsFwd; 

    if (p.isCPU && press(k.u)) {
        this.handleInashi(p, opp);
        if (p.inashiTimer > 0) return;
    }

    // チャージ判定
    const chargeThreshold = p.isCharging ? 0.0 : 3.0; 
    const canCharge = p.stamina > chargeThreshold && p.chargeLock === 0;
    let charging = press(k.d) && canCharge;
    
    if (charging) {
        const gain = (CONFIG.CHARGE ? CONFIG.CHARGE.BASE_GAIN : 0.3) * (1 + (stats.tech - 5) * 0.25);
        p.charge = Math.min(100, p.charge + gain);
        
        const costVal = CONFIG.STAMINA ? CONFIG.STAMINA.CHARGE_COST : 0.5;
        p.stamina = Math.max(0, p.stamina - (isTouching ? costVal : costVal * 0.5));

        if (p.stamina <= 0.0) {
            p.stamina = 0; p.charge = 0; p.chargeLock = 40; charging = false;
        }
    } else { 
        p.charge = 0; 
    }
    p.isCharging = charging;
    SoundFX.updateCharge(p.id, charging, p.charge);

    const speedBase = CONFIG.ACTION ? CONFIG.ACTION.SPEED_BASE : 2.8;
    const recoverMove = CONFIG.STAMINA ? CONFIG.STAMINA.RECOVER_MOVE : 0.1;
    const recoverIdle = CONFIG.STAMINA ? CONFIG.STAMINA.RECOVER_IDLE : 0.3;

    p.isPushing = false;
    if (wantsFwd && !wantsBack) {
        p.isPushing = true;
        const spd = (charging ? speedBase * 0.3 : speedBase) * (1 + (stats.speed - 5) * 0.15);
        if (!isTouching) {
            p.x += spd * dir;
            // ★修正: チャージ中でなければ回復
            if (!charging && p.recoveryDelay <= 0) {
                p.stamina = Math.min(p.maxStamina, p.stamina + recoverMove);
            }
        } else {
            p.stamina = Math.max(0, p.stamina - (CONFIG.STAMINA.PUSH_COST || 0.3));
        }
    } else if (wantsBack) {
        const spd = (speedBase * 0.8) * (1 + (stats.speed - 5) * 0.15);
        p.x -= spd * dir;
        // ★修正: チャージ中でなければ回復
        if (!isTouching && !charging && p.recoveryDelay <= 0) {
             p.stamina = Math.min(p.maxStamina, p.stamina + recoverMove);
        }
    } else if (!charging && p.recoveryDelay <= 0) {
        p.stamina = Math.min(p.maxStamina, p.stamina + recoverIdle);
    }
  }

  physics() {
    if (this.grapple.active || this.state.processingEnd) return;

    const d = Math.abs(this.p1.x - this.p2.x);
    const hitDist = (CONFIG.GAME_RULES && CONFIG.GAME_RULES.HIT_DIST) ? CONFIG.GAME_RULES.HIT_DIST : 100;

    // --- A. いなし判定 ---
    if (d <= hitDist + 30) {
        if (this.p1.inashiTimer > 0 && this.p2.wantsFwd) {
            this.triggerInashiSuccess(this.p1, this.p2);
            this.checkWin(); return;
        }
        if (this.p2.inashiTimer > 0 && this.p1.wantsFwd) {
            this.triggerInashiSuccess(this.p2, this.p1);
            this.checkWin(); return;
        }
    }

    if (d <= hitDist) {
        const s1 = this.p1.getStats(this.p2);
        const s2 = this.p2.getStats(this.p1);
        const k = 3; 

        // ★修正1: 変数宣言をここで一回だけ行う（重複エラー回避）
        // デフォルトを300(約5秒)に設定
        const recoveryWait = (CONFIG.STAMINA && CONFIG.STAMINA.RECOVERY_DELAY) ? CONFIG.STAMINA.RECOVERY_DELAY : 200;

        // --- B. はじき処理（かち合い） ---
        if (this.p1.isPushing && this.p2.isPushing && this.p1.cooldown <= 0) {
            
            // 1. 反動計算
            const rbVel = CONFIG.ACTION.REBOUND_VELOCITY || 8;
            const dir = (this.p1.x < this.p2.x) ? 1 : -1;

            this.p1.rebound = -dir * ((s2.power + k) / (s1.power + k)) * rbVel;
            this.p2.rebound =  dir * ((s1.power + k) / (s2.power + k)) * rbVel;

            // 2. ダメージ計算
            const baseDmg = CONFIG.DAMAGE.BASE_PUSH || 5;
            let p1Dmg = baseDmg * ((s2.power + k) / (s1.power + k));
            let p2Dmg = baseDmg * ((s1.power + k) / (s2.power + k));

            // HP1同士ならダメージ0
            if (this.p1.stamina <= 1 && this.p2.stamina <= 1) {
                p1Dmg = 0; p2Dmg = 0;
            }

            // 3. ダメージ適用
            if (p1Dmg > 0) { 
                this.p1.stamina -= p1Dmg; 
                this.p1.maxStamina -= p1Dmg; 
                // ★修正2: かち合い時も回復を待機させる（ここが重要！）
                this.p1.recoveryDelay = recoveryWait; 
            }
            if (p2Dmg > 0) { 
                this.p2.stamina -= p2Dmg; 
                this.p2.maxStamina -= p2Dmg; 
                // ★修正2: かち合い時も回復を待機させる
                this.p2.recoveryDelay = recoveryWait;
            }

            // 4. ダメージ表示
            if (p1Dmg > 0) this.ui.showDamage(this.p1, p1Dmg);
            if (p2Dmg > 0) this.ui.showDamage(this.p2, p2Dmg);

            // 5. クールダウン
            this.p1.cooldown = CONFIG.ACTION.COOLDOWN_TIME || 10;
            this.p2.cooldown = CONFIG.ACTION.COOLDOWN_TIME || 10;

            this.ui.fx(this.p1, this.p2, 'col');
            SoundFX.playHit(false);
            this.checkWin(); return;
        }

        // --- 寄り（グラップル）開始判定 ---
        if (this.p1.isPushing && !this.p2.isPushing && this.p1.cooldown <= 0 && this.p2.cooldown <= 0) {
            this.startGrapple(this.p1, this.p2); 
            return;
        } else if (this.p2.isPushing && !this.p1.isPushing && this.p1.cooldown <= 0 && this.p2.cooldown <= 0) {
            this.startGrapple(this.p2, this.p1); 
            return;
        }

        // --- C. めり込み防止 ---
        const overlap = (hitDist - d) / 2;
        if (this.p1.x < this.p2.x) { this.p1.x -= overlap; this.p2.x += overlap; }
        else { this.p1.x += overlap; this.p2.x -= overlap; }

        // --- D. 寄りダメージ（押し合い） ---
        const ST = CONFIG.STATUS || {};
        const pushBase = ST.PUSH_BASE_RATE || 0.1;
        const distConv = ST.PUSH_DIST_CONVERT || 1.0;
        
        let moveForce = (s1.power - s2.power) * pushBase * distConv;
        if (moveForce > 0 && this.p2.isCharging) moveForce /= (ST.PUSH_VS_CHARGE || 1.5);
        else if (moveForce < 0 && this.p1.isCharging) moveForce /= (ST.PUSH_VS_CHARGE || 1.5);

        this.p1.x += moveForce;
        this.p2.x += moveForce;

        const moveCost = CONFIG.STAMINA.MOVE_COST || 0.15;
        const pwrDmgRate = ST.PWR_DMG_RATE || 0.1;
        
        // ★以前ここで宣言していた const recoveryWait = ... は削除しました

        if (moveForce > 0) { 
            const pwrBonus = Math.max(0, (s1.power - 5) * pwrDmgRate);
            const finalDmg = moveCost + pwrBonus; 
            this.p2.stamina -= finalDmg;
            this.p2.recoveryDelay = recoveryWait;
            this.ui.showDamage(this.p2, finalDmg);
            this.checkWin();
        } else if (moveForce < 0) { 
            const pwrBonus = Math.max(0, (s2.power - 5) * pwrDmgRate);
            const finalDmg = moveCost + pwrBonus;
            this.p1.stamina -= finalDmg;
            this.p1.recoveryDelay = recoveryWait;
            this.ui.showDamage(this.p1, finalDmg);
            this.checkWin();
        }
    }
  }


  // game.js : triggerInashiSuccess

  triggerInashiSuccess(p, opp) {
    SoundFX.updateInashi(p.id, false, true);
      p.inashiTimer = 0; 
      p.lastParry = Date.now(); 
      this.ui.fx(p, opp, 'parry'); 
      SoundFX.playTone('parry'); 
      this.ui.msg(p, "いなし！", false, true);
      const swapDist = CONFIG.ACTION ? CONFIG.ACTION.SWAP_DIST_NORMAL : 80;

      // ★修正: 相手へのダメージは「回復不可の10」に固定
      const inashiDamage = 10; 
      
      // 最大HPを削る（回復不能にする）
      opp.maxStamina = Math.max(0, opp.maxStamina - inashiDamage);
      opp.stamina = Math.min(opp.stamina, opp.maxStamina); 

      // 相手の回復遅延もセット
      const recoveryWait = (CONFIG.STAMINA && CONFIG.STAMINA.RECOVERY_DELAY) ? CONFIG.STAMINA.RECOVERY_DELAY : 200;
      opp.recoveryDelay = recoveryWait;

      // ★修正: 先に位置を入れ替える
      // これで opp の座標が「いなし後の位置」になります
      this.swap(opp, p, swapDist);

      // ★修正: 入れ替わった後の位置にダメージを表示する
      // これで相手の頭上に数字が出ます
      this.ui.showDamage(opp, inashiDamage); 

      if (opp.isCPU) {
            const stumbleDur = (CONFIG.ACTION && CONFIG.ACTION.STUMBLE_DURATION) ? CONFIG.ACTION.STUMBLE_DURATION : 40;
            opp.inashiStumble = stumbleDur;
          opp.stumbleDir = (opp.x < p.x) ? -1 : 1;
      }
  }

  // game.js : updateGrappleState (チャージ制限緩和版)

  updateGrappleState(p1AIKeys, p2AIKeys) {
      const m = this.grapple.master; const s = this.grapple.slave; 
      const mStats = m.getStats(s); const sStats = s.getStats(m); 
      
      const moveCost = CONFIG.STAMINA ? CONFIG.STAMINA.MOVE_COST : 0.15;
      const grappleCostRate = CONFIG.STATUS ? CONFIG.STATUS.GRAPPLE_COST_RATE : 0.2;

      m.stamina = Math.max(1, m.stamina - moveCost * grappleCostRate); 
      s.stamina = Math.max(1, s.stamina - moveCost * grappleCostRate); 
      
      const mFacing = (m.x < s.x) ? 1 : -1;
      const getInput = (p, keys, isAI, aiKeys) => {
          const source = isAI ? aiKeys : this.keys;
          const facing = (p.x < (p===m?s.x:m.x)) ? 1 : -1; 
          return { 
              wantsFwd: facing===1 ? source.has(keys.r) : source.has(keys.l), 
              wantsCharge: source.has(keys.d),
              wantsTech: source.has(keys.u) 
          }; 
      };
      
      const mInput = getInput(m, m.controls, m.isCPU, m === this.p1 ? p1AIKeys : p2AIKeys);
      const sInput = getInput(s, s.controls, s.isCPU, s === this.p1 ? p1AIKeys : p2AIKeys);

      // --- チャージ処理（マスター側） ---
      // ★修正: 閾値を 3.0 / 0.0 に変更
      const mThresh = m.isCharging ? 0.0 : 3.0;
      if (mInput.wantsCharge && m.stamina > mThresh && m.chargeLock === 0) { 
          const baseGain = CONFIG.CHARGE ? CONFIG.CHARGE.BASE_GAIN : 0.3;
          const techRate = CONFIG.STATUS ? CONFIG.STATUS.TECH_CHARGE_RATE : 0.25;
          const gain = baseGain * (1 + (mStats.tech - 5) * techRate); 
          m.charge = Math.min(100, m.charge + gain); 
          const chgCost = CONFIG.STAMINA ? CONFIG.STAMINA.CHARGE_COST : 0.1;
          
          m.stamina = Math.max(0, m.stamina - chgCost); 
          m.isCharging = true; 

          if (m.stamina <= 0.0) {
              m.charge = 0; m.chargeLock = 40; m.isCharging = false;
          }
      } else { 
          m.charge = 0; m.isCharging = false; 
      }
      
      // --- チャージ処理（スレーブ側） ---
      const sThresh = s.isCharging ? 0.0 : 3.0;
      if (sInput.wantsCharge && s.stamina > sThresh && s.chargeLock === 0) { 
          const baseGain = CONFIG.CHARGE ? CONFIG.CHARGE.BASE_GAIN : 0.3;
          const techRate = CONFIG.STATUS ? CONFIG.STATUS.TECH_CHARGE_RATE : 0.25;
          const gain = baseGain * (1 + (sStats.tech - 5) * techRate); 
          s.charge = Math.min(100, s.charge + gain); 
          const chgCost = CONFIG.STAMINA ? CONFIG.STAMINA.CHARGE_COST : 0.1;
          
          s.stamina = Math.max(0, s.stamina - chgCost); 
          s.isCharging = true; 

          if (s.stamina <= 0.0) {
              s.charge = 0; s.chargeLock = 40; s.isCharging = false;
          }
      } else { 
          s.charge = 0; s.isCharging = false; 
      }

      SoundFX.updateCharge(m.id, m.isCharging, m.charge);
      SoundFX.updateCharge(s.id, s.isCharging, s.charge);
      
      [m, s].forEach(p => {
          if (p.inashiTimer > 0) { p.inashiTimer--; SoundFX.updateInashi(p.id, true); } 
          else { SoundFX.updateInashi(p.id, false); }
      });
      
      if (m.isCPU && mInput.wantsTech) {
           if (m.charge >= 100) { this.handleGrappleCounter(m, s, 'throw'); return; }
      }

      // --- 押し込み処理 ---
      if (mInput.wantsFwd) { 
          const spdBase = CONFIG.ACTION ? CONFIG.ACTION.SPEED_BASE : 2.8;
          const grpSpdRate = CONFIG.STATUS ? CONFIG.STATUS.GRAPPLE_SPD_RATE : 0.5;
          const baseSpeed = m.isCharging ? spdBase * 0.3 : spdBase * grpSpdRate; 
          
          let pushSpeed = baseSpeed * Math.max(0.2, (1 + (mStats.power - 5) * 0.6)); 
          
          if (s.isCharging) { pushSpeed *= 0.5; }

          // 泥仕合対策: お互いスタミナ切れ(10以下)＆チャージ無しなら加速
          if (m.stamina <= 10 && !m.isCharging && s.stamina <= 10 && !s.isCharging) {
              pushSpeed *= 3.0; 
              pushSpeed = Math.max(pushSpeed, 2.5); 
          }
          
          const hitDist = (CONFIG.GAME_RULES && CONFIG.GAME_RULES.HIT_DIST) ? CONFIG.GAME_RULES.HIT_DIST : 100;
          m.x += pushSpeed * mFacing; s.x = m.x + (hitDist * mFacing); 
      }
      
      if (s.isCPU) {
          const k = s === this.p1 ? p1AIKeys : p2AIKeys;
          if (k.has(s.controls.u)) { 
             if(s.charge >= 100) this.handleGrappleCounter(s, m, 'throw');
             else this.handleInashi(s, m);
          }
          else if (s.x < m.x ? k.has(s.controls.r) : k.has(s.controls.l)) {
              this.handleGrappleCounter(s, m, 'push');
          }
      }
  }
  handleGrappleInput(code) {
      const s = this.grapple.slave; const m = this.grapple.master;
      if(!m.isCPU) {
          if (this.isPlayerControl(m, code, 'u')) { if (m.charge >= 100) this.handleGrappleCounter(m, s, 'throw'); }
          if (this.isPlayerControl(m, code, 'fwd')) { if (m.charge >= 50) this.handleGrappleCounter(m, s, 'push'); }
      }
      if (s && !s.isCPU) {
          if (this.isPlayerControl(s, code, 'u')) { 
              if (s.charge >= 100) this.handleGrappleCounter(s, m, 'throw'); 
              else this.handleInashi(s, m); 
          }
          if (this.isPlayerControl(s, code, 'fwd')) { if (s.charge >= 50) this.handleGrappleCounter(s, m, 'push'); }
      }
  }

// game.js : handleInashi

  handleInashi(p, opp) {
    if(p.isDefeated || p.cooldown>0 || p.stun > 0 || p.inashiTimer > 0) return;

    const superSwapThresh = (CONFIG.CHARGE && CONFIG.CHARGE.THRESHOLDS && CONFIG.CHARGE.THRESHOLDS.SUPER_SWAP) ? CONFIG.CHARGE.THRESHOLDS.SUPER_SWAP : 100;
    
    // --- 100% 掴み投げ ---
    if(p.charge >= superSwapThresh) { 
        const swapCost = (CONFIG.STAMINA && CONFIG.STAMINA.SUPER_SWAP_COST) ? CONFIG.STAMINA.SUPER_SWAP_COST : 50;
        if(p.stamina < swapCost) return;

        p.stamina = Math.max(0, p.stamina - swapCost);
        p.charge = 0; 
        
        // ★追加: 投げた本人に回復遅延を与える
        const recoveryWait = (CONFIG.STAMINA && CONFIG.STAMINA.RECOVERY_DELAY) ? CONFIG.STAMINA.RECOVERY_DELAY : 200;
        p.recoveryDelay = recoveryWait;

        SoundFX.updateCharge(p.id, false, 0); 
        p.chargeLock = 60; 

        const throwRange = (CONFIG.GAME_RULES && CONFIG.GAME_RULES.THROW_RANGE) ? CONFIG.GAME_RULES.THROW_RANGE : 110;
        const currentDist = Math.abs(p.x - opp.x);

        SoundFX.playVoice('dosukoi');
        SoundFX.playHit(true);

        p.animClass = (p.x < opp.x) ? 'throw-posture-left' : 'throw-posture-right';

        if (currentDist <= throwRange + 30) { 
            this.superSwap(p, opp); 
            p.cooldown = 20;
            opp.cooldown = 20;
        } else {
            p.cooldown = 40;
        }

        setTimeout(() => {
            p.animClass = null; 
            p.el.classList.remove('throw-posture-left', 'throw-posture-right');
            p.el.classList.add('throw-finish-motion');
            setTimeout(() => p.el.classList.remove('throw-finish-motion'), 200);
        }, 300);

        return; 
    }
    
    // --- 通常いなし ---
    const stats = p.getStats(opp); 
    const baseDur = CONFIG.ACTION ? CONFIG.ACTION.INASHI_DURATION_BASE : 15;
    const techMod = CONFIG.ACTION ? CONFIG.ACTION.INASHI_TECH_MOD : 3;
    p.inashiTimer = baseDur + (stats.tech * techMod);
    const parryCost = CONFIG.STAMINA ? CONFIG.STAMINA.PARRY_COST : 5;
    p.stamina = Math.max(1, p.stamina - parryCost);
    
    // ★追加: いなしを行った本人に回復遅延を与える
    const recoveryWait = (CONFIG.STAMINA && CONFIG.STAMINA.RECOVERY_DELAY) ? CONFIG.STAMINA.RECOVERY_DELAY : 200;
    p.recoveryDelay = recoveryWait;

    p.el.classList.add('inashi-active');

    p.actionType = 'inashi'; 
    setTimeout(() => p.actionType = null, p.inashiTimer * 16); 
  }

  normalPush(atk, def, dir){ 
      const aStats = atk.getStats(def); const dStats = def.getStats(atk);
      const pushPowerBase = (CONFIG.PHYSICS && CONFIG.PHYSICS.PUSH_POWER_BASE) ? CONFIG.PHYSICS.PUSH_POWER_BASE : 2.0;
      const pushDistConv = CONFIG.STATUS ? CONFIG.STATUS.PUSH_DIST_CONVERT : 0.4;
      const basePwr = (aStats.power * 0.5) + pushPowerBase;
      let pwr = basePwr * pushDistConv; 
      
      const weakPenalty = CONFIG.STATUS ? CONFIG.STATUS.PUSH_WEAK_PENALTY : 0.7;
      if (aStats.power < 5) pwr *= weakPenalty; 
      
      const advBonus = CONFIG.STATUS ? CONFIG.STATUS.PUSH_ADV_BONUS : 0.4;
      const disadvPenalty = CONFIG.STATUS ? CONFIG.STATUS.PUSH_DISADV_PENALTY : 0.5;
      if (aStats.power > dStats.power) pwr *= (1 + (aStats.power - dStats.power) * advBonus); 
      else pwr *= disadvPenalty; 
      
      const vsCharge = CONFIG.STATUS ? CONFIG.STATUS.PUSH_VS_CHARGE : 1.5;
      if (def.isCharging) pwr *= vsCharge; 
      
      this.p1.x += pwr * dir; this.p2.x += pwr * dir; 
      
      const pwrDmgRate = CONFIG.STATUS ? CONFIG.STATUS.PWR_DMG_RATE : 0.1;
      const basePushDmg = CONFIG.DAMAGE ? CONFIG.DAMAGE.BASE_PUSH : 1.5;
      const dmgMult = 1.0 + ((aStats.power - 5) * pwrDmgRate); 
      const damage = basePushDmg * dmgMult;
      
      def.maxStamina -= damage;
      this.ui.showDamage(def, damage);
      def.stamina = Math.min(def.stamina, def.maxStamina); 
      this.lastHit = 'push';
      if(def.stamina<=0) { this.resolveMatch(atk, def, 'ko_push'); } 
  }
  
 superPush(atk, def, dir){ 
      const aStats = atk.getStats(def); this.ui.fx(atk, def, 'super'); SoundFX.playHit(true); 
      const baseDist = CONFIG.STATUS ? CONFIG.STATUS.SP_PUSH_BASE : 50;
      const rateDist = CONFIG.STATUS ? CONFIG.STATUS.SP_PUSH_RATE : 20;
      const backRate = CONFIG.STATUS ? CONFIG.STATUS.SP_SELF_BACK_RATE : 0.2;
      const dist = baseDist + (aStats.power * rateDist); 
      
      def.x += dist * dir; atk.x += (dist * backRate) * dir; 
      
      const cost = CONFIG.STAMINA ? CONFIG.STAMINA.SUPER_PUSH_COST : 5;
      const thresh = (CONFIG.CHARGE && CONFIG.CHARGE.THRESHOLDS) ? CONFIG.CHARGE.THRESHOLDS.SUPER_PUSH : 50;
      atk.stamina = Math.max(1, atk.stamina - cost); 
      atk.charge -= thresh; 
      
      // ★追加: 攻撃した本人に回復遅延を与える
      const recoveryWait = (CONFIG.STAMINA && CONFIG.STAMINA.RECOVERY_DELAY) ? CONFIG.STAMINA.RECOVERY_DELAY : 200;
      atk.recoveryDelay = recoveryWait;

      this.ui.msg(atk,"ぶちかまし！"); 
      this.lastHit = 'thrust';
      
      const damage = CONFIG.DAMAGE ? CONFIG.DAMAGE.BASE_THRUST : 15;
      def.maxStamina -= damage;
      this.ui.showDamage(def, damage, 'crit');
      def.stamina = Math.min(def.stamina, def.maxStamina);
      def.stun = (CONFIG.ACTION && CONFIG.ACTION.STUN_TIME_PUSH) ? CONFIG.ACTION.STUN_TIME_PUSH : 100;
        atk.chargeLock = def.stun;
      if(def.stamina<=0) { this.resolveMatch(atk, def, 'ko_thrust'); }
  }
  
  swap(def, atk, dist){ 
      const ax=atk.x; atk.x=def.x; def.x=ax; const dir = (atk.x > def.x) ? 1 : -1; 
      atk.x += dist*dir; def.x -= (dist/2)*dir; 
      this.lastHit = 'throw'; 
      const cost = CONFIG.STAMINA ? CONFIG.STAMINA.SWAP_COST_NORMAL : 10;
      atk.stamina = Math.max(1, atk.stamina - cost);
  }
  
 superSwap(thrower, victim){ 
      this.ui.fx(thrower, victim, 'super'); SoundFX.playHit(true); 
      const dir = (thrower.x < victim.x) ? 1 : -1; 
      const dist = CONFIG.ACTION ? CONFIG.ACTION.SWAP_DIST_SUPER : 220;
      victim.x = thrower.x - (dist * dir); 
      
      const cost = CONFIG.STAMINA ? CONFIG.STAMINA.SUPER_SWAP_COST : 10;
      thrower.stamina = Math.max(1, thrower.stamina - cost); 
      
      // ★追加: 投げた本人に回復遅延を与える
      const recoveryWait = (CONFIG.STAMINA && CONFIG.STAMINA.RECOVERY_DELAY) ? CONFIG.STAMINA.RECOVERY_DELAY : 200;
      thrower.recoveryDelay = recoveryWait;

      thrower.charge=0; this.ui.msg(thrower,"掴み投げ！"); 
      this.lastHit = 'throw';
      
      const damage = CONFIG.DAMAGE ? CONFIG.DAMAGE.BASE_THROW : 25;
      victim.maxStamina -= damage;
      this.ui.showDamage(victim, damage, 'crit');
      victim.stamina = Math.min(victim.stamina, victim.maxStamina);
      victim.stun = (CONFIG.ACTION && CONFIG.ACTION.STUN_TIME_THROW) ? CONFIG.ACTION.STUN_TIME_THROW : 150;
      thrower.chargeLock = victim.stun;
      if(victim.stamina<=0) { this.resolveMatch(thrower, victim, 'ko_throw'); } 
  }

  isPlayerControl(p, code, action) {
      if (p.isCPU) return false; 
      if (action === 'u') return code === p.controls.u;
      if (action === 'fwd') { const opp = (p === this.p1 ? this.p2 : this.p1); const facingRight = p.x < opp.x; if (facingRight) return code === p.controls.r; else return code === p.controls.l; }
      return false;
  }

  handleGrappleCounter(atk, def, type) {
      if (type === 'push' && def.inashiTimer > 0) {
          this.endGrapple();
          this.triggerInashiSuccess(def, atk);
          return;
      }

      // --- 掴み投げ ---
      if (type === 'throw') {
          this.endGrapple();
          this.superSwap(atk, def);

          SoundFX.playVoice('dosukoi');
          SoundFX.playHit(true);

          atk.animClass = (atk.x < def.x) ? 'throw-posture-right' : 'throw-posture-left';

          atk.cooldown = 20; 
          def.cooldown = 20; 
          atk.chargeLock = 60;

          setTimeout(() => {
              atk.animClass = null; 
              atk.el.classList.remove('throw-posture-left', 'throw-posture-right');
              atk.el.classList.add('throw-finish-motion');
              setTimeout(() => atk.el.classList.remove('throw-finish-motion'), 300);
          }, 400);

          return;
      }

      // --- 押し（ぶちかまし）平行移動Ver ---
      this.endGrapple(); 
      const dir = (atk.x < def.x) ? 1 : -1;
      this.superPush(atk, def, dir);
      
      atk.x -= 20 * dir;

      atk.animClass = (dir === 1) ? 'thrust-attack-right' : 'thrust-attack-left';

      atk.cooldown = 20; 
      def.cooldown = 20; 
      atk.chargeLock = 40;

      setTimeout(() => {
          atk.animClass = null; 
          atk.el.classList.remove('thrust-attack-right', 'thrust-attack-left');
          atk.el.classList.add('thrust-finish-motion'); 
          setTimeout(() => {
              atk.el.classList.remove('thrust-finish-motion');
          }, 200);
      }, 150);
  }
  startGrapple(master, slave) { 
      this.grapple.active = true; this.grapple.master = master; this.grapple.slave = slave; 
      this.ui.els.grappleInd.style.display = 'block'; SoundFX.playHit(false); 
      const dir = (master.x < slave.x) ? 1 : -1; const mid = (master.x + slave.x) / 2; 
      const hitDist = (CONFIG.GAME_RULES && CONFIG.GAME_RULES.HIT_DIST) ? CONFIG.GAME_RULES.HIT_DIST : 100;
      master.x = mid - (hitDist/2 * dir); slave.x = mid + (hitDist/2 * dir); 
  }
  endGrapple() { 
      this.grapple.active = false; this.grapple.master = null; this.grapple.slave = null; 
      this.ui.els.grappleInd.style.display = 'none'; 
  }

  checkWin(){ 
    if(this.state.processingEnd) return; 

    // 1. スタミナ切れ
    if (this.p1.stamina <= 0) {
        this.p1.stamina = 0;
        this.resolveMatch(this.p2, this.p1, 'exhaustion');
        this.stopInashiSound(); // ★音停止
        return;
    }
    if (this.p2.stamina <= 0) {
        this.p2.stamina = 0;
        this.resolveMatch(this.p1, this.p2, 'exhaustion');
        this.stopInashiSound(); // ★音停止
        return;
    }

    // 2. 土俵外
    const leftLimit = (CONFIG.GAME_RULES && CONFIG.GAME_RULES.RING_EDGE_LEFT) ? CONFIG.GAME_RULES.RING_EDGE_LEFT : 115;
    const rightLimit = (CONFIG.GAME_RULES && CONFIG.GAME_RULES.RING_EDGE_RIGHT) ? CONFIG.GAME_RULES.RING_EDGE_RIGHT : 1085;

    const isOut = (p) => {
        const scale = p.getPhysiqueScale ? p.getPhysiqueScale() : 1.0;
        const centerX = p.x + 65; 
        const footSpread = 32 * scale; 
        return (centerX - footSpread < leftLimit || centerX + footSpread > rightLimit);
    };
    
    if(isOut(this.p1)) { 
        this.resolveMatch(this.p2, this.p1, 'ringout'); 
        this.stopInashiSound(); // ★音停止
    }
    else if(isOut(this.p2)) { 
        this.resolveMatch(this.p1, this.p2, 'ringout'); 
        this.stopInashiSound(); // ★音停止
    }
  }

  // game.js : updateVisualEffects

  updateVisualEffects() {
      // 試合中以外は完全に消す
      if (!this.state.active && !this.state.processingEnd) {
          [this.p1, this.p2].forEach(p => {
              if (p.el) p.el.classList.remove('aura-yellow', 'aura-blue');
          });
          return;
      }

      const leftEdge = (CONFIG.GAME_RULES && CONFIG.GAME_RULES.RING_EDGE_LEFT) ? CONFIG.GAME_RULES.RING_EDGE_LEFT : 115;
      const rightEdge = (CONFIG.GAME_RULES && CONFIG.GAME_RULES.RING_EDGE_RIGHT) ? CONFIG.GAME_RULES.RING_EDGE_RIGHT : 1085;
      const dangerZone = 120; 
      const rikishiWidth = 130; 

      [this.p1, this.p2].forEach(p => {
          if (p.isDefeated) {
              p.el.classList.remove('aura-yellow', 'aura-blue');
              return;
          }
          
          // ★修正: 変数名を 'gyakuten' から 'reversal' に変更
          // data.js で読み込んだプロパティ名は reversal です
          let val = 5; 
          if (p.baseStats && p.baseStats.reversal !== undefined) {
              val = p.baseStats.reversal;
          }
          const reversalVal = parseInt(val, 10);

          // 位置判定
          const isDangerLeft = p.x < (leftEdge + dangerZone);
          const isDangerRight = (p.x + rikishiWidth) > (rightEdge - dangerZone);
          
          if ((isDangerLeft || isDangerRight) && p.stamina > 0) {
              // ★色決定: 4以下なら青、5以上なら黄色
              const isLow = reversalVal < 5;
              const auraColor = isLow ? 'aura-blue' : 'aura-yellow';
              const removeColor = isLow ? 'aura-yellow' : 'aura-blue';
              
              if (!p.el.classList.contains(auraColor)) {
                  p.el.classList.add(auraColor);
                  p.el.classList.remove(removeColor);
              }
          } else {
              p.el.classList.remove('aura-yellow', 'aura-blue');
          }
      });
  }

  // ★追加: 音停止ヘルパー
  stopInashiSound() {
    SoundFX.updateInashi('p1', false);
    SoundFX.updateInashi('p2', false);
  }

  // ★修正: resolveMatch (決まり手判定強化版)
  resolveMatch(winner, loser, reason) {
      if(this.state.processingEnd) return; 
      this.state.processingEnd = true;
      let kimarite = "決まり手不明";
      
      const hitDist = (CONFIG.GAME_RULES && CONFIG.GAME_RULES.HIT_DIST) ? CONFIG.GAME_RULES.HIT_DIST : 100;
      const isContact = Math.abs(this.p1.x - this.p2.x) <= (hitDist + 20);

      // ★修正: いなし中なら「突き落とし」
      if (winner.actionType === 'inashi') {
          kimarite = "突き落とし";
      } else {
          if (reason === 'ringout') {
              if (!isContact && !this.lastHit) kimarite = "勇み足";
              else if (this.lastHit === 'throw') kimarite = "上手出し投げ";
              else if (this.lastHit === 'thrust') kimarite = "突き出し";
              else kimarite = "寄り切り";
          }
          else {
              switch(reason) {
                  case 'ko_throw':    kimarite = "上手投げ"; break;
                  case 'ko_thrust':   kimarite = "突き倒し"; break;
                  case 'ko_push':     kimarite = "押し倒し"; break;
                  default:            kimarite = "押し倒し"; break;
              }
          }
      }
      
      this.stopInashiSound();
      this.startSlowMotion(winner.name, loser, kimarite);
  }

  startSlowMotion(wName, loser, kimarite) {
    this.state.active = false; 
    this.ui.stopGyojiCalls(); 
    this.endGrapple();    
    loser.isDefeated = true; 
    if(kimarite.includes('投げ')) loser.isThrown = true;
    const winner = (loser === this.p1) ? this.p2 : this.p1;
    this.ui.triggerSlowMotion(loser, winner);
    setTimeout(() => { this.endRound(wName, loser, kimarite); }, 1500); 
  }

  async endRound(wName, loser, kimarite){
    SoundFX.playVoice('syoubuari');
    SoundFX.updateCharge('p1',0); SoundFX.updateCharge('p2',0); 
    const wId = loser.id==='p1' ? 'p2' : 'p1'; 
    this.state.wins[wId]++; 
    this.ui.els.p1Wins.textContent = this.state.wins.p1 + '勝'; 
    this.ui.els.p2Wins.textContent = this.state.wins.p2 + '勝'; 
    this.ui.draw(this.p1, this.p2);
    this.ui.setGyojiImage('syoubuari');
    
    if(wId === 'p1') {
        this.ui.els.gyoji.style.transform = 'scaleX(-1)';
        this.ui.els.gyoji.classList.add('flipped');
    } else {
        this.ui.els.gyoji.style.transform = 'scaleX(1)';
        this.ui.els.gyoji.classList.remove('flipped');
    }

    const matchStatus = this.checkMatchStatus();
    await wait(1000); 
    this.ui.els.res.classList.add('visible'); 
    document.getElementById('kimarite-display').textContent=`決まり手：${kimarite}`; document.getElementById('win-message').textContent=`${wName}の勝ち！`;
    const btn = document.getElementById('next-btn'); 
    const btnText = (matchStatus.enteringDecider) ? "優勝決定戦へ" : "次の取り組みへ";
    btn.textContent = btnText;
    
    if(matchStatus.isTournamentOver) {
            const winner = matchStatus.winnerName; const winnerObj = matchStatus.winnerObj; btn.style.display = 'none'; 
            await wait(1500); document.getElementById('result-overlay').classList.add('final-mode'); document.getElementById('kimarite-display').textContent = ""; document.getElementById('win-message').textContent = ""; 
            let winImg = (winnerObj && winnerObj.baseStats && winnerObj.baseStats.img) ? this.ui.getImagePath(winnerObj.baseStats.img) : "";
            let html = ``; if(winImg) { html += `<div class="bg-anim" style="position:absolute; top:50%; left:50%; width:1500px; height:1500px; border-radius:50%; background:url('${winImg}') center/cover; pointer-events:none;"></div>`; }
            html += `<div class="winner-anim" style="position:relative; z-index:10; font-size:4rem; color:gold; font-weight:900; text-shadow:4px 4px 0 #000; font-family: 'Yuji Syuku', serif;">${winner} 優勝！</div><div id="final-btn-container"><button class="btn" onclick="game.rematch()">同じ条件で再戦</button><button id="auto-top-btn" class="btn">トップへ戻る (5)</button></div>`;
            document.getElementById('match-info').innerHTML = html;
            setTimeout(() => { 
                const audio = new Audio('assets/se/appare.mp3'); audio.play().then(() => { audio.onended = () => { const container = document.getElementById('final-btn-container'); if(container) container.style.display = 'flex'; const autoBtn = document.getElementById('auto-top-btn'); let count = 5; autoBtn.onclick = () => location.reload(); this.finalAdvanceTimer = setInterval(()=>{ count--; if(count>0) autoBtn.textContent = `トップへ戻る (${count})`; else { clearInterval(this.finalAdvanceTimer); location.reload(); } }, 1000); }; }).catch(e => { const container = document.getElementById('final-btn-container'); if(container) container.style.display = 'flex'; });
            }, 2000);
    } else {
            btn.textContent = `${btnText} (3)`; btn.style.display = 'inline-block'; let count = 3; if (this.autoAdvanceTimer) clearInterval(this.autoAdvanceTimer);
            const proceed = async () => {
                if (this.state.paused) return; 
                if (this.autoAdvanceTimer) { clearInterval(this.autoAdvanceTimer); this.autoAdvanceTimer = null; } if(btn.disabled) return; btn.disabled = true; this.ui.els.dayOverlay.classList.add('visible', 'instant');
                let nextRoundName = ""; 
                if (matchStatus.enteringDecider) { nextRoundName = "優勝決定戦"; } 
                else if (this.state.inDecider) { nextRoundName = `優勝決定戦：${this.state.deciderRound + 1}戦目`; } 
                else { 
                    const cur = this.state.current + 1; const max = this.state.matches;
                    if (max === 1) nextRoundName = "千秋楽"; else if (cur === max) nextRoundName = "千秋楽"; else if (cur === 1) nextRoundName = "初日"; else if (max >= 3 && max % 2 !== 0 && cur === Math.ceil(max / 2)) nextRoundName = "中日"; else nextRoundName = `${cur}日目`; 
                }
                this.ui.els.dayOverlay.textContent = nextRoundName;
                await wait(100); await this.waitForPause(); 
                if (!matchStatus.nextIsDecider && !this.state.inDecider) { this.state.current++; } 
                if (matchStatus.enteringDecider) { this.state.inDecider = true; this.state.deciderRound = 1; } 
                else if (this.state.inDecider) { this.state.deciderRound++; }
                requestAnimationFrame(() => { this.ui.els.dayOverlay.classList.remove('instant'); this.startMatch(true); });
            };
            btn.onclick = proceed; 
            this.autoAdvanceTimer = setInterval(() => { 
                if(!this.state.paused) { 
                    count--; 
                    if (count > 0) { btn.textContent = `${btnText} (${count})`; } else { proceed(); } 
                }
            }, 1000);
    }
  }

  checkMatchStatus() {
      const wins1 = this.state.wins.p1; const wins2 = this.state.wins.p2; const current = this.state.current; const max = this.state.matches;
      if (this.state.deuce) { 
          const diff = Math.abs(wins1 - wins2); 
          if (this.state.inDecider) {
              if (diff >= 2) { return { isTournamentOver: true, winnerName: wins1 > wins2 ? this.p1.name : this.p2.name, winnerObj: wins1 > wins2 ? this.p1 : this.p2 }; } 
              else { return { isTournamentOver: false, nextIsDecider: true }; }
          }
          if (current === max && wins1 === wins2) { return { isTournamentOver: false, nextIsDecider: true, enteringDecider: true }; }
      }
      if (current < max) return { isTournamentOver: false };
      const winnerName = wins1 > wins2 ? this.p1.name : (wins2 > wins1 ? this.p2.name : "引き分け"); 
      const winnerObj = wins1 > wins2 ? this.p1 : this.p2; 
      return { isTournamentOver: true, winnerName, winnerObj };
  }
}

// ------------------------------------------
// Global Initialization
// ------------------------------------------
let game; 
document.fonts.ready.then(()=>document.body.classList.add('loaded'));

window.onload = async () => {
    if (typeof loadExternalData === 'undefined') {
        alert("エラー: data.js が読み込まれていません。");
        return;
    }
    
    await loadExternalData();
    const loadingMsg = document.getElementById('network-loading-msg');
    if(loadingMsg) loadingMsg.style.display = 'none';

    const btnGroup = document.getElementById('start-btn-group');
    if(btnGroup) {
        btnGroup.style.display = 'flex';
        btnGroup.classList.add('fade-in-up');
    }

    try {
        game = new GameManager();
    } catch(e) {
        console.error("Game Init Error:", e);
        alert("ゲームの初期化に失敗しました: " + e.message);
    }
};