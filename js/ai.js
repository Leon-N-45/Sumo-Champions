/**
 * ai.js
 * AIController（思考×タイプ×レベル＋個体差＋状況判断＋癖読み）
 *
 * 重要な実装方針：このゲームは「溜めキー(d)を握っている間だけ必殺技が出る」。
 * そのため、ぶちかまし(charge≥50で前進)や投げ(組み合いでcharge100)を出すには、
 * 発動するまで d を握り続ける必要がある。AIは「プラン」を保持し、
 * プランが続く間は毎フレーム必要なキーを握り続ける。
 *
 *   思考(aiType) : 力押し / 技狙い / 素直 / 変則
 *   タイプ(playType): パワー(ぶちかまし多) / テクニック(掴み投げ多) / スピード(いなし多) / バランス
 *   レベル(cpuLevel): 1=幕下 〜 7=横綱
 *
 * 判断は3段構え：
 *   1) 状況判断（反応）… 相手のいなし待ち・スタン・空振り・溜め突進・その場溜めに反応する。
 *      見てから動くまでの遅れと、気づく確率は ACCURACY（判断の正確さ）で決まる。
 *   2) プラン … 攻め/溜め/詰め/後退/様子見 を選び、終わるまでキーを握り続ける。
 *      選ぶ割合は 思考×タイプ×個体差 に、土俵の位置・スタミナ差・相手の癖を加味する。
 *   3) 癖読み … 相手（主にプレイヤー）がよく使う行動を数え、対策を増やす。
 *      数えた癖は場所（取組）をまたいで少しずつ薄れながら残る。
 */
class AIController {
    // ④ 自動対戦（自己対戦）で学習した値。組み合いの先読みの「点数の付け方」に使う。
    //   tools/ai_trainer.js（進化戦略）で、横綱どうし＋人間っぽい台本プレイヤーとの対戦を
    //   2回（12世代・30世代）学習させ、どちらもほぼ同じ値に落ち着いたもの。学習し直しもできる
    static LEARNED = {
        horizon: 61,      // 何フレーム先まで試すか
        stamina: 1.34,    // スタミナ差
        maxStamina: 1.13, // 体力上限の差
        edge: 5.18,       // 俵までの余裕の差
        helpless: 0.48,   // 動けない時間の差（スタン・空振りなど）
        charge: 0.2,      // 溜めの差
        master: 9.2,      // 組み合いで組んだ側か
        caution: 0.44,    // 最悪の予想をどれだけ重く見るか
        noise: 40,        // 判断のブレ（番付が低いほど効く。学習しない）
        style: 60         // 力士らしさのおまけ点（得意な作戦をどれだけ優先するか。学習しない）
    };

    constructor() {
        this.aiKeys = new Set();
        this.thinkTimer = 0;
        this.effectiveType = null;
        this.tacticState = null;
        this.tacticTimer = 0;
        this.plan = null;
        this.inashiCooldown = 0;
        this.persona = null;
        // 相手の癖（取組をまたいで残す。reset では薄めるだけ）
        this.habit = { inashi: 0, buchi: 0, dash: 0, chargeStill: 0, grabThrow: 0, grabPush: 0, total: 0 };
        this.resetBoutState();
        this.rollPersona();
    }

    reset() {
        this.effectiveType = null;
        this.tacticState = null;
        this.tacticTimer = 0;
        this.plan = null;
        this.thinkTimer = 0;
        this.inashiCooldown = 0;
        this.aiKeys.clear();
        // 前の取組で覚えた癖は残すが、少しずつ忘れる（最近の傾向を重く見る）
        const h = this.habit;
        Object.keys(h).forEach(key => { h[key] *= 0.6; });
        this.resetBoutState();
        this.rollPersona();
    }

    resetBoutState() {
        this.prev = null;           // 前フレームの相手の様子
        this.watch = {};            // 「相手が◯◯している」と気づくまでの経過フレーム
        this.noticed = {};          // その出来事に気づけたか（1回ごとに抽選）
        this.grab = null;           // 組み合い中の作戦
    }

    rollPersona() {
        this.persona = {
            aggro: Math.random(),
            inashiSkill: Math.random(),
            patience: Math.random(),
            feint: Math.random(),
            tempo: Math.random()
        };
    }

    getAIParam(level, paramName) {
        const key = `LV${level}_${paramName.toUpperCase()}`;
        if (CONFIG.AI && CONFIG.AI[key] !== undefined) return CONFIG.AI[key];
        const defaults = { REACTION: 38, MISTAKE: 0.3, ACCURACY: 0.5, INASHIRATE: 0.15 };
        return defaults[paramName.toUpperCase()] || 0;
    }

    determineType(baseType) {
        if (this.effectiveType) return this.effectiveType;
        const valid = ['力押し', '技狙い', '素直'];
        if (baseType === '変則') this.effectiveType = valid[Math.floor(Math.random() * valid.length)];
        else this.effectiveType = valid.includes(baseType) ? baseType : '素直';
        return this.effectiveType;
    }

    clampLevel(lv) { return Math.max(1, Math.min(7, lv || 3)); }

    // ---------------------------------------------------------------
    // 相手の様子を観察して癖を数える（毎フレーム）
    // ---------------------------------------------------------------
    observe(me, opp, grapple) {
        const now = {
            inashi: opp.inashiTimer > 0,
            buchi: opp.charge >= 50 && !!opp.holdingCharge && opp.isPushing,
            dash: opp.isPushing && !opp.holdingCharge,
            chargeStill: opp.isCharging && !opp.isPushing,
            grapple: !!grapple.active,
            oppCharge: opp.charge
        };
        const p = this.prev;
        const h = this.habit;
        // 相手が何フレーム続けて前に出ているか（前後に揺さぶるステップと本気の寄りを見分ける）
        this.oppPushFrames = opp.isPushing ? (this.oppPushFrames || 0) + 1 : 0;
        if (p) {
            // 立ち上がり（始めた瞬間）だけ数える
            if (now.inashi && !p.inashi) { h.inashi++; h.total++; }
            if (now.buchi && !p.buchi) { h.buchi++; h.total++; }
            if (now.dash && !p.dash && !now.grapple) { h.dash += 0.5; h.total += 0.5; }
            if (now.chargeStill && !p.chargeStill && !now.grapple) { h.chargeStill += 0.5; h.total += 0.5; }
            // 組み合い中に相手のゲージが一気に減った＝必殺技を出した
            if (p.grapple && p.oppCharge >= 50 && opp.charge < p.oppCharge - 30) {
                if (p.oppCharge >= 95) h.grabThrow++; else h.grabPush++;
            }
        }
        this.prev = now;
    }

    // 相手の癖の割合（0〜1）。数が少ないうちは控えめに見る
    habitRate(key) {
        const h = this.habit;
        return h[key] / (h.total + 4);
    }

    // 「相手が◯◯している」状態が続いているフレーム数を数え、反応できるか判定する
    // 気づくまでの遅れ（react）と、そもそも気づくか（ACCURACY）で強さに差をつける
    perceive(key, active, react, accuracy) {
        if (!active) { this.watch[key] = 0; this.noticed[key] = undefined; return false; }
        this.watch[key] = (this.watch[key] || 0) + 1;
        if (this.noticed[key] === undefined) this.noticed[key] = Math.random() < accuracy;
        return this.noticed[key] && this.watch[key] >= react;
    }

    // ---------------------------------------------------------------
    think(me, opp, grapple) {
        if (this.inashiCooldown > 0) this.inashiCooldown--;
        this.observe(me, opp, grapple);

        if (me.stun > 0 || me.isThrown || me.isDefeated || me.miss > 0) {
            this.aiKeys.clear();
            this.plan = null;
            this.tacticState = null;
            return this.aiKeys;
        }

        const think = this.determineType(me.baseStats.aiType);
        const ptype = me.baseStats.playType || 'バランス';
        const level = this.clampLevel(me.cpuLevel);
        const accuracy = this.getAIParam(level, 'ACCURACY');
        // 見てから動くまでの遅れ（幕下≒16フレーム、横綱≒3フレーム）
        const react = Math.max(2, Math.round(17 - accuracy * 14));
        const ctx = { me, opp, level, think, ptype, accuracy, react };

        // 組み合い中は専用処理
        if (grapple.active) {
            this.plan = null;
            this.tacticState = null;
            this.thinkGrapple(me, opp, grapple, ctx);
            return this.aiKeys;
        }
        this.grab = null;
        this.grabLook = null;

        // ① 状況判断（反応）。プランより優先する
        if (this.react(ctx)) return this.aiKeys;

        // 進行中プランを継続（毎フレーム必要キーを握り続ける＝チャージが切れない）
        if (this.plan) {
            const done = this.runPlan(me, opp);
            if (!done) return this.aiKeys;
            this.plan = null;
        }

        // 戦術（前後ステップ等）
        if (this.tacticState && this.tacticTimer > 0) { this.executeTactic(me, opp); return this.aiKeys; }

        // 思考ウェイト（レベルが高いほど速い・個体差で揺らぐ）
        if (this.thinkTimer > 0) { this.thinkTimer--; this.aiKeys.clear(); return this.aiKeys; }
        const reaction = this.getAIParam(level, 'REACTION');
        this.thinkTimer = Math.max(1, Math.round(reaction * (0.7 + this.persona.tempo * 0.6)) - level * 2 + Math.floor(Math.random() * 5));

        this.aiKeys.clear();
        this.decide(ctx);
        return this.aiKeys;
    }

    // 位置関係などの共通計算
    geometry(me, opp) {
        const ringL = cfg('GAME_RULES.RING_EDGE_LEFT', 115);
        const ringR = cfg('GAME_RULES.RING_EDGE_RIGHT', 1085);
        // 土俵を割るまでの残り距離（game.isOutOfRing と同じ：体の中心±足幅）
        const room = (p, side) => {
            const sc = p.getPhysiqueScale ? p.getPhysiqueScale() : { x: 1 };
            const cx = p.x + 65, foot = 40 * (sc.x || 1);
            return side < 0 ? (cx - foot) - ringL : ringR - (cx + foot);
        };
        const facingRight = me.x < opp.x;
        const k = me.controls;
        return {
            dist: Math.abs(me.x - opp.x),
            hitDist: cfg('GAME_RULES.HIT_DIST', 100),
            keyFwd: facingRight ? k.r : k.l,
            keyBack: facingRight ? k.l : k.r,
            myBackEdge: room(me, facingRight ? -1 : 1),    // 自分の背中側の俵まで
            myFrontEdge: room(me, facingRight ? 1 : -1),   // 自分の正面側の俵まで
            oppBackEdge: room(opp, facingRight ? 1 : -1)   // 相手の背中側の俵まで
        };
    }

    // 1フレームで溜まる量（updatePlayer と同じ式。立ち止まって溜めた場合）
    chargeGain(p) {
        const tech = (p.baseStats && p.baseStats.tech) || 5;
        return Math.max(0.05, cfg('CHARGE.BASE_GAIN', 0.3) * (1 + (tech - 5) * cfg('STATUS.TECH_CHARGE_RATE', 0.25)));
    }

    // 歩く速さの目安（updatePlayer と同じ式）
    walkSpeed(p, charging) {
        const base = cfg('ACTION.SPEED_BASE', 2.8);
        const spd = (p.baseStats && p.baseStats.speed) || 5;
        return Math.max(0.5, (charging ? base * 0.3 : base) * (1 + (spd - 5) * 0.15));
    }

    // ---------------------------------------------------------------
    // ① 状況判断：相手の様子に反応する。反応したら true
    // ---------------------------------------------------------------
    react(ctx) {
        const { me, opp, accuracy, react } = ctx;
        const g = this.geometry(me, opp);
        const k = me.controls;

        // (a) 相手がいなしを構えている → 前に出ない（出るといなされる）。溜めて待ち、空振りさせてから攻める
        const oppInashi = this.perceive('inashi', opp.inashiTimer > 0 && g.dist < 300, react, accuracy);
        if (oppInashi) {
            this.plan = null; this.tacticState = null;
            this.aiKeys.clear();
            if (me.stamina > 12) this.aiKeys.add(k.d);              // その場で溜めて次のぶちかましに備える
            else if (g.dist < g.hitDist + 60 && g.myBackEdge > 160) this.aiKeys.add(g.keyBack);
            this._afterInashiWait = true;
            return true;
        }
        if (this._afterInashiWait && opp.inashiTimer <= 0) {
            // いなしが空振りで終わった直後＝相手はスタミナを失っている。溜めがあれば一気に攻める
            this._afterInashiWait = false;
            // 近ければ溜めたままぶちかまし、遠ければ溜めずに素早く詰める（溜め歩きは遅く、またいなされる）
            if (me.charge >= 50 && g.dist < g.hitDist + 50) this.startPlan('attack', 40);
            else this.startPlan('dash', Math.ceil(Math.max(0, g.dist - g.hitDist) / this.walkSpeed(me, false)) + 4);
        }

        // (b) 相手が動けない（スタン・空振り硬直・弾かれ中）→ 届くうちに詰めて組み、押し出す
        const helpless = Math.max(opp.stun || 0, opp.miss || 0, opp.inashiStumble || 0, (opp.cooldown || 0) > 12 ? opp.cooldown : 0);
        const reachFrames = Math.max(0, g.dist - g.hitDist) / this.walkSpeed(me, false);
        if (this.perceive('helpless', helpless > 0, Math.ceil(react * 0.6), accuracy) && helpless > reachFrames + 4) {
            this.plan = null; this.tacticState = null;
            this.aiKeys.clear();
            // 溜めずに素早く詰める（溜めながらだと遅い）。触れる瞬間だけ、溜めが十分ならぶちかましで追い打ち
            if (g.dist <= g.hitDist + 4 && me.charge >= 50 && me.chargeLock === 0) this.aiKeys.add(k.d);
            this.aiKeys.add(g.keyFwd);
            return true;
        }

        // (c) 相手が溜めながら突っ込んでくる（ぶちかまし）→ 間合いを読んでいなす
        if (this.tryInashi(ctx, g)) return true;

        // (d) 相手がその場で溜めている
        //   組むと相手の溜めは半分になる。組んだ後の「溜め比べ」で勝てるなら詰めて組み止める。
        //   勝てないなら（組んでも先に押し返される）こちらも溜めて、来たところをいなす／ぶつける
        const still = opp.isCharging && !opp.isPushing && g.dist < 340 && opp.inashiTimer <= 0;
        if (this.perceive('chargeStill', still, react, accuracy)) {
            const need = Math.max(0, g.dist - g.hitDist) / this.walkSpeed(me, false);
            const oppGain = this.chargeGain(opp);
            const oppAtGrab = Math.min(100, opp.charge + oppGain * need) * cfg('ACTION.GRAPPLE_CHARGE_KEEP_RATE', 0.5);
            const winsRace = me.charge >= oppAtGrab + 8 && oppAtGrab < 45;
            if (winsRace && opp.charge + oppGain * need < 48) {
                if (!this.plan || this.plan.type !== 'dash') { this.tacticState = null; this.startPlan('dash', Math.ceil(need) + 6); }
            } else if (!this.plan || this.plan.type === 'dash' || this.plan.type === 'hold') {
                this.tacticState = null;
                if (me.stamina > 15) { this.startPlan('build', 40); this.plan.target = 101; } // 溜めて待つ（ぶちかましはしない）
                else this.startPlan('hold', 20);
            }
        }
        return false;
    }

    // 相手の突進にタイミングを合わせていなす
    tryInashi(ctx, g) {
        const { me, opp, level, think, ptype, accuracy } = ctx;
        if (!opp.isPushing) { this._inashiRolled = false; return false; }
        if (this.inashiCooldown > 0 || me.inashiTimer > 0 || me.cooldown > 0) return false;
        if (opp.inashiTimer > 0) return false;

        const charged = opp.charge >= 45 && opp.holdingCharge;
        const oppSpeed = this.walkSpeed(opp, opp.isCharging);
        // いなしは「相手が130以内で前に出ている」と決まり、100まで寄られると組まれる（ぶちかまし）。
        // その間の30はまだ間に合うので、できるだけ引きつけてから構える（早すぎると空振り）
        const reachDist = g.hitDist + 30;
        if (g.dist <= g.hitDist + 2) return false;            // もう組まれる距離
        // 溜めていない寄りは、しばらく前に出続けているもの（本気の寄り）だけを相手にする
        if (!charged && this.oppPushFrames < 7) return false;
        const framesToContact = Math.max(0, g.dist - reachDist) / oppSpeed;
        // 正確さが低いほどタイミングがずれる（早すぎ＝空振りの危険）
        const ideal = 3 + (1 - accuracy) * (Math.random() * 16 - 4);
        if (framesToContact > ideal) return false;

        // いなす確率：レベル（INASHIRATE）×思考/タイプ×個体差＋状況＋相手の癖
        // （INASHIRATE は以前の「毎フレーム抽選」の値なので、1回の突進あたりの確率に直して使う）
        const base = this.getAIParam(level, 'INASHIRATE');
        // 溜めていない突進へのいなしは見極めが難しいので、上の番付ほど使う
        let prob = charged ? base * 0.9 : base * 0.5 * accuracy * accuracy;
        if (think === '技狙い') prob += 0.12;
        else if (think === '力押し') prob -= 0.05;
        if (ptype === 'スピード') prob += 0.2;
        else if (ptype === 'テクニック') prob += 0.06;
        if (charged && opp.charge > 75) prob += 0.12;
        // 土俵際で押し込まれそう → いなせば位置が入れ替わる。強く狙う
        if (g.myBackEdge < 180) prob += 0.25 * accuracy * accuracy;
        // 相手がよくぶちかましてくる／よく突っ込んでくるなら、いなしを増やす（癖読み）
        prob += (charged ? this.habitRate('buchi') : this.habitRate('dash')) * 0.8 * accuracy * accuracy;
        prob *= (0.6 + this.persona.inashiSkill * 0.7);
        prob = Math.min(Math.max(prob, 0), 0.7);
        prob = 1 - Math.pow(1 - prob, 20);                    // 1回の突進あたりに直す
        // 何でもいなされると遊べないので上限を設ける（溜めない寄りは特に控えめ）
        prob = Math.min(prob, charged ? 0.92 : 0.12 + accuracy * 0.3);

        // 判定は1回の突進につき1度だけ（毎フレーム抽選すると確率が膨らむ）。相手が止まったら次の突進
        if (this._inashiRolled) return false;
        this._inashiRolled = true;
        if (Math.random() >= prob) return false;

        this.plan = null;
        this.tacticState = null;
        this.aiKeys.clear();
        this.aiKeys.add(me.controls.u); // いなしは単独入力（押し・溜めと同時不可）
        this.inashiCooldown = 26;
        return true;
    }

    // ---------------------------------------------------------------
    // ③ 先読み（お試し計算）
    //   オンライン対戦用に作った「状態の保存・巻き戻し」(NetSim)を使い、
    //   組み合いの作戦（投げ狙い／押し返し狙い／溜めずに寄る）ごとに、相手の作戦3通りと組み合わせて
    //   1秒ほど先までゲームを実際に計算し、結果の良し悪しを点数にする（平均と最悪の両方を見る）。
    //   ※ 組み合い以外（離れている時の行動選び）でも試したが、強さが変わらなかったので使っていない。
    // ---------------------------------------------------------------
    lookaheadChance(level) {
        const v = CONFIG.AI && CONFIG.AI[`LV${level}_LOOKAHEAD`];
        if (v !== undefined) return v;
        return ({ 5: 0.35, 6: 0.6, 7: 0.85 })[level] || 0;
    }

    // 組み合いの作戦（毎フレームのキーの出し方）
    grapplePolicies(p, other) {
        const k = p.controls;
        const fwd = () => (p.x < other.x ? k.r : k.l);
        return {
            throwAim: () => p.charge >= 100 ? new Set([k.d, k.u]) : new Set([k.d]),               // 100まで溜めて投げ
            pushAim: () => p.charge >= 100 ? new Set([k.d, k.u]) : p.charge >= 50 ? new Set([k.d, fwd()]) : new Set([k.d]), // 50で押し返し
            walk: () => new Set([fwd()]),                                                         // 溜めずに寄る
            hold: () => new Set()
        };
    }

    grappleByLookahead(me, opp, grapple, ctx) {
        const gm = (typeof game !== 'undefined') ? game : null;
        if (!gm || !gm.runSandbox || gm.sandbox || (typeof NetSim !== 'undefined' && NetSim.online)) return false;
        const chance = this.lookaheadChance(ctx.level);
        if (chance <= 0) return false;
        // 決めた作戦はしばらく続ける（毎フレーム試算すると重い）
        const gl = this.grabLook;
        if (gl && gl.left > 0) {
            gl.left--;
            if (!gl.policy) return false;          // 今回は先読みしない番（いつもの作戦で動く）
            this.aiKeys.clear();
            gl.policy().forEach(c => this.aiKeys.add(c));
            return true;
        }
        if (Math.random() >= chance) { this.grabLook = { left: 12, policy: null }; return false; }
        const L = this.learned || AIController.LEARNED;
        const H = Math.round(L.horizon);
        const mine = this.grapplePolicies(me, opp), theirs = this.grapplePolicies(opp, me);
        const myNames = ['throwAim', 'pushAim', 'walk'];
        const oppNames = ['throwAim', 'pushAim', 'walk'];
        let best = null;
        for (const mn of myNames) {
            let sum = 0, worst = Infinity;
            for (const on of oppNames) {
                const v = this.simulatePolicies(gm, me, opp, mine[mn], theirs[on], H);
                sum += v; worst = Math.min(worst, v);
            }
            const score = (sum / oppNames.length) * (1 - L.caution) + worst * L.caution
                + this.styleBonus(mn, ctx)
                + (Math.random() * 2 - 1) * L.noise * (1 - ctx.accuracy);
            if (!best || score > best.score) best = { mn, score };
        }
        this.grabLook = { left: 12, policy: mine[best.mn], name: best.mn };
        this.aiKeys.clear();
        mine[best.mn]().forEach(c => this.aiKeys.add(c));
        return true;
    }

    // 力士らしさのおまけ点：思考・タイプの得意な作戦を、点数が僅差なら選ぶようにする
    //   技狙い・テクニック → 投げ狙い / 力押し・パワー → 押し返し狙い / スピード → 寄りより技
    //   （明らかに損な時は、おまけ点より差が大きいので別の作戦を選ぶ）
    styleBonus(policy, ctx) {
        const B = (this.learned || AIController.LEARNED).style || 0;
        let b = 0;
        const add = (fav, w) => { if (policy === fav) b += B * w; };
        if (ctx.think === '技狙い') add('throwAim', 0.5);
        else if (ctx.think === '力押し') add('pushAim', 0.5);
        if (ctx.ptype === 'テクニック') add('throwAim', 0.5);
        else if (ctx.ptype === 'パワー') add('pushAim', 0.5);
        else if (ctx.ptype === 'スピード') { add('throwAim', 0.25); add('pushAim', 0.25); }
        return b;
    }

    // 自分と相手のキーの出し方（関数）を決めて H フレーム試し計算し、点数を返す
    simulatePolicies(gm, me, opp, myPolicy, oppPolicy, H) {
        return gm.runSandbox(() => {
            let myKeys = new Set(), oppKeys = new Set();
            const stub = (get) => ({ think: () => get(), aiKeys: new Set(), reset() {} });
            const meStub = stub(() => myKeys), oppStub = stub(() => oppKeys);
            if (me === gm.p1) { gm.aiP1 = meStub; gm.aiP2 = oppStub; } else { gm.aiP2 = meStub; gm.aiP1 = oppStub; }
            let t = 0;
            for (; t < H && !gm.sandboxEnd; t++) {
                myKeys = (me.stun > 0 || me.miss > 0) ? new Set() : myPolicy();
                oppKeys = oppPolicy();
                gm.setFrameInput(opp.isCPU ? new Set() : new Set(oppKeys));
                gm.simStep();
            }
            return this.evaluate(gm, me, opp, gm.sandboxEnd, t);
        });
    }

    // 盤面の点数（自分から見て）。重みは④の学習で決めた値
    evaluate(gm, me, opp, end, t) {
        if (end === me.id) return 10000 - t * 10;
        if (end === opp.id) return -10000 + t * 10;
        if (end === 'draw') return -3000;
        const W = this.learned || AIController.LEARNED;
        const g = this.geometry(me, opp);
        const room = (r) => Math.sqrt(Math.max(0, Math.min(r, 400)));
        const out = (p) => (p.stun || 0) + (p.miss || 0) + (p.inashiStumble || 0) + Math.max(0, (p.cooldown || 0) - 10);
        let s = 0;
        s += W.stamina * (me.stamina - opp.stamina);
        s += W.maxStamina * (me.maxStamina - opp.maxStamina);
        s += W.edge * (room(g.myBackEdge) - room(g.oppBackEdge));
        s += W.helpless * (out(opp) - out(me));
        s += W.charge * (me.charge - opp.charge);
        if (gm.grapple.active) s += W.master * (gm.grapple.master === me ? 1 : -1);
        return s;
    }

    startPlan(type, timer) { this.plan = { type: type, timer: timer, peaked: false }; }

    // プラン実行：プランが終わるまで毎フレーム必要キーを握り続ける
    runPlan(me, opp) {
        const pl = this.plan;
        const k = me.controls;
        const g = this.geometry(me, opp);
        const isTouching = g.dist <= g.hitDist + 25;

        this.aiKeys.clear();
        pl.timer--;
        if (me.stun > 0 || me.miss > 0) return true;

        if (pl.type === 'attack') {
            // まず d で溜め、55%以上になってから前進してぶちかまし発動（溜め切る前の突進を防ぐ）
            this.aiKeys.add(k.d);
            if (me.charge >= 55) {
                this.aiKeys.add(g.keyFwd);
                pl.peaked = true;
            } else if (!isTouching && me.charge >= 30 && g.dist > 220) {
                this.aiKeys.add(g.keyFwd);
            }
            if (pl.peaked && me.charge < 25) return true; // ぶちかまし発動でチャージ消費→終了
            if (pl.timer <= 0 || me.stamina < 6) return true;
            return false;
        }
        if (pl.type === 'build') {
            this.aiKeys.add(k.d);
            if (me.charge >= (pl.target || 60) || me.stamina < 10) { this.plan = { type: 'attack', timer: 45, peaked: false }; return false; }
            if (pl.timer <= 0) return true;
            return false;
        }
        if (pl.type === 'dash') {
            this.aiKeys.add(g.keyFwd);
            if (pl.timer <= 0) return true;
            return false;
        }
        if (pl.type === 'feint') {
            // 寄るふりをして止まる：相手のいなしを空振りさせる（いなし癖のある相手向け）
            if (pl.timer > pl.stopAt) this.aiKeys.add(g.keyFwd);
            else if (me.stamina > 12) this.aiKeys.add(k.d);
            if (pl.timer <= 0) return true;
            return false;
        }
        if (pl.type === 'retreat') {
            this.aiKeys.add(g.keyBack);
            if (pl.timer <= 0) return true;
            return false;
        }
        // hold（じっと様子見）
        if (pl.timer <= 0) return true;
        return false;
    }

    executeTactic(me, opp) {
        this.tacticTimer--;
        this.aiKeys.clear();
        const g = this.geometry(me, opp);

        if (this.tacticState === 'step') {
            if (Math.floor(this.tacticTimer / 3) % 2 === 0) this.aiKeys.add(g.keyFwd);
            else this.aiKeys.add(g.keyBack);
            if (this.tacticTimer <= 0) {
                this._stepCount = (this._stepCount || 1) - 1;
                if (this._stepCount > 0) this.tacticTimer = 6 + Math.floor(Math.random() * 5);
                else this.tacticState = null;
            }
        } else {
            if (this.tacticTimer <= 0) this.tacticState = null;
        }
    }

    // ---------------------------------------------------------------
    // ② プラン選び（思考×タイプ×個体差＋状況＋癖）
    // ---------------------------------------------------------------
    decide(ctx) {
        const { me, opp, level, think, ptype, accuracy: A } = ctx;
        const g = this.geometry(me, opp);
        const dist = g.dist;
        const P = this.persona;
        const mistake = this.getAIParam(level, 'MISTAKE');
        const nearMyEdge = g.myBackEdge < 130;
        const overrunRisk = g.myFrontEdge < 160; // 前の俵が近い（いなされると自分から出てしまう）

        // ミス・無駄行動（低レベルほど多い）
        if (Math.random() < mistake) {
            const r = Math.random();
            if (r < 0.5) this.startPlan('build', 10 + Math.floor(Math.random() * 10));
            else if (r < 0.78) this.startPlan('retreat', 7);
            else this.startPlan('hold', 14);
            return;
        }

        let wAttack = 0, wBuild = 0, wDash = 0, wRetreat = 0, wStep = 0, wHold = 0, wFeint = 0;
        if (think === '力押し') { wAttack = 0.46; wBuild = 0.13; wDash = 0.22; wRetreat = 0.03; wStep = 0.05; wHold = 0.04; }
        else if (think === '技狙い') { wAttack = 0.1; wBuild = 0.1; wDash = 0.4; wRetreat = 0.12; wStep = 0.13; wHold = 0.08; }
        else { wAttack = 0.27; wBuild = 0.12; wDash = 0.32; wRetreat = 0.07; wStep = 0.1; wHold = 0.05; }

        if (ptype === 'パワー') { wAttack += 0.2; wBuild += 0.05; }
        else if (ptype === 'テクニック') { wDash += 0.18; wStep += 0.06; }
        else if (ptype === 'スピード') { wDash += 0.16; wStep += 0.1; wRetreat += 0.05; }

        // 個体差
        wAttack *= (0.75 + P.aggro * 0.5);
        wDash *= (0.7 + P.aggro * 0.6);
        wRetreat *= (0.7 + (1 - P.aggro) * 0.6);
        wStep *= (0.6 + P.feint * 0.8);
        wBuild *= (0.7 + P.patience * 0.6);

        // 距離・疲労
        if (dist > 240) { wDash *= 1.25; wBuild *= 1.15; wRetreat *= 0.5; }
        if (me.stamina < 22) { wAttack *= 0.6; wDash *= 0.6; wBuild *= 1.3; wRetreat *= 1.3; }

        // 土俵際の自滅防止
        if (nearMyEdge) { wRetreat = 0; wAttack *= 1.4; wDash *= 1.2; wBuild *= 0.5; wHold *= 0.3; }
        if (overrunRisk) { wAttack *= 0.5; wDash *= 0.4; wBuild *= 1.2; wStep += 0.08; }

        // ---- 状況判断（正確さ A が高いほど強く効く） ----
        const lerp = (x) => 1 + (x - 1) * A;
        // 相手が俵に近い → 押し出しを狙って前へ
        if (g.oppBackEdge < 200) { wAttack *= lerp(1.6); wDash *= lerp(1.8); wRetreat *= lerp(0.2); wHold *= lerp(0.3); }
        // スタミナ差：勝っていれば攻め、負けていれば溜めて一発を狙う
        const gap = me.stamina - opp.stamina;
        if (gap > 20) { wAttack *= lerp(1.3); wDash *= lerp(1.3); wHold *= lerp(0.5); }
        else if (gap < -20) { wBuild *= lerp(1.4); wStep *= lerp(1.3); wDash *= lerp(0.8); }
        // 相手がもう溜めている（ぶちかましの準備）→ 正面から歩いて入らない
        if (opp.charge >= 50 && opp.holdingCharge) { wDash *= lerp(0.4); wBuild *= lerp(1.3); wStep *= lerp(1.4); wRetreat *= lerp(1.3); }
        // 自分に溜めが残っている → 使いに行く
        if (me.charge >= 55) { wAttack *= lerp(1.8); }

        // ---- 癖読み ----
        const hInashi = this.habitRate('inashi');
        const hBuchi = this.habitRate('buchi');
        const hStill = this.habitRate('chargeStill');
        // いなし癖 → 正直に突っ込まず、フェイントで空振りさせる
        wFeint = hInashi * 1.2 * A;
        wDash *= (1 - hInashi * 0.6 * A);
        wAttack *= (1 - hInashi * 0.4 * A);
        // ぶちかまし癖 → 待ってこちらも溜める（相打ち・いなしの準備）
        wBuild *= (1 + hBuchi * 0.8 * A);
        wHold *= (1 + hBuchi * 0.5 * A);
        // その場で溜める癖 → 正面から詰めると押し返されるので、こちらも溜めて備える
        wBuild *= (1 + hStill * 1.0 * A);
        wDash *= (1 - hStill * 0.4 * A);

        // 大関以上(Lv6+)はアグレッシブ
        if (level >= 6 && me.stamina > 18) { wAttack *= 1.3; wDash *= 1.5; wStep *= 1.2; wHold *= 0.4; wBuild *= 0.8; }

        const total = wAttack + wBuild + wDash + wRetreat + wStep + wHold + wFeint;
        let pick = Math.random() * total;

        if ((pick -= wAttack) < 0) { this.startPlan('attack', 50 + Math.floor(Math.random() * 25)); return; }
        if ((pick -= wBuild) < 0) { this.startPlan('build', 18 + Math.floor(Math.random() * 14)); return; }
        if ((pick -= wDash) < 0) { this.startPlan('dash', 8 + Math.floor(Math.random() * 6)); return; }
        if ((pick -= wFeint) < 0) {
            this.startPlan('feint', 34 + Math.floor(Math.random() * 12));
            this.plan.stopAt = this.plan.timer - (6 + Math.floor(Math.random() * 6)); // 少しだけ前に出て止まる
            return;
        }
        if ((pick -= wRetreat) < 0) { this.startPlan('retreat', 7 + Math.floor(Math.random() * 6)); return; }
        if ((pick -= wStep) < 0) {
            this.tacticState = 'step';
            this.tacticTimer = 6 + Math.floor(Math.random() * 5);
            this._stepCount = 2 + Math.floor(Math.random() * 3);
            return;
        }
        this.startPlan('hold', 10 + Math.floor(Math.random() * 10));
    }

    // ---------------------------------------------------------------
    // 組み合い（寄り）
    //   掴み投げ = charge 100 で u（溜めキーを握ったまま）
    //   押し返し(ぶちかまし) = charge 50 以上で 前（溜めキーを握ったまま）
    //   寄り(押し) = 組んだ側(master)が前を押すと相手ごと進む。溜めながらだと遅い
    // ---------------------------------------------------------------
    thinkGrapple(me, opp, grapple, ctx) {
        const { think, ptype, accuracy: A, react } = ctx;
        const k = me.controls;
        const g = this.geometry(me, opp);
        const isMaster = grapple.master === me;

        this.aiKeys.clear();

        // 決着間際は押し切る
        if (me.stamina <= 1.1 || opp.stamina <= 1.1) { this.aiKeys.add(g.keyFwd); return; }

        // ③ 先読み：組み合いの作戦を、少し先まで試し計算して選ぶ（上の番付ほど）
        if (this.grappleByLookahead(me, opp, grapple, ctx)) return;

        // 組んだ瞬間に作戦を決める（投げまで溜める / 50で押し返す / 溜めずに寄り切る）
        if (!this.grab) {
            const likesThrow = (think === '技狙い' || ptype === 'テクニック');
            const likesBuchi = (think === '力押し' || ptype === 'パワー');
            let goal = likesThrow ? 'throw' : likesBuchi ? 'push' : (Math.random() < 0.5 ? 'throw' : 'push');
            // 相手がよく組んで投げてくる → 投げを待たずに早めに押し返す
            if (Math.random() < this.habitRate('grabThrow') * 2 * A) goal = 'push';
            this.grab = { goal, startFrames: 0 };
        }
        const plan = this.grab;
        plan.startFrames++;

        const myGain = this.chargeGain(me), oppGain = this.chargeGain(opp);
        const myTo100 = (100 - me.charge) / myGain;
        const oppTo100 = (100 - opp.charge) / oppGain;
        const oppTo50 = Math.max(0, 50 - opp.charge) / oppGain;
        const sees = plan.startFrames >= react; // 組んですぐは状況が読めない

        // 相手がいなしを構えている間は押し返しを出さない（出すといなされる）
        const oppInashi = opp.inashiTimer > 0 && sees && Math.random() < 0.5 + A * 0.5;

        // 寄り切り：自分が組んだ側で、相手が俵に近い → 溜めずに一気に運ぶ（溜めると遅くなる）
        if (isMaster && sees && g.oppBackEdge < 110 + A * 60 && opp.charge < 85) {
            this.aiKeys.add(g.keyFwd);
            return;
        }

        // 常にチャージを握る（投げ・押し返しの威力源）
        this.aiKeys.add(k.d);
        if (me.stamina < 6) return;

        // 投げられる → 必ず投げる
        if (me.charge >= 100) { this.aiKeys.add(k.u); return; }

        // 投げ狙いでも、相手が先に50（押し返し）に届きそうなら、こちらも50で押し返す作戦に切り替える
        if (sees && plan.goal === 'throw' && !plan.checked) {
            plan.checked = true;
            if (oppTo50 < myTo100 && Math.random() < 0.3 + A * 0.7) plan.goal = 'push';
        }
        // 相手の投げが先に来そう → 50あるなら先に押し返す（間に合わないなら寄って出す）
        const oppThreat = sees && opp.charge >= 60 && oppTo100 < myTo100;
        if (oppThreat && Math.random() < 0.35 + A * 0.65) {
            if (me.charge >= 50 && !oppInashi) { this.aiKeys.add(g.keyFwd); return; }
            if (isMaster) { this.aiKeys.delete(k.d); this.aiKeys.add(g.keyFwd); return; }
        }

        if (plan.goal === 'push') {
            if (me.charge >= 50 && !oppInashi) this.aiKeys.add(g.keyFwd);
            return;
        }
        // 投げ狙い：前進しない（前進＝50%で押しが出て100に届かない）。d だけで100まで溜める
    }
}
