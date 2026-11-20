/**
 * ai_trainer.js — CPUの「④ 自動対戦で学習」用の道具（ゲーム本体では読み込まない）
 *
 * 使い方（開発者向け）:
 *   1. ゲームを開き、ブラウザの開発者ツールのコンソールで次を実行して読み込む
 *        const s = document.createElement('script'); s.src = 'tools/ai_trainer.js'; document.head.appendChild(s);
 *   2. AITrainer.run({ generations: 15 }) で学習を始める（数分〜十数分）
 *   3. 終わると「AIController.LEARNED に貼る値」がコンソールに出るので、js/ai.js に貼る
 *   ※ 学習中はゲームの表示・音・勝負ありの処理を止めるので、終わったらページを読み込み直すこと
 *
 * 学習の仕組み（進化戦略＝遺伝的アルゴリズムの仲間）:
 *   今の値を少しずつ変えた「候補」をいくつも作り、それぞれを
 *     ・今の値のCPU（横綱）との自動対戦
 *     ・人間っぽく操作する台本プレイヤー（ぶちかまし型・いなし型・混合型）との自動対戦
 *   で戦わせる。勝率の良かった候補の方向へ値を動かす、を何世代も繰り返す。
 *   全候補に同じ力士の組み合わせ・同じ数の取組をさせて、運の差が出にくいようにしている。
 */
(function () {
    // 学習する値と、1回にどれくらい動かすか（幅）、取りうる範囲
    const SPACE = {
        horizon:    { step: 10,   min: 40, max: 120 },
        stamina:    { step: 0.3,  min: 0,  max: 3 },
        maxStamina: { step: 0.25, min: 0,  max: 3 },
        edge:       { step: 2,    min: 0,  max: 20 },
        helpless:   { step: 0.15, min: 0,  max: 2 },
        charge:     { step: 0.08, min: 0,  max: 1 },
        master:     { step: 3,    min: 0,  max: 25 },
        caution:    { step: 0.12, min: 0,  max: 1 },
        noise:      { step: 0,    min: 40, max: 40 },  // 番付ごとのブレは学習しない（強さの差のため）
        style:      { step: 0,    min: 0,  max: 200 }  // 力士らしさのおまけ点も学習しない（強さだけを目指すと消えてしまうため）
    };
    const KEYS = Object.keys(SPACE);

    // ---- 自動対戦の準備（表示・音・勝負あり演出を止める） ----
    let result = null;
    function prepare() {
        if (prepare.done) return; prepare.done = true;
        for (const k of Object.keys(SoundFX)) if (typeof SoundFX[k] === 'function') SoundFX[k] = () => Promise.resolve();
        ['msg', 'showDamage', 'fx', 'startSlowmoFx', 'stopSlowmoFx', 'resetCameraZoom', 'showBGMToast'].forEach(f => { if (game.ui[f]) game.ui[f] = () => {}; });
        const G = GameManager.prototype;
        game.resolveMatch = function (w, l, r) {
            if (this.sandbox) return G.resolveMatch.call(this, w, l, r);
            result = w.id; this.state.processingEnd = true;
        };
        game.resolveDraw = function () {
            if (this.sandbox) return G.resolveDraw.call(this);
            result = 'draw'; this.state.processingEnd = true;
        };
    }

    // 人間っぽく操作する台本プレイヤー
    function makeBot(style) {
        const st = { mode: 'idle', t: 0, uHeld: 0, delay: 0 };
        return function (me, opp, grapple) {
            const k = me.controls; const keys = new Set();
            const fwd = me.x < opp.x ? k.r : k.l;
            const dist = Math.abs(me.x - opp.x);
            if (st.uHeld > 0) { st.uHeld--; return keys; }
            if (grapple.active) {
                keys.add(k.d);
                if (me.charge >= 100) { keys.add(k.u); st.uHeld = 2; }
                else if (style !== 'mix' && me.charge >= 55 && Math.random() < 0.05) keys.add(fwd);
                return keys;
            }
            const threat = opp.isPushing && opp.charge >= 40 && dist < 200;
            if (threat) st.delay++; else st.delay = 0;
            const wantInashi = style === 'inashi' ? 0.9 : style === 'mix' ? 0.5 : 0.15;
            if (st.delay === 12 && Math.random() < wantInashi && me.stamina >= 15) { keys.add(k.u); st.uHeld = 3; return keys; }
            if (style === 'inashi' && opp.isPushing && dist < 170 && Math.random() < 0.08 && me.stamina >= 15) { keys.add(k.u); st.uHeld = 3; return keys; }
            if (st.t-- <= 0) {
                const r = Math.random();
                if (style === 'buchi') st.mode = r < 0.75 ? 'charge' : 'dash';
                else if (style === 'inashi') st.mode = r < 0.4 ? 'charge' : r < 0.7 ? 'wait' : 'dash';
                else st.mode = r < 0.45 ? 'charge' : r < 0.75 ? 'dash' : 'wait';
                st.t = st.mode === 'charge' ? 140 : st.mode === 'dash' ? 25 : 40;
            }
            if (st.mode === 'charge') {
                keys.add(k.d);
                if (me.charge >= 60) keys.add(fwd);
                if (me.charge < 20 && st.t < 100) st.t = 0;
            } else if (st.mode === 'dash') keys.add(fwd);
            return keys;
        };
    }

    // 1番取らせる。p1Bot があれば P1 は台本プレイヤー、無ければ ai1 のCPU
    function bout(c1, c2, ai1, ai2, lv, p1Bot) {
        game.p1.setData(c1); game.p2.setData(c2);
        game.p1.isCPU = !p1Bot; game.p2.isCPU = true;
        game.p1.cpuLevel = lv; game.p2.cpuLevel = lv;
        game.aiP1 = ai1 || new AIController(); game.aiP2 = ai2;
        game.p1.resetState(); game.p2.resetState();
        game.p1.x = 350; game.p2.x = 720;
        [game.p1, game.p2].forEach(p => { p.inashiStumble = 0; p.inashiTimer = 0; p.uLock = false; p.reversalActive = false; });
        game.grapple = { active: false, master: null, slave: null };
        game.state.processingEnd = false; game.state.tachiai = false; game.state.active = true; game.state.paused = false;
        game.frameKeys = new Set(); game.aiP1.reset(); game.aiP2.reset();
        result = null;
        for (let f = 0; f < 60 * 120 && !result; f++) {
            game.setFrameInput(p1Bot ? p1Bot(game.p1, game.p2, game.grapple) : new Set());
            game.simStep();
        }
        game.state.active = false;
        return result;
    }

    // 候補の値 θ の強さ（0〜1）。matchups は全候補で共通の組み合わせ
    function fitness(theta, base, matchups, lv) {
        const cand = new AIController(); cand.learned = theta;
        const ref = new AIController(); ref.learned = base;
        let score = 0, n = 0;
        for (const m of matchups) {
            if (m.bot) {
                const w = bout(m.a, m.b, null, cand, lv, makeBot(m.bot));
                score += w === 'p2' ? 1 : w === 'draw' ? 0.5 : 0;
            } else {
                // 左右を入れ替えて2番
                const w1 = bout(m.a, m.b, cand, ref, lv); score += w1 === 'p1' ? 1 : w1 === 'draw' ? 0.5 : 0;
                const w2 = bout(m.a, m.b, ref, cand, lv); score += w2 === 'p2' ? 1 : w2 === 'draw' ? 0.5 : 0;
                n++;
            }
            n++;
        }
        return score / n;
    }

    const pickChar = () => RIKISHI_DATA[Math.floor(Math.random() * RIKISHI_DATA.length)];
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const clamp = (k, x) => Math.max(SPACE[k].min, Math.min(SPACE[k].max, x));
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    window.AITrainer = {
        best: null, log: [],
        /**
         * generations: 何世代まわすか / pop: 1世代の候補数 / pairs: CPU戦の組み合わせ数 / bots: 台本プレイヤー戦の数 / level: 学習する番付
         */
        async run({ generations = 15, pop = 8, pairs = 12, bots = 18, level = 7 } = {}) {
            prepare();
            let theta = { ...(AIController.LEARNED) };
            let sigma = 1.0;
            for (let gen = 1; gen <= generations; gen++) {
                const matchups = [];
                for (let i = 0; i < pairs; i++) matchups.push({ a: pickChar(), b: pickChar() });
                for (let i = 0; i < bots; i++) matchups.push({ a: pickChar(), b: pickChar(), bot: ['buchi', 'inashi', 'mix'][i % 3] });
                const kids = [];
                for (let i = 0; i < pop; i++) {
                    // 対称な2つ（＋と−）を作ると、運の差が打ち消しやすい
                    const eps = {}; KEYS.forEach(k => eps[k] = gauss());
                    for (const sign of [1, -1]) {
                        if (kids.length >= pop) break;
                        const t = {}; KEYS.forEach(k => t[k] = clamp(k, theta[k] + sign * eps[k] * SPACE[k].step * sigma));
                        kids.push(t);
                    }
                }
                const scored = [];
                for (const t of kids) {
                    await sleep(0);   // 画面が固まらないように少し休む
                    scored.push({ t, f: fitness(t, theta, matchups, level) });
                }
                scored.sort((x, y) => y.f - x.f);
                // 上位半分の平均へ動かす
                const top = scored.slice(0, Math.max(1, Math.floor(pop / 2)));
                const next = {};
                KEYS.forEach(k => next[k] = clamp(k, top.reduce((s, x) => s + x.t[k], 0) / top.length));
                const line = `世代${gen}: 最高 ${(scored[0].f * 100).toFixed(0)}% / 上位平均 ${(top.reduce((s, x) => s + x.f, 0) / top.length * 100).toFixed(0)}%（今の値との対戦＋台本プレイヤー戦）`;
                this.log.push(line); console.log(line);
                theta = next;
                sigma *= 0.93;   // だんだん細かく調整する
                this.best = theta;
                try { localStorage.setItem('sumocham_ai_learned', JSON.stringify(theta)); } catch (e) { /* 保存できなくても続ける */ }
            }
            const rounded = {};
            KEYS.forEach(k => rounded[k] = Math.round(theta[k] * 100) / 100);
            rounded.horizon = Math.round(theta.horizon);
            console.log('AIController.LEARNED に貼る値:', JSON.stringify(rounded));
            this.best = rounded;
            return rounded;
        },
        // 学習した値と元の値を戦わせて、どれだけ強くなったか確かめる
        compare(theta, { pairs = 60, bots = 60, level = 7 } = {}) {
            prepare();
            const matchups = [];
            for (let i = 0; i < pairs; i++) matchups.push({ a: pickChar(), b: pickChar() });
            for (let i = 0; i < bots; i++) matchups.push({ a: pickChar(), b: pickChar(), bot: ['buchi', 'inashi', 'mix'][i % 3] });
            const cpuOnly = matchups.filter(m => !m.bot), botOnly = matchups.filter(m => m.bot);
            return {
                vsOriginal: Math.round(fitness(theta, AIController.LEARNED, cpuOnly, level) * 100) + '%',
                vsBots_learned: Math.round(fitness(theta, theta, botOnly, level) * 100) + '%',
                vsBots_original: Math.round(fitness(AIController.LEARNED, AIController.LEARNED, botOnly, level) * 100) + '%'
            };
        }
    };
    console.log('AITrainer を読み込みました。AITrainer.run() で学習を始めます');
})();
