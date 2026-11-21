/**
 * custom_rikishi.js
 * 新力士入門（キャラクリエイト）。
 *
 * 自分で顔を描き、能力を「強さ50以内」で割り振って力士を作る。
 * 作った力士はこの端末（localStorage）に保存し、読み込み時に RIKISHI_DATA の後ろへ加える。
 * 力士選択画面ではアイコンの一番下の段（新弟子の段）に並ぶ。
 *
 * 強さ・タイプ・コストの計算は config.js（calcStrength / calcPlayType / costFromStrength）。
 * スプレッドシートの式と同じなので、将来の通信対戦でも同じ計算で確かめられる。
 */

// ============================================================
// ■ 保存と読み込み
// ============================================================
const CustomRikishi = {
    STORAGE_KEY: 'sumochamp_custom_rikishi',
    VERSION: 1,             // データの形を変える時に上げる（通信対戦で互換を確かめるため）
    ID_BASE: 1000,          // 自作力士のID（スプシの力士と重ならないように1000番台）
    MAX_COUNT: CHAR_GRID.CUSTOM_COUNT,   // 新弟子の段に並べられる数（1段＝5人）
    STRENGTH_LIMIT: 50,     // 強さの上限
    NAME_MAX: 8,            // しこ名の最大文字数
    AI_TYPES: ['力押し', '技狙い', '素直', '変則'],
    BG_COLORS: ['#ffffff', '#9e9e9e', '#222222'],   // カード背景に選べる単色（白・グレー・黒）

    load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list.filter(r => r && r.id && r.face) : [];
        } catch (e) { return []; }
    },

    saveAll(list) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
            return true;
        } catch (e) {
            console.warn('新弟子を保存できませんでした', e);
            return false;
        }
    },

    nextId(list) {
        return list.reduce((m, r) => Math.max(m, r.id), this.ID_BASE - 1) + 1;
    },

    /** 保存データ1件を、ゲームで使う力士データ（RIKISHI_DATA の1件と同じ形）にする */
    toCharData(r) {
        const stats = {};
        STAT_KEYS.forEach(k => { stats[k] = clampInt(r[k], 1, 10, 3); });
        const type = calcPlayType(stats);
        const total = calcStrength(stats);
        return {
            id: r.id,
            custom: true,
            draft: false,
            name: String(r.name || '新弟子').replace(/[<>&"'`\\]/g, ''),
            nickname: '',
            img: r.face,
            desc: type + 'タイプ',
            playType: type,
            aiType: this.AI_TYPES.includes(r.aiType) ? r.aiType : '素直',
            ...stats,
            voice: '',
            slot: NaN,
            total,
            height: clampInt(r.height, 1, 5, 3),
            weight: clampInt(r.weight, 1, 5, 3),
            category: '新弟子',
            costume: '',
            bgImage: '',
            bgColor: CustomRikishi.BG_COLORS.includes(r.bgColor) ? r.bgColor : '',   // カード背景の単色（空ならタイプ別の模様）
            'コスト': costFromStrength(total)
        };
    },

    /** 保存されている新弟子を RIKISHI_DATA に入れ直す */
    injectAll() {
        if (typeof RIKISHI_DATA === 'undefined' || !Array.isArray(RIKISHI_DATA)) return;
        for (let i = RIKISHI_DATA.length - 1; i >= 0; i--) {
            if (RIKISHI_DATA[i].custom) RIKISHI_DATA.splice(i, 1);
        }
        this.load().forEach(r => {
            const d = this.toCharData(r);
            // 強さの上限を超えるデータ（手で書き換えた等）は並べない
            if (d.total <= this.STRENGTH_LIMIT) RIKISHI_DATA.push(d);
        });
    }
};

function clampInt(v, min, max, def) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, n));
}

// ============================================================
// ■ 新力士入門の画面
// ============================================================
const CreateScreen = {
    CANVAS_W: 320,          // キャンバスは真円（顔の形）
    CANVAS_H: 320,
    // 10色×4段。1段目は肌・髪など顔によく使う色。
    // 2〜4段目は同じ並び（赤・橙・黄・黄緑・緑・水色・青・藍・紫・桃）で、白に近い明るい色 → 鮮やかな色 → 濃い色
    COLORS: ['#111111', '#4a4a4a', '#9e9e9e', '#ffffff', '#fff1e0', '#fde3c8', '#f6d2b0', '#e8b08a', '#c47f55', '#8a5a3c',
             '#ffcdd2', '#ffe0b2', '#fff9c4', '#f0f4c3', '#c8e6c9', '#b2ebf2', '#bbdefb', '#c5cae9', '#e1bee7', '#f8bbd0',
             '#e53935', '#fb8c00', '#fdd835', '#c0ca33', '#43a047', '#00acc1', '#1e88e5', '#3949ab', '#8e24aa', '#f48fb1',
             '#8e1b1b', '#a0522d', '#9e7e00', '#827717', '#1b5e20', '#006064', '#0d47a1', '#1a237e', '#4a148c', '#ad1457'],

    editingId: null,
    dirty: false,           // 保存していない変更があるか
    form: null,
    tool: 'pen',
    color: '#111111',
    size: 9,
    history: [],
    drawing: false,

    // ---------------------------------------------------------------
    // 画面の出し入れ
    // ---------------------------------------------------------------
    open() {
        if (!this._built) this.build();
        // 空きがあれば新しく作るところから、5人いっぱいなら1人目を直すところから始める
        const list = CustomRikishi.load();
        if (list.length >= CustomRikishi.MAX_COUNT) this.edit(list[0].id);
        else this.newRikishi();
        this.renderList();
        const curtain = document.getElementById('transition-curtain');
        const show = () => {
            document.getElementById('start-screen').classList.remove('active');
            document.getElementById('create-screen').classList.add('active');
            if (typeof initFastScale === 'function') initFastScale();
        };
        if (curtain) {
            curtain.classList.add('active');
            setTimeout(show, 400);
            setTimeout(() => curtain.classList.remove('active'), 900);
        } else show();
    },

    async close() {
        if (!await this.confirmDiscard()) return;
        // 他の画面と同じく、読み込み直してタイトルへ戻る（作った力士も選択画面に反映される）
        location.reload();
    },

    /** 保存していない変更があれば、捨ててよいか聞く。進んでよければ true */
    async confirmDiscard() {
        if (!this.dirty) return true;
        return this.ask('保存していない変更があります。\n保存せずに移りますか？', '保存せずに移る');
    },

    markDirty() { this.dirty = true; },

    // ---------------------------------------------------------------
    // 画面の部品を作る（最初の1回だけ）
    // ---------------------------------------------------------------
    build() {
        this._built = true;

        // 色
        const colorBox = document.getElementById('create-colors');
        this.COLORS.forEach(c => {
            const b = document.createElement('button');
            b.className = 'create-color';
            b.style.background = c;
            b.dataset.color = c;
            b.onclick = () => {
                this.color = c;
                // 色を選んだら描く道具に戻す（消しゴム・移動・ズーム中ならペンへ）
                if (!['pen', 'fill'].includes(this.tool)) this.setTool('pen');
                this.paintTools();
            };
            colorBox.appendChild(b);
        });

        // 太さ（スライダー）。ズームの時は縮尺のスライダーになる
        const sizeEl = document.getElementById('create-size');
        sizeEl.value = this.size;
        sizeEl.oninput = () => {
            if (this.tool === 'zoom') { this.applyZoom(parseInt(sizeEl.value, 10)); return; }
            this.size = parseInt(sizeEl.value, 10);
            this.paintTools();
        };

        // 道具
        document.querySelectorAll('#create-tools [data-tool]').forEach(b => {
            b.onclick = () => this.setTool(b.dataset.tool);
        });
        document.getElementById('create-undo').onclick = () => this.undo();
        document.getElementById('create-clear').onclick = async () => {
            if (this.isCanvasEmpty()) return;
            if (!await this.ask('顔を全部消しますか？', '全部消す')) return;
            this.pushHistory();
            this.ctx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
            if (this.tool === 'zoom') this.setTool('zoom');   // 消した絵をズームの基準にし直す
            this.updatePreview();
        };
        document.getElementById('create-guide-toggle').onchange = (e) => {
            document.getElementById('create-guide').style.display = e.target.checked ? 'block' : 'none';
        };

        // 能力
        const statBox = document.getElementById('create-stats');
        const statLabels = { power: 'チカラ', tech: 'ギジュツ', speed: 'ハヤサ', stamina: 'タイリョク', spirit: 'キモチ', reversal: 'ギャクテン' };
        STAT_KEYS.forEach(k => {
            const row = document.createElement('div');
            row.className = 'create-stat-row';
            row.innerHTML = `
                <span class="create-stat-name">${statLabels[k]}</span>
                <button class="create-step" data-k="${k}" data-d="-1">－</button>
                <div class="create-stat-bar"><div class="create-stat-fill" id="create-fill-${k}"></div></div>
                <span class="create-stat-val" id="create-val-${k}">3</span>
                <button class="create-step" data-k="${k}" data-d="1">＋</button>`;
            statBox.appendChild(row);
        });
        statBox.querySelectorAll('.create-step').forEach(b => {
            b.onclick = () => this.step(b.dataset.k, parseInt(b.dataset.d, 10));
        });
        document.getElementById('create-stats-random').onclick = () => this.randomStats();

        // 身長・体重・思考
        ['height', 'weight'].forEach(k => {
            const el = document.getElementById(`create-${k}`);
            el.oninput = () => { this.form[k] = parseInt(el.value, 10); this.markDirty(); this.refresh(); };
        });
        this.buildChoice('create-ai', CustomRikishi.AI_TYPES, v => { this.form.aiType = v; this.markDirty(); this.refresh(); });

        document.getElementById('create-name').addEventListener('input', (e) => {
            this.form.name = e.target.value;
            this.markDirty();
            this.refresh();
        });
        document.getElementById('create-save').onclick = () => this.save();
        document.getElementById('create-delete').onclick = () => this.remove();
        document.getElementById('create-back').onclick = () => this.close();

        // カード背景の単色パレット（もう一度押すと元の模様に戻る）
        const palette = document.getElementById('create-bg-palette');
        CustomRikishi.BG_COLORS.forEach(c => {
            const b = document.createElement('button');
            b.className = 'create-bg-swatch';
            b.style.background = c;
            b.dataset.color = c;
            b.onclick = (e) => {
                e.stopPropagation();
                this.form.bgColor = (this.form.bgColor === c) ? '' : c;
                this.markDirty();
                this.refresh();
            };
            palette.appendChild(b);
        });

        // カードを押すと大きく見せる（団体戦の詳細と同じ）
        document.getElementById('create-card-wrap').onclick = () => this.showBigCard();

        // 顔の作り方の切り替え（パーツで作る／自分で描く）
        document.getElementById('create-mode-parts').onclick = () => this.setFaceMode('parts');
        document.getElementById('create-mode-draw').onclick = () => this.setFaceMode('draw');
        document.getElementById('parts-random').onclick = () => {
            this.parts = FaceParts.randomRecipe();
            this.partsChanged();
        };
        document.getElementById('parts-reset').onclick = () => {
            this.parts = FaceParts.defaultRecipe();
            this.partsChanged();
        };

        this.setupCanvas();
        this.drawGuide();
    },

    buildChoice(id, values, onPick) {
        const box = document.getElementById(id);
        values.forEach(v => {
            const b = document.createElement('button');
            b.className = 'create-choice';
            b.dataset.v = v;
            b.textContent = v;
            b.onclick = () => onPick(v);
            box.appendChild(b);
        });
    },

    // ---------------------------------------------------------------
    // パーツで作る
    // ---------------------------------------------------------------
    faceMode: 'parts',      // 'parts'（パーツで作る）か 'draw'（自分で描く）
    parts: null,            // パーツのレシピ（FaceParts）
    partsCat: 'face',       // いま選んでいるパーツの分類
    drawnOver: false,       // パーツの顔に、自分で描き足したか

    /** 顔の作り方を切り替える */
    async setFaceMode(mode) {
        if (mode === this.faceMode) return;
        if (mode === 'parts') {
            // 描いた絵はパーツでは表せないので、パーツに戻すと消える
            const hasDrawing = this.drawnOver || (!this.parts && !this.isCanvasEmpty());
            if (hasDrawing && !await this.ask('描いた分は消えて、パーツで作った顔に戻ります。\nよろしいですか？', 'パーツに戻る')) return;
            if (this.tool === 'zoom') this.setTool('pen');
            if (!this.parts) this.parts = FaceParts.randomRecipe();   // 初めてパーツにした時は、おまかせのパーツで始める
            this.drawnOver = false;
            this.faceMode = 'parts';
            this.markDirty();
            this.renderParts();
        } else {
            // パーツで作った顔はそのまま残り、その上から描き足せる
            this.faceMode = 'draw';
            this.history = [];
        }
        this.paintFaceMode();
    },

    paintFaceMode() {
        const center = document.getElementById('create-center');
        center.classList.toggle('parts-mode', this.faceMode === 'parts');
        center.classList.toggle('draw-mode', this.faceMode === 'draw');
        document.getElementById('create-mode-parts').classList.toggle('active', this.faceMode === 'parts');
        document.getElementById('create-mode-draw').classList.toggle('active', this.faceMode === 'draw');
    },

    /** パーツを変えた時：顔を描き直し、選択の表示も更新する */
    partsChanged({ ui = true } = {}) {
        this.markDirty();
        this.renderParts({ ui });
    },

    renderParts({ ui = true } = {}) {
        FaceParts.render(this.ctx, this.parts, this.CANVAS_W);
        this.applyMask();
        this.updatePreview();
        if (ui) this.renderPartsUI();
    },

    /** パーツを選ぶ所（分類・種類・色・スライダー）を作り直す */
    renderPartsUI() {
        const cat = this.partsCat;
        const r = this.parts;

        const cats = document.getElementById('parts-cats');
        cats.innerHTML = '';
        FaceParts.CATS.forEach(c => {
            const b = document.createElement('button');
            b.className = 'parts-cat' + (c.id === cat ? ' active' : '');
            b.textContent = c.label;
            b.onclick = () => { this.partsCat = c.id; this.renderPartsUI(); };
            cats.appendChild(b);
        });

        // 種類：そのパーツだけを、小さな見本で見せる（名前は出さない）
        const types = document.getElementById('parts-types');
        types.innerHTML = '';
        const area = FaceParts.PART_AREA[cat];
        const off = document.createElement('canvas');
        off.width = off.height = FaceParts.SIZE;
        const octx = off.getContext('2d');
        FaceParts.TYPES[cat].forEach(([id]) => {
            const b = document.createElement('button');
            b.className = 'parts-type' + (r[cat].type === id ? ' active' : '');
            const cv = document.createElement('canvas');
            cv.width = cv.height = 96;
            const trial = FaceParts.normalize(r);
            trial[cat] = { ...trial[cat], type: id };
            FaceParts.renderPart(octx, trial, cat);
            // パーツのある範囲を、見本の枠いっぱいに（縦横の比は保つ）
            // （範囲がキャンバスの外にはみ出しても、ブラウザがはみ出た分だけ切って縮尺は保つ）
            const s = Math.max(area[2], area[3]);
            cv.getContext('2d').drawImage(off, area[0] + (area[2] - s) / 2, area[1] + (area[3] - s) / 2, s, s, 0, 0, 96, 96);
            b.appendChild(cv);
            b.onclick = () => { r[cat].type = id; this.partsChanged(); };
            types.appendChild(b);
        });

        // 色
        const colors = document.getElementById('parts-colors');
        colors.innerHTML = '';
        (FaceParts.COLORS[cat] || []).forEach(c => {
            const b = document.createElement('button');
            b.className = 'parts-color' + (r[cat].color === c ? ' active' : '');
            b.style.background = c;
            b.onclick = () => { r[cat].color = c; this.partsChanged(); };
            colors.appendChild(b);
        });
        colors.style.display = FaceParts.COLORS[cat] ? '' : 'none';

        // 位置・大きさなどのスライダー（動かしている間は顔だけ描き直し、選ぶ所は作り直さない）
        const sliders = document.getElementById('parts-sliders');
        sliders.innerHTML = '';
        (FaceParts.SLIDERS[cat] || []).forEach(([key, label, min, max, step]) => {
            const row = document.createElement('label');
            row.className = 'parts-slider';
            row.innerHTML = `<span>${label}</span><input type="range" class="create-range" min="${min}" max="${max}" step="${step}">`;
            const input = row.querySelector('input');
            input.value = r[cat][key];
            input.oninput = () => { r[cat][key] = parseFloat(input.value); this.partsChanged({ ui: false }); };
            input.onchange = () => this.renderPartsUI();
            sliders.appendChild(row);
        });
    },

    // ---------------------------------------------------------------
    // 道具の切り替え・移動・ズーム
    // ---------------------------------------------------------------
    setTool(tool) {
        if (this.tool === 'zoom' && tool !== 'zoom') this.endZoom();
        this.tool = tool;
        const sizeEl = document.getElementById('create-size');
        const label = document.getElementById('create-size-label');
        if (tool === 'zoom') {
            this.startZoom();
            // 真ん中が今の大きさ。右へ動かすと大きく、左へ動かすと小さく
            sizeEl.min = -50; sizeEl.max = 50; sizeEl.value = 0;
            label.textContent = '縮尺';
        } else {
            sizeEl.min = 2; sizeEl.max = 30; sizeEl.value = this.size;
            label.textContent = '太さ';
        }
        this.paintTools();
    },

    /** スライダーの値(-50〜50)を倍率にする：0で等倍、右端で2倍、左端で半分 */
    zoomScale(v) { return Math.pow(2, v / 50); },

    /** ズームを始める時の絵を覚えておき、いつもこの絵から拡大・縮小する（何度動かしても絵が荒れないように） */
    startZoom() {
        const base = document.createElement('canvas');
        base.width = this.CANVAS_W; base.height = this.CANVAS_H;
        base.getContext('2d').drawImage(this.canvas, 0, 0);
        this.zoomBase = base;
        this.zoomPushed = false;
    },

    applyZoom(v) {
        if (!this.zoomBase) this.startZoom();
        if (!this.zoomPushed) { this.pushHistory(); this.zoomPushed = true; }
        const s = this.zoomScale(v);
        const W = this.CANVAS_W, H = this.CANVAS_H;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(this.zoomBase, W / 2 - W * s / 2, H / 2 - H * s / 2, W * s, H * s);
        this.applyMask();
        this.paintTools();
        this.updatePreview();
    },

    endZoom() {
        this.zoomBase = null;
        this.zoomPushed = false;
    },

    // ---------------------------------------------------------------
    // お絵かき
    // ---------------------------------------------------------------
    setupCanvas() {
        const cv = document.getElementById('create-canvas');
        cv.width = this.CANVAS_W; cv.height = this.CANVAS_H;
        this.canvas = cv;
        this.ctx = cv.getContext('2d');

        // 画面の拡縮に関係なく、キャンバス上の座標へ直す
        const pos = (e) => {
            const r = cv.getBoundingClientRect();
            return { x: (e.clientX - r.left) * this.CANVAS_W / r.width, y: (e.clientY - r.top) * this.CANVAS_H / r.height };
        };
        cv.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            const p = pos(e);
            if (this.faceMode === 'parts') return;   // パーツで作っている間は描けない（「自分で描く」で描き足す）
            if (this.tool === 'zoom') return;   // ズームは下のスライダーで行う
            this.pushHistory();
            if (this.tool === 'move') {
                // 押した時の絵を覚えておき、ドラッグした分だけずらして描き直す
                const snap = document.createElement('canvas');
                snap.width = this.CANVAS_W; snap.height = this.CANVAS_H;
                snap.getContext('2d').drawImage(cv, 0, 0);
                this.moveSnap = snap;
                this.moveStart = p;
                this.drawing = true;
                cv.setPointerCapture(e.pointerId);
                return;
            }
            if (this.tool === 'fill') {
                this.floodFill(Math.floor(p.x), Math.floor(p.y), this.color);
                this.applyMask();
                this.updatePreview();
                return;
            }
            this.drawing = true;
            cv.setPointerCapture(e.pointerId);
            this.last = p;
            this.stroke(p, p);
        });
        cv.addEventListener('pointermove', (e) => {
            if (!this.drawing) return;
            const p = pos(e);
            if (this.tool === 'move') {
                this.ctx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
                this.ctx.drawImage(this.moveSnap, p.x - this.moveStart.x, p.y - this.moveStart.y);
                return;
            }
            this.stroke(this.last, p);
            this.last = p;
        });
        const end = () => {
            if (!this.drawing) return;
            this.drawing = false;
            this.moveSnap = null;
            this.applyMask();
            this.updatePreview();
        };
        cv.addEventListener('pointerup', end);
        cv.addEventListener('pointercancel', end);
    },

    /** キャンバスは楕円形。楕円の外にはみ出した部分は消す（見えている絵＝保存される絵にする） */
    applyMask() {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        ctx.beginPath();
        ctx.ellipse(this.CANVAS_W / 2, this.CANVAS_H / 2, this.CANVAS_W / 2, this.CANVAS_H / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    },

    stroke(a, b) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalCompositeOperation = (this.tool === 'eraser') ? 'destination-out' : 'source-over';
        ctx.strokeStyle = this.color;
        ctx.lineWidth = (this.tool === 'eraser') ? this.size * 2 : this.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x + 0.01, b.y);
        ctx.stroke();
        ctx.restore();
    },

    /** 塗りつぶし：押した所とつながっている同じ色の範囲を塗る（線のふちのにじみも少し許す） */
    floodFill(x, y, hex) {
        const W = this.CANVAS_W, H = this.CANVAS_H;
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const img = this.ctx.getImageData(0, 0, W, H);
        const d = img.data;
        const at = (i) => [d[i], d[i + 1], d[i + 2], d[i + 3]];
        const start = at((y * W + x) * 4);
        const fill = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
        const TOL = 60;
        const same = (i) => {
            // 透明どうしは色に関係なく同じとみなす
            if (start[3] < 30 && d[i + 3] < 30) return true;
            return Math.abs(d[i] - start[0]) + Math.abs(d[i + 1] - start[1])
                 + Math.abs(d[i + 2] - start[2]) + Math.abs(d[i + 3] - start[3]) <= TOL;
        };
        if (Math.abs(start[0] - fill[0]) + Math.abs(start[1] - fill[1]) + Math.abs(start[2] - fill[2]) < 4 && start[3] === 255) return;

        const seen = new Uint8Array(W * H);
        const stack = [y * W + x];
        while (stack.length) {
            const p = stack.pop();
            if (seen[p]) continue;
            seen[p] = 1;
            const i = p * 4;
            if (!same(i)) continue;
            d[i] = fill[0]; d[i + 1] = fill[1]; d[i + 2] = fill[2]; d[i + 3] = 255;
            const px = p % W;
            if (px > 0) stack.push(p - 1);
            if (px < W - 1) stack.push(p + 1);
            if (p >= W) stack.push(p - W);
            if (p < W * (H - 1)) stack.push(p + W);
        }
        this.ctx.putImageData(img, 0, 0);
    },

    pushHistory() {
        this.markDirty();   // 絵を変える操作の直前に必ず呼ばれる
        // パーツで作った顔に描き足した印（パーツに戻る時は、描き足した分が消えると知らせる）
        if (this.faceMode === 'draw') this.drawnOver = true;
        this.history.push(this.ctx.getImageData(0, 0, this.CANVAS_W, this.CANVAS_H));
        if (this.history.length > 30) this.history.shift();
    },

    undo() {
        const prev = this.history.pop();
        if (!prev) return;
        this.ctx.putImageData(prev, 0, 0);
        this.markDirty();
        // ズーム中に戻したら、戻した絵を新しい基準にしてスライダーを真ん中へ
        if (this.tool === 'zoom') this.setTool('zoom');
        this.updatePreview();
    },

    /** 下書き線：目・口の高さと顔の中心の目安（保存される絵には入らない）。顔の形はキャンバスの円そのもの */
    drawGuide() {
        const g = document.getElementById('create-guide');
        g.width = this.CANVAS_W; g.height = this.CANVAS_H;
        const c = g.getContext('2d');
        const W = this.CANVAS_W, H = this.CANVAS_H;
        c.clearRect(0, 0, W, H);
        c.strokeStyle = 'rgba(80, 60, 40, 0.35)';
        c.lineWidth = 3;
        c.setLineDash([6, 8]);
        c.beginPath(); c.moveTo(W / 2, H * 0.1); c.lineTo(W / 2, H * 0.9); c.stroke();        // 顔の中心
        c.beginPath(); c.moveTo(W * 0.14, H * 0.46); c.lineTo(W * 0.86, H * 0.46); c.stroke(); // 目の高さ
        c.beginPath(); c.moveTo(W * 0.32, H * 0.72); c.lineTo(W * 0.68, H * 0.72); c.stroke(); // 口の高さ
    },

    isCanvasEmpty() {
        const d = this.ctx.getImageData(0, 0, this.CANVAS_W, this.CANVAS_H).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 20) return false;
        return true;
    },

    /** 描いた顔を、他の力士と同じように「下の端に合わせて」使う画像にする */
    exportFace() {
        return this.canvas.toDataURL('image/png');
    },

    loadFace(dataUrl) {
        // 別の力士に切り替える時、ズームの途中なら終えておく（前の絵を基準に拡大しないように）
        if (this.tool === 'zoom') this.setTool('pen');
        this.ctx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
        this.history = [];
        if (!dataUrl) { this.updatePreview(); return; }
        const img = new Image();
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
            this.ctx.drawImage(img, 0, 0, this.CANVAS_W, this.CANVAS_H);
            this.updatePreview();
        };
        img.src = dataUrl;
    },

    // ---------------------------------------------------------------
    // 能力・入力
    // ---------------------------------------------------------------
    newRikishi() {
        this.editingId = null;
        this.form = { name: '', power: 3, tech: 3, speed: 3, stamina: 3, spirit: 3, reversal: 3, height: 3, weight: 3, aiType: '素直', bgColor: '' };
        document.getElementById('create-name').value = '';
        this.loadFace(null);
        // 新しく作る時は、まず「自分で描く」から。パーツのタブを押すと、おまかせのパーツで始まる
        this.parts = null;
        this.partsCat = 'face';
        this.faceMode = 'draw';
        this.drawnOver = false;
        this.history = [];
        this.paintFaceMode();
        this.refresh();
        this.dirty = false;
    },

    edit(id) {
        const r = CustomRikishi.load().find(x => x.id === id);
        if (!r) return;
        this.editingId = id;
        this.form = {
            name: r.name || '',
            height: clampInt(r.height, 1, 5, 3), weight: clampInt(r.weight, 1, 5, 3),
            aiType: CustomRikishi.AI_TYPES.includes(r.aiType) ? r.aiType : '素直',
            bgColor: CustomRikishi.BG_COLORS.includes(r.bgColor) ? r.bgColor : ''
        };
        STAT_KEYS.forEach(k => { this.form[k] = clampInt(r[k], 1, 10, 3); });
        document.getElementById('create-name').value = this.form.name;
        // パーツで作って描き足していない顔は、パーツのまま直せるように開く。それ以外は絵として開く
        this.parts = r.parts ? FaceParts.normalize(r.parts) : null;
        this.partsCat = 'face';
        this.drawnOver = !!r.drawnOver;
        if (this.parts && !r.drawnOver) {
            this.loadFace(null);
            this.faceMode = 'parts';
            this.renderParts();
        } else {
            this.faceMode = 'draw';
            this.loadFace(r.face);
        }
        this.paintFaceMode();
        this.refresh();
        this.renderList();
        this.dirty = false;
    },

    strength() { return calcStrength(this.form); },

    step(k, d) {
        const v = this.form[k] + d;
        if (v < 1 || v > 10) return;
        const next = { ...this.form, [k]: v };
        if (d > 0 && calcStrength(next) > CustomRikishi.STRENGTH_LIMIT) {
            this.flashLimit();
            return;
        }
        this.form[k] = v;
        this.markDirty();
        this.refresh();
    },

    /**
     * 能力おまかせ：強さ50を使い切るように、6つの能力をランダムに割り振る。
     * 毎回「得意な能力」を1〜2つ決めて上がりやすくし、似たような平均型ばかりにならないようにする。
     */
    randomStats() {
        const limit = CustomRikishi.STRENGTH_LIMIT;
        const f = this.form;
        STAT_KEYS.forEach(k => { f[k] = 1; });
        const weight = {};
        STAT_KEYS.forEach(k => { weight[k] = 1; });
        const favorites = [...STAT_KEYS].sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 2));
        favorites.forEach(k => { weight[k] = 4; });
        for (let guard = 0; guard < 200; guard++) {
            // もう1上げても強さ50以内に収まる能力だけが候補
            const cands = STAT_KEYS.filter(k => f[k] < 10 && calcStrength({ ...f, [k]: f[k] + 1 }) <= limit);
            if (!cands.length) break;
            const total = cands.reduce((s, k) => s + weight[k], 0);
            let r = Math.random() * total;
            const pick = cands.find(k => (r -= weight[k]) < 0) || cands[cands.length - 1];
            f[pick]++;
        }
        this.markDirty();
        this.refresh();
    },

    flashLimit() {
        const el = document.getElementById('create-strength');
        el.classList.remove('over'); void el.offsetWidth; el.classList.add('over');
    },

    refresh() {
        const f = this.form;
        const str = this.strength();
        const limit = CustomRikishi.STRENGTH_LIMIT;

        STAT_KEYS.forEach(k => {
            const valEl = document.getElementById(`create-val-${k}`);
            valEl.textContent = f[k];
            // カードと同じく、3以下は赤・8以上は青
            valEl.classList.toggle('stat-low', f[k] <= 3);
            valEl.classList.toggle('stat-high', f[k] >= 8);
            document.getElementById(`create-fill-${k}`).style.width = `${f[k] * 10}%`;
            const plus = document.querySelector(`.create-step[data-k="${k}"][data-d="1"]`);
            const minus = document.querySelector(`.create-step[data-k="${k}"][data-d="-1"]`);
            plus.disabled = f[k] >= 10 || calcStrength({ ...f, [k]: f[k] + 1 }) > limit;
            minus.disabled = f[k] <= 1;
        });

        document.getElementById('create-strength-val').textContent = str;
        document.getElementById('create-strength-fill').style.width = `${Math.min(100, str / limit * 100)}%`;
        const type = calcPlayType(f);
        document.getElementById('create-type').textContent = type + 'タイプ';
        document.getElementById('create-cost').textContent = costFromStrength(str);

        const paint = (id, v) => document.querySelectorAll(`#${id} .create-choice`)
            .forEach(b => b.classList.toggle('active', String(b.dataset.v) === String(v)));
        ['height', 'weight'].forEach(k => {
            document.getElementById(`create-${k}`).value = f[k];
            document.getElementById(`create-${k}-val`).textContent = f[k];
        });
        paint('create-ai', f.aiType);
        document.querySelectorAll('.create-bg-swatch')
            .forEach(b => b.classList.toggle('active', b.dataset.color === f.bgColor));

        // 新しく作る時は「保存」だけ、作った力士を直す時は「削除」「保存」
        document.getElementById('create-delete').style.display = this.editingId ? '' : 'none';
        this.updatePreview();
    },

    paintTools() {
        document.querySelectorAll('#create-tools [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === this.tool));
        document.querySelectorAll('.create-color').forEach(b => b.classList.toggle('active', b.dataset.color === this.color && this.tool !== 'eraser'));
        // キャンバスのカーソル：移動は手のひら、ズームは何もしない
        if (this.canvas) {
            this.canvas.style.cursor = { move: 'grab', zoom: 'default' }[this.tool] || 'crosshair';
        }
        // ズーム中は丸の代わりに倍率（％）を出す
        const zoomVal = document.getElementById('create-zoom-val');
        const dot = document.getElementById('create-size-dot');
        if (this.tool === 'zoom') {
            const v = parseInt(document.getElementById('create-size').value, 10) || 0;
            if (zoomVal) { zoomVal.textContent = `${Math.round(this.zoomScale(v) * 100)}%`; zoomVal.style.display = ''; }
            if (dot) dot.style.display = 'none';
            return;
        }
        if (zoomVal) zoomVal.style.display = 'none';
        if (dot) dot.style.display = '';
        // 太さの見本の丸（消しゴムは実際に2倍の太さで消える）
        if (dot) {
            const px = (this.tool === 'eraser') ? this.size * 2 : this.size;
            dot.style.width = dot.style.height = `${Math.min(px, 40)}px`;
            dot.style.background = (this.tool === 'eraser') ? '#fff' : this.color;
        }
    },

    /**
     * 左の見本：力士選択画面と同じ力士カードで見せる。能力や顔を変えるとその場で書き換わる。
     * カードの描画は ui.updatePreview をそのまま使う（見た目を揃えるため）。
     * そのために作りかけの力士を一瞬だけ RIKISHI_DATA に入れ、描いたらすぐ取り除く。
     */
    updatePreview() {
        this.paintTools();
        const box = document.getElementById('preview-create');
        if (!box || !this.form) return;
        this.renderCard('create', box);
        // 登場の動きは画面を開いた最初の1回だけ（数値を変えるたびに飛び込んでくると見づらい）
        if (this._cardShown) box.classList.add('no-dock');
        this._cardShown = true;
    },

    /** 作りかけの力士のカードを、指定した枠（preview-<playerId>）に描く */
    renderCard(playerId, box) {
        if (typeof game === 'undefined' || !game.ui) return;
        const PREVIEW_ID = -100;
        const f = this.form;
        const d = CustomRikishi.toCharData({
            ...f, id: PREVIEW_ID,
            name: (f.name || '').trim() || ' ',
            face: this.canvas ? this.exportFace() : ''
        });
        RIKISHI_DATA.push(d);
        try { game.ui.updatePreview(playerId, PREVIEW_ID); }
        finally {
            const i = RIKISHI_DATA.indexOf(d);
            if (i >= 0) RIKISHI_DATA.splice(i, 1);
        }
        // 操作の欄（P1/P2/CPU）は、作る画面では1Pとして見せる
        const ctrl = box.querySelector('.preview-badge-control');
        if (ctrl) ctrl.textContent = 'P1';
        // 四股名が未記入の間は、カードの名前の欄に何も書かない
        if (!(f.name || '').trim()) {
            const nameEl = box.querySelector('.preview-name');
            if (nameEl) nameEl.textContent = '';
        }
    },

    /** カードを押した時：団体戦の詳細と同じく、画面の真ん中に大きく出す（背景を押すと閉じる） */
    showBigCard() {
        const existing = document.getElementById('char-detail-overlay');
        if (existing) existing.remove();
        const ov = document.createElement('div');
        ov.id = 'char-detail-overlay';
        ov.className = 'char-detail-overlay create-detail';
        ov.innerHTML = `<div class="char-detail-card"><div class="preview-box" id="preview-detailview"></div></div>`;
        document.body.appendChild(ov);
        this.renderCard('detailview', document.getElementById('preview-detailview'));
        ov.addEventListener('click', () => ov.remove());
    },

    /** お知らせだけの小さな画面（ボタンは「OK」だけ） */
    notice(message) {
        return this.ask(message, 'OK', { single: true });
    },

    /** はい／いいえを選ぶ小さな画面を出す。はいなら true（single なら「OK」だけ） */
    ask(message, okLabel = 'はい', { single = false } = {}) {
        return new Promise(resolve => {
            const wrap = document.getElementById('create-confirm');
            document.getElementById('create-confirm-msg').textContent = message;
            const ok = document.getElementById('create-confirm-ok');
            const cancel = document.getElementById('create-confirm-cancel');
            ok.textContent = okLabel;
            cancel.style.display = single ? 'none' : '';
            const done = (v) => { wrap.classList.remove('active'); ok.onclick = cancel.onclick = null; resolve(v); };
            ok.onclick = () => done(true);
            cancel.onclick = () => done(false);
            wrap.onclick = (e) => { if (e.target === wrap) done(false); };
            wrap.classList.add('active');
        });
    },

    // ---------------------------------------------------------------
    // 保存・削除・一覧
    // ---------------------------------------------------------------
    async save() {
        // 記号の一部は画面の表示を壊すことがあるので使えないようにする
        const name = (this.form.name || '').replace(/[<>&"'`\\]/g, '').trim();
        const list = CustomRikishi.load();

        // 登録できない理由があれば、まとめて知らせる
        const errors = [];
        if (!name) errors.push('四股名を入れてください');
        else if (name.length > CustomRikishi.NAME_MAX) errors.push(`四股名は${CustomRikishi.NAME_MAX}文字までです`);
        if (this.isCanvasEmpty()) errors.push('顔を描いてください');
        if (this.strength() > CustomRikishi.STRENGTH_LIMIT) errors.push(`強さが${CustomRikishi.STRENGTH_LIMIT}を超えています`);
        if (!this.editingId && list.length >= CustomRikishi.MAX_COUNT) {
            errors.push(`新弟子は${CustomRikishi.MAX_COUNT}人までです。誰かを削除してください`);
        }
        if (errors.length) {
            await this.notice('保存できません\n\n' + errors.map(e => '・' + e).join('\n'));
            if (!name) document.getElementById('create-name').focus();
            return;
        }

        // 登録できる時は、保存してよいか確かめる
        const question = this.editingId
            ? `${name} の変更を保存しますか？`
            : `${name} を入門させますか？`;
        if (!await this.ask(question, '保存する')) return;
        const rec = {
            v: CustomRikishi.VERSION,
            id: this.editingId || CustomRikishi.nextId(list),
            name,
            face: this.exportFace(),
            height: this.form.height, weight: this.form.weight,
            aiType: this.form.aiType,
            bgColor: this.form.bgColor || '',
            // パーツで作った時のレシピ（あとでパーツのまま直せるように）。描き足したかどうかも残す
            parts: this.parts || null,
            drawnOver: this.faceMode === 'draw' && this.drawnOver,
            updated: new Date().toISOString()
        };
        STAT_KEYS.forEach(k => { rec[k] = this.form[k]; });

        const idx = list.findIndex(r => r.id === rec.id);
        if (idx >= 0) list[idx] = rec; else list.push(rec);
        if (!CustomRikishi.saveAll(list)) { await this.notice('保存できませんでした\n（端末の空き容量が足りない可能性があります）'); return; }
        CustomRikishi.injectAll();

        const wasNew = !this.editingId;
        this.editingId = rec.id;
        this.toast(wasNew ? `${name} が入門しました！` : `${name} を保存しました`);
        if (wasNew && typeof SoundFX !== 'undefined') SoundFX.playVoice('dosukoi');
        this.refresh();
        this.renderList();
        this.dirty = false;
    },

    async remove() {
        if (!this.editingId) return;
        const list = CustomRikishi.load();
        const r = list.find(x => x.id === this.editingId);
        if (!r || !await this.ask(`${r.name} を削除しますか？（元に戻せません）`, '削除する')) return;
        CustomRikishi.saveAll(list.filter(x => x.id !== this.editingId));
        CustomRikishi.injectAll();
        this.toast(`${r.name} を削除しました`);
        this.newRikishi();
        this.renderList();
    },

    /**
     * 新弟子一覧：作れる数（5人）のマスを最初から並べる。
     * 作った力士のマスを押すとその力士を直せる。空きマスを押すと新しく作る。
     */
    renderList() {
        const box = document.getElementById('create-list');
        if (!box) return;
        const list = CustomRikishi.load();
        box.innerHTML = '';
        // 新しく作っている間は、最初の空きマスを「いま作っているマス」として光らせる
        let newMarked = false;
        for (let i = 0; i < CustomRikishi.MAX_COUNT; i++) {
            const r = list[i];
            const b = document.createElement('button');
            if (r) {
                // 力士選択画面のアイコンと同じ見た目：顔＋タイプ別の背景、右下にコスト
                const d = CustomRikishi.toCharData(r);
                b.className = 'create-list-item create-list-char' + (r.id === this.editingId ? ' active' : '');
                const bgCss = charBgCss(d);
                b.style.backgroundImage = bgCss ? `url('${r.face}'), ${bgCss}` : `url('${r.face}')`;
                b.title = r.name;
                b.innerHTML = costBadgeHtml(d['コスト'], false);
                b.onclick = () => this.switchTo(r.id);
            } else {
                const active = !this.editingId && !newMarked;
                if (active) newMarked = true;
                b.className = 'create-list-item create-list-empty' + (active ? ' active' : '');
                b.innerHTML = '<span class="create-list-plus">＋</span>';
                b.title = '新しく作る';
                b.onclick = () => this.switchTo(null);
            }
            box.appendChild(b);
        }
        document.getElementById('create-count').textContent = `${list.length} / ${CustomRikishi.MAX_COUNT}`;
    },

    /** 一覧のマスを押した時：保存していない変更があれば確認してから切り替える */
    async switchTo(id) {
        if (id === this.editingId) return;
        if (!await this.confirmDiscard()) return;
        if (id) this.edit(id);
        else { this.newRikishi(); this.renderList(); }
    },

    toast(msg) {
        if (typeof settings !== 'undefined' && settings.showToast) settings.showToast(msg);
        else alert(msg);
    }
};

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
