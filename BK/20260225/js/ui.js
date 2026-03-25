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
        this.bgmToastTimer = null; // BGMトースト用タイマー

        this._injectP2Styles();
        this.initSelectScreen();
        this.inputSequence = [];
        this.secretCode = ['KeyH', 'KeyI', 'KeyN', 'KeyO'];

        document.addEventListener('keydown', (e) => this.checkSecretInput(e));
        document.addEventListener('keydown', (e) => this.highlightKey(e.code, true));
        document.addEventListener('keyup', (e) => this.highlightKey(e.code, false));
        this.resize();
    }

    _injectP2Styles() {
        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes spirit-burning-p2-anim {
                from { transform: scaleX(-1) scale(1); filter: brightness(1); }
                to { transform: scaleX(-1) scale(1.02); filter: brightness(1.3); }
            }
            @keyframes spirit-depressed-p2-anim {
                0% { transform: scaleX(-1) translate(0, 0); }
                25% { transform: scaleX(-1) translate(1px, -1px); }
                50% { transform: scaleX(-1) translate(-1px, 1px); }
                75% { transform: scaleX(-1) translate(1px, 1px); }
                100% { transform: scaleX(-1) translate(0, 0); }
            }
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

        const p1 = this.game.p1.baseStats;
        const p2 = this.game.p2.baseStats;

        if (this.els.p1Name) this.els.p1Name.textContent = p1 ? p1.name : "P1";
        if (this.els.p2Name) this.els.p2Name.textContent = p2 ? p2.name : "P2";

        const p1CtrlName = document.getElementById('p1-control-name');
        if (p1CtrlName) p1CtrlName.textContent = p1 ? p1.name : "P1";

        const p2CtrlName = document.getElementById('p2-control-name');
        if (p2CtrlName) p2CtrlName.textContent = p2 ? p2.name : "P2";

        this.resize();
        requestAnimationFrame(() => { this.els.dayOverlay.classList.remove('instant'); });
    }

    showCharSelect(mode) {
        if (mode === 'init') {
            this.game.state.wins = { p1: 0, p2: 0 };
            this.game.state.current = 1;
        }
        this.els.res.classList.remove('visible');
        this.els.wrapper.style.display = 'none';
        this.els.start.classList.remove('active');
        this.els.select.classList.add('active');
    }

    resize() {
        const baseW = 1260; const baseH = 900;
        const winW = window.innerWidth - 60;
        const winH = window.innerHeight - 60;
        const scale = Math.min(winW / baseW, winH / baseH);
        const uiScale = Math.min(scale, 1.0);

        this.els.wrapper.style.transform = `scale(${scale})`;

        const startWrapper = document.getElementById('start-content-wrapper');
        if (startWrapper) startWrapper.style.transform = `translate(-50%, -50%) scale(${scale})`;

        const selectWrapper = document.getElementById('select-scaling-wrapper');
        if (selectWrapper) selectWrapper.style.transform = `translate(-50%, -50%) scale(${scale})`;

        document.querySelectorAll('.pause-box, .settings-scale-wrapper, .confirm-box, .modal-window').forEach(box => {
            box.style.transform = `scale(${uiScale})`;
        });

        if (this.els.dayOverlay) this.els.dayOverlay.style.fontSize = `calc(8rem * ${scale})`;

        const footer = document.querySelector('.version-info');
        if (footer) {
            footer.style.transform = `scale(${uiScale})`;
            footer.style.transformOrigin = 'bottom center';
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
            <div class="control-layout p1-layout">
                <div class="key-visual-grid">
                    <div class="key-row-top"><span class="key block-key" data-code="${p1.u}">${fmt(p1.u)}</span></div>
                    <div class="key-row-bottom">
                        <span class="key block-key" data-code="${p1.l}">${fmt(p1.l)}</span>
                        <span class="key block-key" data-code="${p1.d}">${fmt(p1.d)}</span>
                        <span class="key block-key" data-code="${p1.r}">${fmt(p1.r)}</span>
                    </div>
                </div>
                <div class="key-desc-list">
                    <div><span class="key-area"><span class="key mini-key">${fmt(p1.u)}</span></span> いなし</div>
                    <div><span class="key-area"><span class="key mini-key">${fmt(p1.d)}</span></span> 溜め</div>
                    <div><span class="key-area"><span class="key mini-key">${fmt(p1.l)}</span><span class="key mini-key">${fmt(p1.r)}</span></span> 移動</div>
                </div>
            </div>
        `;

        if (p2Container) p2Container.innerHTML = `
            <div class="control-layout p2-layout">
                <div class="key-desc-list">
                    <div><span class="key-area"><span class="key mini-key">${fmt(p2.u)}</span></span> いなし</div>
                    <div><span class="key-area"><span class="key mini-key">${fmt(p2.d)}</span></span> 溜め</div>
                    <div><span class="key-area"><span class="key mini-key">${fmt(p2.l)}</span><span class="key mini-key">${fmt(p2.r)}</span></span> 移動</div>
                </div>
                <div class="key-visual-grid">
                    <div class="key-row-top"><span class="key block-key" data-code="${p2.u}">${fmt(p2.u)}</span></div>
                    <div class="key-row-bottom">
                        <span class="key block-key" data-code="${p2.l}">${fmt(p2.l)}</span>
                        <span class="key block-key" data-code="${p2.d}">${fmt(p2.d)}</span>
                        <span class="key block-key" data-code="${p2.r}">${fmt(p2.r)}</span>
                    </div>
                </div>
            </div>
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
            if (bodyImg) bodyImg.style.transform = '';
            if (p.elHead) p.elHead.style.top = '-45px';
            if (p.initDOM) p.initDOM();
            if (p.updateSize) p.updateSize();
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

        const p1HpText = document.getElementById('p1-hp-text');
        const p2HpText = document.getElementById('p2-hp-text');

        if (p1HpText) {
            const cur = Math.max(0, Math.ceil(p1.stamina));
            const max = Math.ceil(p1.initialMaxStamina);
            p1HpText.textContent = `${cur} / ${max}`;
        }
        if (p2HpText) {
            const cur = Math.max(0, Math.ceil(p2.stamina));
            const max = Math.ceil(p2.initialMaxStamina);
            p2HpText.textContent = `${cur} / ${max}`;
        }
    }

    updateBar(p, id) {
        const hpBar = (p.dom && p.dom.bar) ? p.dom.bar : document.getElementById(`${id}-hp-bar`);
        const chBar = (p.dom && p.dom.charge) ? p.dom.charge : document.getElementById(`${id}-charge-bar`);
        if (!hpBar || !chBar) return;

        if (p.dom && p.dom.max) p.dom.max.style.display = 'none';

        const hpFrame = hpBar.parentElement;
        if (hpFrame && p.initialMaxStamina) {
            const MAX_POSSIBLE_HP = 200;
            const widthPct = Math.min(100, (p.initialMaxStamina / MAX_POSSIBLE_HP) * 100);
            hpFrame.style.width = `${widthPct}%`;
            hpFrame.style.maxWidth = '100%';
            hpFrame.style.display = 'flex';
            hpFrame.style.justifyContent = 'flex-start';
            hpFrame.style.backgroundColor = '#3f3f46';

            if (id === 'p2') {
                hpFrame.style.transform = 'scaleX(-1)';
                hpFrame.style.marginLeft = 'auto';
            } else {
                hpFrame.style.transform = 'none';
                hpFrame.style.marginLeft = '0';
            }

            hpFrame.classList.remove('spirit-burning', 'spirit-depressed', 'spirit-burning-p2', 'spirit-depressed-p2');

            if (p.spiritActive) {
                const spiritVal = p.baseStats.spirit || 5;
                let baseClass = null;

                if (spiritVal >= 8) baseClass = 'spirit-burning';
                else if (spiritVal <= 3) baseClass = 'spirit-depressed';

                if (baseClass) {
                    const finalClass = (id === 'p2') ? `${baseClass}-p2` : baseClass;
                    hpFrame.classList.add(finalClass);
                }
            }
        }

        const hpPct = (p.stamina / p.initialMaxStamina) * 100;
        const chPct = p.charge;
        const maxPct = (p.maxStamina / p.initialMaxStamina) * 100;

        hpBar.style.width = `${Math.max(0, hpPct)}%`;

        if (hpPct < 30) hpBar.style.background = '#ef4444';
        else hpBar.style.background = (id === 'p1' ? '#3b82f6' : '#ef4444');

        if (hpFrame) {
            const colorRecoverable = '#e4e4e7';
            hpFrame.style.backgroundImage = `linear-gradient(to right, ${colorRecoverable} ${maxPct.toFixed(1)}%, transparent ${maxPct.toFixed(1)}%)`;
        }

        const chFrame = chBar.parentElement;
        if (chFrame) {
            chFrame.style.display = 'flex';
            chFrame.style.justifyContent = 'flex-start';
            if (id === 'p2') chFrame.style.transform = 'scaleX(-1)';
            else chFrame.style.transform = 'none';
        }

        chBar.style.width = `${Math.max(0, chPct)}%`;

        const setClass = (el, cls, on) => { if (el) on ? el.classList.add(cls) : el.classList.remove(cls); };
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

        if (p.isDefeated) {
            classStr += ' is-defeated';
            if (p.fallDir === 'left') classStr += ' fall-left';
            if (p.fallDir === 'right') classStr += ' fall-right';
        } else {
            if (p.charge >= 100) classStr += ' charge-max';
            else if (p.charge >= 50) classStr += ' charge-mid';
            else if (p.isCharging) classStr += ' charge-active';

            if (p.inashiTimer > 0) classStr += ' inashi-active';
            if (p.miss > 0) classStr += ' miss-active';

            if (p.reversalActive && p.inashiTimer <= 0 && p.miss <= 0 && p.stun <= 0) {
                const revVal = p.baseStats.reversal || 5;
                if (revVal >= 8) classStr += ' aura-yellow';
                else if (revVal <= 3) classStr += ' aura-blue';
            }
        }

        p.el.className = classStr;

        if (p.stun > 0 && !p.isDefeated) {
            p.el.classList.add('stunned');
            if (p.dom && p.dom.stunMark) p.dom.stunMark.style.display = 'block';
        } else {
            p.el.classList.remove('stunned');
            if (p.dom && p.dom.stunMark) p.dom.stunMark.style.display = 'none';
        }
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

        [p1, p2].forEach(p => {
            p.el.classList.remove('charge-active', 'charge-mid', 'charge-max', 'parry-active', 'miss-active', 'stunned');
            p.isDefeated = true;
            p.fallDir = null;
        });

        this.draw(this.game.p1, this.game.p2);
        void p1.el.offsetWidth;

        this.animTimer = setTimeout(() => {
            if (p1.x < p2.x) {
                p1.fallDir = 'left';
                p2.fallDir = 'right';
            } else {
                p1.fallDir = 'right';
                p2.fallDir = 'left';
            }
            this.draw(this.game.p1, this.game.p2);
            this.animTimer = null;
        }, 50);
    }

    fx(a, b, type) {
        const cx = (a.x + b.x) / 2 + 55;
        const y = 300;
        if (type === 'parry') {
            const s = document.createElement('div'); s.className = 'shockwave'; a.el.appendChild(s); setTimeout(() => s.remove(), 500);
        } else {
            const st = document.getElementById('stage');
            st.classList.remove('shake');
            void st.offsetWidth;
            st.classList.add('shake');

            const toast = document.getElementById('bgm-toast');
            if (toast && toast.classList.contains('show')) {
                toast.classList.remove('shake');
                void toast.offsetWidth;
                toast.classList.add('shake');
            }
        }
        for (let i = 0; i < (type === 'super' ? 40 : 15); i++) {
            const p = document.createElement('div'); p.style.position = 'absolute'; p.style.width = (Math.random() * 8 + 2) + 'px'; p.style.height = p.style.width; p.style.borderRadius = '50%';
            p.style.background = type === 'parry' ? '#22d3ee' : (type === 'super' ? '#ff4500' : 'gold');
            p.style.left = cx + 'px'; p.style.top = (y - 50) + 'px';
            p.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 300}px, ${(Math.random() - 0.5) * 300}px) scale(0)`, opacity: 0 }], { duration: 600, easing: 'ease-out' }).onfinish = () => p.remove();
            document.getElementById('stage').appendChild(p);
        }
    }

    startGyojiConfusion() {
        this.stopGyojiCalls();
        if (this.els.gyoji) {
            this.els.gyoji.classList.add('gyoji-confused');
        }
    }

    showDamage(target, amount, type = 'normal') {
        if (amount <= 0) return;

        const el = document.createElement('div');
        el.className = `damage-popup ${type}`;

        el.textContent = amount < 1 ? amount.toFixed(1) : Math.floor(amount);

        const randX = (Math.random() * 40) - 20;
        const randY = (Math.random() * 20) - 10;
        const x = target.x + 65 + randX;
        const y = 200 + randY;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        this.els.stage.appendChild(el);

        const durationFrames = (CONFIG.UI && CONFIG.UI.DMG_DURATION) ? CONFIG.UI.DMG_DURATION : 60;
        const durationMs = durationFrames * 16.6;

        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-20px)';
            setTimeout(() => el.remove(), 300);
        }, durationMs);
    }

    showBGMToast(trackName) {
        const toast = document.getElementById('bgm-toast');
        const nameSpan = document.getElementById('bgm-name');
        if (!toast || !nameSpan) return;

        nameSpan.textContent = trackName;
        toast.classList.add('show');

        if (this.bgmToastTimer) clearTimeout(this.bgmToastTimer);
        this.bgmToastTimer = setTimeout(() => {
            toast.classList.remove('show');
            this.bgmToastTimer = null;
        }, 5000);
    }

    msg(p, txt, miss, parry, reversal) {
        const d = document.createElement('div'); d.className = 'combo-call'; d.textContent = txt;
        if (miss) d.classList.add('miss-call'); if (parry) d.classList.add('parry-call'); if (reversal) d.classList.add('reversal-call');
        p.el.appendChild(d); setTimeout(() => d.remove(), 800);
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
        if (this.gyojiTimer) { clearTimeout(this.gyojiTimer); this.gyojiTimer = null; }
        document.querySelectorAll('.gyoji-shout').forEach(el => el.remove());
        if (this.els.gyoji) {
            this.els.gyoji.classList.remove('gyoji-flip-jump');
            this.els.gyoji.style.transform = 'scaleX(1)';
        }
    }

    showGyojiCall(text, side) {
        if (!this.els.gyoji) return;
        const el = document.createElement('div');
        el.className = `gyoji-shout shout-${side}`;
        el.textContent = text;
        this.els.gyoji.parentElement.appendChild(el);
        setTimeout(() => el.remove(), 1200);
    }

    setGyojiImage(type) {
        if (!this.els.gyoji) return;
        if (type === 'hakkeyoi') this.els.gyoji.src = 'assets/img/gyouzi_hakkeyoi.png';
        if (type === 'nokotta') this.els.gyoji.src = 'assets/img/gyouzi_nokotta.png';
        if (type === 'syoubuari') this.els.gyoji.src = 'assets/img/gyouzi_syoubuari.png';
    }

    checkSecretInput(e) {
        this.inputSequence.push(e.code);
        if (this.inputSequence.length > this.secretCode.length) {
            this.inputSequence.shift();
        }
        if (this.inputSequence.join(',') === this.secretCode.join(',')) {
            this.toggleDreamCharacters();
            this.inputSequence = [];
        }
    }

    toggleDreamCharacters() {
        const isUnlocking = !settings.current.dreamUnlocked;
        settings.current.dreamUnlocked = isUnlocking;
        settings.save();

        const dreamIcons = document.querySelectorAll('.cat-dream');
        if (typeof SoundFX !== 'undefined') {
            if (!SoundFX.ctx) SoundFX.init();
        }

        if (isUnlocking) {
            if (typeof SoundFX !== 'undefined') SoundFX.playTone('reversal');
            dreamIcons.forEach((icon, index) => {
                setTimeout(() => {
                    icon.classList.remove('secret-hidden');
                    icon.classList.add('secret-reveal');
                }, index * 100);
            });
            settings.showToast("隠し力士 解禁！");
        } else {
            if (typeof SoundFX !== 'undefined') SoundFX.playTone('miss');
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
        if (sel) {
            sel.innerHTML = '';
            for (let i = 1; i <= 15; i++) { const o = document.createElement('option'); o.text = i; if (i === 2) o.selected = true; sel.add(o); }
        }

        const iconGrid = document.getElementById('icon-grid');
        if (!iconGrid) return;
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
        for (let i = 0; i < 20; i++) {
            const icon = document.createElement('div');
            const charData = gridSlots[i];
            let classes = ['char-select-icon'];
            if (charData) {
                icon.dataset.id = charData.id;
                let bgFile = '';
                const isLegend = (charData.category === "レジェンド");

                if (charData.desc.includes('パワー')) bgFile = isLegend ? 'chikara2_bg.png' : 'chikara1_bg.png';
                else if (charData.desc.includes('スピード')) bgFile = isLegend ? 'hayasa2_bg.png' : 'hayasa1_bg.png';
                else if (charData.desc.includes('テクニック')) bgFile = isLegend ? 'gizyutu2_bg.png' : 'gizyutu1_bg.png';
                else if (charData.desc.includes('バランス')) bgFile = isLegend ? 'baransu2_bg.png' : 'baransu1_bg.png';

                if (bgFile) {
                    const faceImg = this.getImagePath(charData.img);
                    const bgImg = `assets/img/${bgFile}`;
                    icon.style.backgroundImage = `url('${faceImg}'), url('${bgImg}')`;
                    icon.style.backgroundPosition = 'center, center';
                    icon.style.backgroundSize = 'contain, cover';
                    icon.style.backgroundRepeat = 'no-repeat, no-repeat';
                } else {
                    icon.style.backgroundImage = `url('${this.getImagePath(charData.img)}')`;
                }

                if (charData.category === "レジェンド") {
                    classes.push('cat-legend');
                    icon.style.backgroundColor = '#ffffff';
                }
                else if (charData.category === "ドリーム") {
                    classes.push('cat-dream');
                    icon.style.backgroundColor = '#ffffff';
                    if (!settings.current.dreamUnlocked) classes.push('secret-hidden');
                }
                else if (charData.category === "空きスロット") {
                    classes.push('cat-empty', 'inactive');
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
                if (icon.classList.contains('inactive') || icon.classList.contains('secret-hidden') || !icon.hasAttribute('data-id')) return;
                e.preventDefault(); isDragging = true; dragId = parseInt(icon.dataset.id); dragSource = 'icon';
                const charData = RIKISHI_DATA.find(d => d.id === dragId);
                ghost.style.backgroundImage = `url('${charData ? this.getImagePath(charData.img) : ""}')`;
                ghost.style.display = 'block';
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

            for (let ic of icons) { const r = ic.getBoundingClientRect(); if (this.isHit(e.clientX, e.clientY, r)) { hitIconID = parseInt(ic.dataset.id); break; } }
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
        if (!container) return;

        container.classList.remove('cat-legend', 'cat-dream');

        let isCPU = false;
        let cpuLevel = 3;
        const toggleEl = document.getElementById(`cpu-toggle-${playerId}`);
        const levelEl = document.getElementById(`cpu-level-${playerId}`);
        if (toggleEl) isCPU = toggleEl.checked;
        if (levelEl) cpuLevel = parseInt(levelEl.value);

        let imgName = playerId === 'p1' ? 'assets/img/rikiship1.png' : 'assets/img/rikiship2.png';
        if (isCPU) imgName = 'assets/img/rikishiCPU.png';

        const checked = isCPU ? 'checked' : '';
        const levelStyle = isCPU ? 'display:block;' : 'display:none;';

        const levels = [
            { v: 7, l: "横綱" }, { v: 6, l: "大関" }, { v: 5, l: "関脇" },
            { v: 4, l: "小結" }, { v: 3, l: "前頭" }, { v: 2, l: "十両" }, { v: 1, l: "幕下" }
        ];
        let options = levels.map(L => `<option value="${L.v}" ${L.v === cpuLevel ? 'selected' : ''}>${L.l}</option>`).join('');

        let switchHtml = `
            <div class="cpu-switch-container ${playerId}-switch">
                <div class="switch-wrapper">
                    <span class="player-label-text">Player</span>
                    <label class="switch">
                        <input type="checkbox" id="cpu-toggle-${playerId}" onchange="game.toggleP${playerId === 'p1' ? '1' : '2'}CPU(this.checked)" ${checked}>
                        <span class="slider round"></span>
                    </label>
                    <span class="cpu-label-text">CPU</span>
                </div>
                <select id="cpu-level-${playerId}" class="custom-select" style="${levelStyle}">
                    ${options}
                </select>
            </div>`;

        const controlText = isCPU ? 'CPU' : playerId.toUpperCase();

        const typeMap = { "バランスタイプ": "dock-balance", "テクニックタイプ": "dock-tech", "パワータイプ": "dock-power", "スピードタイプ": "dock-speed" };
        let dockClass = '';
        let charData = null;
        let bgHtml = '';
        let typeIconHtml = '';
        let dockFaceHtml = '';

        if (charId !== null) {
            charData = RIKISHI_DATA.find(d => d.id === charId);
            if (charData) {
                if (charData.category === "レジェンド") container.classList.add('cat-legend');
                else if (charData.category === "ドリーム") container.classList.add('cat-dream');

                const type = charData.desc;
                dockClass = typeMap[type] || 'dock-balance';

                let bgFile = '';
                const isLegend = (charData.category === "レジェンド");
                let typeImgFile = 'TypeBalance.png';

                if (charData.desc.includes('パワー')) { bgFile = isLegend ? 'chikara2_bg.png' : 'chikara1_bg.png'; typeImgFile = 'TypePower.png'; }
                else if (charData.desc.includes('スピード')) { bgFile = isLegend ? 'hayasa2_bg.png' : 'hayasa1_bg.png'; typeImgFile = 'TypeSpeed.png'; }
                else if (charData.desc.includes('テクニック')) { bgFile = isLegend ? 'gizyutu2_bg.png' : 'gizyutu1_bg.png'; typeImgFile = 'TypeTech.png'; }
                else if (charData.desc.includes('バランス')) { bgFile = isLegend ? 'baransu2_bg.png' : 'baransu1_bg.png'; typeImgFile = 'TypeBalance.png'; }

                typeIconHtml = `<img src="assets/img/${typeImgFile}" class="type-kanji-icon" alt="${type}">`;
                if (bgFile) bgHtml = `<div class="char-background" style="background-image: url('assets/img/${bgFile}');"></div>`;
            }
        } else {
            const syncOffset = (performance.now() % 2000) / 1000;
            dockFaceHtml = `<div class="empty-dock-face" style="animation: dock-blink 2s ease-in-out -${syncOffset}s infinite;"></div>`;
        }

        const selectedClass = (charId !== null) ? 'is-selected' : '';
        let physiqueClass = '';
        if (charData) { physiqueClass = 'physique-' + (charData.physique || 3); }

        let headStyle = 'display:none;';
        if (charId !== null && charData) {
            const src = this.getImagePath ? this.getImagePath(charData.img) : `assets/img/${charData.img}`;
            headStyle = `background-image:url('${src}');`;
        }

        let bodyAnimStyle = '';
        let bodyImgStyle = '';
        if (charId !== null && charData) {
            const spd = charData.speed || 5;
            const duration = Math.max(0.4, 5.0 - (spd * 0.45));
            bodyAnimStyle = `style="animation-duration: ${duration.toFixed(2)}s;"`;

            let scaleX = 1.0; let scaleY = 1.0;
            const phys = charData.physique || 3;
            if (phys === 1) { scaleX = 0.75; scaleY = 0.80; }
            if (phys === 2) { scaleX = 0.88; scaleY = 0.85; }
            if (phys === 3) { scaleX = 1.00; scaleY = 0.90; }
            if (phys === 4) { scaleX = 1.20; scaleY = 0.95; }
            if (phys === 5) { scaleX = 1.45; scaleY = 1.00; }

            bodyImgStyle = `style="transform: scale(${scaleX}, ${scaleY}); transform-origin: bottom center;"`;
            const preBaseH = 280; const preBaseTop = -45; const preGap = preBaseH * (1 - scaleY);
            headStyle += `top: ${preBaseTop + preGap}px;`;
        }

        const size = 100; const center = size / 2; const maxR = 40;
        let points = [0, 1, 2, 3, 4, 5].map(() => `${center},${center}`).join(' ');

        if (charData) {
            const stats = [charData.power, charData.tech, charData.speed, charData.stamina, charData.spirit, charData.reversal];
            points = stats.map((val, i) => {
                const angle = (Math.PI * 2 / 6) * i - (Math.PI / 2);
                const r = (val / 10) * maxR;
                const x = center + r * Math.cos(angle);
                const y = center + r * Math.sin(angle);
                return `${x},${y}`;
            }).join(' ');
        }

        let radarHtml = `
            <div class="radar-chart-container">
                <svg viewBox="0 0 ${size} ${size}" class="radar-svg">
                    <polygon points="${this._getHexPoints(center, maxR)}" class="radar-guide" />
                    ${[0, 1, 2, 3, 4, 5].map(i => {
            const angle = (Math.PI * 2 / 6) * i - (Math.PI / 2);
            return `<line x1="${center}" y1="${center}" x2="${center + maxR * Math.cos(angle)}" y2="${center + maxR * Math.sin(angle)}" class="radar-axis" />`;
        }).join('')}
                    <polygon points="${points}" class="radar-poly" />
                    <polygon points="${this._getHexPoints(center, maxR * 0.5)}" class="radar-guide-mid" />
                </svg>
            </div>`;

        let html = `${switchHtml}
        ${dockFaceHtml}
        <div class="preview-char-img ${selectedClass} ${physiqueClass}">
            ${typeIconHtml}
            ${bgHtml}
            <div class="anim-wrapper ${dockClass}">
                <div class="rikishi-body" ${bodyAnimStyle}>
                    <img src="${imgName}" class="body-img" ${bodyImgStyle}>
                    <div class="head" style="${headStyle}"></div>
                </div>
            </div>
        </div>`;

        if (charData) {
            const d = charData;
            const colorVal = (v) => {
                if (v >= 8) return `<span class="stat-high">${v}</span>`;
                if (v <= 3) return `<span class="stat-low">${v}</span>`;
                return `<span>${v}</span>`;
            };
            const typeName = d.desc.replace('タイプ', '');
            const aiName = d.aiType || '素直';

            html += `
            <div class="preview-info">
                ${radarHtml} 
                <div class="preview-name">${d.name}</div>
                <div class="preview-badge-type">${typeName}</div>
                <div class="preview-badge-ai">${aiName}</div>
                <div class="preview-stat-grid">
                    <div class="stat-row"><span></span>${colorVal(d.power)}</div>
                    <div class="stat-row"><span></span>${colorVal(d.tech)}</div>
                    <div class="stat-row"><span></span>${colorVal(d.speed)}</div>
                    <div class="stat-row"><span></span>${colorVal(d.stamina)}</div>
                    <div class="stat-row"><span></span>${colorVal(d.spirit)}</div>
                    <div class="stat-row"><span></span>${colorVal(d.reversal)}</div>
                </div>
                <div class="preview-badge-control">${controlText}</div>
                <div class="dosukoi-power-container">
                    <span class="dosukoi-value">${d.total || 0}</span>
                </div>
            </div>`;
        } else {
            html += `
            <div class="preview-info">
                ${radarHtml}
                <div class="preview-badge-control">${controlText}</div>
            </div>`;
        }
        container.innerHTML = html;
    }

    _getHexPoints(center, r) {
        let p = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI * 2 / 6) * i - (Math.PI / 2);
            p.push(`${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`);
        }
        return p.join(' ');
    }

    highlightKey(code, isPressed) {
        if (isPressed && this.game && (!this.game.state.active || this.game.state.paused)) {
            return;
        }
        const keyEls = document.querySelectorAll(`.block-key[data-code="${code}"]`);
        keyEls.forEach(el => {
            if (isPressed) el.classList.add('key-pressed');
            else el.classList.remove('key-pressed');
        });
    }

    // =========================================================
    // ▼▼▼ BGMモーダル (完全修正版) ▼▼▼
    // =========================================================

    openBgmModal() {
        const modal = document.getElementById('bgm-modal');
        if (modal) {
            modal.classList.add('active');
            this.showAlbumView(); // 開くときは必ずアルバム一覧から
        } else {
            console.error("エラー: #bgm-modal がHTMLに見つかりません");
        }
    }

    closeBgmModal() {
        const modal = document.getElementById('bgm-modal');
        if (modal) modal.classList.remove('active');
    }

    // アルバム一覧画面を表示
    showAlbumView() {
        const albumView = document.getElementById('album-view');
        const trackView = document.getElementById('track-view');

        // エラーガード
        if (!albumView || !trackView) return;

        albumView.style.display = 'block';
        trackView.style.display = 'none';

        this.renderAlbums();
    }

    // アルバムを描画
    // アルバムを描画
    renderAlbums() {
        const albumGrid = document.getElementById('album-grid');
        if (!albumGrid) return;

        // ★「全曲集」を先頭に自動追加
        let albumsToRender = [
            { id: 'all', name: '全曲集', img: 'assets/img/album_all.png' } // 画像は適宜用意してください
        ];

        // 読み込んだアルバムデータを追加
        if (typeof ALBUM_DATA !== 'undefined' && ALBUM_DATA.length > 0) {
            // 画像パスを補完して追加 (assets/img/ をつける)
            const loadedAlbums = ALBUM_DATA.map(alb => ({
                id: alb.id,
                name: alb.name,
                img: alb.img.includes('/') ? alb.img : `assets/img/${alb.img}`
            }));
            albumsToRender = albumsToRender.concat(loadedAlbums);
        }

        // グリッド生成
        albumGrid.innerHTML = albumsToRender.map(alb => `
            <div class="album-item" onclick="game.ui.renderTracks('${alb.id}')">
                <img src="${alb.img}" onerror="this.src='assets/img/rikishiflame.png'">
                <div>${alb.name}</div>
            </div>
        `).join('');
    }

    // トラックリストを描画して表示切り替え
    renderTracks(albumId) {
        const albumView = document.getElementById('album-view');
        const trackView = document.getElementById('track-view');
        const trackList = document.getElementById('track-list');
        const titleDisplay = document.getElementById('current-album-title');

        if (!albumView || !trackView || !trackList) return;

        // 画面切り替え
        albumView.style.display = 'none';
        trackView.style.display = 'block';

        // アルバム名の表示
        let albumName = "全曲集";
        if (albumId !== 'all' && typeof ALBUM_DATA !== 'undefined') {
            const target = ALBUM_DATA.find(a => a.id === albumId);
            if (target) albumName = target.name;
        }
        if (titleDisplay) titleDisplay.textContent = albumName;

        // データ確認
        if (typeof BGM_DATA === 'undefined') {
            trackList.innerHTML = '<li class="track-item">データ読み込み中...</li>';
            return;
        }

        // ★フィルタリング処理
        let tracks = [];
        if (albumId === 'all') {
            tracks = BGM_DATA; // 全曲
        } else {
            tracks = BGM_DATA.filter(bgm => bgm.albumId === albumId);
        }

        // リスト生成
        if (tracks.length === 0) {
            trackList.innerHTML = '<li class="track-item">曲がありません</li>';
        } else {
            trackList.innerHTML = tracks.map(bgm => `
                <li class="track-item ${SoundFX.selectedBgmFile === bgm.file ? 'selected' : ''}" 
                    onclick="game.ui.selectBgm('${bgm.file}', '${bgm.name}')">
                    <span>${bgm.name}</span>
                    ${SoundFX.selectedBgmFile === bgm.file ? '<span>♪ 再生中</span>' : ''}
                </li>
            `).join('');
        }
    }
}
