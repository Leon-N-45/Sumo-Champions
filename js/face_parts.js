/**
 * face_parts.js
 * 入門（キャラクリエイト）の「パーツで作る」。輪郭・髪・眉・目・鼻・口などを選んで顔を組み立てる。
 *
 * 絵柄は、いまの力士たちの顔画像（assets/img/onosato.png など）に合わせている。
 *   - 輪郭線：細め（元の絵で4〜5px ＝ この320pxの絵で約3.5px）の濃い線
 *   - 色：元の絵から拾った色（肌 #fbc5a6・#fdac75・#e6a273、髪 #31322b に明るい筋 #4a4944、
 *         唇 #d49581、眉の下の影 #d2a081）
 *   - 髪：黒に近い灰色に細い筋がたくさん。こめかみの横が張り出し、上に丸いまげ。生え際は中央が少し下がる
 *   - 顔：縦長の大きな卵形。目は小さめの切れ長で茶色い瞳。鼻は小鼻と穴の線だけ。唇は線で囲まず色の濃淡
 *   - 影：眉の下・ほお・あごにやわらかい影
 *
 * 顔は「レシピ」（どのパーツを・何色で・どこに）として持ち、render でキャンバスに描く。
 * 出来上がるのは「自分で描く」と同じ顔の画像なので、カード・戦闘・遠征はそのまま使える。
 * renderPart は1つのパーツだけを描く（パーツを選ぶボタンの見本に使う）。
 *
 * 座標は 320×320 のキャンバス（円の中が顔になる）を基準にしている。顔の中心の横位置は 160。
 */
const FaceParts = {
    SIZE: 320,
    LINE: '#1f1a17',
    LW: 3.5,

    // 顔の各部の基準の位置（スライダーでここから動かす）
    // （いまの力士の絵を測った割合：生え際33%・眉48%・目55%・鼻の下65%・口77%・あご95%）
    POS: { hairline: 106, brow: 154, eye: 177, nose: 210, mouth: 248 },

    CATS: [
        { id: 'face', label: '輪郭' },
        { id: 'hair', label: '髪' },
        { id: 'brow', label: '眉' },
        { id: 'eye', label: '目' },
        { id: 'nose', label: '鼻' },
        { id: 'mouth', label: '口' },
        { id: 'cheek', label: 'ほお' },
        { id: 'beard', label: '装飾' }   // 中身の名前は beard のまま（保存データとの互換のため）。無精ひげ・ひげ剃りあと＋眼鏡などの飾り
    ],

    // 各パーツ10種類（[記号, 名前]。名前は画面には出さず、説明用）
    TYPES: {
        face: [['round', '丸'], ['egg', 'たまご'], ['square', '四角'], ['onigiri', 'おにぎり'], ['long', '面長'], ['pear', '下ぶくれ'], ['base', 'ベース'], ['wide', '横長'], ['chubby', 'まんまる'], ['slim', 'ほっそり']],
        hair: [['chonmage', 'ちょんまげ'], ['oicho', '大銀杏'], ['bozu', '坊主'], ['short', '短髪'], ['center', 'まん中分け'], ['shichisan', '七三'], ['zanbara', 'ざんばら'], ['long', '長髪'], ['afro', 'もじゃ'], ['none', 'なし']],
        // 眉は「形」が違うものだけを並べる（傾きは角度のスライダーで変えられるので、八の字・つりは種類にしない）
        brow: [['thick', '太い'], ['straight', '一文字'], ['thin', '細い'], ['arch', '弓なり'], ['peak', '山形'], ['fude', '筆'], ['short', '短い'], ['bushy', 'げじげじ'], ['unibrow', 'つながり'], ['maro', 'まろ']],
        // 目は大きさではなく「形」で分ける（大きさはスライダー）
        eye: [['normal', '切れ長'], ['round', 'どんぐり'], ['big', 'ぱっちり'], ['narrow', '細目'], ['tsuri', 'つり目'], ['tare', 'たれ目'], ['sanpaku', '三白眼'], ['sleepy', '半目'], ['smile', 'にっこり'], ['closed', '閉じ']],
        // 鼻：いまの絵の鼻2つ＋線や影で描くキャラクターらしい鼻
        nose: [['standard', 'ふつう'], ['big', 'どっしり'], ['el', 'L字'], ['ku', 'くの字'], ['shadow', '影'], ['hook', 'わし鼻'], ['round', 'まる'], ['up', '上向き'], ['tiny', 'ちょん'], ['dot', '点']],
        mouth: [['neutral', 'ふつう'], ['smile', 'にっこり'], ['teeth', '歯'], ['open', 'お'], ['frown', 'への字'], ['smirk', 'にやり'], ['thick', '厚い唇'], ['small', '小さい'], ['pout', 'とがり'], ['tongue', 'べー']],
        cheek: [['none', 'なし'], ['blush', 'うすピンク'], ['red', '赤'], ['lines', '笑いじわ'], ['puffy', 'ふっくら'], ['dimple', 'えくぼ'], ['freckles', 'そばかす'], ['mole', 'ほくろ'], ['scar', '傷'], ['sweat', '汗']],
        beard: [['none', 'なし'], ['stubble', '無精ひげ'], ['shadow', 'ひげ剃りあと'], ['glasses', '眼鏡'], ['sunglasses', 'サングラス'], ['hachimaki', 'はちまき'], ['bandage', 'ばんそうこう'], ['kumadori', '隈取'], ['eyepatch', '眼帯'], ['mask', 'マスク']]
    },

    // パーツごとに選べる色（1つ目が初期の色。肌と髪は元の絵から拾った色を先頭に置く）
    COLORS: {
        face: ['#fbc5a6', '#fdac75', '#e6a273', '#f6d4c4', '#d99a6c', '#b87a52', '#8a5a3a', '#f2c9b8'],
        hair: ['#31322b', '#232323', '#474745', '#3d2b20', '#6a4a32', '#9e9e9e', '#e2e2e2', '#7a2a24'],
        brow: ['#2e2a26', '#232323', '#4a3a2e', '#7a6a5a', '#d8d8d8'],
        eye: ['#6b4430', '#4a2e1e', '#2a1a12', '#4f7fa8', '#4f7f4f', '#7a4f9a'],
        // 唇の色（1つ目はいまの力士の絵の色）
        mouth: ['#c98375', '#d99a8c', '#e07a7a', '#c45a6a', '#e3a3a8', '#b0605a', '#a87060', '#8a4a40']
    },

    // スライダー：[項目, 名前, 最小, 最大, 刻み]
    SLIDERS: {
        face: [['w', '幅', 0.88, 1.12, 0.01]],
        brow: [['y', '高さ', -12, 12, 1], ['angle', '角度', -18, 18, 1]],
        eye: [['y', '高さ', -12, 12, 1], ['gap', '間隔', -12, 12, 1], ['size', '大きさ', 0.8, 1.3, 0.05]],
        nose: [['y', '高さ', -12, 12, 1], ['size', '大きさ', 0.8, 1.35, 0.05]],
        mouth: [['y', '高さ', -12, 12, 1], ['size', '大きさ', 0.8, 1.35, 0.05]]
    },

    defaultRecipe() {
        return {
            face: { type: 'egg', color: '#fbc5a6', w: 1 },
            hair: { type: 'chonmage', color: '#31322b' },
            brow: { type: 'thick', color: '#2e2a26', y: 0, angle: 0 },
            eye: { type: 'normal', color: '#6b4430', y: 0, gap: 0, size: 1 },
            nose: { type: 'standard', y: 0, size: 1 },
            mouth: { type: 'neutral', color: '#c98375', y: 0, size: 1 },
            cheek: { type: 'none' },
            beard: { type: 'none' }
        };
    },

    /** おまかせ：パーツをランダムに組み合わせる（力士らしい顔になりやすいよう、髪と色は控えめに選ぶ） */
    randomRecipe() {
        const pick = a => a[Math.floor(Math.random() * a.length)];
        const typeOf = cat => pick(this.TYPES[cat])[0];
        const between = (a, b) => a + Math.random() * (b - a);
        const hairColor = pick(this.COLORS.hair.slice(0, 3));
        return {
            face: { type: typeOf('face'), color: pick(this.COLORS.face.slice(0, 6)), w: +between(0.94, 1.08).toFixed(2) },
            hair: { type: pick(['chonmage', 'chonmage', 'chonmage', 'chonmage', 'oicho', 'oicho', 'bozu', 'short', 'zanbara', 'shichisan']), color: hairColor },
            brow: { type: pick(['thick', 'thick', 'straight', 'straight', 'thin', 'arch', 'peak', 'fude', 'short', 'bushy']), color: '#2e2a26', y: Math.round(between(-3, 3)), angle: Math.round(between(-8, 8)) },
            eye: { type: pick(['normal', 'normal', 'normal', 'round', 'big', 'narrow', 'tsuri', 'tare', 'sanpaku', 'sleepy', 'smile', 'closed']), color: pick(this.COLORS.eye.slice(0, 3)), y: Math.round(between(-3, 3)), gap: Math.round(between(-3, 3)), size: +between(0.95, 1.1).toFixed(2) },
            nose: { type: pick(['standard', 'standard', 'standard', 'big', 'big', 'el', 'ku', 'shadow', 'hook', 'round', 'up', 'tiny']), y: Math.round(between(-3, 3)), size: +between(0.95, 1.12).toFixed(2) },
            mouth: { type: pick(['neutral', 'neutral', 'neutral', 'smile', 'teeth', 'frown', 'thick', 'small', 'smirk', 'pout']), color: pick(this.COLORS.mouth.slice(0, 3)), y: Math.round(between(-3, 3)), size: +between(0.95, 1.1).toFixed(2) },
            cheek: { type: pick(['none', 'none', 'none', 'blush', 'blush', 'lines', 'puffy', 'dimple', 'mole']) },
            beard: { type: pick(['none', 'none', 'none', 'none', 'none', 'stubble', 'stubble', 'shadow', 'glasses', 'hachimaki', 'bandage']) }
        };
    },

    /** 保存されていたレシピの欠けた所を初期値で補う（パーツの種類が変わっても古いデータを開けるように） */
    normalize(r) {
        const d = this.defaultRecipe();
        const out = {};
        for (const k of Object.keys(d)) {
            out[k] = { ...d[k], ...((r && r[k]) || {}) };
            if (!this.TYPES[k].some(([id]) => id === out[k].type)) out[k].type = d[k].type;
        }
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
     * 円いキャンバスに収めるための縮める割合。
     * 輪郭（と耳）だけで決める。髪型では決めないので、髪型を変えても顔の大きさは変わらない
     * （大きな髪型は、はみ出した分が円で切れるだけ）。
     */
    fitScale(r) {
        const g = this.faceGeom(r.face);
        const need = Math.max(
            Math.hypot(g.cheekW + 14, g.cheekY - 160),   // ほお＋耳
            Math.hypot(g.jawW, g.jawY - 160),
            g.chinY - 160 + 4
        );
        return Math.min(1, 154 / need);
    },

    render(ctx, recipe, size = this.SIZE) {
        const r = this.normalize(recipe);
        this.begin(ctx, size);
        const k = this.fitScale(r);
        if (k < 1) { ctx.translate(160, 160); ctx.scale(k, k); ctx.translate(-160, -160); }

        this.drawHairBack(ctx, r);
        this.drawEars(ctx, r);
        this.drawFace(ctx, r);
        this.drawFaceShading(ctx, r);
        this.drawCheeks(ctx, r);
        this.drawBeardArea(ctx, r);
        this.drawBun(ctx, r);
        this.drawHair(ctx, r);
        this.drawSweat(ctx, r);
        this.drawEyes(ctx, r);
        this.drawBrows(ctx, r);
        this.drawNose(ctx, r);
        this.drawMouth(ctx, r);
        this.drawAccessory(ctx, r);
        ctx.restore();
    },

    /** 1つのパーツだけを描く（選ぶボタンの見本用）。「なし」は斜線の入った丸 */
    renderPart(ctx, recipe, cat, size = this.SIZE) {
        const r = this.normalize(recipe);
        this.begin(ctx, size);
        const type = r[cat].type;
        if (type === 'none') { this.drawNoneMark(ctx, cat); ctx.restore(); return; }
        const skin = () => { this.facePath(ctx, r.face); ctx.fillStyle = r.face.color; ctx.fill(); };
        switch (cat) {
            case 'face': this.drawEars(ctx, r); this.drawFace(ctx, r); this.drawFaceShading(ctx, r); break;
            case 'hair': this.drawHairBack(ctx, r); this.drawBun(ctx, r); this.drawHair(ctx, r, true); break;
            case 'brow': skin(); this.drawBrows(ctx, r); break;
            case 'eye': skin(); this.drawEyes(ctx, r); break;
            case 'nose': skin(); this.drawNose(ctx, r); break;
            case 'mouth': skin(); this.drawMouth(ctx, r); break;
            case 'cheek': skin(); this.drawCheeks(ctx, r); this.drawSweat(ctx, r); break;
            case 'beard': skin(); this.drawBeardArea(ctx, r); this.drawAccessory(ctx, r); break;
        }
        ctx.restore();
    },

    /** パーツの見本で大きく見せる範囲（分類ごと）：[左, 上, 幅, 高さ] */
    PART_AREA: {
        face: [0, 0, 320, 320], hair: [0, 0, 320, 320],
        brow: [64, 124, 192, 52], eye: [84, 156, 152, 42],
        nose: [98, 136, 124, 116], mouth: [98, 222, 124, 56],
        cheek: [24, 118, 272, 182], beard: [16, 70, 288, 250]
    },

    drawNoneMark(ctx, cat) {
        const a = this.PART_AREA[cat];
        const cx = a[0] + a[2] / 2, cy = a[1] + a[3] / 2, rad = Math.min(a[2], a[3]) * 0.3;
        ctx.strokeStyle = '#b9ab88'; ctx.lineWidth = Math.max(3, rad * 0.14);
        ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - rad * 0.7, cy + rad * 0.7); ctx.lineTo(cx + rad * 0.7, cy - rad * 0.7); ctx.stroke();
    },

    // --- 輪郭 -------------------------------------------------------
    /**
     * 輪郭の寸法（中心からの横幅）：額の横 topW、ほお cheekW（cheekY の高さ）、あご jawW（jawY）、あご先 chinY。
     * いまの力士の絵は縦長の大きな卵形で、ほおから下がふっくら広い。
     */
    FACE_SHAPES: {
        round:   { top: 92, topW: 100, cheekW: 120, cheekY: 216, jawW: 98,  jawY: 280, chinY: 310 },
        egg:     { top: 90, topW: 102, cheekW: 114, cheekY: 210, jawW: 86,  jawY: 282, chinY: 312 },
        square:  { top: 92, topW: 106, cheekW: 118, cheekY: 210, jawW: 108, jawY: 278, chinY: 306 },
        onigiri: { top: 96, topW: 84,  cheekW: 116, cheekY: 222, jawW: 108, jawY: 282, chinY: 310 },
        long:    { top: 84, topW: 96,  cheekW: 104, cheekY: 212, jawW: 84,  jawY: 288, chinY: 314 },
        pear:    { top: 96, topW: 92,  cheekW: 120, cheekY: 230, jawW: 108, jawY: 286, chinY: 312 },
        base:    { top: 92, topW: 104, cheekW: 116, cheekY: 206, jawW: 106, jawY: 276, chinY: 304, angular: true },
        wide:    { top: 96, topW: 110, cheekW: 128, cheekY: 214, jawW: 108, jawY: 278, chinY: 304 },
        chubby:  { top: 94, topW: 104, cheekW: 126, cheekY: 226, jawW: 116, jawY: 284, chinY: 312 },
        slim:    { top: 86, topW: 98,  cheekW: 104, cheekY: 200, jawW: 74,  jawY: 280, chinY: 312 }
    },

    faceGeom(f) {
        const s = this.FACE_SHAPES[f.type] || this.FACE_SHAPES.egg;
        const w = (f.w || 1) * 0.9;   // いまの力士の絵は、横より縦が長い
        return { ...s, topW: s.topW * w, cheekW: s.cheekW * w, jawW: s.jawW * w };
    },

    /** 点の列を通るなめらかな閉じた線（キャットムル–ロム曲線） */
    smoothClosed(ctx, pts) {
        const n = pts.length;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 0; i < n; i++) {
            const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
            ctx.bezierCurveTo(
                p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
                p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
                p2[0], p2[1]);
        }
        ctx.closePath();
    },

    facePath(ctx, f) {
        const g = this.faceGeom(f), cx = 160;
        const R = [
            [cx + g.topW * 0.62, g.top + 6],
            [cx + g.topW, g.top + 42],
            [cx + g.cheekW, g.cheekY],
            [cx + g.jawW, g.jawY],
            [cx + g.jawW * 0.5, g.chinY - 6]
        ];
        if (g.angular) R.splice(4, 0, [cx + g.jawW * 0.78, g.jawY + 18]);
        const pts = [[cx, g.top], ...R, [cx, g.chinY], ...[...R].reverse().map(([x, y]) => [cx * 2 - x, y])];
        this.smoothClosed(ctx, pts);
    },

    halfWidth(f) { return this.faceGeom(f).cheekW; },

    drawEars(ctx, r) {
        const g = this.faceGeom(r.face);
        const skin = r.face.color, line = this.LINE;
        [-1, 1].forEach(s => {
            const x = 160 + s * (g.cheekW - 4), y = g.cheekY - 14;
            ctx.beginPath(); ctx.ellipse(x, y, 13, 25, s * 0.15, 0, Math.PI * 2);
            ctx.fillStyle = skin; ctx.fill();
            ctx.strokeStyle = line; ctx.lineWidth = this.LW; ctx.stroke();
            ctx.beginPath(); ctx.arc(x + s * 1, y + 2, 8, s > 0 ? Math.PI * 0.55 : -Math.PI * 0.45, s > 0 ? Math.PI * 1.45 : Math.PI * 0.45);
            ctx.strokeStyle = this.shade(skin, -0.32); ctx.lineWidth = 1.8; ctx.stroke();
        });
    },

    /** 顔の塗り：真ん中が明るく、ふちに向かって少し濃くなる */
    drawFace(ctx, r) {
        const g = this.faceGeom(r.face), skin = r.face.color;
        const grad = ctx.createRadialGradient(160, 196, 30, 160, 206, g.cheekW * 1.15);
        grad.addColorStop(0, this.shade(skin, 0.06));
        grad.addColorStop(0.7, skin);
        grad.addColorStop(1, this.shade(skin, -0.1));
        this.facePath(ctx, r.face);
        ctx.fillStyle = grad; ctx.fill();
        ctx.strokeStyle = this.LINE; ctx.lineWidth = this.LW; ctx.stroke();
    },

    /** やわらかい影：眉の下・目の周り・あご（いまの力士の絵の、茶色がかった影） */
    drawFaceShading(ctx, r) {
        const g = this.faceGeom(r.face), skin = r.face.color;
        const shadow = this.mix(skin, '#9a6a4a', 0.32);
        ctx.save();
        this.facePath(ctx, r.face); ctx.clip();
        // 眉の下〜目頭の影（元の絵の #d2a081 のような色）
        const p = this.eyePos(r);
        [-1, 1].forEach(s => {
            const gr = ctx.createRadialGradient(160 + s * (p.dx + 6), p.y - 9, 2, 160 + s * (p.dx + 6), p.y - 9, 30);
            gr.addColorStop(0, this.withAlpha(shadow, 0.55)); gr.addColorStop(1, this.withAlpha(shadow, 0));
            ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(160 + s * (p.dx + 6), p.y - 9, 32, 15, 0, 0, Math.PI * 2); ctx.fill();
        });
        // あごの下の影
        const cg = ctx.createLinearGradient(0, g.chinY - 40, 0, g.chinY);
        cg.addColorStop(0, this.withAlpha(shadow, 0)); cg.addColorStop(1, this.withAlpha(shadow, 0.35));
        ctx.fillStyle = cg; ctx.fillRect(0, g.chinY - 40, 320, 40);
        ctx.restore();
        // あご先の下の線（ふっくらしたあご）
        ctx.beginPath(); ctx.moveTo(160 - 26, g.chinY - 20); ctx.quadraticCurveTo(160, g.chinY - 12, 160 + 26, g.chinY - 20);
        ctx.strokeStyle = this.withAlpha(this.shade(skin, -0.38), 0.7); ctx.lineWidth = 1.6; ctx.stroke();
    },

    // --- 髪 -------------------------------------------------------
    /** 力士の髪の形か（こめかみの張り出し＋生え際） */
    isSumoHair(t) { return t === 'chonmage' || t === 'oicho'; },

    /**
     * 力士の髪：頭のてっぺんから、こめかみの横で四角っぽく張り出して耳の上まで。
     * 下の辺は生え際（額の上で、中央が少し下がる）。顔の上に重ねて描く。
     */
    sumoHairPath(ctx, r) {
        const g = this.faceGeom(r.face), cx = 160, hl = this.POS.hairline;
        const wing = g.cheekW + 22;                 // こめかみの張り出し（顔の横から外へはみ出す）
        const low = g.cheekY - 26;                  // 髪の横の下の端（耳の上あたりまで下りてくる）
        ctx.beginPath();
        ctx.moveTo(cx - g.cheekW + 4, low + 10);                           // 左の耳の上
        ctx.lineTo(cx - wing, low - 8);                                    // 張り出しの下の角
        ctx.bezierCurveTo(cx - wing - 8, 130, cx - wing + 4, 74, cx - 72, 54);
        ctx.bezierCurveTo(cx - 36, 40, cx + 36, 40, cx + 72, 54);          // 頭のてっぺん
        ctx.bezierCurveTo(cx + wing - 4, 74, cx + wing + 8, 130, cx + wing, low - 8);
        ctx.lineTo(cx + g.cheekW - 4, low + 10);                           // 右の耳の上
        // 生え際（右のこめかみ → 額の中央の少し下がった所 → 左のこめかみ）
        ctx.bezierCurveTo(cx + g.topW - 6, low - 20, cx + g.topW - 6, hl + 20, cx + 52, hl + 2);
        ctx.quadraticCurveTo(cx + 22, hl - 4, cx, hl + 8);
        ctx.quadraticCurveTo(cx - 22, hl - 4, cx - 52, hl + 2);
        ctx.bezierCurveTo(cx - g.topW + 6, hl + 20, cx - g.topW + 6, low - 20, cx - g.cheekW + 4, low + 10);
        ctx.closePath();
    },

    /** 顔の後ろに広がる髪（ざんばら・長髪・もじゃ） */
    drawHairBack(ctx, r) {
        const t = r.hair.type, c = r.hair.color, g = this.faceGeom(r.face);
        const path = () => {
            ctx.beginPath();
            if (t === 'long') {
                ctx.moveTo(160, 46);
                ctx.bezierCurveTo(160 + g.cheekW + 34, 46, 160 + g.cheekW + 30, 200, 160 + g.cheekW + 12, 316);
                ctx.lineTo(160 - g.cheekW - 12, 316);
                ctx.bezierCurveTo(160 - g.cheekW - 30, 200, 160 - g.cheekW - 34, 46, 160, 46);
            } else if (t === 'afro') {
                const n = 18;
                for (let i = 0; i <= n; i++) {
                    const a = Math.PI * 2 * i / n;
                    const x = 160 + Math.cos(a) * (g.cheekW + 18), y = 140 + Math.sin(a) * 112;
                    const x2 = 160 + Math.cos(a + Math.PI / n) * (g.cheekW + 32), y2 = 140 + Math.sin(a + Math.PI / n) * 126;
                    if (i === 0) ctx.moveTo(x, y); else ctx.quadraticCurveTo(x2, y2, x, y);
                }
            } else if (t === 'zanbara') {
                const n = 17;
                for (let i = 0; i <= n; i++) {
                    const a = Math.PI * (0.95 + 1.1 * i / n);
                    const rad = (i % 2 === 0) ? g.cheekW + 26 : g.cheekW + 4;
                    const x = 160 + Math.cos(a) * rad, y = 186 + Math.sin(a) * rad * 1.08;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
            } else return false;
            ctx.closePath();
            return true;
        };
        if (!path()) return;
        ctx.fillStyle = c; ctx.fill();
        ctx.strokeStyle = this.LINE; ctx.lineWidth = this.LW; ctx.stroke();
    },

    /** まげ（ちょんまげ：丸いかたまり／大銀杏：いちょうの葉の形）。髪の下に一部隠れる */
    drawBun(ctx, r) {
        const t = r.hair.type, c = r.hair.color;
        if (t === 'chonmage') {
            const path = () => { ctx.beginPath(); ctx.ellipse(160, 36, 36, 28, 0, 0, Math.PI * 2); };
            path(); ctx.fillStyle = c; ctx.fill();
            path(); ctx.strokeStyle = this.LINE; ctx.lineWidth = this.LW; ctx.stroke();
        } else if (t === 'oicho') {
            const path = () => {
                ctx.beginPath();
                ctx.moveTo(160, 62);
                ctx.quadraticCurveTo(104, 52, 108, 22);
                ctx.quadraticCurveTo(160, 2, 212, 22);
                ctx.quadraticCurveTo(216, 52, 160, 62);
                ctx.closePath();
            };
            path(); ctx.fillStyle = c; ctx.fill();
            path(); ctx.strokeStyle = this.LINE; ctx.lineWidth = this.LW; ctx.stroke();
        }
    },

    /** 頭の上の髪 */
    drawHair(ctx, r, alone = false) {
        const t = r.hair.type, c = r.hair.color, g = this.faceGeom(r.face);
        if (this.isSumoHair(t) || t === 'zanbara' || t === 'long') {
            const path = () => this.sumoHairPath(ctx, r);
            path(); ctx.fillStyle = c; ctx.fill();
            path(); ctx.strokeStyle = this.LINE; ctx.lineWidth = this.LW; ctx.stroke();
        } else if (t === 'shichisan') {
            // 七三分け：横分けの前髪
            const path = () => {
                ctx.beginPath();
                ctx.moveTo(160 - g.cheekW - 4, g.cheekY - 50);
                ctx.bezierCurveTo(160 - g.cheekW - 10, 80, 120, 44, 166, 46);
                ctx.bezierCurveTo(222, 48, 160 + g.cheekW + 10, 86, 160 + g.cheekW + 4, g.cheekY - 50);
                ctx.bezierCurveTo(160 + g.topW, 130, 210, 112, 136, 108);
                ctx.quadraticCurveTo(84, 112, 160 - g.cheekW - 4, g.cheekY - 50);
                ctx.closePath();
            };
            path(); ctx.fillStyle = c; ctx.fill();
            path(); ctx.strokeStyle = this.LINE; ctx.lineWidth = this.LW; ctx.stroke();
        } else if (t === 'short' || t === 'center') {
            // 短髪：頭にぴったりの髪、生え際はまっすぐ／まん中分け：額の中央で左右に分かれる
            const hl = this.POS.hairline;
            const path = () => {
                ctx.beginPath();
                ctx.moveTo(160 - g.cheekW + 2, g.cheekY - 46);
                ctx.bezierCurveTo(160 - g.cheekW - 8, 90, 118, 52, 160, 52);
                ctx.bezierCurveTo(202, 52, 160 + g.cheekW + 8, 90, 160 + g.cheekW - 2, g.cheekY - 46);
                if (t === 'short') {
                    ctx.bezierCurveTo(160 + g.topW - 8, 140, 160 + g.topW - 12, hl - 2, 160 + 40, hl - 2);
                    ctx.lineTo(160 - 40, hl - 2);
                    ctx.bezierCurveTo(160 - g.topW + 12, hl - 2, 160 - g.topW + 8, 140, 160 - g.cheekW + 2, g.cheekY - 46);
                } else {
                    ctx.bezierCurveTo(160 + g.topW, 150, 160 + 60, hl + 14, 160 + 6, hl - 16);
                    ctx.lineTo(160 - 6, hl - 16);
                    ctx.bezierCurveTo(160 - 60, hl + 14, 160 - g.topW, 150, 160 - g.cheekW + 2, g.cheekY - 46);
                }
                ctx.closePath();
            };
            path(); ctx.fillStyle = c; ctx.fill();
            path(); ctx.strokeStyle = this.LINE; ctx.lineWidth = this.LW; ctx.stroke();
        } else if (t === 'bozu') {
            // 坊主：頭の上をうすく塗り、細かい点
            ctx.save(); this.facePath(ctx, r.face); ctx.clip();
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(320, 0); ctx.lineTo(320, 150);
            ctx.quadraticCurveTo(160, this.POS.hairline - 6, 0, 150); ctx.closePath();
            ctx.fillStyle = this.withAlpha(c, alone ? 0.7 : 0.42); ctx.fill();
            ctx.restore();
        } else if (t === 'afro') {
            // もじゃ：額の上を覆う
            ctx.save(); this.facePath(ctx, r.face); ctx.clip();
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(320, 0); ctx.lineTo(320, 140);
            for (let i = 0; i <= 8; i++) ctx.quadraticCurveTo(320 - i * 40 + 20, 140 - 14, 320 - (i + 1) * 40, 136);
            ctx.closePath(); ctx.fillStyle = c; ctx.fill();
            ctx.restore();
        } else if (t === 'none' && !alone) {
            // つるつる頭の光り
            ctx.beginPath(); ctx.ellipse(126, 116, 26, 10, -0.4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
        }
    },

    // --- 目・眉 ---------------------------------------------------
    eyePos(r) {
        const e = r.eye;
        return { y: this.POS.eye + (e.y || 0), dx: 44 + (e.gap || 0), k: (e.size || 1) * 1.3 };
    },

    drawEyes(ctx, r) {
        const e = r.eye, p = this.eyePos(r), k = p.k;
        const skin = r.face.color, line = this.LINE;
        const soft = this.withAlpha(this.shade(skin, -0.45), 0.8);
        [-1, 1].forEach(s => {
            ctx.save();
            ctx.translate(160 + s * p.dx, p.y);
            ctx.scale(s, 1);   // x の正の向きが顔の外側
            const eye = o => this.almond(ctx, { color: e.color, skin, ...o });
            switch (e.type) {
                // どんぐり：まん丸に近い白目に、瞳が丸ごと見える
                case 'round':  eye({ w: 12 * k, h: 9.5 * k, top: 1.15, bot: 1.15, iris: 6.4 * k, lidW: 2.6, fold: false }); break;
                // ぱっちり：大きな目、二重、目尻にまつげ、光が2つ
                case 'big':    eye({ w: 17 * k, h: 10 * k, top: 1.35, bot: 1.0, iris: 8.2 * k, lidW: 3.6, lashes: true, sparkle: true }); break;
                // 細目：線のように細く、瞳は少しだけ
                case 'narrow': eye({ w: 17 * k, h: 3 * k, top: 1.3, bot: 0.9, iris: 5 * k, irisY: 1 * k, lidW: 3.2, fold: false, lower: false }); break;
                // つり目：目尻が上がり、目尻がとがる
                case 'tsuri':  eye({ w: 17 * k, h: 6 * k, rot: -0.26, top: 1.2, bot: 0.8, iris: 5.8 * k, lidW: 3.2, sharp: true }); break;
                // たれ目：目尻が下がり、目の下にふくらみ
                case 'tare':   eye({ w: 16 * k, h: 7 * k, rot: 0.24, top: 1.4, bot: 1.0, iris: 6.2 * k });
                    this.eyeBag(ctx, k, skin, 1.4); break;
                // 三白眼：白目が多く、小さな瞳が上の方に
                case 'sanpaku': eye({ w: 17 * k, h: 7.5 * k, top: 1.2, bot: 1.1, iris: 4 * k, irisY: -2.2 * k, lidW: 3.2, sharp: true, fold: false }); break;
                // 半目：重いまぶたが瞳の上半分を隠す（眠そう・落ち着いた顔）
                case 'sleepy': eye({ w: 16 * k, h: 7 * k, top: 1.3, bot: 1.0, iris: 6.4 * k, irisY: 1 * k, lid: 0.55 });
                    this.eyeBag(ctx, k, skin, 1); break;
                case 'smile':
                    // にっこり：上に弧を描いた目と、目尻のしわ
                    ctx.beginPath(); ctx.moveTo(-15 * k, 3 * k); ctx.quadraticCurveTo(0, -9 * k, 16 * k, 2 * k);
                    ctx.strokeStyle = line; ctx.lineWidth = 3.2; ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(-10 * k, 7 * k); ctx.quadraticCurveTo(0, 4 * k, 12 * k, 7 * k);
                    ctx.strokeStyle = soft; ctx.lineWidth = 1.3; ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(19 * k, -1 * k); ctx.lineTo(25 * k, -4 * k); ctx.moveTo(19 * k, 3 * k); ctx.lineTo(25 * k, 4 * k);
                    ctx.stroke();
                    break;
                case 'closed': {
                    // 閉じた目（いまの絵の閉じ目）：下向きの長い弧、まぶたのふくらみと影
                    const gr = ctx.createLinearGradient(0, -12 * k, 0, 2 * k);
                    gr.addColorStop(0, this.withAlpha(this.shade(skin, -0.2), 0)); gr.addColorStop(1, this.withAlpha(this.shade(skin, -0.2), 0.6));
                    ctx.beginPath(); ctx.moveTo(-17 * k, 0); ctx.quadraticCurveTo(0, -14 * k, 19 * k, 0); ctx.quadraticCurveTo(0, 6 * k, -17 * k, 0);
                    ctx.fillStyle = gr; ctx.fill();
                    ctx.beginPath(); ctx.moveTo(-17 * k, -1 * k); ctx.quadraticCurveTo(0, 6 * k, 19 * k, 0);
                    ctx.strokeStyle = line; ctx.lineWidth = 3; ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(-12 * k, -6 * k); ctx.quadraticCurveTo(2 * k, -12 * k, 16 * k, -5 * k);
                    ctx.strokeStyle = soft; ctx.lineWidth = 1.2; ctx.stroke();
                    break;
                }
                default:       eye({ w: 16 * k, h: 6.5 * k, top: 1.35, bot: 1.05, iris: 6.2 * k });   // normal：切れ長（いまの絵）
            }
            ctx.restore();
        });
    },

    /**
     * 目（いまの力士の絵）：白目は少しだけ、茶色い瞳が大きめに見え、上まぶたは濃く太い線。下まぶたは細くうすい線。
     * o: w 半分の幅 h 高さ rot 傾き top/bot 上下のふくらみ iris 瞳の半径 irisY 瞳の上下
     *    lid 上まぶたが下りる割合（半目） lidW 上まぶたの線の太さ sharp 目尻をとがらせる
     *    lashes まつげ sparkle 光を2つ fold 二重の線 lower 下まぶたの線
     */
    almond(ctx, o) {
        const { w, h, color, skin } = o;
        const rot = o.rot || 0, top = o.top || 1.35, bot = o.bot || 1.05;
        const iris = o.iris, iy = o.irisY || 0;
        const tipY = o.sharp ? -h * 0.4 : 1;          // 目尻の高さ（とがった目は少し上）
        ctx.save();
        ctx.rotate(rot);
        const shape = () => {
            ctx.beginPath();
            ctx.moveTo(-w, 1);
            ctx.bezierCurveTo(-w * 0.45, -h * top, w * 0.45, -h * top * 1.07, w, tipY);
            ctx.bezierCurveTo(w * 0.45, h * bot, -w * 0.45, h * bot, -w, 1);
            ctx.closePath();
        };
        shape(); ctx.fillStyle = '#f7f2ec'; ctx.fill();
        ctx.save(); shape(); ctx.clip();
        ctx.beginPath(); ctx.arc(0.5, iy, iris, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
        ctx.beginPath(); ctx.arc(0.5, iy, iris * 0.5, 0, Math.PI * 2); ctx.fillStyle = '#151010'; ctx.fill();
        ctx.beginPath(); ctx.arc(0.5 - iris * 0.3, iy - iris * 0.35, Math.max(1.3, iris * 0.22), 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        if (o.sparkle) { ctx.beginPath(); ctx.arc(0.5 + iris * 0.38, iy + iris * 0.32, Math.max(1, iris * 0.13), 0, Math.PI * 2); ctx.fill(); }
        // 上まぶたの影（白目の上の方が少し暗い）
        ctx.fillStyle = 'rgba(80,50,30,0.25)'; ctx.fillRect(-w, -h * 1.6, w * 2, h * 0.75);
        // 半目：上まぶた（肌の色）が下りてくる
        let lidY = null;
        if (o.lid) {
            lidY = -h * top + h * (top + bot) * o.lid;
            ctx.fillStyle = this.shade(skin, -0.06);
            ctx.fillRect(-w - 2, -h * 2, w * 2 + 4, lidY + h * 2);
        }
        ctx.restore();
        // 上まぶた：濃く太い線（半目はまぶたのふち）
        ctx.beginPath();
        if (lidY !== null) {
            ctx.moveTo(-w - 1, 1.5); ctx.quadraticCurveTo(-w * 0.6, lidY, 0, lidY); ctx.quadraticCurveTo(w * 0.6, lidY, w + 2, tipY + 0.5);
        } else {
            ctx.moveTo(-w - 1, 1.5); ctx.bezierCurveTo(-w * 0.45, -h * top, w * 0.45, -h * top * 1.07, w + 2, tipY + 0.5);
        }
        ctx.strokeStyle = this.LINE; ctx.lineWidth = o.lidW || 2.8; ctx.stroke();
        // まつげ（目尻に3本）
        if (o.lashes) {
            ctx.lineWidth = 2;
            [[0.62, -0.95, 0.75, -1.6], [0.82, -0.6, 1.02, -1.15], [0.97, -0.15, 1.2, -0.5]].forEach(([a, b, c, d]) => {
                ctx.beginPath(); ctx.moveTo(w * a, h * b); ctx.lineTo(w * c, h * d); ctx.stroke();
            });
        }
        // 下まぶた：細くうすい線
        if (o.lower !== false) {
            ctx.beginPath(); ctx.moveTo(-w * 0.6, h * bot * 0.72); ctx.bezierCurveTo(-w * 0.2, h * bot, w * 0.4, h * bot * 0.95, w * 0.9, tipY + h * 0.3);
            ctx.strokeStyle = this.withAlpha(this.shade(skin, -0.45), 0.8); ctx.lineWidth = 1.2; ctx.stroke();
        }
        // 二重の線
        if (o.fold !== false) {
            const fy = lidY !== null ? lidY - h * 0.5 : -h * top * 0.92;
            ctx.beginPath(); ctx.moveTo(-w * 0.55, fy); ctx.quadraticCurveTo(w * 0.1, fy - h * 0.6, w * 0.85, fy + h * 0.45);
            ctx.strokeStyle = this.withAlpha(this.shade(skin, -0.45), 0.7); ctx.lineWidth = 1.2; ctx.stroke();
        }
        ctx.restore();
    },

    /** 目の下のふくらみ（たれ目・寝不足顔の線） */
    eyeBag(ctx, k, skin, a = 1) {
        ctx.beginPath(); ctx.moveTo(-12 * k, 12 * k); ctx.quadraticCurveTo(2 * k, 17 * k, 15 * k, 10 * k);
        ctx.strokeStyle = this.withAlpha(this.shade(skin, -0.38), 0.6 * a); ctx.lineWidth = 1.3; ctx.stroke();
    },

    drawBrows(ctx, r) {
        const b = r.brow;
        if (b.type === 'none') return;
        const p = this.eyePos(r);
        const y = this.POS.brow + (b.y || 0) + Math.min(0, (r.eye.y || 0));
        const deg = b.angle || 0;                   // プラスで外側が上がる（全部の形で共通）
        ctx.fillStyle = b.color; ctx.strokeStyle = b.color;

        // つながり眉：眉間でつながった1本（左右を別々には描かない）
        if (b.type === 'unibrow') {
            ctx.save();
            ctx.translate(160, y);
            ctx.beginPath();
            const a = Math.tan(deg * Math.PI / 180) * 70;
            ctx.moveTo(-92, 2 - a); ctx.quadraticCurveTo(-46, -12, -6, -3); ctx.quadraticCurveTo(0, -1, 6, -3);
            ctx.quadraticCurveTo(46, -12, 92, 2 - a);
            ctx.lineTo(92, 5 - a); ctx.quadraticCurveTo(46, -2, 6, 6); ctx.quadraticCurveTo(0, 7, -6, 6);
            ctx.quadraticCurveTo(-46, -2, -92, 5 - a); ctx.closePath(); ctx.fill();
            ctx.restore();
            return;
        }

        [-1, 1].forEach(s => {
            ctx.save();
            ctx.translate(160 + s * (p.dx + 4), y);
            ctx.scale(s, 1);                        // x の正の向きが顔の外側
            ctx.rotate(-deg * Math.PI / 180);
            ctx.beginPath();
            switch (b.type) {
                case 'maro':     // まろ眉：額の高い所に、小さな丸
                    ctx.ellipse(-6, -14, 11, 7, 0, 0, Math.PI * 2); break;
                case 'thin':     // 細い：同じ細さの1本の弧
                    ctx.moveTo(-26, 2); ctx.quadraticCurveTo(4, -9, 34, 1);
                    ctx.quadraticCurveTo(4, -5, -26, 5); break;
                case 'arch':     // 弓なり：真ん中が高く持ち上がった弧、外側へ細く
                    ctx.moveTo(-26, 5); ctx.lineTo(-25, -3);
                    ctx.quadraticCurveTo(2, -22, 34, 2);
                    ctx.quadraticCurveTo(2, -13, -26, 5); break;
                case 'peak':     // 山形：外寄りに角のある太い眉（きりっとした形）
                    ctx.moveTo(-26, 6); ctx.lineTo(-26, -5);
                    ctx.lineTo(16, -12); ctx.lineTo(34, 3);
                    ctx.lineTo(16, -4); ctx.lineTo(-26, 6); break;
                case 'straight': // 一文字：まっすぐな太い帯。眉頭は毛の流れでぼかす（いまの絵の眉）
                    ctx.moveTo(-20, 6); ctx.lineTo(-20, -6); ctx.lineTo(34, -6); ctx.lineTo(34, 4); ctx.lineTo(-20, 6);
                    ctx.closePath(); ctx.fill();
                    ctx.lineWidth = 1.8;
                    for (let i = 0; i < 5; i++) {
                        ctx.beginPath(); ctx.moveTo(-20 - i * 1.6, 5 - i * 0.4); ctx.lineTo(-24 - i * 1.6, -5 + i * 1.6); ctx.stroke();
                    }
                    ctx.beginPath(); break;
                case 'fude':     // 筆：眉頭が太く、外へ向かって筆ではらうように細くはね上がる
                    ctx.moveTo(-26, 7); ctx.quadraticCurveTo(-28, -2, -22, -7);
                    ctx.quadraticCurveTo(10, -10, 40, -12);
                    ctx.quadraticCurveTo(10, -2, -26, 7); break;
                case 'short':    // 短い：太くて短い四角っぽい眉
                    ctx.moveTo(-18, 7); ctx.lineTo(-18, -6); ctx.quadraticCurveTo(4, -9, 14, -5);
                    ctx.lineTo(14, 5); ctx.quadraticCurveTo(0, 4, -18, 7); break;
                case 'bushy':    // げじげじ：とても太く、上下のふちがぎざぎざ
                    ctx.moveTo(-26, 9);
                    for (let i = 0; i <= 10; i++) ctx.lineTo(-26 + i * 6, -9 - (i % 2) * 3 - Math.sin(i / 10 * Math.PI) * 3);
                    ctx.lineTo(36, 2);
                    for (let i = 10; i >= 0; i--) ctx.lineTo(-26 + i * 6, 6 + (i % 2) * 3 - Math.sin(i / 10 * Math.PI) * 2);
                    break;
                default:         // 太い：いまの力士の絵の、ほぼまっすぐで太く濃い眉。外側へやや細く
                    ctx.moveTo(-26, 6); ctx.lineTo(-25, -6);
                    ctx.quadraticCurveTo(4, -10, 34, -2);
                    ctx.lineTo(34, 2);
                    ctx.quadraticCurveTo(4, 0, -26, 6);
            }
            ctx.closePath(); ctx.fill();
            ctx.restore();
        });
    },

    // --- 鼻 -------------------------------------------------------
    /**
     * いまの力士たち（ゲームの絵）の鼻：
     *   - 鼻すじ：眉間の下から鼻先の横へ下りる線（向かって左は濃く、右はうすく）
     *   - 鼻先：丸いかたまり。両わきにうすい線、上に光、下に影
     *   - 小鼻：外へふくらむ「（ ）」の太い線。下の端は鼻の穴へ巻きこむ
     *   - 鼻の穴：濃い色のしずく形、間を鼻先の下の線でつなぐ
     *   - 小鼻の横から外へ下りる短いしわ（大きな鼻）
     * どの種類もこの描き方で、幅・高さ・鼻すじ・しわを変える。
     */
    drawNose(ctx, r) {
        const n = r.nose, k = (n.size || 1) * 1.22, y = this.POS.nose + (n.y || 0), x = 160;
        if (n.type === 'none') return;
        const skin = r.face.color, line = this.LINE;
        const brown = this.shade(skin, -0.42);
        const soft = this.withAlpha(brown, 0.75);
        const P = (dx, dy) => [x + dx * k, y + dy * k];

        // wd：小鼻の外までの幅 ht：鼻先の高さ
        // o.bridge：鼻すじの長さ（0で無し） o.both：右の鼻すじも o.crease：小鼻の横のしわ o.up：上向き（穴が大きく見える）
        const draw = (wd, ht, o = {}) => {
            const bridge = o.bridge || 0;
            // 鼻の下のうすい影
            ctx.save();
            ctx.filter = 'blur(3px)';
            ctx.beginPath(); ctx.ellipse(...P(0, ht * 0.95), wd * 0.75 * k, ht * 0.22 * k, 0, 0, Math.PI * 2);
            ctx.fillStyle = this.withAlpha(this.shade(skin, -0.3), 0.35); ctx.fill();
            ctx.restore();
            // 鼻先のかたまり：上が明るく、下と横が少し暗い
            const [bx, by] = P(0, -ht * 0.05);
            const gr = ctx.createRadialGradient(bx - wd * 0.15 * k, by - ht * 0.35 * k, 1, bx, by, wd * 0.75 * k);
            gr.addColorStop(0, this.withAlpha(this.shade(skin, 0.08), 0.9));
            gr.addColorStop(0.6, this.withAlpha(skin, 0));
            gr.addColorStop(1, this.withAlpha(this.shade(skin, -0.18), 0.55));
            ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(bx, by, wd * 0.7 * k, ht * 0.8 * k, 0, 0, Math.PI * 2); ctx.fill();

            // 鼻すじ（向かって左：濃い線、右：うすい線）
            if (bridge) {
                ctx.beginPath(); ctx.moveTo(...P(-9, -bridge));
                ctx.bezierCurveTo(...P(-11, -bridge * 0.55), ...P(-wd * 0.42, -ht * 1.1), ...P(-wd * 0.55, -ht * 0.55));
                ctx.strokeStyle = this.withAlpha(line, 0.85); ctx.lineWidth = 2.2; ctx.stroke();
                ctx.beginPath(); ctx.moveTo(...P(9, -bridge * (o.both ? 1 : 0.6)));
                ctx.bezierCurveTo(...P(11, -bridge * 0.4), ...P(wd * 0.42, -ht * 1.05), ...P(wd * 0.55, -ht * 0.55));
                ctx.strokeStyle = o.both ? this.withAlpha(brown, 0.85) : soft; ctx.lineWidth = o.both ? 1.8 : 1.5; ctx.stroke();
            }
            // 鼻先の両わきのうすい線（丸いかたまりに見せる）
            [-1, 1].forEach(s => {
                ctx.beginPath(); ctx.moveTo(...P(s * wd * 0.52, -ht * 0.5));
                ctx.quadraticCurveTo(...P(s * wd * 0.62, ht * 0.05), ...P(s * wd * 0.44, ht * 0.32));
                ctx.strokeStyle = soft; ctx.lineWidth = 1.5; ctx.stroke();
            });
            // 小鼻の横のしわ
            if (o.crease) {
                [-1, 1].forEach(s => {
                    ctx.beginPath(); ctx.moveTo(...P(s * wd * 1.1, -ht * 0.25));
                    ctx.quadraticCurveTo(...P(s * wd * 1.4, ht * 0.35), ...P(s * wd * 1.38, ht * 1.0));
                    ctx.strokeStyle = this.withAlpha(line, 0.7); ctx.lineWidth = 1.8; ctx.stroke();
                });
            }
            // 小鼻：外へふくらむ太い線。下の端は内側（鼻の穴）へ巻きこむ
            [-1, 1].forEach(s => {
                ctx.beginPath();
                ctx.moveTo(...P(s * wd * 0.62, -ht * 0.42));
                ctx.bezierCurveTo(...P(s * wd * 1.1, -ht * 0.5), ...P(s * wd * 1.18, ht * 0.5), ...P(s * wd * 0.7, ht * 0.52));
                ctx.quadraticCurveTo(...P(s * wd * 0.6, ht * 0.5), ...P(s * wd * 0.54, ht * 0.46));
                ctx.strokeStyle = line; ctx.lineWidth = 3.2; ctx.stroke();
            });
            // 鼻の穴（しずく形）
            const ny = o.up ? ht * 0.34 : ht * 0.42;
            const nrx = wd * (o.up ? 0.2 : 0.17), nry = ht * (o.up ? 0.16 : 0.09);
            ctx.fillStyle = this.mix(line, this.shade(skin, -0.6), 0.4);
            [-1, 1].forEach(s => {
                ctx.beginPath(); ctx.ellipse(...P(s * wd * 0.37, ny), nrx * k, nry * k, s * -0.15, 0, Math.PI * 2); ctx.fill();
            });
            // 鼻先の下の線（鼻の穴の間をくぐる）
            ctx.beginPath(); ctx.moveTo(...P(-wd * 0.3, ny + nry * 1.1));
            ctx.bezierCurveTo(...P(-wd * 0.2, ht * 0.8), ...P(wd * 0.2, ht * 0.8), ...P(wd * 0.3, ny + nry * 1.1));
            ctx.strokeStyle = line; ctx.lineWidth = 2.2; ctx.stroke();
            // 鼻先の光
            ctx.beginPath(); ctx.ellipse(...P(-wd * 0.1, -ht * 0.3), wd * 0.16 * k, ht * 0.14 * k, -0.3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,248,242,0.55)'; ctx.fill();
        };
        // 線だけで描くキャラクターらしい鼻の道具
        const stroke = (w = 3, c = line) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); };
        const shadowFill = (a = 0.45) => { ctx.fillStyle = this.withAlpha(this.shade(skin, -0.3), a); ctx.fill(); };
        const nostril = (dx, dy, rx, ry, rot = 0) => {
            ctx.beginPath(); ctx.ellipse(...P(dx, dy), rx * k, ry * k, rot, 0, Math.PI * 2);
            ctx.fillStyle = this.mix(line, this.shade(skin, -0.6), 0.4); ctx.fill();
        };
        switch (n.type) {
            case 'big':     draw(31, 21, { bridge: 48, both: true, crease: true }); break; // どっしり：大きく、しわも
            case 'el': {    // L字：鼻すじの線が下で横に折れる、漫画の定番の鼻
                ctx.beginPath(); ctx.moveTo(...P(-4, -40)); ctx.quadraticCurveTo(...P(-6, -16), ...P(-12, 2)); ctx.lineTo(...P(-12, 8)); ctx.lineTo(...P(-4, 4)); ctx.closePath(); shadowFill(0.35);
                ctx.beginPath(); ctx.moveTo(...P(-4, -40)); ctx.quadraticCurveTo(...P(-6, -16), ...P(-13, 3));
                ctx.quadraticCurveTo(...P(-6, 12), ...P(10, 8)); stroke(3);
                nostril(2, 6, 3, 1.8, -0.2);
                break;
            }
            case 'ku': {    // くの字：横を向いたようなとがった鼻
                ctx.beginPath(); ctx.moveTo(...P(4, -36)); ctx.lineTo(...P(-12, 4)); ctx.lineTo(...P(6, 10)); ctx.closePath(); shadowFill(0.3);
                ctx.beginPath(); ctx.moveTo(...P(4, -36)); ctx.quadraticCurveTo(...P(-4, -14), ...P(-13, 4));
                ctx.quadraticCurveTo(...P(-6, 9), ...P(6, 10)); stroke(3);
                break;
            }
            case 'shadow': { // 影：線を使わず、鼻の横と下の影だけで形を見せる（アニメ風）
                ctx.beginPath(); ctx.moveTo(...P(-2, -34)); ctx.quadraticCurveTo(...P(-12, -6), ...P(-12, 6));
                ctx.quadraticCurveTo(...P(-2, 2), ...P(-2, -34)); shadowFill(0.5);
                ctx.beginPath(); ctx.moveTo(...P(-10, 9)); ctx.quadraticCurveTo(...P(2, 15), ...P(12, 8));
                stroke(2.4, this.withAlpha(brown, 0.9));
                break;
            }
            case 'dot':     // 点：鼻の穴の2つの点だけ
                nostril(-7, 4, 3.2, 3.2); nostril(7, 4, 3.2, 3.2);
                break;
            case 'round': { // まる：丸い玉のような鼻
                const [cx, cy] = P(0, -2);
                const gr = ctx.createRadialGradient(cx - 5 * k, cy - 6 * k, 1, cx, cy, 16 * k);
                gr.addColorStop(0, this.shade(skin, 0.1)); gr.addColorStop(1, this.mix(skin, '#e0806e', 0.35));
                ctx.beginPath(); ctx.arc(cx, cy, 15 * k, 0, Math.PI * 2); ctx.fillStyle = gr; ctx.fill(); stroke(3);
                ctx.beginPath(); ctx.ellipse(cx - 5 * k, cy - 6 * k, 4.5 * k, 3 * k, -0.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
                break;
            }
            case 'hook': {  // わし鼻：長い鼻すじが大きく曲がって、とがった鼻先が下を向く
                ctx.beginPath(); ctx.moveTo(...P(-6, -46)); ctx.bezierCurveTo(...P(4, -36), ...P(16, -14), ...P(14, 6));
                ctx.quadraticCurveTo(...P(12, 14), ...P(2, 10)); ctx.lineTo(...P(-2, 10)); ctx.closePath(); shadowFill(0.3);
                ctx.beginPath(); ctx.moveTo(...P(-6, -46)); ctx.bezierCurveTo(...P(4, -36), ...P(16, -14), ...P(14, 6));
                ctx.quadraticCurveTo(...P(12, 14), ...P(2, 10)); stroke(3);
                ctx.beginPath(); ctx.moveTo(...P(-12, 4)); ctx.quadraticCurveTo(...P(-10, 10), ...P(-3, 9)); stroke(2.4);
                nostril(-4, 6, 3, 1.6, 0.2);
                break;
            }
            case 'up': {    // 上向き：小さく上を向いて、丸い鼻の穴が2つ見える
                ctx.beginPath(); ctx.moveTo(...P(-13, -2)); ctx.quadraticCurveTo(...P(-14, 10), ...P(0, 10));
                ctx.quadraticCurveTo(...P(14, 10), ...P(13, -2)); stroke(2.8);
                nostril(-5, 3, 2.8, 3.6, 0.2); nostril(5, 3, 2.8, 3.6, -0.2);
                ctx.beginPath(); ctx.ellipse(...P(-2, -8), 4 * k, 3 * k, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,248,242,0.6)'; ctx.fill();
                break;
            }
            case 'tiny':    // ちょん：小さな「く」の線だけ
                ctx.beginPath(); ctx.moveTo(...P(2, -10)); ctx.quadraticCurveTo(...P(-6, 0), ...P(-5, 4)); ctx.quadraticCurveTo(...P(0, 6), ...P(5, 4)); stroke(2.8);
                break;
            default:        draw(25, 17, { bridge: 42, crease: true });                 // ふつう（いまの力士の絵の鼻）
        }
    },

    // --- 口 -------------------------------------------------------
    /**
     * いまの力士の絵の唇：まわりを黒い線で囲まず、色の濃淡で形を出す。
     * 唇の色は選べる（下唇は上唇より少し明るく）。唇の合わせ目だけ濃い線。
     */
    drawMouth(ctx, r) {
        const m = r.mouth, k = (m.size || 1) * 1.25, y = this.POS.mouth + (m.y || 0), x = 160;
        const up = m.color || '#c98375';
        const lo = this.shade(up, 0.18);
        const seam = this.mix(up, '#3a1a14', 0.55);
        const lips = (wd, upH, loH, curve, seamCurve = 0) => {
            // 下唇
            ctx.beginPath();
            ctx.moveTo(x - wd * k, y + curve * k);
            ctx.bezierCurveTo(x - wd * 0.6 * k, y + loH * 1.25 * k, x + wd * 0.6 * k, y + loH * 1.25 * k, x + wd * k, y + curve * k);
            ctx.quadraticCurveTo(x, y + 2 * k, x - wd * k, y + curve * k);
            ctx.fillStyle = lo; ctx.fill();
            // 上唇（中央が少しへこんだ形）
            ctx.beginPath();
            ctx.moveTo(x - wd * k, y + curve * k);
            ctx.bezierCurveTo(x - wd * 0.6 * k, y - upH * k, x - 8 * k, y - upH * 1.15 * k, x, y - upH * 0.7 * k);
            ctx.bezierCurveTo(x + 8 * k, y - upH * 1.15 * k, x + wd * 0.6 * k, y - upH * k, x + wd * k, y + curve * k);
            ctx.quadraticCurveTo(x, y + 2 * k, x - wd * k, y + curve * k);
            ctx.fillStyle = up; ctx.fill();
            // 下唇の光
            ctx.beginPath(); ctx.ellipse(x + 4 * k, y + loH * 0.55 * k, wd * 0.25 * k, 2.2 * k, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,240,235,0.45)'; ctx.fill();
            // 下唇の下のふちだけ、うすい線
            ctx.beginPath(); ctx.moveTo(x - wd * 0.8 * k, y + (curve + loH * 0.5) * k);
            ctx.bezierCurveTo(x - wd * 0.5 * k, y + loH * 1.25 * k, x + wd * 0.5 * k, y + loH * 1.25 * k, x + wd * 0.8 * k, y + (curve + loH * 0.5) * k);
            ctx.strokeStyle = this.withAlpha(this.shade(up, -0.3), 0.6); ctx.lineWidth = 1.4; ctx.stroke();
            // 合わせ目の線
            ctx.beginPath(); ctx.moveTo(x - (wd + 3) * k, y + (curve + 0.5) * k);
            ctx.quadraticCurveTo(x, y + (2 + seamCurve) * k, x + (wd + 3) * k, y + (curve + 0.5) * k);
            ctx.strokeStyle = seam; ctx.lineWidth = 2.4; ctx.stroke();
        };
        switch (m.type) {
            case 'smile':  lips(26, 6, 8, -5, 4); break;
            case 'frown':  lips(23, 7, 9, 6, -3); break;
            case 'thick':  lips(27, 9, 13, 1); break;
            case 'small':  lips(15, 5, 6, 1); break;
            case 'smirk':
                lips(23, 6, 8, 1);
                ctx.beginPath(); ctx.moveTo(x + 20 * k, y + 1 * k); ctx.quadraticCurveTo(x + 27 * k, y - 2 * k, x + 30 * k, y - 7 * k);
                ctx.strokeStyle = seam; ctx.lineWidth = 2; ctx.stroke(); break;
            case 'open':
                ctx.beginPath(); ctx.ellipse(x, y + 4 * k, 12 * k, 14 * k, 0, 0, Math.PI * 2);
                ctx.fillStyle = up; ctx.fill();
                ctx.beginPath(); ctx.ellipse(x, y + 4 * k, 8 * k, 10 * k, 0, 0, Math.PI * 2);
                ctx.fillStyle = '#5a1e1a'; ctx.fill(); break;
            case 'pout':   // とがり：小さく前に突き出した唇
                lips(13, 8, 10, 2);
                ctx.beginPath(); ctx.moveTo(x - 17 * k, y - 6 * k); ctx.quadraticCurveTo(x - 20 * k, y + 2 * k, x - 16 * k, y + 10 * k);
                ctx.moveTo(x + 17 * k, y - 6 * k); ctx.quadraticCurveTo(x + 20 * k, y + 2 * k, x + 16 * k, y + 10 * k);
                ctx.strokeStyle = this.withAlpha(this.shade(r.face.color, -0.4), 0.6); ctx.lineWidth = 1.4; ctx.stroke(); break;
            case 'tongue': {   // べー：口の端から舌を出す
                lips(23, 6, 7, 1);
                ctx.beginPath(); ctx.moveTo(x - 9 * k, y + 2 * k);
                ctx.bezierCurveTo(x - 10 * k, y + 20 * k, x + 10 * k, y + 20 * k, x + 9 * k, y + 2 * k); ctx.closePath();
                ctx.fillStyle = '#e8737a'; ctx.fill();
                ctx.strokeStyle = this.mix('#e8737a', '#3a1a14', 0.5); ctx.lineWidth = 2; ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x, y + 5 * k); ctx.lineTo(x, y + 12 * k); ctx.lineWidth = 1.4; ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x - (23 + 3) * k, y + 1.5 * k); ctx.quadraticCurveTo(x, y + 2 * k, x + 26 * k, y + 1.5 * k);
                ctx.strokeStyle = seam; ctx.lineWidth = 2.4; ctx.stroke();
                break;
            }
            case 'teeth': {
                // 歯を見せて笑う（いまの絵の、上の歯が見える笑顔）
                const wd = 30;
                ctx.beginPath();
                ctx.moveTo(x - wd * k, y - 4 * k);
                ctx.quadraticCurveTo(x, y - 9 * k, x + wd * k, y - 4 * k);
                ctx.quadraticCurveTo(x + 4 * k, y + 22 * k, x - wd * k, y - 4 * k);
                ctx.closePath();
                ctx.fillStyle = '#6a2622'; ctx.fill();
                ctx.save(); ctx.clip();
                ctx.fillStyle = '#fbf8f4'; ctx.fillRect(x - 32 * k, y - 10 * k, 64 * k, 12 * k);
                ctx.fillStyle = '#e88a8a'; ctx.beginPath(); ctx.ellipse(x, y + 16 * k, 14 * k, 6 * k, 0, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                ctx.beginPath(); ctx.moveTo(x - wd * k, y - 4 * k); ctx.quadraticCurveTo(x + 4 * k, y + 22 * k, x + wd * k, y - 4 * k);
                ctx.strokeStyle = lo; ctx.lineWidth = 4; ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x - wd * k, y - 4 * k); ctx.quadraticCurveTo(x, y - 9 * k, x + wd * k, y - 4 * k);
                ctx.strokeStyle = up; ctx.lineWidth = 3; ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x - (wd + 2) * k, y - 4 * k); ctx.quadraticCurveTo(x + 4 * k, y + 23 * k, x + (wd + 2) * k, y - 4 * k);
                ctx.strokeStyle = seam; ctx.lineWidth = 1.4; ctx.stroke();
                break;
            }
            default:       lips(25, 7, 9, 1);   // neutral
        }
    },

    // --- ほお -----------------------------------------------------
    drawCheeks(ctx, r) {
        const t = r.cheek.type;
        if (t === 'none') return;
        const p = this.eyePos(r), g = this.faceGeom(r.face), skin = r.face.color;
        const y = this.POS.nose + 6;
        const line = this.withAlpha(this.shade(skin, -0.38), 0.7);
        [-1, 1].forEach(s => {
            const x = 160 + s * (p.dx + 26);
            if (t === 'blush' || t === 'red') {
                // いまの絵のような、ぼかした赤み
                const gr = ctx.createRadialGradient(x, y, 4, x, y, 40);
                gr.addColorStop(0, t === 'red' ? 'rgba(228,80,80,0.5)' : 'rgba(236,120,120,0.38)');
                gr.addColorStop(1, 'rgba(236,120,120,0)');
                ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, 42, 32, 0, 0, Math.PI * 2); ctx.fill();
            } else if (t === 'lines') {
                // 笑いじわ（小鼻の横から口の横へ）
                ctx.beginPath(); ctx.moveTo(160 + s * 28, this.POS.nose - 2); ctx.quadraticCurveTo(160 + s * 44, this.POS.nose + 24, 160 + s * 40, this.POS.mouth + 10);
                ctx.strokeStyle = line; ctx.lineWidth = 1.8; ctx.stroke();
            } else if (t === 'puffy') {
                ctx.beginPath(); ctx.moveTo(160 + s * 34, this.POS.nose + 6); ctx.quadraticCurveTo(160 + s * 46, this.POS.nose + 26, 160 + s * 42, this.POS.mouth + 4);
                ctx.strokeStyle = line; ctx.lineWidth = 1.6; ctx.stroke();
                ctx.beginPath(); ctx.moveTo(160 + s * (g.jawW - 26), g.jawY - 6); ctx.quadraticCurveTo(160 + s * (g.jawW - 10), g.jawY + 8, 160 + s * (g.jawW - 22), g.jawY + 18);
                ctx.stroke();
            } else if (t === 'dimple') {
                // えくぼ：口の両横に小さな三日月
                ctx.beginPath(); ctx.arc(160 + s * 40, this.POS.mouth + 2, 5, s > 0 ? Math.PI * 0.6 : -Math.PI * 0.35, s > 0 ? Math.PI * 1.35 : Math.PI * 0.4);
                ctx.strokeStyle = line; ctx.lineWidth = 1.8; ctx.stroke();
            } else if (t === 'freckles') {
                ctx.fillStyle = 'rgba(150,90,60,0.55)';
                [[-10, -6], [0, 0], [10, -5], [-5, 7], [7, 7], [14, 2]].forEach(([dx, dy]) => {
                    ctx.beginPath(); ctx.arc(x + dx, y + dy - 8, 1.9, 0, Math.PI * 2); ctx.fill();
                });
            }
        });
        if (t === 'mole') {
            ctx.fillStyle = '#3a2418';
            ctx.beginPath(); ctx.arc(160 + 36, this.POS.mouth + 12, 3, 0, Math.PI * 2); ctx.fill();
        } else if (t === 'scar') {
            const x = 160 + p.dx + 24;
            ctx.strokeStyle = this.withAlpha(this.shade(skin, -0.45), 0.9); ctx.lineWidth = 2.6;
            ctx.beginPath(); ctx.moveTo(x - 12, y - 16); ctx.lineTo(x + 10, y + 8); ctx.stroke();
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - 9 + i * 7, y - 12 + i * 7); ctx.lineTo(x - 3 + i * 7, y - 17 + i * 7); ctx.stroke(); }
        }
    },

    /** 汗（ほおの「汗」）：髪より手前に描く */
    drawSweat(ctx, r) {
        if (r.cheek.type !== 'sweat') return;
        const g = this.faceGeom(r.face);
        // 汗：こめかみに水のしずく
        const drop = (dx, dy, sz) => {
            const sx = 160 + dx, sy = dy;
            ctx.beginPath(); ctx.moveTo(sx, sy - sz * 1.6);
            ctx.bezierCurveTo(sx + sz * 1.1, sy - sz * 0.2, sx + sz, sy + sz, sx, sy + sz);
            ctx.bezierCurveTo(sx - sz, sy + sz, sx - sz * 1.1, sy - sz * 0.2, sx, sy - sz * 1.6);
            ctx.fillStyle = '#bfe4f7'; ctx.fill();
            ctx.strokeStyle = '#4a8ab8'; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.arc(sx - sz * 0.3, sy + sz * 0.1, sz * 0.25, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        };
        drop(g.topW - 12, this.POS.brow - 12, 8);
        drop(g.topW - 2, this.POS.brow + 18, 5.5);
    },

    // --- 装飾（無精ひげ・ひげ剃りあと・眼鏡など） -------------------
    beardColor(r) { return r.hair.type === 'none' ? '#2a2a2a' : r.hair.color; },

    /** あごの周りのひげ（無精ひげ・ひげ剃りあと）と、顔に描く隈取。目や口はこの上に描く */
    drawBeardArea(ctx, r) {
        const t = r.beard.type;
        const g = this.faceGeom(r.face);
        if (t === 'kumadori') { this.drawKumadori(ctx, r); return; }
        if (t !== 'stubble' && t !== 'shadow') return;
        const color = this.beardColor(r);
        const top = this.POS.nose + 14;
        const jawArea = () => {
            ctx.beginPath();
            ctx.moveTo(0, 320); ctx.lineTo(0, top + 6);
            ctx.quadraticCurveTo(100, top - 6, 132, top + 4);
            ctx.quadraticCurveTo(160, top + 12, 188, top + 4);
            ctx.quadraticCurveTo(220, top - 6, 320, top + 6);
            ctx.lineTo(320, 320); ctx.closePath();
        };
        ctx.save();
        this.facePath(ctx, r.face); ctx.clip();
        if (t === 'stubble') {
            // 無精ひげ：あご周りの細かく短い毛
            ctx.save(); jawArea(); ctx.clip();
            ctx.strokeStyle = this.withAlpha(color, 0.55); ctx.lineWidth = 1;
            let seed = 11;
            const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
            for (let i = 0; i < 520; i++) {
                const px = 20 + rnd() * 280, py = top + rnd() * (g.chinY - top);
                ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 0.8, py + 2.4); ctx.stroke();
            }
            ctx.restore();
        } else {
            // ひげ剃りあと：あご周りがうっすら暗い
            // ひげ剃りあと：口のまわりからあごへ、ふちをぼかした青っぽい影
            ctx.filter = 'blur(7px)';
            ctx.beginPath();
            ctx.moveTo(160 - g.jawW - 14, g.jawY - 30);
            ctx.quadraticCurveTo(160 - 46, top + 8, 160, top + 10);
            ctx.quadraticCurveTo(160 + 46, top + 8, 160 + g.jawW + 14, g.jawY - 30);
            ctx.lineTo(160 + g.jawW + 20, 330); ctx.lineTo(160 - g.jawW - 20, 330); ctx.closePath();
            ctx.fillStyle = this.withAlpha(this.mix(r.face.color, '#4a5260', 0.55), 0.42); ctx.fill();
            ctx.filter = 'none';
        }
        ctx.restore();
    },

    /** 隈取（歌舞伎の化粧）：目尻から上へはねる赤い線と、ほおの赤い線 */
    drawKumadori(ctx, r) {
        const p = this.eyePos(r);
        ctx.save();
        this.facePath(ctx, r.face); ctx.clip();
        ctx.strokeStyle = '#c8202a'; ctx.lineCap = 'round';
        [-1, 1].forEach(s => {
            // 目の周りから、こめかみへはね上がる太い線
            ctx.beginPath();
            ctx.moveTo(160 + s * (p.dx - 16), p.y + 10);
            ctx.quadraticCurveTo(160 + s * (p.dx + 22), p.y + 4, 160 + s * (p.dx + 40), p.y - 34);
            ctx.lineWidth = 6; ctx.stroke();
            // 眉の上の線
            ctx.beginPath();
            ctx.moveTo(160 + s * 18, this.POS.brow - 14);
            ctx.quadraticCurveTo(160 + s * 50, this.POS.brow - 34, 160 + s * 76, this.POS.brow - 44);
            ctx.lineWidth = 4.5; ctx.stroke();
            // ほおの線
            ctx.beginPath();
            ctx.moveTo(160 + s * 34, this.POS.nose + 8);
            ctx.quadraticCurveTo(160 + s * 62, this.POS.nose + 4, 160 + s * 84, this.POS.nose - 24);
            ctx.lineWidth = 4; ctx.stroke();
        });
        ctx.restore();
    },

    /** 顔の上に重ねる飾り（眼鏡・サングラス・はちまき・ばんそうこう）。一番最後に描く */
    drawAccessory(ctx, r) {
        const t = r.beard.type, p = this.eyePos(r), g = this.faceGeom(r.face);
        const line = this.LINE;
        if (t === 'glasses' || t === 'sunglasses') {
            const ey = p.y, rx = 24, ry = (t === 'sunglasses') ? 17 : 19;
            [-1, 1].forEach(s => {
                ctx.beginPath();
                if (t === 'sunglasses') this.roundRect(ctx, 160 + s * p.dx - rx, ey - ry + 2, rx * 2, ry * 2, 12);
                else ctx.ellipse(160 + s * p.dx, ey, rx, ry, 0, 0, Math.PI * 2);
                if (t === 'sunglasses') { ctx.fillStyle = 'rgba(20,20,26,0.88)'; ctx.fill(); }
                else { ctx.fillStyle = 'rgba(210,230,245,0.18)'; ctx.fill(); }
                ctx.strokeStyle = line; ctx.lineWidth = 3.2; ctx.stroke();
                // つる（耳へ）
                ctx.beginPath(); ctx.moveTo(160 + s * (p.dx + rx), ey - 4); ctx.lineTo(160 + s * (g.cheekW - 4), ey - 8);
                ctx.lineWidth = 3; ctx.stroke();
                if (t === 'sunglasses') {
                    ctx.beginPath(); ctx.moveTo(160 + s * p.dx - rx * 0.5, ey - ry * 0.4); ctx.lineTo(160 + s * p.dx - rx * 0.1, ey - ry * 0.75);
                    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.strokeStyle = line;
                }
            });
            // ブリッジ（眼鏡の真ん中）
            ctx.beginPath(); ctx.moveTo(160 - p.dx + rx, ey - 4); ctx.quadraticCurveTo(160, ey - 12, 160 + p.dx - rx, ey - 4);
            ctx.lineWidth = 3; ctx.stroke();
        } else if (t === 'hachimaki') {
            // はちまき：額に白い布、横で結んだ端
            const hy = this.POS.hairline + 8;
            ctx.save();
            const band = () => {
                ctx.beginPath();
                ctx.moveTo(160 - g.cheekW - 14, hy + 4);
                ctx.quadraticCurveTo(160, hy - 12, 160 + g.cheekW + 14, hy + 4);
                ctx.lineTo(160 + g.cheekW + 14, hy + 22);
                ctx.quadraticCurveTo(160, hy + 6, 160 - g.cheekW - 14, hy + 22);
                ctx.closePath();
            };
            band(); ctx.fillStyle = '#fbfbf8'; ctx.fill();
            ctx.strokeStyle = line; ctx.lineWidth = 3; ctx.stroke();
            // 日の丸
            ctx.beginPath(); ctx.arc(160, hy + 5, 6.5, 0, Math.PI * 2); ctx.fillStyle = '#d42a2a'; ctx.fill();
            // 結び目の端
            ctx.fillStyle = '#fbfbf8';
            [[18, -6], [26, 14]].forEach(([dx, dy]) => {
                ctx.beginPath();
                ctx.moveTo(160 + g.cheekW + 8, hy + 10);
                ctx.lineTo(160 + g.cheekW + 8 + dx, hy + 10 + dy);
                ctx.lineTo(160 + g.cheekW + 8 + dx - 4, hy + 10 + dy + 9);
                ctx.closePath(); ctx.fill(); ctx.stroke();
            });
            ctx.restore();
        } else if (t === 'eyepatch') {
            // 眼帯：向かって右の目に黒い当て布、ひもは斜めに頭へ
            const ex = 160 + p.dx, ey = p.y;
            ctx.beginPath();
            ctx.moveTo(160 - g.topW + 4, this.POS.hairline + 14); ctx.lineTo(ex, ey - 6); ctx.lineTo(160 + g.cheekW - 2, ey + 18);
            ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 3.5; ctx.stroke();
            ctx.beginPath(); ctx.ellipse(ex, ey + 1, 25, 19, 0.1, 0, Math.PI * 2);
            ctx.fillStyle = '#26262a'; ctx.fill();
            ctx.strokeStyle = line; ctx.lineWidth = 3; ctx.stroke();
            ctx.beginPath(); ctx.ellipse(ex - 7, ey - 6, 8, 4, -0.4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();
        } else if (t === 'mask') {
            // マスク：鼻から下を白い布で覆う。耳へかけるひも
            const top = this.POS.nose - 22, bot = Math.min(g.chinY - 14, this.POS.mouth + 40);
            const half = g.cheekW - 18;
            const path = () => {
                ctx.beginPath();
                ctx.moveTo(160 - half, top + 12);
                ctx.quadraticCurveTo(160, top - 10, 160 + half, top + 12);
                ctx.quadraticCurveTo(160 + half + 4, (top + bot) / 2, 160 + half - 10, bot - 8);
                ctx.quadraticCurveTo(160, bot + 12, 160 - half + 10, bot - 8);
                ctx.quadraticCurveTo(160 - half - 4, (top + bot) / 2, 160 - half, top + 12);
                ctx.closePath();
            };
            [-1, 1].forEach(s => {
                ctx.beginPath(); ctx.moveTo(160 + s * half, top + 16); ctx.lineTo(160 + s * (g.cheekW - 2), g.cheekY - 18);
                ctx.moveTo(160 + s * (half - 6), bot - 12); ctx.lineTo(160 + s * (g.cheekW - 2), g.cheekY - 6);
                ctx.strokeStyle = '#d8d8d4'; ctx.lineWidth = 2.5; ctx.stroke();
            });
            path(); ctx.fillStyle = '#fbfbf8'; ctx.fill();
            ctx.strokeStyle = line; ctx.lineWidth = 3; ctx.stroke();
            // ひだ
            ctx.strokeStyle = 'rgba(120,120,120,0.45)'; ctx.lineWidth = 1.6;
            [0.32, 0.55, 0.78].forEach(f => {
                const yy = top + (bot - top) * f;
                ctx.beginPath(); ctx.moveTo(160 - half + 8, yy); ctx.quadraticCurveTo(160, yy + 6, 160 + half - 8, yy); ctx.stroke();
            });
        } else if (t === 'bandage') {
            // ばんそうこう：鼻の上に斜めに
            ctx.save();
            ctx.translate(160 + 4, this.POS.nose - 26);
            ctx.rotate(-0.35);
            ctx.beginPath(); this.roundRect(ctx, -26, -8, 52, 16, 7);
            ctx.fillStyle = '#f2c49a'; ctx.fill(); ctx.strokeStyle = this.shade('#f2c49a', -0.35); ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); this.roundRect(ctx, -9, -6, 18, 12, 3); ctx.fillStyle = '#fbe6d2'; ctx.fill();
            ctx.fillStyle = this.shade('#f2c49a', -0.25);
            for (const dx of [-18, -14, 14, 18]) for (const dy of [-3, 3]) { ctx.beginPath(); ctx.arc(dx, dy, 0.9, 0, Math.PI * 2); ctx.fill(); }
            ctx.restore();
        }
    },

    roundRect(ctx, x, y, w, h, r) {
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
    },

    // --- 色の道具 -------------------------------------------------
    /** 色を明るく(+)・暗く(-)する */
    shade(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        const f = c => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c : 255 - c) * amt)));
        const rr = f(n >> 16), gg = f((n >> 8) & 255), bb = f(n & 255);
        return '#' + ((1 << 24) + (rr << 16) + (gg << 8) + bb).toString(16).slice(1);
    },
    /** 2つの色を混ぜる（t=0 で a、1 で b） */
    mix(a, b, t) {
        const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
        const ch = (n, sh) => (n >> sh) & 255;
        const m = sh => Math.round(ch(pa, sh) * (1 - t) + ch(pb, sh) * t);
        return '#' + ((1 << 24) + (m(16) << 16) + (m(8) << 8) + m(0)).toString(16).slice(1);
    },
    /** 色に透明度を付ける */
    withAlpha(hex, a) {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
    }
};
