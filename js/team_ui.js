/**
 * team_ui.js
 * 団体戦の編成画面表示（アイコングリッド・スロット・コスト表示）を担当するクラス
 */
class TeamUIManager {
    constructor(game) {
        this.game = game;
        this.els = {
            ghost: document.getElementById('drag-ghost')
        };
        this.MAX_COST = 8;

        // HTML側に頼らず、JS側で直接セレクトボックスを監視する（絶対確実な方法）
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

    // コストの八角形バッジ（中身は config.js の costBadgeHtml。個人戦・入門の画面でも同じものを使う）
    _getCostBadgeHtml(cost, isLarge) {
        return costBadgeHtml(cost, isLarge);
    }
    initSelectScreen() {
        if (typeof RIKISHI_DATA === 'undefined' || RIKISHI_DATA.length === 0) {
            setTimeout(() => this.initSelectScreen(), 500);
            return;
        }

        this.renderCharGrid();
        this.initDraggableIcons();
        this.updateTeamDisplay();
    }

    /** 力士アイコンのグリッドを描く（一番下の段は新弟子） */
    renderCharGrid() {
        const iconGrid = document.querySelector('#team-select-screen #icon-grid') || document.getElementById('icon-grid');
        if (!iconGrid) return;
        iconGrid.innerHTML = '';

        const gridSlots = buildCharGridSlots();

        for (let i = 0; i < CHAR_GRID.SIZE; i++) {
            const icon = document.createElement('div');
            const charData = gridSlots[i];
            let classes = ['char-select-icon'];

            if (charData && charData.random) {
                icon.dataset.id = RANDOM_CHAR_ID;
                icon.title = 'ランダム';
                icon.style.backgroundImage = `url('${RANDOM_CHAR_IMG}')`;
                classes.push('char-random');
            }
            else if (charData) {
                icon.dataset.id = charData.id;
                const bgCss = charBgCss(charData);
                const faceImg = charData.img.includes('/') ? charData.img : `assets/img/${charData.img}`;

                if (bgCss) {
                    // 顔 → 専用背景 → タイプ別背景 の順に重ねる
                    icon.style.backgroundImage = `url('${faceImg}'), ${bgCss}`;
                    icon.style.backgroundPosition = 'center';
                    icon.style.backgroundSize = 'contain, cover';
                    icon.style.backgroundRepeat = 'no-repeat';
                } else {
                    icon.style.backgroundImage = `url('${faceImg}')`;
                }

                if (charData.category === "レジェンド") {
                    classes.push('cat-legend');
                    icon.style.backgroundColor = '#ffffff';
                }
                else if (charData.category === "ドリーム") {
                    // 隠し力士の仕組みはやめ、常に表示する（カテゴリはオーラの見た目に使う）
                    classes.push('cat-dream');
                    icon.style.backgroundColor = '#ffffff';
                }
                else if (charData.category === "空きスロット") {
                    classes.push('cat-empty', 'inactive');
                }

                const costValue = parseInt(charData['コスト']) || 0;
                icon.innerHTML = this._getCostBadgeHtml(costValue, false)
                    + `<button class="icon-detail-btn" onmousedown="event.stopPropagation();" onmouseup="event.stopPropagation();" onclick="event.stopPropagation(); window.teamGame.ui.showCharDetail(${charData.id});" title="力士の詳細"><img src="assets/img/gumbai2.png" alt="詳細"></button>`;
            } else {
                classes.push('inactive');
            }
            if (charData && charData.custom) classes.push('cat-custom');
            if (isCustomRowIndex(i)) {
                classes.push('custom-row');
                if (!charData) icon.innerHTML = '<span class="custom-empty-label">新弟子</span>';
            }
            icon.className = classes.join(' ');
            iconGrid.appendChild(icon);
        }
    }

    // ---------------------------------------------------------------
    // ランダムの枠
    // 編成中は「ランダム」のまま置いておき、誰になるかは取組開始時（resolveRandomSlots）に決める。
    // コスト上限を必ず守れるよう、編成中のランダム枠は「一番安い力士のコスト」で数えておき、
    // 抽選時は残りのランダム枠の分を差し引いた予算内の力士だけから選ぶ。
    // ---------------------------------------------------------------
    get dupOff() {
        return (document.getElementById('team-dup-select')?.value || 'off') === 'off';
    }

    /** 編成中の1枠のコスト。ランダム枠は一番安い力士のコストで数える */
    slotCost(id) {
        if (id === null || id === undefined) return 0;
        if (id === RANDOM_CHAR_ID) return this.randomReserveCost();
        return parseInt(RIKISHI_DATA.find(d => d.id === id)?.['コスト']) || 0;
    }

    randomReserveCost() {
        const costs = buildCharGridSlots({ silent: true })
            .filter(d => d && !d.random && !d.custom && d.category !== '空きスロット')
            .map(d => parseInt(d['コスト']) || 0);
        return costs.length ? Math.min(...costs) : 0;
    }

    teamCost(team) {
        return team.reduce((s, id) => s + this.slotCost(id), 0);
    }

    /** チームのランダム枠を、重複禁止とコスト上限を守って実際の力士に置き換える */
    resolveRandomSlots(player) {
        const team = this.game.state.teams[player];
        const randIdx = team.map((id, i) => id === RANDOM_CHAR_ID ? i : -1).filter(i => i >= 0);
        const reserve = this.randomReserveCost();

        randIdx.forEach((idx, k) => {
                const laterRandoms = randIdx.length - k - 1;
                // まだ決まっていない枠を除いた、いま決まっている力士のコスト
                const fixedCost = team.reduce((s, id, i) =>
                    s + ((id === null || id === RANDOM_CHAR_ID) ? 0 : this.slotCost(id)), 0);
                const budget = this.MAX_COST - fixedCost - laterRandoms * reserve;
                const fits = d => this.MAX_COST >= 99 || (parseInt(d['コスト']) || 0) <= budget;
                const unique = d => !(this.dupOff && team.includes(d.id));

                team[idx] = pickRandomCharId(d => fits(d) && unique(d))
                    ?? pickRandomCharId(fits)        // 重複なしで足りない時（候補が極端に少ない時）の保険
                    ?? pickRandomCharId();
            });
    }

    initDraggableIcons() {
        let isDragging = false;
        let dragId = null;
        let dragSourceSlot = null;

        const startDrag = (id, x, y) => {
            const charData = RIKISHI_DATA.find(d => d.id === id);
            if (charData || id === RANDOM_CHAR_ID) {
                const faceImg = !charData ? RANDOM_CHAR_IMG
                              : charData.img.includes('/') ? charData.img : `assets/img/${charData.img}`;
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
                // 詳細ボタン（gumbai）クリック時はドラッグ判定を行わずクリックを通す
                if (e.target.closest('.icon-detail-btn')) return;
                const listIcon = e.target.closest('.char-select-icon');
                // ランダム枠は顔の代わりにランダムの画像をつかんで動かす
                const slotHead = e.target.closest('.team-slot .head, .team-slot .random-slot-img');

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

                            // 「力士の重複: なし」の場合、同一チーム内に同じ力士は置けない（敵チームとの重複はOK）
                            // ランダムは取組開始時に重ならないよう抽選するので、何枠でも置ける
                            const dupOff = this.dupOff && dragId !== RANDOM_CHAR_ID;
                            const teamArr = this.game.state.teams[targetPlayer] || [];
                            const isDuplicate = dupOff && teamArr.some((id, i) =>
                                id === dragId && i !== targetIndex &&
                                !(dragSourceSlot && dragSourceSlot.player === targetPlayer && dragSourceSlot.index === i));
                            if (isDuplicate) {
                                // 配置は中止（元スロットはそのまま）。エラー音と簡単なフィードバック。
                                slot.classList.add('dup-reject');
                                setTimeout(() => slot.classList.remove('dup-reject'), 400);
                                if (typeof SoundFX !== 'undefined' && SoundFX.playTone) SoundFX.playTone('miss');
                                return; // この取組相手スロットの処理を中止（元の力士は移動しない）
                            }

                            // コスト上限チェック：この力士を置くとチーム合計コストが上限を超える場合は弾く
                            const costLimit = this.MAX_COST;
                            if (costLimit < 99) {
                                const proj = (this.game.state.teams[targetPlayer] || []).slice();
                                if (dragSourceSlot && dragSourceSlot.player === targetPlayer) proj[dragSourceSlot.index] = null;
                                proj[targetIndex] = dragId;
                                const projTotal = this.teamCost(proj);
                                if (projTotal > costLimit) {
                                    slot.classList.add('dup-reject');
                                    setTimeout(() => slot.classList.remove('dup-reject'), 400);
                                    if (typeof SoundFX !== 'undefined' && SoundFX.playTone) SoundFX.playTone('miss');
                                    return; // コスト超過のため配置中止
                                }
                            }

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
                        const head = sourceSlotEl.querySelector('.head, .random-slot-img');
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

    updateTeamDisplay() {
        document.querySelectorAll('.char-select-icon').forEach(icon => { icon.classList.remove('p1-active', 'p2-active'); });

        ['p1', 'p2'].forEach(player => {
                const team = this.game.state.teams[player];

                // コスト計算（ランダム枠は一番安い力士のコストで数える）
                const totalCost = this.teamCost(team);
                const hasRandom = team.includes(RANDOM_CHAR_ID);
                // ランダム枠が1つでもあれば、合計は「?」にして中身が分からないようにする
                const costLabel = hasRandom ? '?' : `${totalCost}`;

                // ゲージと数値の更新
                const costValEl = document.getElementById(`${player}-cost-val`);
                const costBarEl = document.getElementById(`${player}-cost-bar`);

                // 無制限(99)の場合は上限を出さず、コストの合計を「戦力」として表示する
                if (costValEl) {
                    costValEl.textContent = this.MAX_COST >= 99 ? `戦力：${costLabel}` : `${costLabel} / ${this.MAX_COST}`;
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
                            const iconEl = document.querySelector(`#team-select-screen .char-select-icon[data-id="${charId}"]`);
                            if (iconEl) iconEl.classList.add(`${player}-active`);

                            if (currentCharId !== charId) {
                                slot.classList.add('is-filled');
                                slot.classList.remove('p1-empty', 'p2-empty');
                                slot.innerHTML = (charId === RANDOM_CHAR_ID)
                                    ? this._getRandomSlotHtml(player, index)
                                    : this._getMiniPreviewHtml(c, player, index);

                                const costValue = (charId === RANDOM_CHAR_ID) ? '?' : (parseInt(c['コスト']) || 0);

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
    _getMiniPreviewHtml(charData, playerId, slotIndex = 0) {
        // タイプ別アニメーションと背景の復活
        const typeMap = { "バランスタイプ": "dock-balance", "テクニックタイプ": "dock-tech", "パワータイプ": "dock-power", "スピードタイプ": "dock-speed" };
        const dockClass = typeMap[charData.desc] || 'dock-balance';
        const isLegend = (charData.category === "レジェンド");

        const bodyAnimStyle = `animation-duration: ${speedAnimDuration(charData.speed)}s;`;

        const combinedScale = 0.44;
        const wVal = charData.weight || 3;
        const hVal = charData.height || 3;
        const bodyImgStyle = `transform: scale(${(0.6 + wVal * 0.12) * 0.8}, ${(0.6 + hVal * 0.12) * 0.8}); transform-origin: bottom center;`;

        // 身長の中間調整
        const headTops = [50, 16, -10, -30, -65];
        const headTop = headTops[hVal - 1] || -30;

        // 背景の選定（専用背景 bs_〇〇.png → タイプ別 の順に重ねる。
        // タイプにも一致しない場合はバランス背景にフォールバック）
        let bgCss = charBgCss(charData);
        if (!charTypeAssets(charData).bg) {
            const fallback = `url('assets/img/${isLegend ? 'baransu2_bg.png' : 'baransu1_bg.png'}')`;
            bgCss = bgCss ? `${bgCss}, ${fallback}` : fallback;
        }

        const switchHtml = this._slotCpuSwitchHtml(playerId, slotIndex);
        const bodyImg = bodyImageFile(playerId, this._isSlotCPU(playerId, slotIndex), charData);

        return `
            ${switchHtml}
            <div class="char-background" style="background-image: ${bgCss};"></div>
            <div class="preview-char-img is-selected" style="transform: scale(${combinedScale}) !important; bottom: 25px;">
                <div class="anim-wrapper ${dockClass}">
                    <div class="rikishi-body" style="${bodyAnimStyle}">
                        <img src="assets/img/${bodyImg}" class="body-img" style="${bodyImgStyle}">
                        <div class="head" style="background-image:url('${charData.img.includes('/') ? charData.img : 'assets/img/' + charData.img}'); top: ${headTop}px; display: block; width:100px; height:100px; transform: scale(1.15); left:50%; transform-origin: center center; margin-left: -50px; position:absolute;"></div>
                    </div>
                </div>
            </div>
            <div class="vertical-name"><span class="vertical-main">${charData.name}</span>${charData.nickname ? `<span class="vertical-nickname">${charData.nickname}</span>` : ''}</div>
        `;
    }

    // ランダム枠の表示。取組開始までは誰か分からないよう、ランダムの画像と名前だけを出す
    _getRandomSlotHtml(playerId, slotIndex) {
        return `
            ${this._slotCpuSwitchHtml(playerId, slotIndex)}
            <div class="random-slot-fill"></div>
            <img src="${RANDOM_CHAR_IMG}" class="random-slot-img" alt="ランダム">
            <div class="vertical-name"><span class="vertical-main">ランダム</span></div>
        `;
    }

    _isSlotCPU(playerId, slotIndex) {
        const st = this.game && this.game.state ? this.game.state : null;
        return !!(st && st.slotCPU && st.slotCPU[playerId] && st.slotCPU[playerId][slotIndex]);
    }

    // スロット単位のCPU設定スイッチ
    _slotCpuSwitchHtml(playerId, slotIndex) {
        const st = this.game && this.game.state ? this.game.state : null;
        const isCPU = this._isSlotCPU(playerId, slotIndex);
        const curLevel = (st && st.slotLevel && st.slotLevel[playerId]) ? st.slotLevel[playerId][slotIndex] : 3;

        const levels = [
            { v: 7, l: "横綱" }, { v: 6, l: "大関" }, { v: 5, l: "関脇" },
            { v: 4, l: "小結" }, { v: 3, l: "前頭" }, { v: 2, l: "十両" }, { v: 1, l: "幕下" }
        ];
        const options = levels.map(L => `<option value="${L.v}" ${L.v === curLevel ? 'selected' : ''}>${L.l}</option>`).join('');
        return `
            <div class="slot-cpu-switch ${isCPU ? 'is-cpu' : ''}" onpointerdown="event.stopPropagation();" onmousedown="event.stopPropagation();">
                <label class="switch" onpointerdown="event.stopPropagation();">
                    <input type="checkbox" ${isCPU ? 'checked' : ''} onchange="window.teamGame.ui.toggleSlotCPU('${playerId}', ${slotIndex}, this.checked)">
                    <span class="slider round"></span>
                </label>
                <select class="custom-select slot-cpu-level" style="${isCPU ? '' : 'display:none;'}" onpointerdown="event.stopPropagation();" onchange="window.teamGame.ui.setSlotLevel('${playerId}', ${slotIndex}, this.value)">
                    ${options}
                </select>
            </div>`;
    }

    // スロットのCPU切替（体画像・ラベル・段位表示を更新）
    toggleSlotCPU(playerId, slotIndex, checked) {
        if (!this.game.state.slotCPU[playerId]) this.game.state.slotCPU[playerId] = [false, false, false];
        this.game.state.slotCPU[playerId][slotIndex] = checked;
        const slot = document.getElementById(`${playerId}-slot-${slotIndex}`);
        if (!slot) return;
        const bodyImg = slot.querySelector('.body-img');
        if (bodyImg) {
            // Player復帰時にドレス姿へ戻せるよう、そのスロットの力士から体画像を決める
            const charId = (this.game.state.teams[playerId] || [])[slotIndex];
            const charData = (charId !== null && charId !== undefined)
                ? RIKISHI_DATA.find(d => d.id === charId) : null;
            bodyImg.src = `assets/img/${bodyImageFile(playerId, checked, charData)}`;
        }
        const cont = slot.querySelector('.slot-cpu-switch');
        if (cont) cont.classList.toggle('is-cpu', checked);
        const lvl = slot.querySelector('.slot-cpu-level');
        if (lvl) lvl.style.display = checked ? '' : 'none';
    }

    setSlotLevel(playerId, slotIndex, value) {
        if (!this.game.state.slotLevel[playerId]) this.game.state.slotLevel[playerId] = [3, 3, 3];
        this.game.state.slotLevel[playerId][slotIndex] = parseInt(value);
    }

    // 力士の詳細カード（個人戦と同じパラメータ詳細＋レーダー）を画面中央に大きく表示
    showCharDetail(charId) {
        const existing = document.getElementById('char-detail-overlay');
        if (existing) existing.remove();

        const ov = document.createElement('div');
        ov.id = 'char-detail-overlay';
        ov.className = 'char-detail-overlay';
        ov.innerHTML = `<div class="char-detail-card"><div class="preview-box" id="preview-detailview"></div></div>`;
        document.body.appendChild(ov);

        // 個人戦のプレビュー描画をそのまま流用してカードを構築
        if (typeof game !== 'undefined' && game.ui && typeof game.ui.updatePreview === 'function') {
            game.ui.updatePreview('detailview', charId);
        }

        // カード以外（背景）をクリックしたら閉じる
        ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
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

        const p1Cost = this.teamCost(p1Team);
        const p2Cost = this.teamCost(p2Team);

        const isCostOk = (p1Cost <= this.MAX_COST && p2Cost <= this.MAX_COST);
        const isReady = p1Ready && p2Ready && isCostOk;

        const container = document.getElementById('team-char-title-container');
        const headerImg = document.getElementById('team-select-header-img');
        const instrText = document.getElementById('team-select-instruction-text');

        const oldBtnContainer = document.getElementById('start-btn-container');
        if (oldBtnContainer) oldBtnContainer.style.display = 'none';

        if (isReady) {
            if (container) container.classList.add('torikumi-obi-mode');

            if (headerImg) {
                headerImg.src = "assets/img/torikumikaishi.png";
                headerImg.classList.add('ready-aura');
                headerImg.style.cursor = 'pointer';
                headerImg.onclick = () => {
                    // 遠征では、部屋を作った側のルール（取り組み形式・コスト）で両者同時に始める
                    if (typeof Online !== 'undefined' && Online.active) Online.requestTeamStart();
                    else this.game.startTeamMatch();
                };
            }

            if (instrText) {
                instrText.textContent = (typeof MenuNav !== 'undefined')
                    ? MenuNav.readyText() : "↑ をクリックしてゲーム開始だ！";
                instrText.style = "";
            }

        } else {
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
                        // ここで数字が最新の MAX_COST に書き換わります
                        instrText.innerHTML = `コスト合計が<span style="color:#FFF; -webkit-text-stroke:1px #000; font-size:2rem; font-family:'tamanegi', sans-serif; font-weight:900; padding:0 4px; vertical-align:baseline;">${this.MAX_COST}</span>以下になるように3人組を編成しろ！`;
                    }
                }
            }
        }
    }
}