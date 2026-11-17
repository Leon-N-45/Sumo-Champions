/**
 * face_parts.js
 * 入門（キャラクリエイト）の「パーツで作る」。輪郭・髪・眉・目・鼻・口などを選んで顔を組み立てる。
 *
 * 顔は「レシピ」（どのパーツを・何色で・どこに）として持ち、render でキャンバスに描く。
 * 出来上がるのは「自分で描く」と同じ顔の画像なので、カード・戦闘・遠征はそのまま使える。
 * renderPart は1つのパーツだけを描く（パーツを選ぶボタンの見本に使う）。
 *
 * パーツの絵はプログラムで描いている（線と色だけのシンプルな絵）。
 * 絵を描いた画像に差し替えたい時は、そのパーツを描く関数の中身を drawImage に置き換えればよい。
 *
 * 座標は 320×320 のキャンバス（円の中が顔になる）を基準にしている。顔の中心の横位置は 160。
 */
const FaceParts = {
    SIZE: 320,
    LINE: '#2a2a2a',

    // 選ぶ順に並べたパーツの分類
    CATS: [
        { id: 'face', label: '輪郭' },
        { id: 'hair', label: '髪' },
        { id: 'brow', label: '眉' },
        { id: 'eye', label: '目' },
        { id: 'nose', label: '鼻' },
        { id: 'mouth', label: '口' },
        { id: 'cheek', label: 'ほっぺ' },
        { id: 'beard', label: 'ひげ' }
    ],

    // 各パーツ8種類（[記号, 名前]。名前は画面には出さず、説明用）
    TYPES: {
        face: [['round', '丸'], ['egg', 'たまご'], ['square', '四角'], ['onigiri', 'おにぎり'], ['long', '面長'], ['pear', '下ぶくれ'], ['base', 'ベース'], ['wide', '横長']],
        hair: [['chonmage', 'ちょんまげ'], ['oicho', '大銀杏'], ['bozu', '坊主'], ['zanbara', 'ざんばら'], ['shichisan', '七三'], ['long', '長髪'], ['afro', 'もじゃ'], ['none', 'なし']],
        brow: [['thick', '太い'], ['thin', '細い'], ['hachi', '八の字'], ['tsuri', 'つり'], ['arch', '弓なり'], ['geji', 'げじげじ'], ['maro', 'まろ'], ['none', 'なし']],
        eye: [['dot', '点'], ['round', '丸'], ['big', 'ぱっちり'], ['tsuri', 'つり目'], ['tare', 'たれ目'], ['narrow', 'にっこり'], ['wink', 'ウインク'], ['line', '線']],
        nose: [['dot', '小さい'], ['round', '丸'], ['dango', '団子'], ['line', 'すっと'], ['pig', 'ぶた'], ['big', '大きい'], ['tri', '三角'], ['none', 'なし']],
        mouth: [['smile', 'にっこり'], ['line', '一文字'], ['frown', 'への字'], ['teeth', '歯'], ['open', 'お'], ['cat', 'ω'], ['tongue', 'べー'], ['fang', '八重歯']],
        cheek: [['pink', 'うすピンク'], ['red', '赤'], ['blush', '照れ'], ['freckles', 'そばかす'], ['swirl', 'ぐるぐる'], ['scar', '傷'], ['mole', 'ほくろ'], ['none', 'なし']],
        beard: [['mustache', '口ひげ'], ['kaiser', 'カイゼル'], ['chobi', 'ちょび'], ['goatee', 'あごひげ'], ['stubble', '無精'], ['full', 'もじゃ'], ['side', 'もみあげ'], ['none', 'なし']]
    },

    // パーツごとに選べる色（色を選ばないパーツは無し）
    COLORS: {
        face: ['#fff1e0', '#fde3c8', '#f6d2b0', '#e8b08a', '#c47f55', '#8a5a3c', '#ffd6d6', '#d9e8ff'],
        hair: ['#1a1a1a', '#4a3020', '#8a5a3c', '#c8a060', '#9e9e9e', '#f2f2f2', '#c62828', '#1e88e5'],
        brow: ['#1a1a1a', '#4a3020', '#8a5a3c', '#9e9e9e', '#f2f2f2'],
        eye: ['#1a1a1a', '#4a3020', '#1e88e5', '#43a047', '#8e24aa', '#c62828']
    },

    // スライダー：[項目, 名前, 最小, 最大, 刻み]
    SLIDERS: {
        face: [['w', '幅', 0.85, 1.15, 0.01]],
        brow: [['y', '高さ', -20, 20, 1], ['angle', '角度', -25, 25, 1]],
        eye: [['y', '高さ', -20, 20, 1], ['gap', '間隔', -18, 18, 1], ['size', '大きさ', 0.7, 1.4, 0.05]],
        nose: [['y', '高さ', -20, 20, 1], ['size', '大きさ', 0.7, 1.5, 0.05]],
        mouth: [['y', '高さ', -20, 20, 1], ['size', '大きさ', 0.7, 1.5, 0.05]]
    },

    defaultRecipe() {
        return {
            face: { type: 'round', color: '#f6d2b0', w: 1 },
            hair: { type: 'chonmage', color: '#1a1a1a' },
            brow: { type: 'thick', color: '#1a1a1a', y: 0, angle: 0 },
            eye: { type: 'dot', color: '#1a1a1a', y: 0, gap: 0, size: 1 },
            nose: { type: 'dot', y: 0, size: 1 },
            mouth: { type: 'smile', y: 0, size: 1 },
            cheek: { type: 'none' },
            beard: { type: 'none' }
        };
    },

    /** おまかせ：パーツをランダムに組み合わせる（変わった顔になりすぎないよう、数値は控えめに揺らす） */
    randomRecipe() {
        const pick = a => a[Math.floor(Math.random() * a.length)];
        const typeOf = cat => pick(this.TYPES[cat])[0];
        const between = (a, b) => a + Math.random() * (b - a);
        const hairColor = pick(this.COLORS.hair.slice(0, 5));
        return {
            face: { type: typeOf('face'), color: pick(this.COLORS.face.slice(0, 6)), w: +between(0.9, 1.1).toFixed(2) },
            hair: { type: pick(['chonmage', 'chonmage', 'oicho', 'bozu', 'zanbara', 'shichisan', 'long', 'afro', 'none']), color: hairColor },
            brow: { type: typeOf('brow'), color: hairColor, y: Math.round(between(-6, 6)), angle: Math.round(between(-10, 10)) },
            eye: { type: typeOf('eye'), color: pick(this.COLORS.eye.slice(0, 3)), y: Math.round(between(-6, 6)), gap: Math.round(between(-6, 6)), size: +between(0.9, 1.15).toFixed(2) },
            nose: { type: typeOf('nose'), y: Math.round(between(-5, 5)), size: +between(0.9, 1.2).toFixed(2) },
            mouth: { type: typeOf('mouth'), y: Math.round(between(-5, 5)), size: +between(0.9, 1.2).toFixed(2) },
            cheek: { type: pick(['none', 'none', 'none', 'pink', 'red', 'blush', 'freckles', 'swirl', 'scar', 'mole']) },
            beard: { type: pick(['none', 'none', 'none', 'none', 'mustache', 'kaiser', 'chobi', 'goatee', 'stubble', 'full', 'side']) }
        };
    },

    /** 保存されていたレシピの欠けた所を初期値で補う（パーツが増えても古いデータを開けるように） */
    normalize(r) {
        const d = this.defaultRecipe();
        const out = {};
        for (const k of Object.keys(d)) out[k] = { ...d[k], ...((r && r[k]) || {}) };
        return out;
    },

    // ---------------------------------------------------------------
    // 描く
    // ---------------------------------------------------------------
    begin(ctx, size) {
        ctx.save();
        ctx.clearRect(0, 0, size, size);
        ctx.scale(size / this.SIZE, size / this.SIZE);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    },

    /**
     * 顔（耳・後ろ髪を含む）が円いキャンバスからはみ出さないための縮める割合。
     * 輪郭の形と幅によっては円の外に出るので、外周を測って収まるだけ小さくする（はみ出さなければ1）。
     */
    fitScale(r) {
        const probe = this._probe || (this._probe = document.createElement('canvas').getContext('2d'));
        const C = 160, LIMIT = 154;   // 円の中心と、ここまでに収めたい半径（線の太さの分だけ内側）
        let need = 0;
        // 輪郭：中心から放射状にたどり、形の一番外側までの距離を測る
        this.facePath(probe, r.face);
        for (let deg = 0; deg < 360; deg += 6) {
            const a = deg * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
            let lo = 0, hi = 200;
            for (let i = 0; i < 12; i++) {
                const mid = (lo + hi) / 2;
                if (probe.isPointInPath(C + dx * mid, 170 + dy * mid)) lo = mid; else hi = mid;
            }
            const x = C + dx * lo, y = 170 + dy * lo;
            need = Math.max(need, Math.hypot(x - C, y - C) + 3);
        }
        // 耳（輪郭の横に付く）
        const hw = this.halfWidth(r.face);
        need = Math.max(need, Math.hypot(hw + 15, 186 + 26 - C), Math.hypot(hw + 17, 186 - C));
        // 顔の後ろに広がる髪
        if (r.hair.type === 'long') need = Math.max(need, Math.hypot(292 - C, 314 - C));
        if (r.hair.type === 'afro') need = Math.max(need, 158);
        return Math.min(1, LIMIT / need);
    },

    /** 顔をキャンバスに描く（320×320 を基準に、ctx の大きさに合わせて縮める） */
    render(ctx, recipe, size = this.SIZE) {
        const r = this.normalize(recipe);
        this.begin(ctx, size);
        // はみ出す形は、円の中心を基準に少しだけ縮めて収める
        const k = this.fitScale(r);
        if (k < 1) { ctx.translate(160, 160); ctx.scale(k, k); ctx.translate(-160, -160); }
        this.drawHairBack(ctx, r);
        this.drawEars(ctx, r);
        this.facePath(ctx, r.face);
        ctx.fillStyle = r.face.color; ctx.fill();
        this.drawHairCap(ctx, r);
        this.drawCheeks(ctx, r);
        this.drawBeardArea(ctx, r);
        // 顔の線は髪やひげの上に引く
        this.facePath(ctx, r.face);
        ctx.strokeStyle = this.LINE; ctx.lineWidth = 6; ctx.stroke();
        this.drawEyes(ctx, r);
        this.drawBrows(ctx, r);
        this.drawNose(ctx, r);
        this.drawMustache(ctx, r);
        this.drawMouth(ctx, r);
        this.drawHairTop(ctx, r);
        ctx.restore();
    },

    /**
     * 1つのパーツだけを描く（選ぶボタンの見本用）。
     * 「なし」の種類は、なしの印（斜線の入った丸）を描く。
     */
    renderPart(ctx, recipe, cat, size = this.SIZE) {
        const r = this.normalize(recipe);
        this.begin(ctx, size);
        const type = r[cat].type;
        if (type === 'none') { this.drawNoneMark(ctx, cat); ctx.restore(); return; }
        switch (cat) {
            case 'face':
                this.drawEars(ctx, r);
                this.facePath(ctx, r.face);
                ctx.fillStyle = r.face.color; ctx.fill();
                ctx.strokeStyle = this.LINE; ctx.lineWidth = 6; ctx.stroke();
                break;
            case 'hair':
                this.drawHairBack(ctx, r);
                this.drawHairCap(ctx, r, true);
                this.drawHairTop(ctx, r);
                break;
            case 'brow': this.drawBrows(ctx, r); break;
            case 'eye': this.drawEyes(ctx, r); break;
            case 'nose': this.drawNose(ctx, r); break;
            case 'mouth': this.drawMouth(ctx, r); break;
            case 'cheek': this.drawCheeks(ctx, r); break;
            case 'beard': this.drawBeardArea(ctx, r, true); this.drawMustache(ctx, r); break;
        }
        ctx.restore();
    },

    /** パーツの見本で大きく見せる範囲（分類ごと）：[左, 上, 幅, 高さ] */
    PART_AREA: {
        face: [0, 0, 320, 320], hair: [20, 0, 280, 220],
        brow: [84, 112, 152, 50], eye: [88, 150, 144, 56],
        nose: [115, 180, 90, 80], mouth: [105, 215, 110, 80],
        cheek: [56, 196, 208, 60], beard: [30, 170, 260, 150]
    },

    /** 「なし」の印 */
    drawNoneMark(ctx, cat) {
        const a = this.PART_AREA[cat];
        const cx = a[0] + a[2] / 2, cy = a[1] + a[3] / 2, rad = Math.min(a[2], a[3]) * 0.3;
        ctx.strokeStyle = '#b9ab88'; ctx.lineWidth = Math.max(3, rad * 0.14);
        ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - rad * 0.7, cy + rad * 0.7); ctx.lineTo(cx + rad * 0.7, cy - rad * 0.7); ctx.stroke();
    },

    /** 輪郭の形（ctx に道筋を作るだけ） */
    facePath(ctx, f) {
        const w = f.w || 1, cx = 160;
        ctx.beginPath();
        switch (f.type) {
            case 'egg':
                ctx.moveTo(cx, 48);
                ctx.bezierCurveTo(cx + 140 * w, 48, cx + 118 * w, 262, cx, 298);
                ctx.bezierCurveTo(cx - 118 * w, 262, cx - 140 * w, 48, cx, 48);
                break;
            case 'square':
                this.roundRect(ctx, cx - 112 * w, 56, 224 * w, 236, 56);
                break;
            case 'onigiri':
                ctx.moveTo(cx, 50);
                ctx.bezierCurveTo(cx + 62 * w, 50, cx + 138 * w, 228, cx + 122 * w, 272);
                ctx.bezierCurveTo(cx + 104 * w, 304, cx - 104 * w, 304, cx - 122 * w, 272);
                ctx.bezierCurveTo(cx - 138 * w, 228, cx - 62 * w, 50, cx, 50);
                break;
            case 'long':
                ctx.ellipse(cx, 176, 100 * w, 136, 0, 0, Math.PI * 2);
                break;
            case 'pear':   // 下ぶくれ：上が細く、ほっぺから下がふっくら
                ctx.moveTo(cx, 52);
                ctx.bezierCurveTo(cx + 88 * w, 52, cx + 92 * w, 130, cx + 116 * w, 200);
                ctx.bezierCurveTo(cx + 138 * w, 268, cx + 70 * w, 300, cx, 300);
                ctx.bezierCurveTo(cx - 70 * w, 300, cx - 138 * w, 268, cx - 116 * w, 200);
                ctx.bezierCurveTo(cx - 92 * w, 130, cx - 88 * w, 52, cx, 52);
                break;
            case 'base':   // ベース型：あごの角がはっきりした形
                ctx.moveTo(cx, 50);
                ctx.bezierCurveTo(cx + 104 * w, 50, cx + 116 * w, 110, cx + 116 * w, 190);
                ctx.lineTo(cx + 104 * w, 262);
                ctx.quadraticCurveTo(cx + 96 * w, 286, cx + 60 * w, 294);
                ctx.lineTo(cx - 60 * w, 294);
                ctx.quadraticCurveTo(cx - 96 * w, 286, cx - 104 * w, 262);
                ctx.lineTo(cx - 116 * w, 190);
                ctx.bezierCurveTo(cx - 116 * w, 110, cx - 104 * w, 50, cx, 50);
                break;
            case 'wide':   // 横長
                ctx.ellipse(cx, 182, 134 * w, 112, 0, 0, Math.PI * 2);
                break;
            default: // round
                ctx.ellipse(cx, 174, 120 * w, 126, 0, 0, Math.PI * 2);
        }
        ctx.closePath();
    },

    /** 輪郭の横幅の半分（耳を付ける位置に使う） */
    halfWidth(f) {
        const w = f.w || 1;
        return ({ egg: 104, square: 112, onigiri: 108, long: 100, pear: 112, base: 116, wide: 132 }[f.type] || 120) * w;
    },

    roundRect(ctx, x, y, w, h, r) {
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
    },

    drawEars(ctx, r) {
        const hw = this.halfWidth(r.face);
        [-1, 1].forEach(s => {
            ctx.beginPath();
            ctx.ellipse(160 + s * (hw - 2), 186, 17, 26, 0, 0, Math.PI * 2);
            ctx.fillStyle = r.face.color; ctx.fill();
            ctx.strokeStyle = this.LINE; ctx.lineWidth = 5; ctx.stroke();
        });
    },

    /** 顔の後ろに広がる髪（ざんばら・長髪・もじゃ） */
    drawHairBack(ctx, r) {
        const t = r.hair.type, c = r.hair.color;
        ctx.fillStyle = c; ctx.strokeStyle = this.LINE; ctx.lineWidth = 5;
        if (t === 'zanbara') {
            ctx.beginPath();
            const cx = 160, cy = 172, n = 13;
            for (let i = 0; i <= n; i++) {
                const a = Math.PI * (1.0 + i / n);
                const rad = (i % 2 === 0) ? 146 : 122;
                const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.lineTo(cx + 120, 190); ctx.lineTo(cx - 120, 190);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (t === 'long') {
            ctx.beginPath();
            ctx.moveTo(160, 34);
            ctx.bezierCurveTo(310, 34, 300, 200, 292, 314);
            ctx.lineTo(28, 314);
            ctx.bezierCurveTo(20, 200, 10, 34, 160, 34);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (t === 'afro') {
            ctx.beginPath();
            const n = 16;
            for (let i = 0; i <= n; i++) {
                const a = Math.PI * 2 * i / n;
                const x = 160 + Math.cos(a) * 140, y = 132 + Math.sin(a) * 118;
                const x2 = 160 + Math.cos(a + Math.PI / n) * 162, y2 = 132 + Math.sin(a + Math.PI / n) * 136;
                if (i === 0) ctx.moveTo(x, y); else ctx.quadraticCurveTo(x2, y2, x, y);
            }
            ctx.closePath(); ctx.fill(); ctx.stroke();
        }
    },

    /**
     * 頭の上の髪（顔の形の中だけに塗る）
     *   alone : パーツの見本として髪だけを描く時（顔が無いので、生え際の線を顔の形で切る）
     */
    drawHairCap(ctx, r, alone = false) {
        const t = r.hair.type;
        if (t === 'none') return;
        ctx.save();
        this.facePath(ctx, r.face);
        ctx.clip();
        ctx.beginPath();
        const edge = (t === 'bozu') ? 112 : (t === 'long' || t === 'afro') ? 96 : 102;   // 生え際の高さ
        ctx.moveTo(0, 0); ctx.lineTo(320, 0); ctx.lineTo(320, edge + 8);
        if (t === 'shichisan') {
            // 七三分け：分け目から右へ流れる前髪
            ctx.quadraticCurveTo(210, edge + 22, 130, edge - 4);
            ctx.quadraticCurveTo(70, edge - 18, 0, edge + 30);
        } else {
            ctx.quadraticCurveTo(160, edge - 40, 0, edge + 8);
        }
        ctx.closePath();
        ctx.globalAlpha = (t === 'bozu') ? (alone ? 0.6 : 0.35) : 1;
        ctx.fillStyle = r.hair.color; ctx.fill();
        ctx.globalAlpha = 1;
        if (t !== 'bozu') { ctx.strokeStyle = this.LINE; ctx.lineWidth = 4; ctx.stroke(); }
        if (t === 'shichisan') {
            ctx.beginPath(); ctx.moveTo(118, 54); ctx.quadraticCurveTo(124, 80, 130, 98);
            ctx.strokeStyle = this.shade(r.hair.color === '#1a1a1a' ? '#555555' : r.hair.color, 0.35); ctx.lineWidth = 4; ctx.stroke();
        }
        ctx.restore();
    },

    /** 頭のてっぺんの飾り（まげ・大銀杏）は一番上に描く */
    drawHairTop(ctx, r) {
        const t = r.hair.type, c = r.hair.color;
        ctx.fillStyle = c; ctx.strokeStyle = this.LINE; ctx.lineWidth = 5;
        if (t === 'chonmage') {
            // 頭にのせたまげ（前へ折り返した形）
            ctx.beginPath(); ctx.ellipse(160, 52, 24, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(150, 46); ctx.quadraticCurveTo(160, 8, 178, 20); ctx.quadraticCurveTo(172, 36, 170, 48);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (t === 'oicho') {
            // 大銀杏：いちょうの葉のように広がったまげ
            ctx.beginPath(); ctx.ellipse(160, 58, 20, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(160, 56);
            ctx.quadraticCurveTo(108, 44, 114, 18);
            ctx.quadraticCurveTo(160, 4, 206, 18);
            ctx.quadraticCurveTo(212, 44, 160, 56);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(160, 52); ctx.lineTo(160, 14); ctx.lineWidth = 3; ctx.stroke();
        }
    },

    eyePos(r) {
        const e = r.eye;
        return { y: 178 + (e.y || 0), dx: 46 + (e.gap || 0), k: e.size || 1 };
    },

    drawEyes(ctx, r) {
        const e = r.eye, p = this.eyePos(r), k = p.k;
        [-1, 1].forEach(s => {
            const x = 160 + s * p.dx, y = p.y;
            ctx.save();
            ctx.translate(x, y);
            ctx.strokeStyle = this.LINE; ctx.lineWidth = 4.5;
            let type = e.type;
            if (type === 'wink') type = (s < 0) ? 'round' : 'narrow';   // ウインク：右目（向かって右）を閉じる
            switch (type) {
                case 'round':
                    this.eyeball(ctx, 15 * k, 17 * k, 0, e.color, 7.5 * k); break;
                case 'big':
                    this.eyeball(ctx, 19 * k, 22 * k, 0, e.color, 11 * k);
                    ctx.beginPath(); ctx.arc(-4 * k, -6 * k, 3.5 * k, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
                    break;
                case 'tsuri':
                    this.eyeball(ctx, 17 * k, 9 * k, -s * 0.38, e.color, 6.5 * k); break;
                case 'tare':
                    this.eyeball(ctx, 17 * k, 9 * k, s * 0.38, e.color, 6.5 * k); break;
                case 'narrow':
                    ctx.beginPath(); ctx.arc(0, 6 * k, 14 * k, Math.PI * 1.15, Math.PI * 1.85);
                    ctx.lineWidth = 6; ctx.stroke(); break;
                case 'line':
                    ctx.beginPath(); ctx.moveTo(-14 * k, 0); ctx.lineTo(14 * k, 0);
                    ctx.lineWidth = 6; ctx.stroke(); break;
                default: // dot
                    ctx.beginPath(); ctx.ellipse(0, 0, 8 * k, 9.5 * k, 0, 0, Math.PI * 2);
                    ctx.fillStyle = e.color; ctx.fill();
            }
            ctx.restore();
        });
    },

    /** 白目と黒目 */
    eyeball(ctx, rx, ry, rot, color, pupil) {
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, rot, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
        ctx.save(); ctx.clip();
        ctx.beginPath(); ctx.arc(0, 1, pupil, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
        ctx.restore();
    },

    drawBrows(ctx, r) {
        const b = r.brow;
        if (b.type === 'none') return;
        const p = this.eyePos(r);
        const y = 136 + (b.y || 0) + Math.min(0, (r.eye.y || 0));
        [-1, 1].forEach(s => {
            ctx.save();
            ctx.translate(160 + s * p.dx, y);
            ctx.strokeStyle = b.color; ctx.fillStyle = b.color;
            if (b.type === 'maro') {
                ctx.beginPath(); ctx.ellipse(0, -10, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
                ctx.restore(); return;
            }
            // 角度：プラスで外側が上がる。八の字は外側が下がり、つりは外側が上がる
            let deg = b.angle || 0;
            if (b.type === 'hachi') deg -= 16;
            if (b.type === 'tsuri') deg += 18;
            ctx.rotate(-s * deg * Math.PI / 180);
            ctx.beginPath();
            if (b.type === 'geji') {
                // げじげじ：ぎざぎざの太い眉
                ctx.moveTo(-22, 2);
                for (let i = 0; i <= 8; i++) ctx.lineTo(-22 + i * 5.5, (i % 2 === 0) ? 2 : -8);
                ctx.lineWidth = 6;
            } else if (b.type === 'arch') {
                ctx.moveTo(-21, 4); ctx.quadraticCurveTo(0, -18, 21, 4);
                ctx.lineWidth = 6;
            } else {
                ctx.moveTo(-20, 0); ctx.quadraticCurveTo(0, -7, 20, 0);
                ctx.lineWidth = (b.type === 'thin') ? 4.5 : 11;
            }
            ctx.stroke();
            ctx.restore();
        });
    },

    drawNose(ctx, r) {
        const n = r.nose, k = n.size || 1, y = 216 + (n.y || 0), x = 160;
        ctx.strokeStyle = this.LINE; ctx.lineWidth = 4.5;
        switch (n.type) {
            case 'round':
                ctx.beginPath(); ctx.arc(x, y, 11 * k, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); break;
            case 'dango':
                ctx.beginPath(); ctx.ellipse(x, y, 17 * k, 14 * k, 0, 0, Math.PI * 2);
                ctx.fillStyle = this.shade(r.face.color, -0.12); ctx.fill(); ctx.stroke(); break;
            case 'line':
                ctx.beginPath(); ctx.moveTo(x + 2, y - 22 * k); ctx.lineTo(x - 9 * k, y + 4 * k); ctx.lineTo(x + 6 * k, y + 4 * k); ctx.stroke(); break;
            case 'pig':   // ぶた鼻：丸に穴が2つ
                ctx.beginPath(); ctx.ellipse(x, y, 18 * k, 13 * k, 0, 0, Math.PI * 2);
                ctx.fillStyle = this.shade(r.face.color, -0.08); ctx.fill(); ctx.stroke();
                ctx.fillStyle = this.LINE;
                [-1, 1].forEach(s => { ctx.beginPath(); ctx.ellipse(x + s * 6 * k, y, 3 * k, 4.5 * k, 0, 0, Math.PI * 2); ctx.fill(); });
                break;
            case 'big':   // 大きい鼻：鼻すじ＋小鼻
                ctx.beginPath();
                ctx.moveTo(x + 4, y - 34 * k);
                ctx.quadraticCurveTo(x + 4 * k, y, x + 18 * k, y + 8 * k);
                ctx.quadraticCurveTo(x, y + 18 * k, x - 18 * k, y + 8 * k);
                ctx.stroke(); break;
            case 'tri':   // 三角
                ctx.beginPath(); ctx.moveTo(x, y - 18 * k); ctx.lineTo(x + 12 * k, y + 8 * k); ctx.lineTo(x - 12 * k, y + 8 * k); ctx.closePath();
                ctx.fillStyle = this.shade(r.face.color, -0.1); ctx.fill(); ctx.stroke(); break;
            case 'none': break;
            default: // dot
                ctx.beginPath(); ctx.ellipse(x, y, 6 * k, 4.5 * k, 0, 0, Math.PI * 2);
                ctx.fillStyle = this.shade(r.face.color, -0.3); ctx.fill();
        }
    },

    drawMouth(ctx, r) {
        const m = r.mouth, k = m.size || 1, y = 256 + (m.y || 0), x = 160;
        ctx.strokeStyle = this.LINE; ctx.lineWidth = 5;
        switch (m.type) {
            case 'line':
                ctx.beginPath(); ctx.moveTo(x - 22 * k, y); ctx.lineTo(x + 22 * k, y); ctx.stroke(); break;
            case 'frown':
                ctx.beginPath(); ctx.moveTo(x - 24 * k, y + 8 * k); ctx.quadraticCurveTo(x, y - 14 * k, x + 24 * k, y + 8 * k); ctx.stroke(); break;
            case 'teeth':
                ctx.beginPath();
                ctx.moveTo(x - 28 * k, y - 8 * k); ctx.lineTo(x + 28 * k, y - 8 * k);
                ctx.quadraticCurveTo(x + 26 * k, y + 22 * k, x, y + 22 * k);
                ctx.quadraticCurveTo(x - 26 * k, y + 22 * k, x - 28 * k, y - 8 * k);
                ctx.closePath();
                ctx.fillStyle = '#7a1f1f'; ctx.fill();
                ctx.save(); ctx.clip();
                ctx.fillStyle = '#fff'; ctx.fillRect(x - 30 * k, y - 9 * k, 60 * k, 10 * k);
                ctx.restore();
                ctx.stroke(); break;
            case 'open':
                ctx.beginPath(); ctx.ellipse(x, y + 4 * k, 12 * k, 15 * k, 0, 0, Math.PI * 2);
                ctx.fillStyle = '#7a1f1f'; ctx.fill(); ctx.stroke(); break;
            case 'cat':
                ctx.beginPath();
                ctx.arc(x - 11 * k, y - 2, 11 * k, Math.PI * 0.05, Math.PI * 0.95);
                ctx.moveTo(x + 22 * k, y - 2);
                ctx.arc(x + 11 * k, y - 2, 11 * k, Math.PI * 0.05, Math.PI * 0.95);
                ctx.stroke(); break;
            case 'tongue':   // べー：にっこり口から舌を出す
                ctx.beginPath(); ctx.moveTo(x - 6 * k, y + 6 * k);
                ctx.quadraticCurveTo(x - 8 * k, y + 26 * k, x + 4 * k, y + 26 * k);
                ctx.quadraticCurveTo(x + 14 * k, y + 24 * k, x + 12 * k, y + 6 * k);
                ctx.fillStyle = '#f06292'; ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(x, y - 14 * k, 24 * k, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke(); break;
            case 'fang':   // 八重歯：にっこり口から小さな牙
                ctx.beginPath(); ctx.arc(x, y - 14 * k, 24 * k, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x + 6 * k, y + 8 * k); ctx.lineTo(x + 11 * k, y + 19 * k); ctx.lineTo(x + 16 * k, y + 6 * k); ctx.closePath();
                ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke(); break;
            default: // smile
                ctx.beginPath(); ctx.arc(x, y - 14 * k, 26 * k, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
        }
    },

    drawCheeks(ctx, r) {
        const t = r.cheek.type;
        if (t === 'none') return;
        const p = this.eyePos(r);
        const y = 224;
        [-1, 1].forEach(s => {
            const x = 160 + s * (p.dx + 28);
            if (t === 'pink' || t === 'red' || t === 'blush') {
                const color = { pink: 'rgba(248,140,170,0.55)', red: 'rgba(229,57,53,0.5)', blush: 'rgba(240,110,130,0.6)' }[t];
                ctx.beginPath(); ctx.ellipse(x, y, 20, 13, 0, 0, Math.PI * 2);
                ctx.fillStyle = color; ctx.fill();
                if (t === 'blush') {
                    // 照れ：斜線を3本
                    ctx.strokeStyle = 'rgba(200,60,80,0.8)'; ctx.lineWidth = 2.5;
                    for (let i = -1; i <= 1; i++) {
                        ctx.beginPath(); ctx.moveTo(x + i * 9 - 4, y + 6); ctx.lineTo(x + i * 9 + 4, y - 6); ctx.stroke();
                    }
                }
            } else if (t === 'freckles') {
                ctx.fillStyle = 'rgba(140,80,50,0.7)';
                [[-10, -4], [0, 4], [10, -3], [-4, 8], [7, 9]].forEach(([dx, dy]) => {
                    ctx.beginPath(); ctx.arc(x + dx, y + dy - 6, 2.6, 0, Math.PI * 2); ctx.fill();
                });
            } else if (t === 'swirl') {
                ctx.strokeStyle = 'rgba(229,57,53,0.75)'; ctx.lineWidth = 3;
                ctx.beginPath();
                for (let a = 0; a < Math.PI * 5; a += 0.2) {
                    const rad = 2 + a * 1.1;
                    const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad * 0.7;
                    if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.stroke();
            }
        });
        if (t === 'scar') {
            // 傷：向かって右のほおに×の傷あと
            const x = 160 + p.dx + 26;
            ctx.strokeStyle = '#a0522d'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(x - 14, y - 14); ctx.lineTo(x + 14, y + 10); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + 12, y - 14); ctx.lineTo(x - 10, y + 10); ctx.stroke();
        } else if (t === 'mole') {
            ctx.fillStyle = '#2a2a2a';
            ctx.beginPath(); ctx.arc(160 + 40, 262, 4, 0, Math.PI * 2); ctx.fill();
        }
    },

    /**
     * 顔に塗るひげ（無精ひげ・もじゃひげ・もみあげ）。口はこの上に描く。
     *   alone : パーツの見本としてひげだけを描く時
     */
    drawBeardArea(ctx, r, alone = false) {
        const t = r.beard.type;
        if (t !== 'stubble' && t !== 'full' && t !== 'side') return;
        const color = this.beardColor(r);
        ctx.save();
        this.facePath(ctx, r.face);
        ctx.clip();
        ctx.beginPath();
        if (t === 'side') {
            const hw = this.halfWidth(r.face);
            [-1, 1].forEach(s => {
                const x0 = 160 + s * hw;
                ctx.moveTo(x0, 120); ctx.lineTo(x0 - s * 30, 130); ctx.lineTo(x0 - s * 26, 250); ctx.lineTo(x0, 260); ctx.closePath();
            });
            ctx.globalAlpha = 0.95;
        } else {
            const top = (t === 'full') ? 222 : 236;
            ctx.moveTo(0, 320); ctx.lineTo(0, top + 20);
            ctx.quadraticCurveTo(70, top - 6, 120, top + 4);
            ctx.quadraticCurveTo(160, top + 18, 200, top + 4);
            ctx.quadraticCurveTo(250, top - 6, 320, top + 20);
            ctx.lineTo(320, 320); ctx.closePath();
            ctx.globalAlpha = (t === 'stubble') ? (alone ? 0.55 : 0.28) : 0.95;
        }
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
    },

    beardColor(r) { return r.hair.type === 'none' ? '#3a3a3a' : r.hair.color; },

    drawMustache(ctx, r) {
        const t = r.beard.type;
        ctx.fillStyle = this.beardColor(r); ctx.strokeStyle = this.LINE; ctx.lineWidth = 3;
        const y = 236 + (r.mouth.y || 0) * 0.5;
        if (t === 'mustache') {
            [-1, 1].forEach(s => {
                ctx.beginPath();
                ctx.moveTo(160, y);
                ctx.quadraticCurveTo(160 + s * 22, y - 12, 160 + s * 42, y + 4);
                ctx.quadraticCurveTo(160 + s * 22, y + 4, 160, y + 6);
                ctx.closePath(); ctx.fill(); ctx.stroke();
            });
        } else if (t === 'kaiser') {
            // カイゼルひげ：両端がくるんと上がる
            [-1, 1].forEach(s => {
                ctx.beginPath();
                ctx.moveTo(160, y + 2);
                ctx.quadraticCurveTo(160 + s * 26, y - 8, 160 + s * 46, y - 18);
                ctx.quadraticCurveTo(160 + s * 54, y - 26, 160 + s * 48, y - 30);
                ctx.quadraticCurveTo(160 + s * 44, y - 14, 160 + s * 24, y + 4);
                ctx.quadraticCurveTo(160 + s * 12, y + 8, 160, y + 7);
                ctx.closePath(); ctx.fill(); ctx.stroke();
            });
        } else if (t === 'chobi') {
            // ちょびひげ：鼻の下に小さな四角
            ctx.beginPath(); this.roundRect(ctx, 148, y - 6, 24, 12, 3); ctx.fill(); ctx.stroke();
        } else if (t === 'goatee') {
            const gy = 290 + (r.mouth.y || 0) * 0.3;
            ctx.beginPath();
            ctx.moveTo(146, gy - 10); ctx.quadraticCurveTo(160, gy + 26, 174, gy - 10);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        }
    },

    /** 色を明るく(+)・暗く(-)する */
    shade(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        const f = c => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c : 255 - c) * amt)));
        const rr = f(n >> 16), gg = f((n >> 8) & 255), bb = f(n & 255);
        return '#' + ((1 << 24) + (rr << 16) + (gg << 8) + bb).toString(16).slice(1);
    }
};
