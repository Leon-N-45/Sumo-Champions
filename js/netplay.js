/**
 * netplay.js
 * オンライン対戦（ロールバック方式）のゲーム側の土台。
 *
 * 【ロールバックとは】
 * 相手の入力が届くのを待たずに「相手は直前と同じボタンを押し続けている」と予想して先へ進め、
 * 実際の入力が届いて予想と違っていたら、その刻みまで巻き戻して計算し直す。
 * こうすると、通信に時間がかかっても自分の操作はすぐ画面に出る（ラグを感じにくい）。
 *
 * 【この部品がやること】
 *   - 取組の状態を丸ごと保存・復元する（snapshot / restore）
 *   - 計算し直しの間は、音・演出を出さない。計算し直しで初めて起きたこと（予想が外れて
 *     実際は技が出ていた等）は、計算し直しが終わってから1回だけ見せる（defer / flush）
 *   - 勝負ありは、両者の入力が確定した刻みでだけ決める（canDecide）
 *
 * 通信（相手とのやり取り）は別の部品で行い、ここには入力だけを渡す。
 * オフライン（online = false）の時は何もしない。
 */
const NetSim = {
    online: false,      // オンライン対戦中か
    frame: 0,           // いま計算している刻みの番号
    resim: false,       // 巻き戻して計算し直している最中か
    replaying: false,   // 後回しにした演出を見せている最中か
    decideOk: true,     // この刻みで勝負ありを決めてよいか（両者の入力が確定しているか）

    // 一度だけ見せる演出の記録： 刻みの番号 → その刻みで見せた演出の目印
    emitted: new Map(),
    // 計算し直しで初めて起きた演出（終わってから見せる）
    pending: [],

    // 計算し直しの間は止めるだけの、毎刻み呼ばれる表示・音（後で見せ直す必要がない）
    CONTINUOUS: {
        ui: ['draw'],
        sound: ['updateCharge', 'updateInashi']
    },
    // 一度きりの表示・音（計算し直しで初めて起きた時は、後で1回見せる）
    ONE_SHOT: {
        ui: ['showDamage', 'msg', 'fx', 'setGyojiImage', 'startGyojiCalls', 'startGyojiConfusion'],
        sound: ['playHit', 'playVoice', 'playShout', 'playTone']
    },

    _installed: false,

    // ---------------------------------------------------------------
    // 表示・音の関数に「計算し直し中は止める」仕掛けを付ける（最初の1回だけ）
    // ---------------------------------------------------------------
    install(game) {
        if (this._installed) return;
        this._installed = true;
        const wrap = (obj, names, group, oneShot) => {
            names.forEach(name => {
                const orig = obj[name];
                if (typeof orig !== 'function') return;
                obj[name] = function (...args) {
                    if (NetSim.online && !NetSim.replaying) {
                        if (oneShot) {
                            if (NetSim.defer(obj, name, args, orig)) {
                                return name === 'playVoice' ? Promise.resolve() : undefined;
                            }
                        } else if (NetSim.resim) {
                            return undefined;
                        }
                    }
                    return orig.apply(obj, args);
                };
            });
        };
        wrap(game.ui, this.CONTINUOUS.ui, 'ui', false);
        wrap(game.ui, this.ONE_SHOT.ui, 'ui', true);
        if (typeof SoundFX !== 'undefined') {
            wrap(SoundFX, this.CONTINUOUS.sound, 'sound', false);
            wrap(SoundFX, this.ONE_SHOT.sound, 'sound', true);
        }
    },

    /**
     * 一度きりの演出を出してよいか決める。出さずに済ませた（後回し・二重）なら true を返す。
     *   普通の計算中   : 目印を記録して、そのまま出す（false）
     *   計算し直し中   : 同じ刻みですでに出していれば出さない。初めてなら後回しにする（true）
     */
    defer(target, name, args, orig) {
        if (!this.online || this.replaying) return false;
        const key = this.effectKey(name, args);
        let set = this.emitted.get(this.frame);
        if (!set) { set = new Set(); this.emitted.set(this.frame, set); }
        if (!this.resim) { set.add(key); return false; }
        if (set.has(key)) return true;
        set.add(key);
        this.pending.push({ target, name, args: Array.from(args), orig });
        return true;
    },

    /** 演出の目印：関数の名前＋引数（力士は p1/p2、数値は丸める） */
    effectKey(name, args) {
        const parts = Array.from(args).map(a => {
            if (a && typeof a === 'object' && a.id) return a.id;
            if (typeof a === 'number') return Math.round(a);
            if (typeof a === 'string' || typeof a === 'boolean') return a;
            return '';
        });
        return name + '|' + parts.join(',');
    },

    /** 計算し直しで初めて起きた演出を、まとめて1回ずつ見せる */
    flush() {
        const list = this.pending;
        this.pending = [];
        this.replaying = true;
        try {
            list.forEach(e => {
                const fn = e.orig || e.target[e.name];
                try { fn.apply(e.target, e.args); } catch (err) { console.warn('演出の再生に失敗', e.name, err); }
            });
        } finally { this.replaying = false; }
    },

    /** 古い刻みの演出の記録を捨てる（もう巻き戻さない刻み） */
    forgetBefore(frame) {
        for (const f of this.emitted.keys()) if (f < frame) this.emitted.delete(f);
    },

    canDecide() { return !this.online || this.decideOk; },

    /**
     * 勝負ありを決めてよいか。予想の入力で計算している刻みなら止めて、その刻みを覚えておく。
     * 後でその刻みの入力が確定した時、予想が当たっていても必ずそこから計算し直して勝負ありを決める
     * （計算し直さないと、勝負ありがどこにも記録されないまま進んでしまうため）。
     */
    allowDecision() {
        if (this.canDecide()) return true;
        if (this.blockedFrame === null || this.frame < this.blockedFrame) this.blockedFrame = this.frame;
        return false;
    },
    blockedFrame: null,   // 勝負ありを止めた一番早い刻み（無ければ null）

    // ---------------------------------------------------------------
    // 取組の状態の保存と復元
    // ---------------------------------------------------------------
    // 力士の中で、保存しない項目（見た目だけ・操作の割り当て・試合中に変わらない物）
    SKIP_KEYS: new Set(['id', 'controls', 'poseTimer', 'flightKind', 'fallDir', 'animClass']),

    /** 力士の「数値・文字・真偽」の項目だけを写し取る（画面の部品や能力表は写さない） */
    snapPlayer(p) {
        const o = {};
        for (const k of Object.keys(p)) {
            if (this.SKIP_KEYS.has(k) || k[0] === '_') continue;
            const v = p[k];
            if (v === null || v === undefined || (typeof v !== 'object' && typeof v !== 'function')) o[k] = v;
        }
        return o;
    },

    restorePlayer(p, o) {
        // 保存した後に新しく増えた項目は「無かった」状態に戻す
        for (const k of Object.keys(p)) {
            if (this.SKIP_KEYS.has(k) || k[0] === '_') continue;
            const v = p[k];
            const prim = v === null || v === undefined || (typeof v !== 'object' && typeof v !== 'function');
            if (prim && !(k in o)) p[k] = undefined;
        }
        Object.assign(p, o);
    },

    snapshot(game) {
        const g = game.grapple;
        return {
            p1: this.snapPlayer(game.p1),
            p2: this.snapPlayer(game.p2),
            grapple: { active: !!g.active, master: g.master ? g.master.id : null, slave: g.slave ? g.slave.id : null },
            state: { active: game.state.active, tachiai: game.state.tachiai },
            frameKeys: [...game.frameKeys],
            prevFrameKeys: [...game.prevFrameKeys]
        };
    },

    restore(game, s) {
        this.restorePlayer(game.p1, s.p1);
        this.restorePlayer(game.p2, s.p2);
        const byId = id => id === 'p1' ? game.p1 : id === 'p2' ? game.p2 : null;
        game.grapple.active = s.grapple.active;
        game.grapple.master = byId(s.grapple.master);
        game.grapple.slave = byId(s.grapple.slave);
        game.state.active = s.state.active;
        game.state.tachiai = s.state.tachiai;
        game.frameKeys = new Set(s.frameKeys);
        game.prevFrameKeys = new Set(s.prevFrameKeys);
    },

    /** 状態の要約（両者の計算がずれていないかを確かめるのに使う） */
    checksum(game) {
        const json = JSON.stringify(this.snapshot(game));
        let h = 2166136261;
        for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 16777619); }
        return (h >>> 0).toString(16);
    },

    // ---------------------------------------------------------------
    // オンライン対戦の刻みの進め方（ロールバック）
    // ---------------------------------------------------------------
    INPUT_DELAY: 2,       // 自分の入力を何刻み遅らせて使うか（相手に届く時間を稼ぎ、巻き戻しを減らす）
    MAX_PREDICT: 8,       // 相手の入力を予想で進めてよい最大の刻み数。これを超えたら届くまで待つ
    SNAP_KEEP: 20,        // 保存しておく状態の数（巻き戻せる範囲）
    CHECK_EVERY: 60,      // 何刻みごとに状態の要約を送り合ってずれを確かめるか

    side: 'p1',           // 自分が操作する側
    link: null,           // 相手とのやり取り（Online が渡す。send(msg) を持つ）
    bout: 0,              // 何番目の取組か（取組をまたいだ古い通信を捨てるため）

    /** 取組ごとの入れ物を空にする */
    resetBout() {
        this.frame = 0;
        this.started = false;
        this.readySent = false;
        this.remoteReady = false;
        this.local = [];            // 自分の入力（ボタンの4ビット）。添字は刻み
        this.remote = [];           // 相手の確定した入力
        this.usedRemote = [];       // その刻みの計算に使った相手の入力（予想を含む）
        this.remoteConfirmed = -1;  // 相手の入力が切れ目なく届いている最後の刻み
        this.remoteFrameSeen = -1;  // 相手が送ってきた一番先の刻み（どれだけ先行しているかの目安）
        this.remoteAcked = -1;      // 相手が受け取ったと言ってきた自分の入力の最後の刻み
        this.snaps = new Map();
        this.emitted.clear();
        this.pending = [];
        this.blockedFrame = null;
        this.checks = new Map();    // 刻み → 自分の状態の要約
        this.desync = false;
        this.stallCount = 0;
        this.remoteAdv = null;      // 相手から見た「こちらの入力の遅れ」
        this.lastRemoteAt = performance.now();   // 相手の入力が最後に届いた時刻（通信が止まったかの判定用）
    },

    /** 自分から見た「相手の入力がどれだけ遅れて見えるか」（刻み） */
    myAdv() {
        return this.remoteFrameSeen >= 0 ? this.frame - this.remoteFrameSeen : 0;
    },

    /** オンライン対戦を始める（Online から呼ぶ） */
    begin(game, side, link) {
        this.install(game);
        this.online = true;
        this.side = side;
        this.link = link;
        this.bout = 0;
        this.resetBout();
    },

    end() {
        this.online = false;
        this.link = null;
    },

    // ボタンの4ビット： 上=1 下=2 左=4 右=8
    BTN: { u: 1, d: 2, l: 4, r: 8 },

    /** 自分のキーボード・コントローラの入力をボタンの4ビットにする（1P用・2P用どちらのキーでも操作できる） */
    readLocalButtons(game) {
        const keys = game.keys, tapped = game.tapped;
        const sets = [settings.current.controls.p1, settings.current.controls.p2];
        let b = 0;
        for (const [name, bit] of Object.entries(this.BTN)) {
            if (sets.some(c => keys.has(c[name]) || tapped.has(c[name]))) b |= bit;
        }
        tapped.clear();
        return b;
    },

    /** ボタンの4ビットを、その側の力士の操作キーの一覧にする（ゲームの計算はキーで判定しているため） */
    toCodes(game, side, b) {
        const c = game[side].controls;
        const out = [];
        for (const [name, bit] of Object.entries(this.BTN)) if (b & bit) out.push(c[name]);
        return out;
    },

    otherSide() { return this.side === 'p1' ? 'p2' : 'p1'; },

    /** 相手からの通信を受け取る（Online が呼ぶ） */
    receive(msg) {
        if (!this.online || msg.bout !== this.bout) return;
        if (msg.t === 'ready') { this.remoteReady = true; return; }
        if (msg.t === 'in') {
            this.remoteReady = true;   // 入力が届くのは、相手が仕切りに入って始めている証拠
            this.lastRemoteAt = performance.now();
            // msg.from から順に、相手の入力が並んでいる
            msg.inputs.forEach((b, i) => {
                const f = msg.from + i;
                if (this.remote[f] === undefined) this.remote[f] = b;
            });
            this.remoteFrameSeen = Math.max(this.remoteFrameSeen, msg.from + msg.inputs.length - 1);
            if (typeof msg.ack === 'number') this.remoteAcked = Math.max(this.remoteAcked, msg.ack);
            if (typeof msg.adv === 'number') this.remoteAdv = msg.adv;
            while (this.remote[this.remoteConfirmed + 1] !== undefined) this.remoteConfirmed++;
            return;
        }
        if (msg.t === 'sum') {
            const mine = this.checks.get(msg.f);
            if (mine && mine !== msg.sum && !this.desync) {
                this.desync = true;
                console.warn(`オンライン対戦：刻み${msg.f}で両者の計算がずれました`, mine, msg.sum);
                if (this.onDesync) this.onDesync(msg.f);
            }
        }
    },

    send(msg) { if (this.link) this.link.send({ ...msg, bout: this.bout }); },

    /** 1刻み分（1/60秒）の処理。ゲームのループから呼ばれる */
    tick(game) {
        // --- 立ち合いの待ち合わせ：両者が仕切りに入ったら、同時に刻み0から始める ---
        if (!this.started) {
            if (!game.state.tachiai) return;
            if (!this.readySent) { this.readySent = true; this.send({ t: 'ready' }); }
            // 相手からの ready が先に届いていても、自分が仕切りに入るまでは始めない
            if (!this.remoteReady) { this.send({ t: 'ready' }); return; }
            this.started = true;
            // 最初の INPUT_DELAY 刻みは、どちらも「何も押していない」ことにする
            for (let f = 0; f < this.INPUT_DELAY; f++) { this.local[f] = 0; this.remote[f] = 0; }
            this.remoteConfirmed = this.INPUT_DELAY - 1;
            while (this.remote[this.remoteConfirmed + 1] !== undefined) this.remoteConfirmed++;
        }

        // --- 1. 自分の入力を INPUT_DELAY 刻み先の分として記録し、まだ届いていない分をまとめて送る ---
        const target = this.frame + this.INPUT_DELAY;
        if (this.local[target] === undefined) this.local[target] = this.readLocalButtons(game);
        const from = Math.max(this.INPUT_DELAY, this.remoteAcked + 1, target - 30);
        this.send({ t: 'in', from, inputs: this.local.slice(from, target + 1), ack: this.remoteConfirmed, adv: this.myAdv() });

        // --- 2. 届いた相手の入力が予想と違えば、その刻みまで巻き戻して計算し直す ---
        let rollFrom = null;
        for (let f = Math.max(0, this.frame - this.SNAP_KEEP); f < this.frame; f++) {
            if (this.remote[f] !== undefined && this.usedRemote[f] !== this.remote[f]) { rollFrom = f; break; }
        }
        // 予想で計算した刻みで勝負ありを止めていて、その刻みの入力が確定したら、必ずそこから計算し直す
        if (this.blockedFrame !== null && this.blockedFrame <= this.remoteConfirmed) {
            if (rollFrom === null || this.blockedFrame < rollFrom) rollFrom = this.blockedFrame;
        }
        if (rollFrom !== null && this.snaps.has(rollFrom)) {
            this.blockedFrame = null;
            this.restore(game, this.snaps.get(rollFrom));
            const now = this.frame;
            for (let f = rollFrom; f < now; f++) this.simulate(game, f, true);
            this.flush();
        }

        // --- 3. 相手の入力が届かず予想しすぎている時は、この刻みは進めずに待つ ---
        //        しばらく届かなければ「相手を待っています」を出し、もっと続けば接続が切れたとみなす
        if (this.frame - this.remoteConfirmed > this.MAX_PREDICT) {
            this.stallCount++;
            if (this.onStall) this.onStall(performance.now() - this.lastRemoteAt);
            return;
        }
        if (this.onStall) this.onStall(0);
        // 自分だけ先に進みすぎている時は、時々1刻み休んで相手と歩調を合わせる。
        // 「相手の入力がどれだけ遅れて見えるか」は通信の時間も含むので、相手側から見た遅れと比べる
        // （通信の時間は両方に同じだけ含まれるので、差を取ると本当の先行分だけが残る）
        if (this.remoteFrameSeen >= 0 && this.remoteAdv !== null
            && (this.myAdv() - this.remoteAdv) > 2 && this.frame % 3 === 0) {
            this.stallCount++;
            return;
        }

        // --- 4. この刻みを計算する ---
        this.simulate(game, this.frame, false);
        this.forgetBefore(this.frame - this.SNAP_KEEP);
        for (const f of this.snaps.keys()) if (f < this.frame - this.SNAP_KEEP) this.snaps.delete(f);

        // --- 5. 確定した刻みの状態の要約を、ときどき送り合ってずれを確かめる ---
        const cf = this.remoteConfirmed - (this.remoteConfirmed % this.CHECK_EVERY);
        if (cf > 0 && cf < this.frame && !this.checks.has(cf) && this.snaps.has(cf + 1)) {
            // cf+1 の計算前の状態 ＝ cf を計算し終えた状態
            const sum = this.hashSnap(this.snaps.get(cf + 1));
            this.checks.set(cf, sum);
            this.send({ t: 'sum', f: cf, sum });
        }
    },

    /** 刻み f を計算する（resim なら巻き戻しの計算し直し） */
    simulate(game, f, resim) {
        this.frame = f;
        this.snaps.set(f, this.snapshot(game));
        const known = this.remote[f] !== undefined;
        // 相手の入力が届いていなければ、最後に届いた入力のまま押し続けていると予想する
        const remoteB = known ? this.remote[f] : (this.remote[this.remoteConfirmed] ?? 0);
        this.usedRemote[f] = remoteB;
        const localB = this.local[f] ?? 0;
        // 両者の端末で同じ順に処理されるよう、必ず 1P → 2P の順に並べる
        // （同じ刻みに2人がいなしを押した時など、処理の順で結果が変わることがあるため）
        const bySide = { [this.side]: localB, [this.otherSide()]: remoteB };
        const codes = this.toCodes(game, 'p1', bySide.p1).concat(this.toCodes(game, 'p2', bySide.p2));
        this.stepWith(game, codes, { resim, decide: known });
    },

    hashSnap(s) {
        const json = JSON.stringify(s);
        let h = 2166136261;
        for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 16777619); }
        return (h >>> 0).toString(16);
    },

    /** 次の取組へ（取組が終わった後、両者が次の仕切りに入る前に呼ぶ） */
    nextBout() {
        this.bout++;
        this.resetBout();
    },

    /**
     * 1刻み分を、指定の入力で計算する（巻き戻しの計算し直しでも使う）
     *   codes : この刻みに押されているキーの一覧
     */
    stepWith(game, codes, { resim = false, decide = true } = {}) {
        this.resim = resim;
        this.decideOk = decide;
        try {
            game.setFrameInput(new Set(codes));
            game.simStep();
        } finally {
            this.resim = false;
            this.decideOk = true;
        }
        this.frame++;
    }
};
