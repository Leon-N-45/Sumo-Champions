// js/team_ui.js
class TeamUIManager {
    constructor(game) {
        this.game = game;
        this.els = {
            charList: document.getElementById('char-list'),
            ghost: document.getElementById('drag-ghost'),
            startBtn: document.getElementById('team-start-btn')
        };
        this.MAX_COST = 8;

        // ▼ HTML側に頼らず、JS側で直接セレクトボックスを監視する（絶対確実な方法）
        const costLimitSelect = document.getElementById('team-cost-limit-select');
        if (costLimitSelect) {
            // もし画面リロード時にすでに違う値が選ばれていたら、それに合わせる
            this.MAX_COST = parseInt(costLimitSelect.value, 10) || 8;
            
            // ユーザーが値を選び直した瞬間に発動
            costLimitSelect.addEventListener('change', (e) => {
                this.MAX_COST = parseInt(e.target.value, 10);
                
                // ゲージと文字を再描画
                this.updateTeamDisplay();
                // 上部のテキストと、取組開始できるかどうかの条件を再判定
                this.checkStartCondition();
            });
        }

        this.initSelectScreen();
    }

    _getCostBadgeHtml(cost, isLarge) {
        let bg = '';
        if (cost <= 1) bg = '#a1a1aa';
        else if (cost <= 3) bg = '#4ade80';
        else if (cost === 4) bg = '#3b82f6';
        else if (cost === 5) bg = '#eab308';
        else bg = '#745399';

        const size = isLarge ? 36 : 28;
        const fontSize = isLarge ? 18 : 14;

        // ▼ 位置調整用の変数を追加（ここで好きな位置に動かせます！）
        // isLarge（編成枠の大きいバッジ）と、そうでない場合（力士一覧の小さいバッジ）で位置を分けます
        const bottomPos = isLarge ? "13px" : "0px"; 
        const rightPos  = isLarge ? "13px" : "0px";

        return `
        <div style="position:absolute; bottom:${bottomPos}; right:${rightPos}; width:${size}px; height:${size}px; z-index:5; display:flex; align-items:center; justify-content:center;">
            <svg width="${size}" height="${size}" viewBox="0 0 100 100" style="position:absolute; top:0; left:0; z-index:-1;">
                <polygon points="30,4 70,4 96,30 96,70 70,96 30,96 4,70 4,30" fill="${bg}" stroke="#000000" stroke-width="8" stroke-linejoin="round" />
            </svg>
            <span style="color:#ffffff; font-size:${fontSize}px; font-weight:900; font-family:'M PLUS Rounded 1c', sans-serif; -webkit-text-stroke:1px #000;">${cost}</span>
        </div>
        `;
    }
    initSelectScreen() {
        if (typeof RIKISHI_DATA === 'undefined' || RIKISHI_DATA.length === 0) {
            setTimeout(() => this.initSelectScreen(), 500);
            return;
        }

        const iconGrid = document.querySelector('#team-select-screen #icon-grid') || document.getElementById('icon-grid');
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

                const faceImg = charData.img.includes('/') ? charData.img : `assets/img/${charData.img}`;
                const bgImg = `assets/img/${bgFile}`;

                if (bgFile) {
                    icon.style.backgroundImage = `url('${faceImg}'), url('${bgImg}')`;
                    icon.style.backgroundPosition = 'center, center';
                    icon.style.backgroundSize = 'contain, cover';
                    icon.style.backgroundRepeat = 'no-repeat, no-repeat';
                } else {
                    icon.style.backgroundImage = `url('${faceImg}')`;
                }

                if (charData.category === "レジェンド") {
                    classes.push('cat-legend');
                    icon.style.backgroundColor = '#ffffff';
                }
                else if (charData.category === "ドリーム") {
                    classes.push('cat-dream');
                    icon.style.backgroundColor = '#ffffff';
                    if (typeof settings !== 'undefined' && !settings.current.dreamUnlocked) classes.push('secret-hidden');
                }
                else if (charData.category === "空きスロット") {
                    classes.push('cat-empty', 'inactive');
                }

                const costValue = parseInt(charData['コスト']) || 0;
                icon.innerHTML = this._getCostBadgeHtml(costValue, false);
            } else {
                classes.push('inactive');
            }
            icon.className = classes.join(' ');
            iconGrid.appendChild(icon);
        }

        this.initDraggableIcons();
        this.updateTeamDisplay();
    }

    initDraggableIcons() {
        let isDragging = false;
        let dragId = null;
        let dragSourceSlot = null;

        const startDrag = (id, x, y) => {
            const charData = RIKISHI_DATA.find(d => d.id === id);
            if (charData) {
                const faceImg = charData.img.includes('/') ? charData.img : `assets/img/${charData.img}`;
                this.els.ghost.style.backgroundImage = `url('${faceImg}')`;
                this.els.ghost.style.display = 'block';
                this.els.ghost.style.width = '120px';
                this.els.ghost.style.height = '120px';
                this.els.ghost.style.position = 'fixed';
                this.els.ghost.style.transform = 'translate(-50%, -50%)'; 
                this.els.ghost.style.zIndex = '9999';
                this.els.ghost.style.pointerEvents = 'none';
                this.moveGhost(x, y);
            }
        };

        document.addEventListener('mousedown', (e) => {
            const listIcon = e.target.closest('.char-select-icon');
            const slotHead = e.target.closest('.team-slot .head');

            if (listIcon && listIcon.hasAttribute('data-id') && !listIcon.classList.contains('inactive') && !listIcon.classList.contains('secret-hidden')) {
                e.preventDefault(); 
                isDragging = true;
                dragId = parseInt(listIcon.dataset.id);
                dragSourceSlot = null;
                startDrag(dragId, e.clientX, e.clientY);
            } 
            else if (slotHead && !slotHead.classList.contains('empty-dock-face')) {
                e.preventDefault();
                const slot = slotHead.closest('.team-slot');
                if (slot && slot.dataset.player) {
                    const player = slot.dataset.player;
                    const index = parseInt(slot.dataset.index);
                    dragId = this.game.state.teams[player][index];

                    if (dragId !== null) {
                        isDragging = true;
                        dragSourceSlot = { player, index };
                        slotHead.style.opacity = '0.3';
                        startDrag(dragId, e.clientX, e.clientY);
                    }
                }
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            this.moveGhost(e.clientX, e.clientY);

            document.querySelectorAll('.team-slot').forEach(slot => {
                const rect = slot.getBoundingClientRect();
                if (this.isHit(e.clientX, e.clientY, rect)) {
                    slot.classList.add('drag-hover');
                } else {
                    slot.classList.remove('drag-hover');
                }
            });
        });

        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return;
            isDragging = false;
            this.els.ghost.style.display = 'none';

            let droppedOnSlot = false;

            document.querySelectorAll('.team-slot').forEach(slot => {
                slot.classList.remove('drag-hover');
                const rect = slot.getBoundingClientRect();
                
                if (this.isHit(e.clientX, e.clientY, rect)) {
                    droppedOnSlot = true;
                    const targetPlayer = slot.dataset.player; 
                    const targetIndex = parseInt(slot.dataset.index); 
                    
                    slot.removeAttribute('data-current-char-id');

                    if (dragSourceSlot && (dragSourceSlot.player !== targetPlayer || dragSourceSlot.index !== targetIndex)) {
                        const sourceSlotEl = document.getElementById(`${dragSourceSlot.player}-slot-${dragSourceSlot.index}`);
                        if(sourceSlotEl) sourceSlotEl.removeAttribute('data-current-char-id');
                        this.game.selectTeamChar(dragSourceSlot.player, dragSourceSlot.index, null);
                    }

                    this.game.selectTeamChar(targetPlayer, targetIndex, dragId);
                    
                    if (typeof SoundFX !== 'undefined') {
                        const charData = RIKISHI_DATA.find(d => d.id === dragId);
                        if(charData && charData.voice) SoundFX.playVoice(charData.voice);
                    }
                }
            });

            if (!droppedOnSlot && dragSourceSlot) {
                const sourceSlotEl = document.getElementById(`${dragSourceSlot.player}-slot-${dragSourceSlot.index}`);
                if(sourceSlotEl) sourceSlotEl.removeAttribute('data-current-char-id');
                this.game.selectTeamChar(dragSourceSlot.player, dragSourceSlot.index, null);
            }

            if (dragSourceSlot) {
                const sourceSlotEl = document.getElementById(`${dragSourceSlot.player}-slot-${dragSourceSlot.index}`);
                if (sourceSlotEl) {
                    const head = sourceSlotEl.querySelector('.head');
                    if (head) head.style.opacity = '1';
                }
            }
            
            dragSourceSlot = null;
            dragId = null;
        });
    }

    moveGhost(x, y) {
        this.els.ghost.style.left = x + 'px';
        this.els.ghost.style.top = y + 'px';
    }

    isHit(x, y, rect) {
        return (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    }

    // ▼ 1. 新規追加：セレクトボックス変更時に呼ばれる
    updateCostLimit(val) {
        this.MAX_COST = parseInt(val, 10);
        this.updateTeamDisplay();   // ゲージと文字の再描画
        this.checkStartCondition(); // 開始条件の再判定と指示テキストの更新
    }
 updateTeamDisplay() {
        document.querySelectorAll('.char-select-icon').forEach(icon => { icon.classList.remove('p1-active', 'p2-active'); });

        ['p1', 'p2'].forEach(player => {
            const team = this.game.state.teams[player];

            // コスト計算
            let totalCost = 0;
            team.forEach(charId => {
                if (charId !== null) {
                    const c = RIKISHI_DATA.find(d => d.id === charId);
                    if (c) totalCost += (parseInt(c['コスト']) || 0);
                }
            });

            // ゲージと数値の更新
            const costValEl = document.getElementById(`${player}-cost-val`);
            const costBarEl = document.getElementById(`${player}-cost-bar`);
            
            // 無制限(99)の場合は表示を「∞」にする
            const displayMax = this.MAX_COST >= 99 ? '∞' : this.MAX_COST;

            if (costValEl) {
                costValEl.textContent = `${totalCost} / ${displayMax}`;
                costValEl.style.color = (totalCost > this.MAX_COST) ? '#8b0000' : '#ffffff';
            }
            if (costBarEl) {
                if (costBarEl.tagName.toLowerCase() === 'progress') {
                    costBarEl.max = this.MAX_COST >= 99 ? (totalCost || 1) : this.MAX_COST;
                    costBarEl.value = totalCost;
                } else {
                    const pct = this.MAX_COST >= 99 ? 100 : Math.min(100, (totalCost / this.MAX_COST) * 100);
                    costBarEl.style.width = `${pct}%`;
                    costBarEl.style.backgroundColor = (totalCost > this.MAX_COST) ? '#8b0000' : '#745399';
                    costBarEl.style.minHeight = '10px';
                    costBarEl.style.display = 'block';
                    costBarEl.style.transition = 'width 0.3s ease, background-color 0.3s ease';
                }
            }

            // キャラクター画像とバッジの更新
            team.forEach((charId, index) => {
                const slot = document.getElementById(`${player}-slot-${index}`);
                const wrapper = document.getElementById(`${player}-wrapper-${index}`);
                
                if (!slot || !wrapper) return;

                const currentCharId = slot.hasAttribute('data-current-char-id') ? parseInt(slot.getAttribute('data-current-char-id')) : null;

                if (charId !== null) {
                    const c = RIKISHI_DATA.find(d => d.id === charId);
                    const iconEl = document.querySelector(`.char-select-icon[data-id="${charId}"]`);
                    if (iconEl) iconEl.classList.add(`${player}-active`);

                    if (currentCharId !== charId) {
                        slot.classList.add('is-filled');
                        slot.classList.remove('p1-empty', 'p2-empty');
                        slot.innerHTML = this._getMiniPreviewHtml(c, player);
                        
                        const costValue = parseInt(c['コスト']) || 0;
                        
                        const oldBadge = wrapper.querySelector('.cost-badge-wrapper');
                        if(oldBadge) oldBadge.remove();
                        
                        const badgeDiv = document.createElement('div');
                        badgeDiv.className = 'cost-badge-wrapper';
                        // trueを指定してスロット側のバッジを大きくする
                        badgeDiv.innerHTML = this._getCostBadgeHtml(costValue, true);
                        wrapper.appendChild(badgeDiv);
                        
                        slot.setAttribute('data-current-char-id', charId); 
                    }
                } else {
                    if (currentCharId !== null || !slot.innerHTML.includes('empty-dock-face')) {
                        slot.classList.remove('is-filled');
                        slot.classList.add(`${player}-empty`); 
                        slot.innerHTML = this._getEmptySlotHtml(player);
                        
                        const oldBadge = wrapper.querySelector('.cost-badge-wrapper');
                        if(oldBadge) oldBadge.remove();
                        
                        slot.removeAttribute('data-current-char-id'); 
                    }
                }
            });
        });
        
        // テキストの動的更新を即座に行う
        this.checkStartCondition();
    }
    _getMiniPreviewHtml(charData, playerId) {
        // ★タイプ別アニメーションと背景の復活
        const typeMap = { "バランスタイプ": "dock-balance", "テクニックタイプ": "dock-tech", "パワータイプ": "dock-power", "スピードタイプ": "dock-speed" };
        const dockClass = typeMap[charData.desc] || 'dock-balance';
        const isLegend = (charData.category === "レジェンド");

        const durations = [1.75, 1.50, 1.35, 1.20, 1.05, 0.90, 0.75, 0.60, 0.45, 0.30];
        const bodyAnimStyle = `animation-duration: ${durations[Math.max(0, Math.min((charData.speed || 5) - 1, 9))]}s;`;
        
        const combinedScale = 0.44; 
        const wVal = charData.weight || 3;
        const hVal = charData.height || 3;
        const bodyImgStyle = `transform: scale(${(0.6 + wVal * 0.12) * 0.8}, ${(0.6 + hVal * 0.12) * 0.8}); transform-origin: bottom center;`;

        // 身長の中間調整
        const headTops = [50, 16, -10, -30, -65]; 
        const headTop = headTops[hVal - 1] || -30;

        // ★背景の選定ロジック復活
        let bgFile = charData.desc.includes('パワー') ? (isLegend ? 'chikara2_bg.png' : 'chikara1_bg.png') : 
                     charData.desc.includes('スピード') ? (isLegend ? 'hayasa2_bg.png' : 'hayasa1_bg.png') :
                     charData.desc.includes('テクニック') ? (isLegend ? 'gizyutu2_bg.png' : 'gizyutu1_bg.png') : (isLegend ? 'baransu2_bg.png' : 'baransu1_bg.png');

        return `
            <div class="char-background" style="background-image: url('assets/img/${bgFile}');"></div>
            <div class="preview-char-img is-selected" style="transform: scale(${combinedScale}) !important; bottom: 25px;">
                <div class="anim-wrapper ${dockClass}">
                    <div class="rikishi-body" style="${bodyAnimStyle}">
                        <img src="assets/img/rikishi${playerId}.png" class="body-img" style="${bodyImgStyle}">
                        <div class="head" style="background-image:url('assets/img/${charData.img}'); top: ${headTop}px; display: block; width:100px; height:100px; transform: scale(1.15); left:50%; transform-origin: center center; margin-left: -50px; position:absolute;"></div>
                    </div>
                </div>
            </div>
            <div class="vertical-name">${charData.name}</div>
        `;
    }
    _getEmptySlotHtml(playerId) {
        const imgName = `assets/img/rikishi${playerId}.png`;
        const combinedScale = 0.44; 
        const emptyBodyScale = 0.912;

        return `
            <div class="preview-char-img" style="transform: scale(${combinedScale}) !important; bottom: 25px;">
                <div class="anim-wrapper">
                    <div class="rikishi-body" style="transform-origin: bottom center;">
                        <img src="${imgName}" class="body-img" style="transform: scale(${emptyBodyScale}, ${emptyBodyScale}); transform-origin: bottom center;">
                        <div class="head empty-dock-face" style="background-image:url('assets/img/dockface.png'); background-size: contain; background-repeat: no-repeat; background-position: center; width: 450px; height: 450px; top: -100px; left: 50%; transform: translateX(-50%) scale(1.15); display: block; animation: dock-blink 2s ease-in-out infinite; opacity: 0.3;"></div>
                    </div>
                </div>
            </div>
        `;
    }

checkStartCondition() {
        const p1Team = this.game.state.teams.p1;
        const p2Team = this.game.state.teams.p2;

        const p1Ready = p1Team.every(id => id !== null);
        const p2Ready = p2Team.every(id => id !== null);

        let p1Cost = 0, p2Cost = 0;
        p1Team.forEach(id => { if(id !== null) p1Cost += (parseInt(RIKISHI_DATA.find(d => d.id === id)?.['コスト']) || 0); });
        p2Team.forEach(id => { if(id !== null) p2Cost += (parseInt(RIKISHI_DATA.find(d => d.id === id)?.['コスト']) || 0); });

        const isCostOk = (p1Cost <= this.MAX_COST && p2Cost <= this.MAX_COST);
        const isReady = p1Ready && p2Ready && isCostOk;

        const container = document.getElementById('team-char-title-container');
        const headerImg = document.getElementById('team-select-header-img');
        const instrText = document.getElementById('team-select-instruction-text');
        
        const oldBtnContainer = document.getElementById('start-btn-container');
        if (oldBtnContainer) oldBtnContainer.style.display = 'none';

        let curtain = document.getElementById('team-ready-curtain');
        if (!curtain) {
            curtain = document.createElement('div');
            curtain.id = 'team-ready-curtain';
            curtain.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:100; display:none;";
            if (this.els.charList) {
                this.els.charList.style.position = 'relative';
                this.els.charList.appendChild(curtain);
            }
        }

        if (isReady) {
            curtain.style.display = 'block'; 
            if (container) container.classList.add('torikumi-obi-mode'); 

            if (headerImg) {
                headerImg.src = "assets/img/torikumikaishi.png"; 
                headerImg.classList.add('ready-aura'); 
                headerImg.style.cursor = 'pointer';
                headerImg.onclick = () => {
                    this.game.startTeamMatch();
                };
            }

            if (instrText) {
                instrText.textContent = "↑ をクリックしてゲーム開始だ！";
                instrText.style = "";
            }
            
        } else {
            curtain.style.display = 'none'; 
            if (container) container.classList.remove('torikumi-obi-mode');

            if (headerImg) {
                headerImg.src = "assets/img/rikishisentaku.png";
                headerImg.classList.remove('ready-aura');
                headerImg.style.cursor = 'default';
                headerImg.onclick = null;
            }

            if (instrText) {
                const displayMax = this.MAX_COST >= 99 ? '∞' : this.MAX_COST;
                if (p1Ready && p2Ready && !isCostOk) {
                    instrText.innerHTML = `<span style="color:#ef4444; font-weight:bold;">コストオーバーです（ 上限  ${displayMax} ）</span>`;
                } else {
                    if (this.MAX_COST >= 99) {
                        instrText.innerHTML = `好きな3人組を編成しろ！`;
                    } else {
                        // ▼ここで数字が最新の MAX_COST に書き換わります
                        instrText.innerHTML = `コスト合計が<span style="color:#FFF; -webkit-text-stroke:1px #000; font-size:2rem; font-family:'tamanegi', sans-serif; font-weight:900; padding:0 4px; vertical-align:baseline;">${this.MAX_COST}</span>以下になるように3人組を編成しろ！`;
                    }
                }
            }
        }
    }
    }