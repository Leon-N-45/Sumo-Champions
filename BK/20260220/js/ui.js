/**
 * UIManager Class
 */
class UIManager {
    constructor(game) {
        this.game = game;
        this.els = {
            start: document.getElementById('start-screen'),
            select: document.getElementById('char-select-screen'),
            wrapper: document.getElementById('game-wrapper'),
            stage: document.getElementById('stage-container'),
            ui: document.getElementById('ui-layer'),
            call: document.getElementById('call-display'),
            res: document.getElementById('result-overlay'),
            grappleInd: document.getElementById('grapple-indicator'),
            dayOverlay: document.getElementById('day-overlay'),
            gyoji: document.getElementById('gyoji-img'),
            p1Name: document.getElementById('p1-name-disp'),
            p2Name: document.getElementById('p2-name-disp'),
            p1Wins: document.getElementById('p1-wins'),
            p2Wins: document.getElementById('p2-wins')
        };
        this.gyojiTimer = null;
        this.animTimer = null;
        // ★追加: P2用の反転アニメーションスタイルを定義
        this._injectP2Styles();
        this.initSelectScreen();
        this.inputSequence = [];
this.secretCode = ['KeyH', 'KeyI', 'KeyN', 'KeyO'];

// キー入力のリスナー
document.addEventListener('keydown', (e) => this.checkSecretInput(e));
    }

    // ★追加: P2専用のCSSアニメーションを注入するメソッド
    _injectP2Styles() {
        const style = document.createElement('style');
        style.innerHTML = `
            /* P2用：反転状態(scaleX(-1))を維持したまま脈動するアニメーション */
            /* P1の spirit-pulse と同じ変化（brightness & scale）に合わせます */
            @keyframes spirit-burning-p2-anim {
                from { transform: scaleX(-1) scale(1); filter: brightness(1); }
                to { transform: scaleX(-1) scale(1.02); filter: brightness(1.3); }
            }
            
            /* P2用：反転状態を維持したまま震えるアニメーション */
            @keyframes spirit-depressed-p2-anim {
                0% { transform: scaleX(-1) translate(0, 0); }
                25% { transform: scaleX(-1) translate(1px, -1px); }
                50% { transform: scaleX(-1) translate(-1px, 1px); }
                75% { transform: scaleX(-1) translate(1px, 1px); }
                100% { transform: scaleX(-1) translate(0, 0); }
            }

            /* クラス定義：P1と同じ box-shadow と border を適用 */
            .spirit-burning-p2 {
                box-shadow: 0 0 15px #ff4500, inset 0 0 10px #ff8c00 !important;
                border: 2px solid #ff4500 !important;
                animation: spirit-burning-p2-anim 1s infinite alternate !important;
            }
            
            .spirit-depressed-p2 {
                filter: grayscale(0.5) contrast(0.8) !important;
                animation: spirit-depressed-p2-anim 0.2s infinite !important;
            }
        `;
        document.head.appendChild(style);
    }

    showGameScreen() {
        this.els.dayOverlay.textContent = this.game.getRoundName(); 
        this.els.dayOverlay.classList.add('visible', 'instant');
        this.els.select.classList.remove('active'); 
        this.els.start.classList.remove('active');
        this.els.wrapper.style.display = 'flex';
        const p1 = this.game.p1.baseStats; const p2 = this.game.p2.baseStats;
        if(this.els.p1Name) this.els.p1Name.textContent = p1 ? p1.name : "P1";
        if(this.els.p2Name) this.els.p2Name.textContent = p2 ? p2.name : "P2";
        this.resize();
        requestAnimationFrame(() => { this.els.dayOverlay.classList.remove('instant'); });
    }

    // ... (showCharSelect, resize, getImagePath, updateControlsDisplay は省略なし) ...
    
    showCharSelect(mode) {
        if (mode === 'init') {
            this.game.state.wins = {p1:0, p2:0};
            this.game.state.current = 1;
        }
        this.els.res.classList.remove('visible'); 
        this.els.wrapper.style.display = 'none';
        this.els.start.classList.remove('active');
        this.els.select.classList.add('active');
    }

    resize() {
        if (this.els.wrapper.style.display === 'none') return;
        const baseW = 1260; const baseH = 900; 
        const winW = window.innerWidth - 60; 
        const winH = window.innerHeight - 60; 
        const scale = Math.min(winW / baseW, winH / baseH);
        
        // 戦闘画面のラッパーにスケールを適用
        this.els.wrapper.style.transform = `scale(${scale})`;
        
        // 中断メニュー、設定メニュー、確認モーダルの内側ボックスにスケールを適用
        document.querySelectorAll('.pause-box, .settings-box, .confirm-box').forEach(box => {
            box.style.transform = `scale(${scale})`;
        });

        // 追加：日付表示オーバーレイの文字サイズにスケールを適用
        if (this.els.dayOverlay) {
            // ※「8rem」の部分は、ui.cssで設定している本来の文字サイズに合わせて変更してください
            this.els.dayOverlay.style.fontSize = `calc(8rem * ${scale})`;
        }
    }

    getImagePath(filename) {
        if (!filename) return '';
        if (filename.startsWith('http') || filename.startsWith('data:')) return filename;
        return filename.includes('/') ? filename : `assets/img/${filename}`;
    }

    updateControlsDisplay() {
        if (typeof settings === 'undefined') return;
        const p1 = settings.current.controls.p1;
        const p2 = settings.current.controls.p2;
        const fmt = k => {
            const code = k.replace('Key', '');
            if (code === 'ArrowUp' || code === 'Up') return '↑';
            if (code === 'ArrowDown' || code === 'Down') return '↓';
            if (code === 'ArrowLeft' || code === 'Left') return '←';
            if (code === 'ArrowRight' || code === 'Right') return '→';
            return code;
        };
        const p1Container = document.getElementById('p1-controls');
        const p2Container = document.getElementById('p2-controls');
        if (p1Container) p1Container.innerHTML = `
            <div class="control-row"><span class="key">${fmt(p1.l)}</span> <span class="key">${fmt(p1.r)}</span> &nbsp; 移動</div>
            <div class="control-row"><span class="key">${fmt(p1.u)}</span> &nbsp; いなし</div>
            <div class="control-row"><span class="key">${fmt(p1.d)}</span> &nbsp; チャージ</div>
        `;
        if (p2Container) p2Container.innerHTML = `
            <div class="control-row">移動 &nbsp; <span class="key">${fmt(p2.l)}</span> <span class="key">${fmt(p2.r)}</span></div>
            <div class="control-row">いなし &nbsp; <span class="key">${fmt(p2.u)}</span></div>
            <div class="control-row">チャージ &nbsp; <span class="key">${fmt(p2.d)}</span></div>
        `;
    }

    resetVisuals(p1, p2) {
        if (this.animTimer) { clearTimeout(this.animTimer); this.animTimer = null; }
        document.querySelectorAll('.damage-popup, .effect-visual, .shockwave').forEach(e => e.remove());

        [p1, p2].forEach(p => {
            p.el.className = 'rikishi'; p.fallDir = null; 
            p.el.style.left = `${p.initialX}px`; p.el.style.transform = ''; 
            p.el.classList.remove('reversal-glow', 'stunned');
            if (p.dom && p.dom.bar) {
                const hpFrame = p.dom.bar.parentElement;
                if (hpFrame) {
                    hpFrame.classList.remove('spirit-burning', 'spirit-depressed');
                }
            }
            const bodyImg = p.el.querySelector('.body-img');
            if(bodyImg) bodyImg.style.transform = '';
            if(p.elHead) p.elHead.style.top = '-45px';
            if(p.initDOM) p.initDOM();
            if(p.updateSize) p.updateSize();
        });

        this.setGyojiImage('hakkeyoi');
        this.els.gyoji.classList.remove('flipped', 'gyoji-confused');
        this.els.gyoji.style.transform = 'scaleX(1)';
        this.els.call.style.display = 'none';
        this.els.grappleInd.style.display = 'none';
        void this.els.stage.offsetWidth;
    }

    draw(p1, p2) {
        this.updateBar(p1, 'p1');
        this.updateBar(p2, 'p2');
        this.updateRikishi(p1);
        this.updateRikishi(p2);
        if (this.els.p1Name) this.els.p1Name.textContent = p1.name;
        if (this.els.p2Name) this.els.p2Name.textContent = p2.name;

        // HP数値の更新処理
        const p1HpText = document.getElementById('p1-hp-text');
        const p2HpText = document.getElementById('p2-hp-text');

        if (p1HpText) {
            const cur = Math.max(0, Math.ceil(p1.stamina));
            // ▼▼▼ 修正: maxStamina ではなく initialMaxStamina を参照 ▼▼▼
            const max = Math.ceil(p1.initialMaxStamina); 
            p1HpText.textContent = `${cur} / ${max}`;
        }
        if (p2HpText) {
            const cur = Math.max(0, Math.ceil(p2.stamina));
            // ▼▼▼ 修正: 同様に initialMaxStamina を参照 ▼▼▼
            const max = Math.ceil(p2.initialMaxStamina);
            p2HpText.textContent = `${cur} / ${max}`;
        }
        // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

        // ... (ゲージの幅更新などの既存処理) ...
        this.updateRikishi(p1);
        this.updateRikishi(p2);

    }

    updateBar(p, id) {
        const hpBar = (p.dom && p.dom.bar) ? p.dom.bar : document.getElementById(`${id}-hp-bar`);
        const chBar = (p.dom && p.dom.charge) ? p.dom.charge : document.getElementById(`${id}-charge-bar`);
        if (!hpBar || !chBar) return;

        if(p.dom && p.dom.max) p.dom.max.style.display = 'none';

        const hpFrame = hpBar.parentElement;
        if (hpFrame && p.initialMaxStamina) {
            const MAX_POSSIBLE_HP = 200; 
            const widthPct = Math.min(100, (p.initialMaxStamina / MAX_POSSIBLE_HP) * 100);
            hpFrame.style.width = `${widthPct}%`;
            hpFrame.style.maxWidth = '100%';
            hpFrame.style.display = 'flex';
            hpFrame.style.justifyContent = 'flex-start'; 
            hpFrame.style.backgroundColor = '#3f3f46'; 

            // ★修正: シンプルにP2は反転させる（これでP1と完全に対称になります）
            if (id === 'p2') {
                hpFrame.style.transform = 'scaleX(-1)';
                hpFrame.style.marginLeft = 'auto'; 
            } else {
                hpFrame.style.transform = 'none';
                hpFrame.style.marginLeft = '0';
            }

            // ★修正: P2の場合は専用クラス(-p2)を付与し、反転が解除されないようにする
             hpFrame.classList.remove('spirit-burning', 'spirit-depressed', 'spirit-burning-p2', 'spirit-depressed-p2');

        if (p.spiritActive) {
            const spiritVal = p.baseStats.spirit || 5;
            let baseClass = null;

            // ★変更：パラメータ基準 (8以上 / 3以下)
            if (spiritVal >= 8) {
                baseClass = 'spirit-burning';
            } else if (spiritVal <= 3) {
                baseClass = 'spirit-depressed';
            }
            // ※ 4～7 は baseClass = null

            if (baseClass) {
                // P2なら -p2 をつけたクラス名にする
                const finalClass = (id === 'p2') ? `${baseClass}-p2` : baseClass;
                hpFrame.classList.add(finalClass);
            }
        }}

        const hpPct = (p.stamina / p.initialMaxStamina) * 100;
        const chPct = p.charge; 
        const maxPct = (p.maxStamina / p.initialMaxStamina) * 100;

        hpBar.style.width = `${Math.max(0, hpPct)}%`;
        
        if (hpPct < 30) hpBar.style.background = '#ef4444';
        else hpBar.style.background = (id==='p1' ? '#3b82f6' : '#ef4444');

        if (hpFrame) {
            // グラデーションは変えなくてOK（親ごと反転しているのでP1と同じ指定でOK）
            const colorRecoverable = '#e4e4e7'; 
            hpFrame.style.backgroundImage = `linear-gradient(to right, ${colorRecoverable} ${maxPct.toFixed(1)}%, transparent ${maxPct.toFixed(1)}%)`;
        }

        // チャージバーの反転処理
        const chFrame = chBar.parentElement;
        if(chFrame) {
            chFrame.style.display = 'flex';
            chFrame.style.justifyContent = 'flex-start';
            if(id === 'p2') {
                chFrame.style.transform = 'scaleX(-1)';
            } else {
                chFrame.style.transform = 'none';
            }
        }
        
        chBar.style.width = `${Math.max(0, chPct)}%`;
        
        const setClass = (el, cls, on) => { if(el) on ? el.classList.add(cls) : el.classList.remove(cls); };
        const isMax = chPct >= 100;
        const isLock = p.chargeLock > 0;
        const outer = p.dom && p.dom.chargeOuter;

        setClass(chBar, 'max-charge', isMax);
        setClass(outer, 'max-charge', isMax);
        setClass(chBar, 'locked', isLock);
        setClass(outer, 'locked', isLock);
    }

    updateRikishi(p) {
        p.el.style.left = `${p.x}px`;
        let classStr = 'rikishi';

        // ▼▼▼ 修正1: 敗北時に「is-defeated」と「倒れる方向」のクラスを付与 ▼▼▼
        if (p.isDefeated) {
            classStr += ' is-defeated';
            if (p.fallDir === 'left') classStr += ' fall-left';
            if (p.fallDir === 'right') classStr += ' fall-right';
        } else {
            // 通常時のステータス表示
            if(p.charge >= 100) classStr += ' charge-max'; 
        else if(p.charge >= 50) classStr += ' charge-mid'; 
        else if(p.isCharging) classStr += ' charge-active';
        
        if (p.inashiTimer > 0) classStr += ' inashi-active';
        if(p.miss > 0) classStr += ' miss-active';
        
        // ★変更：ギャクテン (Reversal) のパラメータ基準 (8以上 / 3以下)
        if(p.reversalActive && p.inashiTimer <= 0 && p.miss <= 0 && p.stun <= 0) {
            const revVal = p.baseStats.reversal || 5;
            if (revVal >= 8) {
                classStr += ' aura-yellow';
            } else if (revVal <= 3) {
                classStr += ' aura-blue';
            }
            // ※ 4～7 はクラス追加なし
        }}
        // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

        p.el.className = classStr;

        // ▼▼▼ 修正2: 敗北時(!p.isDefeated)はスタン演出（星など）を強制OFFにする ▼▼▼
        // これで「is-defeated」のグレーアウト＆回転演出が確実に優先されます。
        if (p.stun > 0 && !p.isDefeated) { 
            p.el.classList.add('stunned');
            if(p.dom && p.dom.stunMark) p.dom.stunMark.style.display = 'block';
        } else { 
            p.el.classList.remove('stunned');
            if(p.dom && p.dom.stunMark) p.dom.stunMark.style.display = 'none';
        }
        // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
    }

    triggerSlowMotion(loser, winner) {
        if (this.animTimer) clearTimeout(this.animTimer);
        loser.el.classList.remove('charge-active', 'charge-mid', 'charge-max', 'parry-active', 'miss-active', 'stunned');
        loser.isDefeated = true;
        loser.fallDir = null; 
        this.draw(this.game.p1, this.game.p2); 
        void loser.el.offsetWidth; 
        this.animTimer = setTimeout(() => {
            if (loser.x < winner.x) loser.fallDir = 'left';
            else loser.fallDir = 'right';
            this.draw(this.game.p1, this.game.p2);
            this.animTimer = null;
        }, 50);
    }
    triggerDoubleSlowMotion(p1, p2) {
        if (this.animTimer) clearTimeout(this.animTimer);
        
        // 両方のステータス表示を消してダウン状態にする
        [p1, p2].forEach(p => {
            p.el.classList.remove('charge-active', 'charge-mid', 'charge-max', 'parry-active', 'miss-active', 'stunned');
            p.isDefeated = true;
            p.fallDir = null; // 一旦方向リセット
        });
        
        this.draw(this.game.p1, this.game.p2); 
        void p1.el.offsetWidth; // リフロー強制
        
        this.animTimer = setTimeout(() => {
            // 位置関係を見て、お互い「背中側（外側）」に倒れるように設定
            if (p1.x < p2.x) {
                p1.fallDir = 'left';
                p2.fallDir = 'right';
            } else {
                p1.fallDir = 'right';
                p2.fallDir = 'left';
            }
            // 描画更新（これでCSSの回転アニメーションが適用されます）
            this.draw(this.game.p1, this.game.p2);
            this.animTimer = null;
        }, 50);
    }
    fx(a, b, type) { 
        const cx = (a.x+b.x)/2+55; 
        const y = 300; 
        if(type==='parry'){ 
            const s=document.createElement('div'); s.className='shockwave'; a.el.appendChild(s); setTimeout(()=>s.remove(),500); 
        } else { 
            const st = document.getElementById('stage'); st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake'); 
        } 
        for(let i=0; i<(type==='super'?40:15); i++){ 
            const p=document.createElement('div'); p.style.position='absolute'; p.style.width=(Math.random()*8+2)+'px'; p.style.height=p.style.width; p.style.borderRadius='50%'; 
            p.style.background=type==='parry'?'#22d3ee':(type==='super'?'#ff4500':'gold'); 
            p.style.left=cx+'px'; p.style.top=(y-50)+'px';
            p.animate([{transform:'translate(0,0) scale(1)', opacity:1}, {transform:`translate(${(Math.random()-0.5)*300}px, ${(Math.random()-0.5)*300}px) scale(0)`, opacity:0}], {duration:600, easing:'ease-out'}).onfinish=()=>p.remove(); 
            document.getElementById('stage').appendChild(p); 
        } 
    }

    startGyojiConfusion() {
        this.stopGyojiCalls(); // 通常の掛け声タイマーを止める
        if (this.els.gyoji) {
            // 回転クラスを付与
            this.els.gyoji.classList.add('gyoji-confused');
        }
    }
    
    showDamage(target, amount, type = 'normal') {
    if (amount <= 0) return; // 0以下は表示しない
    
    const el = document.createElement('div');
    el.className = `damage-popup ${type}`;
    
    // 1未満の時は小数点第一位まで、1以上は切り捨てで表示
    el.textContent = amount < 1 ? amount.toFixed(1) : Math.floor(amount);

    const randX = (Math.random() * 40) - 20;
    const randY = (Math.random() * 20) - 10;
    const x = target.x + 65 + randX; 
    const y = 200 + randY; 
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.els.stage.appendChild(el);

    // スプシの値（フレーム数）をミリ秒に変換して適用
    const durationFrames = (CONFIG.UI && CONFIG.UI.DMG_DURATION) ? CONFIG.UI.DMG_DURATION : 60;
    const durationMs = durationFrames * 16.6; 

    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-20px)';
        setTimeout(() => el.remove(), 300);
    }, durationMs);
}

    msg(p, txt, miss, parry, reversal) { 
        const d=document.createElement('div'); d.className='combo-call'; d.textContent=txt; 
        if(miss)d.classList.add('miss-call'); if(parry)d.classList.add('parry-call'); if(reversal)d.classList.add('reversal-call'); 
        p.el.appendChild(d); setTimeout(()=>d.remove(),800); 
    }

    startGyojiCalls(activeStateChecker) {
        this.stopGyojiCalls();
        let lastType = 'nokotta'; 
        let sideToggle = false; 
        const runLoop = () => {
            if (!activeStateChecker()) return; 
            let type;
            if (lastType === 'hakkeyoi') { type = 'nokotta'; } 
            else { type = Math.random() < 0.5 ? 'hakkeyoi' : 'nokotta'; }
            lastType = type;
            const text = type === 'hakkeyoi' ? 'はっけよい！' : 'のこった！';
            SoundFX.playVoice(type, 0.66);
            this.showGyojiCall(text, sideToggle ? 'right' : 'left');
            if (this.els.gyoji) {
                this.els.gyoji.classList.remove('gyoji-flip-jump');
                void this.els.gyoji.offsetWidth; 
                this.els.gyoji.classList.add('gyoji-flip-jump');
                this.els.gyoji.style.transform = sideToggle ? 'scaleX(-1)' : 'scaleX(1)'; 
            }
            sideToggle = !sideToggle;
            const minInt = (CONFIG.UI && CONFIG.UI.GYOJI_INTERVAL_MIN) ? CONFIG.UI.GYOJI_INTERVAL_MIN : 800;
const maxInt = (CONFIG.UI && CONFIG.UI.GYOJI_INTERVAL_MAX) ? CONFIG.UI.GYOJI_INTERVAL_MAX : 2500;
const nextInterval = Math.floor(Math.random() * (maxInt - minInt + 1)) + minInt;

this.gyojiTimer = setTimeout(runLoop, nextInterval); 
        };
        const minInt = (CONFIG.UI && CONFIG.UI.GYOJI_INTERVAL_MIN) ? CONFIG.UI.GYOJI_INTERVAL_MIN : 800;
const maxInt = (CONFIG.UI && CONFIG.UI.GYOJI_INTERVAL_MAX) ? CONFIG.UI.GYOJI_INTERVAL_MAX : 2500;
const firstInterval = Math.floor(Math.random() * (maxInt - minInt + 1)) + minInt;

this.gyojiTimer = setTimeout(runLoop, firstInterval); 
    }

    stopGyojiCalls() {
        if(this.gyojiTimer) { clearTimeout(this.gyojiTimer); this.gyojiTimer = null; }
        document.querySelectorAll('.gyoji-shout').forEach(el => el.remove());
        if(this.els.gyoji) {
            this.els.gyoji.classList.remove('gyoji-flip-jump');
            this.els.gyoji.style.transform = 'scaleX(1)';
        }
    }

    showGyojiCall(text, side) {
        if(!this.els.gyoji) return;
        const el = document.createElement('div');
        el.className = `gyoji-shout shout-${side}`;
        el.textContent = text;
        this.els.gyoji.parentElement.appendChild(el); 
        setTimeout(() => el.remove(), 1200); 
    }

    setGyojiImage(type) {
        if(!this.els.gyoji) return;
        if(type === 'hakkeyoi') this.els.gyoji.src = 'assets/img/gyouzi_hakkeyoi.png';
        if(type === 'nokotta') this.els.gyoji.src = 'assets/img/gyouzi_nokotta.png';
        if(type === 'syoubuari') this.els.gyoji.src = 'assets/img/gyouzi_syoubuari.png';
    }
checkSecretInput(e) {

 // 入力されたキーを配列に追加
        this.inputSequence.push(e.code);
        
        // 配列が長すぎたら先頭を削除
        if (this.inputSequence.length > this.secretCode.length) {
            this.inputSequence.shift();
        }
    
        // コマンドが一致するかチェック
        if (this.inputSequence.join(',') === this.secretCode.join(',')) {
            // ▼▼▼ 変更： unlock ではなく toggle を呼ぶ ▼▼▼
            this.toggleDreamCharacters();
            
            // 連続入力の誤作動防止のため履歴をクリア
            this.inputSequence = [];
        }
    }

unlockDreamCharacters() {
    // フラグを保存
    settings.current.dreamUnlocked = true;
    settings.save();

    // 効果音（あれば）
    if (typeof SoundFX !== 'undefined') SoundFX.playTone('reversal'); // 逆転音を流用

    // 画面上の隠しクラスを削除
    const hiddenIcons = document.querySelectorAll('.secret-hidden');
    hiddenIcons.forEach((icon, index) => {
        // 少しずつズラして表示する演出
        setTimeout(() => {
            icon.classList.remove('secret-hidden');
            icon.classList.add('secret-reveal');
        }, index * 200);
    });

    // トースト表示
    settings.showToast("ドリーム力士 解禁！");
}

toggleDreamCharacters() {
        const isUnlocking = !settings.current.dreamUnlocked;
        settings.current.dreamUnlocked = isUnlocking;
        settings.save();

        const dreamIcons = document.querySelectorAll('.cat-dream');

        // ▼▼▼ 修正：ここで SoundFX を強制的に初期化します ▼▼▼
        if (typeof SoundFX !== 'undefined') {
            // まだオーディオ機能がONになっていなければ、ここでONにする
            if (!SoundFX.ctx) SoundFX.init();
        }
        // ▲▲▲ 修正ここまで ▲▲▲

        if (isUnlocking) {
            // === 【解禁】 ===
            
            // 効果音：ジャキーン！（逆転音）
            if (typeof SoundFX !== 'undefined') SoundFX.playTone('reversal'); //

            dreamIcons.forEach((icon, index) => {
                setTimeout(() => {
                    icon.classList.remove('secret-hidden');
                    icon.classList.add('secret-reveal');
                }, index * 100);
            });

            settings.showToast("隠し力士 解禁！");

        } else {
            // === 【封印】 ===
            
            // 効果音：ブブー（ミス音）
            if (typeof SoundFX !== 'undefined') SoundFX.playTone('miss'); //

            dreamIcons.forEach((icon) => {
                icon.classList.remove('secret-reveal');
                icon.classList.add('secret-hidden');
            });

            settings.showToast("隠し力士 封印…");
        }
    }
    initSelectScreen() {
        if (typeof RIKISHI_DATA === 'undefined' || RIKISHI_DATA.length === 0) {
            setTimeout(() => this.initSelectScreen(), 500); 
            return;
        }
        const sel = document.getElementById('match-count-select');
        if(sel) {
            sel.innerHTML = '';
            for(let i=1;i<=15;i++) { const o=document.createElement('option'); o.text=i; if(i===2)o.selected=true; sel.add(o); }
        }
        const iconGrid = document.getElementById('icon-grid');
        if(!iconGrid) return;
        iconGrid.innerHTML = '';
        const gridSlots = new Array(20).fill(null);
        const unplacedChars = [];
        RIKISHI_DATA.forEach(d => {
            if (d.slot !== null && d.slot >= 0 && d.slot < 20 && gridSlots[d.slot] === null) {
                gridSlots[d.slot] = d;
            } else {
                unplacedChars.push(d); 
            }
        });
        let unplacedIdx = 0;
        for (let i = 0; i < 20; i++) {
            if (gridSlots[i] === null && unplacedIdx < unplacedChars.length) {
                gridSlots[i] = unplacedChars[unplacedIdx++];
            }
        }
        for(let i=0; i<20; i++) {
            const icon = document.createElement('div');
            const charData = gridSlots[i];
            let classes = ['char-select-icon'];
            if (charData) {
                icon.dataset.id = charData.id;
                icon.style.backgroundImage = `url('${this.getImagePath(charData.img)}')`;
                if (charData.category === "レジェンド") classes.push('cat-legend');
else if (charData.category === "ドリーム") {
    classes.push('cat-dream');
    // ★追加：まだ解禁されていなければ隠すクラスを付与
    if (!settings.current.dreamUnlocked) {
        classes.push('secret-hidden');
    }
}
else if (charData.category === "空きスロット") classes.push('cat-empty', 'inactive');
                else if (charData.category === "空きスロット") classes.push('cat-empty', 'inactive');
                const val = charData.total || 0;
                let stars = 0;
                if (val >= 80) stars = 5;
                else if (val >= 70) stars = 4;
                else if (val >= 60) stars = 3;
                else if (val >= 50) stars = 2;
                else if (val >= 40) stars = 1;
                if (stars > 0) {
                    const starDiv = document.createElement('div');
                    starDiv.className = 'icon-stars-container';
                    for(let k=0; k<stars; k++){
                        const s = document.createElement('img'); 
                        s.src = 'assets/img/kinboshi.png';
                        s.className = 'star-img';
                        s.style.animationDelay = (k * 0.2) + 's';
                        starDiv.appendChild(s);
                    }
                    icon.appendChild(starDiv);
                }
            } else { 
                classes.push('inactive'); 
            }
            icon.className = classes.join(' ');
            iconGrid.appendChild(icon);
        }
        this.updatePreview('p1', null); this.updatePreview('p2', null);
        this.initDraggableIcons();
    }

    initDraggableIcons() {
        const ghost = document.getElementById('drag-ghost');
        let isDragging = false; let dragId = null; let dragSource = null;
        
        document.addEventListener('mousedown', (e) => {
            const icon = e.target.closest('.char-select-icon');
            if (icon) {
                /* ▼▼▼ 修正1：ここに || icon.classList.contains('secret-hidden') を追加 ▼▼▼ */
                // これで「隠れているアイコン」をつかもうとしても、即座に return され、ゴーストも出なくなります
                if (icon.classList.contains('inactive') || icon.classList.contains('secret-hidden') || !icon.hasAttribute('data-id')) return;
                
                e.preventDefault(); isDragging = true; dragId = parseInt(icon.dataset.id); dragSource = 'icon';
                ghost.style.backgroundImage = icon.style.backgroundImage; ghost.style.display = 'block'; 
                this.moveGhost(ghost, e.clientX, e.clientY); return;
            }
            const head = e.target.closest('.preview-char-img .head');
            if (head) {
                const box = head.closest('.preview-box'); if (!box) return;
                const pId = box.id === 'preview-p1' ? 'p1' : 'p2'; 
                const charId = this.game.state.chars[pId]; if (charId === null) return;
                e.preventDefault(); isDragging = true; dragId = charId; dragSource = pId;
                const charData = RIKISHI_DATA.find(d => d.id === charId);
                ghost.style.backgroundImage = `url('${charData ? this.getImagePath(charData.img) : ""}')`; 
                ghost.style.display = 'block';
                head.classList.add('dragging-source'); this.moveGhost(ghost, e.clientX, e.clientY);
            }
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return; 
            e.preventDefault(); this.moveGhost(ghost, e.clientX, e.clientY);
            const p1Box = document.getElementById('preview-p1'); const p2Box = document.getElementById('preview-p2');
            const rect1 = p1Box.getBoundingClientRect(); const rect2 = p2Box.getBoundingClientRect();
            p1Box.classList.remove('drag-hover'); p2Box.classList.remove('drag-hover');
            if (this.isHit(e.clientX, e.clientY, rect1)) p1Box.classList.add('drag-hover');
            else if (this.isHit(e.clientX, e.clientY, rect2)) p2Box.classList.add('drag-hover');
        });
        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return; 
            isDragging = false; ghost.style.display = 'none';
            document.querySelectorAll('.preview-char-img .head').forEach(el => el.classList.remove('dragging-source'));
            const p1Box = document.getElementById('preview-p1'); const p2Box = document.getElementById('preview-p2');
            p1Box.classList.remove('drag-hover'); p2Box.classList.remove('drag-hover');
            const rect1 = p1Box.getBoundingClientRect(); const rect2 = p2Box.getBoundingClientRect();
            const hitP1 = this.isHit(e.clientX, e.clientY, rect1); const hitP2 = this.isHit(e.clientX, e.clientY, rect2);
            let hitIconID = null;
            const icons = document.querySelectorAll('.char-select-icon:not(.inactive):not(.secret-hidden)');
            
            for(let ic of icons) { const r = ic.getBoundingClientRect(); if(this.isHit(e.clientX, e.clientY, r)) { hitIconID = parseInt(ic.dataset.id); break; } }
            if (hitP1) { 
                this.game.selectChar('p1', dragId); 
                if (dragSource === 'p2') this.game.selectChar('p2', null); 
            } 
            else if (hitP2) { 
                this.game.selectChar('p2', dragId); 
                if (dragSource === 'p1') this.game.selectChar('p1', null); 
            }
            else if (hitIconID !== null && (dragSource === 'p1' || dragSource === 'p2')) { 
                this.game.selectChar(dragSource, hitIconID); 
            }
            else if (dragSource === 'p1' || dragSource === 'p2') { 
                this.game.selectChar(dragSource, null); 
            }
        });
    }
    moveGhost(ghost, x, y) { ghost.style.left = x + 'px'; ghost.style.top = y + 'px'; }
    isHit(x, y, rect) { return (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom); }

    updatePreview(playerId, charId) {
        const container = document.getElementById(`preview-${playerId}`);
        let isCPU = false;
        let cpuLevel = 3; 
        const toggleEl = document.getElementById(`cpu-toggle-${playerId}`);
        const levelEl = document.getElementById(`cpu-level-${playerId}`);
        if(toggleEl) isCPU = toggleEl.checked;
        if(levelEl) cpuLevel = parseInt(levelEl.value);
        let imgName = playerId === 'p1' ? 'assets/img/rikiship1.png' : 'assets/img/rikiship2.png'; 
        if(isCPU) imgName = 'assets/img/rikishiCPU.png'; 
        const checked = isCPU ? 'checked' : '';
        const levelStyle = isCPU ? 'display:inline-block;' : 'display:none;';
        const levels = [
            {v:7, l:"横綱"}, {v:6, l:"大関"}, {v:5, l:"関脇"}, 
            {v:4, l:"小結"}, {v:3, l:"前頭"}, {v:2, l:"十両"}, {v:1, l:"幕下"}
        ];
        let options = levels.map(L => `<option value="${L.v}" ${L.v === cpuLevel ? 'selected' : ''}>${L.l}</option>`).join('');
        let switchHtml = `
            <div class="cpu-switch-container" style="flex-direction:column; gap:5px;">
                <div style="display:flex; align-items:center;">
                    <label class="switch">
                        <input type="checkbox" id="cpu-toggle-${playerId}" onchange="game.toggleP${playerId === 'p1' ? '1' : '2'}CPU(this.checked)" ${checked}>
                        <span class="slider round"></span>
                    </label>
                    <span style="margin-left: 10px; font-weight: bold; font-size: 1.1rem;">CPU</span>
                </div>
                <select id="cpu-level-${playerId}" class="custom-select" style="${levelStyle} font-size:1.1rem; padding:2px 25px 2px 10px; width:100%; margin-top:5px;">
                    ${options}
                </select>
            </div>`;
        const typeMap = { "バランスタイプ": "dock-balance", "テクニックタイプ": "dock-tech", "パワータイプ": "dock-power", "スピードタイプ": "dock-speed" };
        let dockClass = ''; let charData = null;
        if (charId !== null) {
            charData = RIKISHI_DATA.find(d => d.id === charId);
            if(charData) { const type = charData.desc; dockClass = typeMap[type] || 'dock-balance'; }
        }
        const selectedClass = (charId !== null) ? 'is-selected' : '';
        let physiqueClass = '';
        if(charData) { physiqueClass = 'physique-' + (charData.physique || 3); }
        let headStyle = 'display:none;';
        if (charId !== null && charData) {
            headStyle = `background-image:url('${this.getImagePath(charData.img)}');`;
        }
        let bodyAnimStyle = '';
        let bodyImgStyle = '';
        if (charId !== null && charData) {
            const spd = charData.speed || 5;
            const duration = Math.max(0.4, 5.0 - (spd * 0.45)); 
            bodyAnimStyle = `style="animation-duration: ${duration.toFixed(2)}s;"`;
            let scaleX = 1.0;
            let scaleY = 1.0;
            const phys = charData.physique || 3;
            if(phys === 1) scaleX = 0.75; 
            if(phys === 2) scaleX = 0.88; 
            if(phys === 3) scaleX = 1.0; 
            if(phys === 4) scaleX = 1.20; 
            if(phys === 5) scaleX = 1.45;
            if(phys === 1) scaleY = 0.80;
            if(phys === 2) scaleY = 0.85;
            if(phys === 3) scaleY = 0.90;
            if(phys === 4) scaleY = 0.95;
            if(phys === 5) scaleY = 1.00;
            bodyImgStyle = `style="transform: scale(${scaleX}, ${scaleY}); transform-origin: bottom center;"`;
            const preBaseH = 280;
            const preBaseTop = -45;
            const preGap = preBaseH * (1 - scaleY);
            headStyle += `top: ${preBaseTop + preGap}px;`;
        }
        let html = `${switchHtml}<div class="preview-char-img ${dockClass} ${selectedClass} ${physiqueClass}"><div class="rikishi-body" ${bodyAnimStyle}><img src="${imgName}" class="body-img" ${bodyImgStyle}><div class="head" style="${headStyle}"></div></div></div>`;
        if (charId === null) { 
            html += `<div class="preview-info"><div style="font-size:1.5rem; color:#888; margin-top:20px; font-weight:bold;">未選択<br><span style="font-size:1rem; font-weight:normal;">顔をドラッグして体に乗せてください</span></div></div>`; 
        } 
        else if(charData) {
            const d = charData;
            const colorVal = (v) => { if(v >= 8) return `<span class="stat-high">${v}</span>`; if(v <= 3) return `<span class="stat-low">${v}</span>`; return v; };
            const typeName = d.desc.replace('タイプ', '');
            const aiName = d.aiType || '素直';
            html += `<div class="preview-info"><div class="preview-name">${d.name}</div><div class="preview-type" style="font-size:1.1rem;">タイプ：${typeName}　思考：${aiName}</div><div class="preview-stat-grid"><div class="stat-row"><span>チカラ</span><span>${colorVal(d.power)}</span></div><div class="stat-row"><span>タイリョク</span><span>${colorVal(d.stamina)}</span></div><div class="stat-row"><span>ギジュツ</span><span>${colorVal(d.tech)}</span></div><div class="stat-row"><span>キモチ</span><span>${colorVal(d.spirit)}</span></div><div class="stat-row"><span>ハヤサ</span><span>${colorVal(d.speed)}</span></div><div class="stat-row"><span>ギャクテン</span><span>${colorVal(d.reversal)}</span></div></div>`;
            html += `<div class="dosukoi-power-container"><img src="assets/img/dosukoipower.png" alt="どすこいパワー" class="dosukoi-label-img"><span class="dosukoi-value">${d.total || 0}</span></div></div>`;
        }
        container.innerHTML = html;
    }
}