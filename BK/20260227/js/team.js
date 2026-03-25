// js/team_ui.js
class TeamUIManager {
    constructor(game) {
        this.game = game;
        this.els = {
            iconGrid: document.getElementById('icon-grid'),
            ghost: document.getElementById('drag-ghost'),
            startBtn: document.getElementById('team-start-btn')
        };
        this.MAX_COST = 15; // どすこいパワーの上限
        
        this.initSelectScreen();
    }

    initSelectScreen() {
        if (typeof RIKISHI_DATA === 'undefined' || RIKISHI_DATA.length === 0) {
            setTimeout(() => this.initSelectScreen(), 500);
            return;
        }

        // キャラクター一覧の生成
        this.els.iconGrid.innerHTML = '';
        RIKISHI_DATA.forEach(charData => {
            const icon = document.createElement('div');
            icon.className = 'char-select-icon';
            // レジェンドなどは色分け（既存の仕様を踏襲）
            if (charData.category === "レジェンド") icon.classList.add('cat-legend');
            
            icon.dataset.id = charData.id;
            icon.style.backgroundImage = `url('assets/img/${charData.img}')`;
            // コスト表示をアイコンにも付けると親切
            icon.innerHTML = `<div style="position:absolute; bottom:0; right:0; background:rgba(0,0,0,0.7); color:#fff; font-size:0.8rem; padding:2px 4px; border-radius:4px;">${charData.total || 0}</div>`;
            this.els.iconGrid.appendChild(icon);
        });

        this.initDraggableIcons();
        this.updateTeamDisplay();
    }

    initDraggableIcons() {
        let isDragging = false;
        let dragId = null;

        // ドラッグ開始
        document.addEventListener('mousedown', (e) => {
            const icon = e.target.closest('.char-select-icon');
            if (icon && icon.hasAttribute('data-id')) {
                e.preventDefault();
                isDragging = true;
                dragId = parseInt(icon.dataset.id);
                
                const charData = RIKISHI_DATA.find(d => d.id === dragId);
                if (charData) {
                    this.els.ghost.style.backgroundImage = `url('assets/img/${charData.img}')`;
                    this.els.ghost.style.display = 'block';
                    this.moveGhost(e.clientX, e.clientY);
                }
            }
        });

        // ドラッグ中
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            this.moveGhost(e.clientX, e.clientY);

            // スロットの上に重なっているか判定してハイライト
            document.querySelectorAll('.team-slot').forEach(slot => {
                const rect = slot.getBoundingClientRect();
                if (this.isHit(e.clientX, e.clientY, rect)) {
                    slot.classList.add('drag-hover');
                } else {
                    slot.classList.remove('drag-hover');
                }
            });
        });

        // ドロップ（指を離した時）
        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return;
            isDragging = false;
            this.els.ghost.style.display = 'none';

            document.querySelectorAll('.team-slot').forEach(slot => {
                slot.classList.remove('drag-hover');
                const rect = slot.getBoundingClientRect();
                if (this.isHit(e.clientX, e.clientY, rect)) {
                    const player = slot.dataset.player; // "p1" or "p2"
                    const index = parseInt(slot.dataset.index); // 0, 1, 2
                    
                    // ゲームマネージャーに編成を伝達
                    this.game.selectTeamChar(player, index, dragId);
                }
            });
        });
    }

    moveGhost(x, y) {
        this.els.ghost.style.left = (x - 50) + 'px'; // マウスの中心に合わせる
        this.els.ghost.style.top = (y - 50) + 'px';
    }

    isHit(x, y, rect) {
        return (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    }

    updateTeamDisplay() {
        ['p1', 'p2'].forEach(player => {
            let totalCost = 0;
            const team = this.game.state.teams[player];

            team.forEach((charId, index) => {
                const slot = document.getElementById(`${player}-slot-${index}`);
                if (!slot) return;

                const labelNames = ['先鋒', '中堅', '大将'];

                if (charId !== null) {
                    const charData = RIKISHI_DATA.find(d => d.id === charId);
                    slot.classList.add('is-filled');
                    slot.style.backgroundImage = `url('assets/img/${charData.img}')`;
                    slot.innerHTML = `
                        <div class="slot-label">${labelNames[index]}</div>
                        <div style="position:absolute; bottom:5px; background:rgba(0,0,0,0.8); padding:2px 8px; border-radius:10px;">
                            コスト: ${charData.total || 0}
                        </div>
                    `;
                    totalCost += (charData.total || 0); // どすこいパワーを加算
                } else {
                    slot.classList.remove('is-filled');
                    slot.style.backgroundImage = 'none';
                    slot.innerHTML = `<div class="slot-label">${labelNames[index]}</div><div class="slot-empty-text">未選択</div>`;
                }
            });

            // コストUIの描画更新
            const costValEl = document.getElementById(`${player}-cost-val`);
            const costBarEl = document.getElementById(`${player}-cost-bar`);
            const labelEl = costValEl.parentElement;

            costValEl.textContent = totalCost;
            
            // バーの長さは最大値を超えても100%で止める
            const pct = Math.min(100, (totalCost / this.MAX_COST) * 100);
            costBarEl.style.width = `${pct}%`;

            if (totalCost > this.MAX_COST) {
                costBarEl.classList.add('over-cost');
                labelEl.classList.add('over-cost');
            } else {
                costBarEl.classList.remove('over-cost');
                labelEl.classList.remove('over-cost');
            }
        });

        this.checkStartCondition();
    }

    checkStartCondition() {
        const p1Team = this.game.state.teams.p1;
        const p2Team = this.game.state.teams.p2;

        // 全てのスロットが埋まっているか確認
        const p1Ready = p1Team.every(id => id !== null);
        const p2Ready = p2Team.every(id => id !== null);

        // コストオーバーしていないか確認
        let p1Cost = 0, p2Cost = 0;
        p1Team.forEach(id => { if(id !== null) p1Cost += (RIKISHI_DATA.find(d => d.id === id)?.total || 0); });
        p2Team.forEach(id => { if(id !== null) p2Cost += (RIKISHI_DATA.find(d => d.id === id)?.total || 0); });

        const isCostOk = (p1Cost <= this.MAX_COST && p2Cost <= this.MAX_COST);

        // 両チーム準備完了＆コスト内ならスタートボタンを有効化
        if (p1Ready && p2Ready && isCostOk) {
            this.els.startBtn.disabled = false;
            this.els.startBtn.textContent = "いざ、尋常に勝負！";
        } else if (!isCostOk) {
            this.els.startBtn.disabled = true;
            this.els.startBtn.textContent = "コストオーバーです";
        } else {
            this.els.startBtn.disabled = true;
            this.els.startBtn.textContent = "全員編成してください";
        }
    }
}