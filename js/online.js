/**
 * online.js
 * 遠征（オンライン対戦）の画面の流れと、相手とのつながり。
 *
 *   タイトル「遠征」 → 遠征の画面「フレンドマッチ」 → マッチングの画面（部屋を作る／部屋に入る）
 *   → つながったら、個人戦と同じ力士選択へ（自分の側だけ選べる） → 取組
 *
 * 取組中の刻みの進め方（ロールバック）は netplay.js の NetSim が行う。
 * ここは「つながる・力士を選び合う・開始をそろえる」を受け持つ。
 *
 * 【つながり方】
 *   インターネット（ふだん使う）：
 *     1. Cloudflare の仲介サーバー（server/signaling）の部屋に2人が入る
 *     2. 仲介サーバー経由で情報を受け渡し、端末同士の直接通信（WebRTC）を作る
 *     3. 直接つながったら、取組の入力は直接送る（一番速い）。
 *        直接つながらない回線の人どうしでも、仲介サーバー経由のまま遊べる（少し遅くなる）
 *   同じパソコン（試験用）：2つの画面を BroadcastChannel でつなぐ。わざと遅らせて試せる。
 */
const Online = {
    active: false,      // つながっていて、遠征の対戦の流れの中にいるか
    isHost: false,      // 部屋を作った側（1P・左）か
    side: 'p1',
    room: '',
    link: null,
    connected: false,
    started: false,     // 取組を始めたか（開始の二重押し防止）
    remoteCustomSeq: 0,

    // ---------------------------------------------------------------
    // 画面の切り替え
    // ---------------------------------------------------------------
    show(id) {
        const curtain = document.getElementById('transition-curtain');
        const swap = () => {
            document.querySelectorAll('.screen.active').forEach(s => s.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            if (typeof initFastScale === 'function') initFastScale();
        };
        if (curtain) {
            curtain.classList.add('active');
            setTimeout(swap, 400);
            setTimeout(() => curtain.classList.remove('active'), 900);
        } else swap();
    },

    openExpedition() {
        this.show('expedition-screen');
        this.ensurePlayer();   // 部屋名・番付・レートを出す（初めてなら部屋名の登録を促す）
    },

    openFriendMatch() {
        this.mode = 'friend';
        this.setStatus('');
        document.getElementById('net-room-code').textContent = '----';
        document.getElementById('net-create-box').classList.remove('waiting');
        this.show('friend-screen');
    },

    backToTitle() {
        this.closeLobby();
        this.leave();
        location.reload();
    },

    setStatus(text) {
        const el = document.getElementById('net-status');
        if (el) el.textContent = text;
    },

    // ---------------------------------------------------------------
    // 部屋を作る・入る
    // ---------------------------------------------------------------
    createRoom(tries = 0) {
        this.leave();
        this.rulesReceived = false;
        this.pendingStartMsg = null;
        this.isHost = true;
        this.side = 'p1';
        this.room = String(Math.floor(1000 + Math.random() * 9000));
        this.roomTries = tries;
        document.getElementById('net-room-code').textContent = this.room;
        document.getElementById('net-create-box').classList.add('waiting');
        this.setStatus(this.isLocalMode() ? '相手が部屋に入るのを待っています…' : '部屋を用意しています…');
        this.link = this.createLink(this.room, 'host');
    },

    /** つなぎ方が「同じパソコン（試験用）」か */
    isLocalMode() {
        return (document.getElementById('net-mode')?.value || 'net') === 'local';
    },

    joinRoom() {
        const code = (document.getElementById('net-join-code').value || '').replace(/\D/g, '');
        if (code.length !== 4) { this.setStatus('4けたの部屋番号を入れてください'); return; }
        this.leave();
        this.rulesReceived = false;
        this.pendingStartMsg = null;
        this.isHost = false;
        this.side = 'p2';
        this.room = code;
        this.link = this.createLink(code, 'guest');
        this.setStatus(`部屋 ${code} に入っています…`);
        this.knock();
    },

    /** 部屋に入った側から、部屋を作った人に「入りました」と知らせる（届くまで何度か送る） */
    knock() {
        let tries = 0;
        const link = this.link;
        const step = () => {
            if (this.connected || !this.link || this.link !== link) return;
            if (tries++ > 20) { this.setStatus('部屋が見つかりません。番号を確かめてください'); return; }
            this.link.send({ t: 'hello' });
            setTimeout(step, 500);
        };
        step();
    },

    // ---------------------------------------------------------------
    // ランダムマッチ・公式戦（仲介サーバーの待合室で相手を探す）
    //   free     : ランダムマッチ（どの力士でも）
    //   official : 公式戦（強さ50以下の力士だけ）
    // ---------------------------------------------------------------
    mode: 'friend',
    OFFICIAL_LIMIT: 50,

    // 公式戦（個人戦 'official'・団体戦 'official-team'）
    get official() { return this.mode === 'official' || this.mode === 'official-team'; },
    get officialTeam() { return this.mode === 'official-team'; },
    /** 画面に出す名前 */
    modeName(mode = this.mode) {
        return { friend: '友人戦', free: '誰でも戦', official: '公式戦・個人戦', 'official-team': '公式戦・団体戦' }[mode] || '';
    },
    /** 公式戦・団体戦のルール（固定）：勝ち抜き・力士の重複なし・コスト9 */
    OFFICIAL_TEAM_RULES: { rule: 'kachinuki', cost: '9', dup: 'off' },

    // ---------------------------------------------------------------
    // 遠征の名簿（公式戦のレート・番付）
    //   この端末で遠征IDと合言葉を作って保存し、仲介サーバーの名簿に登録する（ログイン不要）
    // ---------------------------------------------------------------
    PLAYER_KEY: 'sumochamp_player',
    profile: null,

    loadPlayer() {
        try { return JSON.parse(localStorage.getItem(this.PLAYER_KEY) || 'null'); } catch (e) { return null; }
    },

    randomHex(bytes) {
        return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');
    },

    /** 遠征IDが無ければ作って名簿に登録する。あれば名簿から最新のレート・番付をもらう */
    async ensurePlayer() {
        let p = this.loadPlayer();
        if (!p || !p.id || !p.secret) {
            p = { id: this.randomHex(16), secret: this.randomHex(16), name: '' };
            localStorage.setItem(this.PLAYER_KEY, JSON.stringify(p));
        }
        this.player = p;
        // まだ部屋名を登録していなければ、登録してもらう（登録すると名簿に載る）
        if (!p.registered) { this.showRegister(); this.paintProfile(); return p; }
        try {
            const res = await fetch(ONLINE_SIGNAL_URL + '/rank/player', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: p.id, secret: p.secret, name: p.name })
            });
            if (res.ok) this.profile = await res.json();
        } catch (e) { console.warn('名簿につながりません', e); }
        this.paintProfile();
        return p;
    },

    cleanName(name) {
        return String(name || '').replace(/[<>&"'`\\]/g, '').trim().slice(0, 10);
    },

    /**
     * 部屋名を名簿に送る。ほかの人と同じ名前なら 'taken'、つながらなければ 'offline'、うまくいけば 'ok'
     */
    async saveName(name) {
        const p = this.player;
        try {
            const res = await fetch(ONLINE_SIGNAL_URL + '/rank/player', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: p.id, secret: p.secret, name })
            });
            if (res.status === 409) return 'taken';
            if (!res.ok) return 'offline';
            this.profile = await res.json();
            p.name = name;
            p.registered = true;
            localStorage.setItem(this.PLAYER_KEY, JSON.stringify(p));
            this.paintProfile();
            return 'ok';
        } catch (e) { return 'offline'; }
    },

    showRegister() {
        const ov = document.getElementById('net-register');
        if (!ov) return;
        ov.classList.add('active');
        document.getElementById('net-register-error').textContent = '';
        const input = document.getElementById('net-register-name');
        input.value = (this.player && this.player.name) || '';
        setTimeout(() => input.focus(), 300);
    },

    async registerName() {
        const input = document.getElementById('net-register-name');
        const err = document.getElementById('net-register-error');
        const name = this.cleanName(input.value);
        if (!name) { err.textContent = '部屋名を入れてください'; return; }
        err.textContent = '登録しています…';
        const r = await this.saveName(name);
        if (r === 'taken') { err.textContent = 'その部屋名はもう使われています。別の名前にしてください'; return; }
        if (r === 'offline') { err.textContent = 'サーバーにつながりません。少し待ってからもう一度お試しください'; return; }
        document.getElementById('net-register').classList.remove('active');
        settings.showToast(`部屋名「${name}」を登録しました`);
    },

    /** 部屋名の「編集」：押すと書き換えられるようになり、もう一度押す（決定）と保存する */
    async toggleNameEdit() {
        const input = document.getElementById('net-player-name');
        const btn = document.getElementById('net-name-edit');
        if (!input || !btn || !this.player) return;
        if (!this.player.registered) { this.showRegister(); return; }
        if (input.readOnly) {
            input.readOnly = false;
            btn.innerHTML = this.ICON_CHECK;
            btn.title = '決定';
            input.focus(); input.select();
            return;
        }
        const name = this.cleanName(input.value);
        if (!name || name === this.player.name) { this.endNameEdit(); return; }
        btn.disabled = true;
        const r = await this.saveName(name);
        btn.disabled = false;
        if (r === 'taken') { settings.showToast('その部屋名はもう使われています'); input.focus(); return; }
        if (r === 'offline') { settings.showToast('サーバーにつながりません'); input.focus(); return; }
        this.endNameEdit();
        settings.showToast('部屋名を変えました');
    },

    endNameEdit() {
        const input = document.getElementById('net-player-name');
        const btn = document.getElementById('net-name-edit');
        if (input) { input.readOnly = true; input.value = (this.player && this.player.name) || ''; }
        if (btn) { btn.innerHTML = this.ICON_PENCIL; btn.title = '部屋名を変える'; }
    },

    ICON_PENCIL: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/></svg>',
    ICON_CHECK: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg>',

    /** 公式戦（レート戦）の取組要項 */
    showRules() {
        document.getElementById('net-rules').classList.add('active');
    },

    /** 遠征の画面に、部屋名と、公式戦の個人戦・団体戦それぞれのレート・番付（各ボタンの下）を出す */
    paintProfile() {
        const p = this.profile;
        const nameEl = document.getElementById('net-player-name');
        if (nameEl && this.player && nameEl.readOnly) nameEl.value = this.player.name || '';
        const editBtn = document.getElementById('net-name-edit');
        if (editBtn) editBtn.style.display = (this.player && this.player.registered) ? '' : 'none';
        // まだ団体戦を一度もしていない（または名簿が古い）時は、始めの値を出す
        const fresh = { rating: 1500, rank: '前相撲' };
        const paint = (id, r) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = r ? `レート：${r.rating}<br>番付：${r.rank}` : 'レート：－<br>番付：－';
        };
        paint('net-rate-single', p ? (p.single || p) : null);
        paint('net-rate-team', p ? (p.team || fresh) : null);
    },

    /** この勝負がどちらのレートに入るか */
    rateKind() { return this.officialTeam ? 'team' : 'single'; },
    rateOf(profile) {
        if (!profile) return null;
        const r = profile[this.rateKind()] || (this.rateKind() === 'single' ? profile : null);
        return r ? r : null;
    },

    // ---------------------------------------------------------------
    // ランダムマッチ・公式戦
    //   先に自分の力士を選んでから相手を探す。相手の力士は取組が始まるまで分からない。
    //   公式戦は先に二勝した方の勝ち（三番勝負）。終わるとレートと番付が動く。
    // ---------------------------------------------------------------
    BEST_OF: 3,   // 公式戦の取組数（過半数＝2勝で決着）
    RANDOM_RULES: { matches: 2, deuce: true },   // ランダムマッチ：二番勝負・優勝決定戦あり（固定）

    /** ランダムマッチ・公式戦の取組数と優勝決定戦の有無 */
    prepickRules() {
        return this.official ? { matches: this.BEST_OF, deuce: false } : this.RANDOM_RULES;
    },

    /** 力士を選ぶ画面へ（相手を探す前） */
    startRandom(mode) {
        // 公式戦は名簿（部屋名）に登録してから
        if ((mode === 'official' || mode === 'official-team') && !(this.player && this.player.registered)) {
            this.ensurePlayer();
            return;
        }
        this.closeLobby();
        this.leave();
        this.mode = mode;
        this.prepick = true;
        this.active = true;
        this.side = 'p1';          // 選ぶ間は左のカード（1P組）を使う（つながった後に本来の側へ移す）
        this.myPick = null;
        this.myTeam = null;
        this.theirPick = null;
        this.matchOver = false;
        this.teamMode = (mode === 'official-team');
        document.body.classList.add('online-mode', 'prepick-mode');
        document.body.classList.toggle('official-mode', mode === 'official');
        game.state.chars.p1 = null; game.state.chars.p2 = null;
        const title = document.getElementById('prepick-title');
        if (title) title.textContent = this.modeName(mode);
        if (this.official) this.ensurePlayer();
        document.getElementById('expedition-screen').classList.remove('active');
        if (this.teamMode) {
            // 公式戦・団体戦：3人を決めてから相手を探す。ルール（勝ち抜き・重複なし・コスト9）は固定
            startTeamMode();
            const tg = window.teamGame;
            tg.state.teams = { p1: [null, null, null], p2: [null, null, null] };
            tg.state.slotCPU = { p1: [false, false, false], p2: [false, false, false] };
            this.applyTeamRules(this.OFFICIAL_TEAM_RULES);
            setTimeout(() => this.updateTeamGuide(), 1600);
            return;
        }
        game.goToCharSelect('2P');
        setTimeout(() => this.updateSelectGuide(), 600);
    },

    /** 団体戦のルール（取り組み形式・コスト・重複）を設定の欄に入れて、編成の画面に反映する */
    applyTeamRules(r) {
        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el && v != null) { el.value = v; el.dispatchEvent(new Event('change')); }
        };
        set('team-rule-select', r.rule);
        set('team-cost-limit-select', r.cost);
        set('team-dup-select', r.dup);
        if (window.teamGame && window.teamGame.ui) {
            window.teamGame.ui.updateTeamDisplay();
            window.teamGame.ui.checkStartCondition();
        }
    },

    /** 力士を決めて「相手を探す」 */
    beginSearch() {
        if (this.teamMode) {
            // 公式戦・団体戦：自分の3人（ランダムの枠はここで抽選）を決める
            const tg = window.teamGame;
            const team = tg.state.teams.p1;
            if (!team.every(id => id !== null)) { settings.showToast('先に3人を選んでください'); return; }
            if (tg.ui.teamCost(team) > tg.ui.MAX_COST) { settings.showToast(`コストの合計を${tg.ui.MAX_COST}以下にしてください`); return; }
            tg.ui.resolveRandomSlots('p1');
            this.myTeam = [...tg.state.teams.p1];
        } else {
            let pick = game.state.chars.p1;
            if (pick === null || pick === undefined) { settings.showToast('先に力士を選んでください'); return; }
            // ランダムを選んでいたら、ここで抽選する（公式戦は強さの上限を守る力士から）
            if (pick === RANDOM_CHAR_ID) {
                pick = pickRandomCharId(d => this.mode !== 'official' || this.officialOk(d));
                if (pick === null) { settings.showToast('選べる力士がいません'); return; }
            }
            this.myPick = pick;
        }
        const mode = this.mode;
        const title = document.getElementById('random-title');
        if (title) title.textContent = this.modeName(mode);
        const rule = document.getElementById('random-rule');
        if (rule) rule.textContent = mode === 'official'
            ? `強さ${this.OFFICIAL_LIMIT}以下の力士どうしで戦います（入門で作った新弟子も使えます）`
            : mode === 'official-team'
                ? 'コスト9以下の3人で勝ち抜き戦（力士の重複なし・新弟子も使えます）'
                : '同じ時間に探している人と対戦します';
        this.show('random-screen');
        this.searchStart = Date.now();
        this.setRandomStatus('相手を探しています…');

        let q = `mode=${mode}`;
        if (this.official && this.player) q += `&pid=${this.player.id}&secret=${this.player.secret}`;
        const ws = new WebSocket(ONLINE_SIGNAL_URL.replace(/^http/, 'ws') + `/lobby?${q}`);
        this.lobby = ws;
        ws.onmessage = (e) => {
            let msg; try { msg = JSON.parse(e.data); } catch (err) { return; }
            if (msg.t === 'need-login') {
                this.setRandomStatus('名簿に登録できませんでした。少し待ってからもう一度お試しください');
                this.ensurePlayer();
                return;
            }
            if (msg.t === 'match') {
                // 相手が見つかった：決まった部屋に入り、あとはフレンドマッチと同じ流れ
                this.closeLobby();
                this.isHost = msg.role === 'host';
                this.side = this.isHost ? 'p1' : 'p2';
                this.room = msg.room;
                this.setRandomStatus('相手が見つかりました！');
                this.rulesReceived = false;
                this.pendingStartMsg = null;
                this.link = this.createNetLink(msg.room, msg.role);
                if (!this.isHost) this.knock();
            }
        };
        ws.onerror = () => this.setRandomStatus('サーバーにつながりません。インターネットの接続を確かめてください');
        // 待っている間の経過時間と、接続を保つための合図
        this.searchTimer = setInterval(() => {
            if (this.connected || !this.lobby) return;
            const sec = Math.floor((Date.now() - this.searchStart) / 1000);
            this.setRandomStatus(`相手を探しています…（${sec}秒）`);
            if (sec % 20 === 0 && ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 1000);
    },

    closeLobby() {
        clearInterval(this.searchTimer);
        if (this.lobby) { try { this.lobby.close(); } catch (e) {} }
        this.lobby = null;
    },

    /** 探すのをやめて、力士を選ぶ画面に戻る */
    cancelRandom() {
        this.closeLobby();
        this.leave();
        this.active = true;          // 力士を選ぶ画面はまだ遠征の中
        this.show('char-select-screen');
    },

    // --- つながった後：お互いの力士を（相手には見せずに）知らせ合い、すぐ取組へ ---
    /** 団体戦：自分の3人を送る（自作の力士は中身ごと） */
    teamPickMessage(ids) {
        return { t: 'pick', team: ids.map(id => this.pickMessage(id)) };
    },

    /** 団体戦：相手の3人を、この端末で使える力士にする。ルールに合わなければ null */
    adoptRemoteTeam(msg) {
        if (!msg || !Array.isArray(msg.team) || msg.team.length !== 3) return null;
        const ids = msg.team.map(p => this.adoptRemotePick(p));
        if (ids.some(id => id === null)) return null;
        if (this.officialTeam) {
            const r = this.OFFICIAL_TEAM_RULES;
            const cost = ids.reduce((s, id) => s + (parseInt(RIKISHI_DATA.find(d => d.id === id)?.['コスト']) || 0), 0);
            if (cost > parseInt(r.cost, 10)) return null;
            // 重複なし（自作の力士は相手の端末で別の番号になるので、名前でも確かめる）
            const keys = ids.map(id => { const d = RIKISHI_DATA.find(x => x.id === id); return d.remoteCustom ? 'c:' + d.name : 'id:' + id; });
            if (new Set(keys).size !== keys.length) return null;
        }
        return ids;
    },

    pickMessage(id) {
        const msg = { t: 'pick', id };
        const d = RIKISHI_DATA.find(x => x.id === id);
        if (d && d.custom) {
            const rec = CustomRikishi.load().find(r => r.id === id);
            if (rec) msg.custom = rec;
        }
        return msg;
    },

    /** 相手から届いた力士を、この端末で使える力士にする（自作の力士は中身から作る） */
    adoptRemotePick(p) {
        if (!p) return null;
        let id = p.id;
        if (p.custom) {
            const d = CustomRikishi.toCharData({ ...p.custom, id: 50000 + (++this.remoteCustomSeq) });
            d.custom = false; d.draft = true; d.remoteCustom = true;
            RIKISHI_DATA.push(d);
            id = d.id;
        }
        const d = RIKISHI_DATA.find(x => x.id === id);
        if (!d) return null;
        if (this.mode === 'official' && !this.officialOk(d)) return null;   // 公式戦・個人戦は強さの上限あり
        return id;
    },

    onRemotePick(msg) {
        if (!this.prepick || this.theirPickMsg) return;
        this.theirPickMsg = msg;
        this.tryStartPrepicked();
    },

    /** 部屋を作った側：両者の力士がそろったら、三番勝負の設定で取組を始める */
    tryStartPrepicked() {
        if (!this.isHost || this.started || !this.theirPickMsg) return;
        if (this.teamMode) {
            const theirs = this.adoptRemoteTeam(this.theirPickMsg);
            if (theirs === null) { this.abortMatch('相手の組がルールに合わないため、対戦を取りやめました'); return; }
            this.started = true;
            const other = this.side === 'p1' ? 'p2' : 'p1';
            const picks = { [this.side]: this.teamPickMessage(this.myTeam), [other]: this.theirPickMsg };
            const bgm = this.chooseMatchBgm();
            this.link.send({ t: 'start', team: true, picks, bgm });
            this.launchPrepickedTeam(this.myTeam, theirs);
            return;
        }
        const theirs = this.adoptRemotePick(this.theirPickMsg);
        if (theirs === null) { this.abortMatch('相手の力士がルールに合わないため、対戦を取りやめました'); return; }
        this.started = true;
        const mine = this.myPick;
        const other = this.side === 'p1' ? 'p2' : 'p1';
        const picks = { [this.side]: this.pickMessage(mine), [other]: this.theirPickMsg };
        const rules = this.prepickRules();
        const bgm = this.chooseMatchBgm();
        this.link.send({ t: 'start', matches: rules.matches, deuce: rules.deuce, picks, bgm });
        this.launchPrepicked(mine, theirs);
    },

    /** 団体戦：両者の3人をそれぞれの側に置き、出場順を決める画面へ（相手探しの画面から直接） */
    launchPrepickedTeam(mine, theirs) {
        const tg = window.teamGame;
        const other = this.side === 'p1' ? 'p2' : 'p1';
        tg.state.teams = { p1: [null, null, null], p2: [null, null, null] };
        tg.state.teams[this.side] = [...mine];
        tg.state.teams[other] = [...theirs];
        tg.state.slotCPU = { p1: [false, false, false], p2: [false, false, false] };
        this.applyTeamRules(this.OFFICIAL_TEAM_RULES);
        document.getElementById('random-screen').classList.remove('active');
        tg.startTeamMatch();
    },

    /** 力士をそれぞれの側に置いて取組を始める（相手探しの画面から直接） */
    launchPrepicked(mine, theirs) {
        const other = this.side === 'p1' ? 'p2' : 'p1';
        game.state.chars.p1 = null; game.state.chars.p2 = null;
        game.state.chars[this.side] = mine;
        game.state.chars[other] = theirs;
        const rules = this.prepickRules();
        const sel = document.getElementById('match-count-select');
        if (sel) sel.value = String(rules.matches);
        const deuce = document.getElementById('deuce-check');
        if (deuce) deuce.checked = rules.deuce;
        const adjust = document.getElementById('adjust-check');
        if (adjust) adjust.checked = false;   // ランダムマッチ・公式戦は能力調整なし
        document.querySelectorAll('#random-screen, #char-select-screen').forEach(s => s.classList.remove('active'));
        game.startGame();
    },

    /** 対戦を取りやめて遠征の画面へ */
    abortMatch(message) {
        settings.showToast(message);
        this.leave();
        setTimeout(() => this.reloadTo('expedition'), 1500);
    },

    /** 読み込み直して、指定の画面を開く（遠征の画面へ戻る時など） */
    reloadTo(screen) {
        try { sessionStorage.setItem('sumocham-open', screen); } catch (e) {}
        location.reload();
    },

    /** 読み込み直した後、遠征の画面を開く必要があれば開く */
    resumeAfterReload() {
        let target = null;
        try { target = sessionStorage.getItem('sumocham-open'); sessionStorage.removeItem('sumocham-open'); } catch (e) {}
        if (target !== 'expedition') return;
        const wait = () => {
            if (typeof RIKISHI_DATA === 'undefined' || !RIKISHI_DATA.length) { setTimeout(wait, 300); return; }
            document.getElementById('start-screen').classList.remove('active');
            document.getElementById('expedition-screen').classList.add('active');
            if (typeof initFastScale === 'function') initFastScale();
            this.ensurePlayer();
        };
        wait();
    },

    // --- 三番勝負が終わった時（ランダムマッチ・公式戦） ---
    /** 優勝の画面が出た時に呼ばれる。公式戦なら結果を名簿に報告し、レートの変化を出す */
    async onMatchFinished(winnerSide) {
        if (!this.active || this.mode === 'friend' || this.matchOver) return;
        this.matchOver = true;
        if (!this.official) return;
        await this.reportResult(winnerSide === this.side ? 'win' : 'lose');
    },

    async reportResult(result) {
        if (!this.player || this.reported) return;
        this.reported = true;
        const beforeR = this.rateOf(this.profile);
        const before = beforeR ? beforeR.rating : null;
        try {
            const res = await fetch(ONLINE_SIGNAL_URL + '/rank/report', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: this.player.id, secret: this.player.secret, room: this.room, result })
            });
            const out = await res.json();
            if (out.me) this.profile = out.me;
            const el = document.getElementById('net-rate-result');
            if (el) {
                const now = this.rateOf(out.me);
                if (out.settled && now && before !== null) {
                    const d = now.rating - before;
                    el.textContent = `${this.officialTeam ? '団体戦' : '個人戦'}のレート ${now.rating}（${d >= 0 ? '+' : ''}${d}）　番付：${now.rank}`;
                } else if (out.voided) {
                    el.textContent = '結果が食い違ったため、この勝負はレートに入りません';
                } else {
                    el.textContent = '';
                    this.pollRating(before, el, 0);
                }
            }
        } catch (e) { console.warn('結果を報告できませんでした', e); }
    },

    /** 先に報告した側は、相手の報告で結果が決まるのを少し待って、レートの変化を出す */
    async pollRating(before, el, tries) {
        if (tries > 8) { el.textContent = '結果はあとで反映されます（遠征の画面でレートを確かめられます）'; return; }
        await new Promise(r => setTimeout(r, 3000));
        try {
            const res = await fetch(`${ONLINE_SIGNAL_URL}/rank/me?id=${this.player.id}`);
            const me = await res.json();
            const was = this.rateOf(this.profile), now = this.rateOf(me);
            if (was && now && now.games > was.games) {
                this.profile = me;
                const d = now.rating - before;
                el.textContent = `${this.officialTeam ? '団体戦' : '個人戦'}のレート ${now.rating}（${d >= 0 ? '+' : ''}${d}）　番付：${now.rank}`;
                return;
            }
        } catch (e) {}
        this.pollRating(before, el, tries + 1);
    },

    /** 優勝の画面の「遠征へ戻る」 */
    finishAndReturn() {
        this.leave();
        this.reloadTo('expedition');
    },

    setRandomStatus(text) {
        const el = document.getElementById('random-status');
        if (el) el.textContent = text;
    },

    /** 公式戦で使える力士か（強さが上限以下か）。自作の力士は能力から計算し直して確かめる */
    officialOk(d) {
        if (!d) return false;
        const str = (d.custom || d.remoteCustom) ? calcStrength(d) : (parseInt(d.total, 10) || calcStrength(d));
        return str <= this.OFFICIAL_LIMIT;
    },

    /** 部屋から出る（相手に知らせる） */
    leave() {
        this.stopPing();
        if (this.statsTimer) { clearInterval(this.statsTimer); this.statsTimer = null; }
        document.getElementById('net-stats')?.classList.remove('show');
        if (typeof SoundFX !== 'undefined') SoundFX.onlineBgmFile = null;
        this.restoreRules();
        if (this.link) {
            try { this.link.send({ t: 'bye' }); } catch (e) {}
            this.link.close();
        }
        this.link = null;
        this.connected = false;
        if (typeof NetSim !== 'undefined') NetSim.end();
    },

    createLink(room, role) {
        return this.isLocalMode() ? this.createLocalLink(room) : this.createNetLink(room, role);
    },

    /**
     * インターネットでのつながり。
     * 仲介サーバーの部屋に入り、まずはサーバー経由でやり取りしながら、端末同士の直接通信を作る。
     * 直接通信ができたら、そちらに切り替える（送る側を見て自動で選ぶ）。
     *   fast : 取組の入力など。届かなくても次の送信で補うので、待たずにすぐ送る（順番・再送なし）
     *   safe : 力士の選択・開始など。必ず順番どおりに届ける
     */
    createNetLink(room, role) {
        const wsUrl = ONLINE_SIGNAL_URL.replace(/^http/, 'ws') + `/room/${room}?role=${role}`;
        const ws = new WebSocket(wsUrl);
        const FAST_TYPES = new Set(['in', 'ready', 'sum', 'png', 'pong']);
        let pc = null, fast = null, safe = null, closed = false, pingTimer = null;
        const pendingCands = [];
        const pendingSignals = [];   // 中継の情報を待っている間に届いた、直接通信の受け渡し
        const turnReady = this.fetchTurn();
        const sendWs = (o) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); };

        const link = {
            direct: false,
            send: (msg) => {
                const ch = FAST_TYPES.has(msg.t) ? fast : safe;
                if (ch && ch.readyState === 'open') ch.send(JSON.stringify(msg));
                else sendWs({ t: 'relay', m: msg });   // 直接つながるまでは仲介サーバー経由
            },
            close: () => {
                closed = true;
                clearInterval(pingTimer);
                try { pc && pc.close(); } catch (e) {}
                try { ws.close(); } catch (e) {}
            }
        };

        const onChannel = (ch) => {
            ch.onmessage = (e) => { try { this.onMessage(JSON.parse(e.data)); } catch (err) {} };
            ch.onopen = () => {
                if (fast && safe && fast.readyState === 'open' && safe.readyState === 'open' && !link.direct) {
                    link.direct = true;
                    this.setConnType('direct');
                    // 実際に使っている道が中継（TURN）かどうかを調べて表示する
                    pc.getStats().then(stats => {
                        let pair = null;
                        stats.forEach(s => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId); });
                        if (!pair) stats.forEach(s => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
                        const local = pair && stats.get(pair.localCandidateId);
                        if (local && local.candidateType === 'relay') this.setConnType('turn');
                    }).catch(() => {});
                }
            };
        };
        const startPeer = async (offerer) => {
            const turn = await turnReady;
            if (closed || pc) return;
            // まず直接（STUN）を試し、無理な時だけ中継（TURN）を使う（どちらを使うかはブラウザが速い方を選ぶ）
            pc = new RTCPeerConnection({ iceServers: ONLINE_STUN_SERVERS.map(urls => ({ urls })).concat(turn) });
            pc.onicecandidate = (e) => { if (e.candidate) sendWs({ t: 'sig', d: { cand: e.candidate } }); };
            if (offerer) {
                fast = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
                safe = pc.createDataChannel('safe');
                onChannel(fast); onChannel(safe);
                pc.createOffer()
                    .then(o => pc.setLocalDescription(o))
                    .then(() => sendWs({ t: 'sig', d: { sdp: pc.localDescription } }))
                    .catch(err => console.warn('直接通信の準備に失敗（サーバー経由で続けます）', err));
            } else {
                pc.ondatachannel = (e) => {
                    if (e.channel.label === 'fast') fast = e.channel; else safe = e.channel;
                    onChannel(e.channel);
                };
            }
            while (pendingSignals.length) await onSignal(pendingSignals.shift());
        };
        const onSignal = async (d) => {
            if (!pc) { pendingSignals.push(d); return; }
            try {
                if (d.sdp) {
                    await pc.setRemoteDescription(d.sdp);
                    if (d.sdp.type === 'offer') {
                        const ans = await pc.createAnswer();
                        await pc.setLocalDescription(ans);
                        sendWs({ t: 'sig', d: { sdp: pc.localDescription } });
                    }
                    while (pendingCands.length) await pc.addIceCandidate(pendingCands.shift());
                } else if (d.cand) {
                    if (pc.remoteDescription) await pc.addIceCandidate(d.cand);
                    else pendingCands.push(d.cand);
                }
            } catch (err) { console.warn('直接通信の受け渡しに失敗（サーバー経由で続けます）', err); }
        };

        ws.onmessage = (e) => {
            let msg; try { msg = JSON.parse(e.data); } catch (err) { return; }
            switch (msg.t) {
                case 'entered':
                    if (role === 'host') this.setStatus('相手が部屋に入るのを待っています…');
                    else startPeer(false);
                    break;
                case 'joined': startPeer(true); break;                 // 部屋を作った側：相手が来た
                case 'taken':                                          // その番号は使用中 → 別の番号で作り直す
                    if ((this.roomTries || 0) < 5) setTimeout(() => this.createRoom((this.roomTries || 0) + 1), 100);
                    else this.setStatus('部屋を作れませんでした。もう一度押してください');
                    break;
                case 'no-host': this.setStatus('その番号の部屋がありません。番号を確かめてください'); break;
                case 'full': this.setStatus('その部屋はもう2人そろっています'); break;
                case 'left': this.onPeerLeft(); break;
                case 'sig': onSignal(msg.d); break;
                case 'relay': this.onMessage(msg.m); break;
            }
        };
        ws.onerror = () => { if (!closed && !this.connected) this.setStatus('サーバーにつながりません。インターネットの接続を確かめてください'); };
        ws.onclose = () => { if (!closed && this.connected && !link.direct) this.onPeerLeft(); };
        // 長く何も送らないとサーバーとの接続が切れることがあるので、ときどき合図を送る
        pingTimer = setInterval(() => sendWs({ t: 'relay', m: { t: 'ping' } }), 25000);
        return link;
    },

    /**
     * 取組中に相手の入力が届かない時間（ミリ秒）。0 なら届いている。
     *   2秒以上：画面に「相手の通信を待っています…」
     *   15秒以上：接続が切れたとみなしてタイトルへ戻る
     */
    STALL_SHOW_MS: 2000,
    STALL_GIVEUP_MS: 15000,
    onStall(ms) {
        const el = document.getElementById('net-wait-overlay');
        if (el) {
            const show = ms >= this.STALL_SHOW_MS;
            el.classList.toggle('active', show);
            if (show) {
                const left = Math.max(0, Math.ceil((this.STALL_GIVEUP_MS - ms) / 1000));
                document.getElementById('net-wait-sec').textContent = `あと${left}秒待って届かなければ終了します`;
            }
        }
        if (ms >= this.STALL_GIVEUP_MS && this.connected) {
            if (el) el.classList.remove('active');
            this.onPeerLeft();
        }
    },

    /** 相手がいなくなった時 */
    onPeerLeft() {
        // 三番勝負が終わった後に相手が帰っただけなら、何もしない（結果の画面に残る）
        if (this.matchOver) { this.connected = false; return; }
        // 公式戦の途中で相手が抜けたら、こちらの勝ちとして名簿に報告する
        if (this.connected && this.official && this.started) {
            this.connected = false;
            this.matchOver = true;
            this.reportResult('win');
            settings.showToast('相手が抜けたため、あなたの勝ちです');
            setTimeout(() => this.reloadTo('expedition'), 2500);
            return;
        }
        if (this.connected) {
            settings.showToast('相手との接続が切れました');
            setTimeout(() => location.reload(), 1500);
        } else {
            this.setStatus('相手が部屋から出ました');
        }
        this.connected = false;
    },

    /** つながり方の表示（直接 or サーバー経由） */
    setConnType(type) {
        this.connType = type;
        this.paintConnBadge();
    },

    /** ③ 中継（TURN）の情報をサーバーからもらう（用意されていなければ空。1.5秒で諦める） */
    fetchTurn() {
        const timeout = new Promise(res => setTimeout(() => res([]), 1500));
        const req = fetch(ONLINE_SIGNAL_URL + '/turn')
            .then(r => r.ok ? r.json() : { iceServers: [] })
            .then(o => Array.isArray(o.iceServers) ? o.iceServers : [])
            .catch(() => []);
        return Promise.race([req, timeout]);
    },

    /** 遠征中の帯：つながり方と、相手の部屋名（公式戦はレートも） */
    paintConnBadge() {
        const el = document.getElementById('net-conn-badge');
        if (!el) return;
        const conn = { direct: '遠征中：直接つながっています', turn: '遠征中：中継（TURN）でつながっています', relay: '遠征中：サーバー経由', local: '遠征中：試験（同じパソコン）' }[this.connType] || '';
        const opp = this.opponentText();
        el.textContent = opp ? `${conn}　／　${opp}` : conn;
    },

    // ---------------------------------------------------------------
    // 相手の部屋名（公式戦はレート・番付も）
    // ---------------------------------------------------------------
    myName() {
        const p = this.player || this.loadPlayer();
        return (p && p.name) ? p.name : '名無し';
    },

    /** つながった時に、自分の部屋名（公式戦ならこの種類のレート・番付も）を相手に知らせる */
    sendWho() {
        if (!this.link) return;
        const msg = { t: 'who', name: this.myName(), delayPref: this.myDelayPref() };
        if (this.official) {
            const r = this.rateOf(this.profile);
            if (r) { msg.rating = r.rating; msg.rank = r.rank; }
        }
        this.link.send(msg);
    },

    onWho(msg) {
        this.theirDelayPref = msg.delayPref === 'smooth' ? 'smooth' : 'reaction';
        const name = this.cleanName(msg.name) || '名無し';
        this.opponent = { name, rating: Number.isFinite(msg.rating) ? Math.round(msg.rating) : null, rank: this.cleanName(msg.rank) || null };
        const text = this.opponentText();
        // 相手が見つかった／入ってきた画面にも出す
        if (this.prepick) this.setRandomStatus(`相手が見つかりました！　${text}`);
        const st = document.getElementById('friendmode-status');
        if (st && this.mode === 'friend') st.textContent = `${this.isHost ? '部屋に相手が入りました' : '部屋に入りました'}　${text}`;
        settings.showToast(text);
        this.paintConnBadge();
    },

    /** 「相手：〇〇部屋」（公式戦は「（レート 1532・前頭）」も） */
    opponentText() {
        const o = this.opponent;
        if (!o) return '';
        if (this.official && o.rating !== null) return `相手：${o.name}（レート ${o.rating}${o.rank ? '・' + o.rank : ''}）`;
        return `相手：${o.name}`;
    },

    /**
     * 同じパソコンの別の画面と BroadcastChannel でつなぐ（試験用）。
     * 選んだ時間だけわざと遅らせて届ける（遠くの相手との対戦を試せる）。
     */
    createLocalLink(room) {
        const ch = new BroadcastChannel('sumocham-room-' + room);
        const delayMs = () => parseInt(document.getElementById('net-delay')?.value || '0', 10);
        const lossRate = () => parseFloat(document.getElementById('net-loss')?.value || '0');
        const FAST = new Set(['in', 'ready', 'sum', 'png', 'pong']);
        const link = {
            send: (msg) => {
                // 試験用：取組中の入力など（順番・再送なしで送るもの）は、選んだ割合で届かないことにする
                if (FAST.has(msg.t) && Math.random() < lossRate()) return;
                const d = delayMs();
                const jitter = d > 0 ? Math.random() * d * 0.2 : 0;   // 届く時間のばらつき
                if (d > 0) setTimeout(() => ch.postMessage(msg), d + jitter);
                else ch.postMessage(msg);
            },
            close: () => ch.close()
        };
        ch.onmessage = (e) => this.onMessage(e.data);
        return link;
    },

    // ---------------------------------------------------------------
    // 相手からの通信
    // ---------------------------------------------------------------
    onMessage(msg) {
        if (!msg || !msg.t) return;
        switch (msg.t) {
            case 'hello':           // 部屋を作った側：相手が入ってきた
                if (!this.isHost) return;
                this.link.send({ t: 'welcome' });
                if (!this.connected) this.onConnected();
                return;
            case 'welcome':         // 入った側：部屋を作った人に受け入れられた
                if (this.isHost || this.connected) return;
                this.onConnected();
                return;
            case 'sel':
                this.applyRemoteSelect(msg);
                return;
            case 'startReq':        // 入った側が「開始」を押した → 部屋を作った側が始める
                if (this.isHost) this.startMatch();
                return;
            case 'start':
                if (this.isHost) return;
                if (!this.rulesReceived) { this.waitRules(msg); return; }   // 数値をそろえてから始める
                this.applyStart(msg);
                return;
            case 'rules':           // 入った側：部屋を作った側のゲームの数値に合わせる
                if (!this.isHost) this.applyRules(msg);
                return;
            case 'who':             // 相手の部屋名（公式戦はレートも）
                this.onWho(msg);
                return;
            case 'bgm':             // 相手が選んだ曲（部屋を作った側が、どちらの曲を流すか決める）
                this.theirBgm = msg.file || 'random';
                return;
            case 'rulesReq':        // 部屋を作った側：数値が届いていないと言われたら送り直す
                if (this.isHost) this.link.send(this.rulesMessage());
                return;
            case 'png':             // 通信の速さを測る：届いたらすぐ返す
                this.link.send({ t: 'pong', at: msg.at });
                return;
            case 'pong':
                this.recordRtt(performance.now() - msg.at);
                return;
            case 'pick':            // ランダムマッチ・公式戦：相手が先に選んでいた力士
                this.onRemotePick(msg);
                return;
            case 'fmode':           // フレンドマッチ：相手が個人戦／団体戦を選んだ
                this.chooseFriendMode(msg.kind, true);
                return;
            case 'tsel':            // 団体戦：相手の編成
                this.applyRemoteTeamSelect(msg);
                return;
            case 'tstartReq':
                if (this.isHost) this.startTeamMatchOnline();
                return;
            case 'tstart':
                if (this.isHost) return;
                if (!this.rulesReceived) { this.waitRules(msg); return; }
                this.applyTeamStart(msg);
                return;
            case 'tsecret':         // 団体戦：相手の選出
                this.onRemoteTeamSecret(msg);
                return;
            case 'final':
                this.finalAction(msg.kind, true);
                return;
            case 'bye':
                this.onPeerLeft();
                return;
            default:
                // 取組中の入力などは NetSim へ
                if (typeof NetSim !== 'undefined') NetSim.receive(msg);
        }
    },

    // ---------------------------------------------------------------
    // ずれ・遅れを防ぐ仕組み
    // ---------------------------------------------------------------
    /**
     * ゲームの数値（設定・力士の能力）。二人の数値が少しでも違うと計算がずれるので、
     * 部屋を作った側の数値に合わせる（スプシの読み込みに失敗した・古いページを開いたまま等で違うことがある）
     */
    rulesPayload() {
        const chars = (RIKISHI_DATA || []).filter(d => d && !d.custom && !d.random).map(d => {
            const o = {};
            for (const k of Object.keys(d)) {
                const v = d[k];
                if (k !== 'img' && (v === null || typeof v !== 'object') && typeof v !== 'function') o[k] = v;
            }
            return o;
        });
        return { config: JSON.parse(JSON.stringify(CONFIG)), chars };
    },

    /** 並び順に左右されない文字列にして要約する（両者で同じ数値なら同じ値になる） */
    hashRules(payload) {
        const stable = (v) => {
            if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
            if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
            return JSON.stringify(v);
        };
        const str = stable(payload);
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return (h >>> 0).toString(16);
    },

    rulesMessage() {
        const payload = this.rulesPayload();
        return { t: 'rules', hash: this.hashRules(payload), ...payload };
    },

    // ---------------------------------------------------------------
    // 選曲：二人が選んだ曲のどちらかを流す（部屋を作った側が決めて、開始の合図で知らせる）
    // ---------------------------------------------------------------
    myBgmChoice() {
        const s = (typeof settings !== 'undefined' && settings.current) ? settings.current.bgmFile : null;
        const f = s || (typeof SoundFX !== 'undefined' ? SoundFX.selectedBgmFile : null);
        return f || 'random';
    },

    /** 自分の選んだ曲を相手に知らせる（つながった時・選び直した時） */
    sendBgmChoice() {
        if (this.link && this.connected) this.link.send({ t: 'bgm', file: this.myBgmChoice() });
    },

    /** 部屋を作った側：二人の選んだ曲から1曲を決める（「ランダム」なら、ここで曲を引いて二人で同じ曲にする） */
    chooseMatchBgm() {
        const picks = [this.myBgmChoice(), this.theirBgm || 'random'];
        let file = picks[Math.floor(Math.random() * picks.length)];
        if (!file || file === 'random') {
            const list = (typeof BGM_DATA !== 'undefined' ? BGM_DATA : []).filter(b => b.file && b.file !== 'opening.mp3');
            file = list.length ? list[Math.floor(Math.random() * list.length)].file : null;
        }
        this.setMatchBgm(file);
        return file;
    },

    setMatchBgm(file) {
        if (typeof SoundFX !== 'undefined') SoundFX.onlineBgmFile = file || null;
    },

    /** 開始の合図が来たのに数値がまだ届いていない：取っておいて、送り直してもらう */
    waitRules(msg) {
        this.pendingStartMsg = msg;
        if (this.link) this.link.send({ t: 'rulesReq' });
    },

    applyRules(msg) {
        const mine = this.rulesPayload();
        if (this.hashRules(mine) !== msg.hash) {
            // 遠征が終わったら元に戻せるように、今の数値を取っておく
            if (!this.rulesBackup) this.rulesBackup = mine;
            this.mergeRules(msg.config, msg.chars);
            console.warn('遠征：相手（部屋を作った側）とゲームの数値が違ったため、相手の数値に合わせました');
        }
        this.rulesReceived = true;
        const pending = this.pendingStartMsg;
        this.pendingStartMsg = null;
        if (pending) this.onMessage(pending);
    },

    /** 数値だけを上書きする（設定の入れ物や、画像などは残す） */
    mergeRules(config, chars) {
        const merge = (dst, src) => {
            for (const k of Object.keys(src)) {
                const v = src[k];
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                    if (!dst[k] || typeof dst[k] !== 'object') dst[k] = {};
                    merge(dst[k], v);
                } else dst[k] = v;
            }
        };
        merge(CONFIG, config);
        (chars || []).forEach(c => {
            const d = RIKISHI_DATA.find(x => x && x.id === c.id && !x.custom);
            if (d) Object.assign(d, c);
        });
    },

    /** 遠征を終える時、合わせる前の自分の数値に戻す */
    restoreRules() {
        if (!this.rulesBackup) return;
        this.mergeRules(this.rulesBackup.config, this.rulesBackup.chars);
        this.rulesBackup = null;
    },

    /** 部屋を作った側：1秒ごとに通信の往復時間を測る */
    startPing() {
        this.stopPing();
        const ping = () => { if (this.link && this.connected) this.link.send({ t: 'png', at: performance.now() }); };
        ping();
        this.pingTimer = setInterval(ping, 1000);
    },

    stopPing() {
        if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    },

    recordRtt(ms) {
        if (!(ms >= 0) || ms > 5000) return;
        this.rtts = (this.rtts || []).concat(ms).slice(-15);
    },

    /**
     * 取組ごとの「入力の遅らせ方」（刻み）を、測った往復時間から決める。
     * 遅らせるほど巻き戻し（画面のカクつき）が減るが、操作の反応は遅くなる。
     * 近い相手は2刻み（約33ミリ秒）のまま、遠い相手ほど少しずつ増やす（最大5刻み）
     */
    chooseDelay() {
        const reaction = this.myDelayPref() === 'reaction' && this.theirDelayPref !== 'smooth';
        const r = (this.rtts || []).slice().sort((a, b) => a - b);
        if (!r.length) return reaction ? 1 : 2;
        const rtt = r[Math.min(r.length - 1, Math.floor(r.length * 0.75))];   // たまに遅い時も考えて、遅めの値を使う
        const oneWayFrames = rtt / 2 / (1000 / 60);
        // 反応優先：遅らせ幅を小さく（1〜3フレーム）。相手の入力は予想で進め、違えば巻き戻す
        // 見た目優先：遅らせ幅を大きめに（2〜5フレーム）。巻き戻し（補正）が減る
        return reaction
            ? Math.max(1, Math.min(3, Math.ceil(oneWayFrames * 0.3)))
            : Math.max(2, Math.min(5, Math.ceil(oneWayFrames * 0.6)));
    },

    /** 自分の設定：遠征の操作（反応優先・見た目優先） */
    myDelayPref() {
        return (typeof settings !== 'undefined' && settings.current && settings.current.netDelay === 'smooth') ? 'smooth' : 'reaction';
    },

    /** ① 通信の状態を画面の隅に出す（0.5秒ごと） */
    startStats() {
        if (this.statsTimer) clearInterval(this.statsTimer);
        const el = document.getElementById('net-stats');
        this.statsTimer = setInterval(() => {
            if (!el) return;
            if (!this.connected || !this.link) { el.classList.remove('show'); return; }
            el.classList.add('show');
            const r = (this.rtts || []).slice(-5).sort((a, b) => a - b);
            const rtt = r.length ? Math.round(r[Math.floor(r.length / 2)]) : null;
            const s = NetSim.takeStats();
            const conn = { direct: '直接', turn: '中継(TURN)', relay: 'サーバー経由', local: '試験' }[this.connType] || '－';
            const cls = (bad) => bad ? 'bad' : 'ok';
            el.innerHTML = `往復 <span class="${cls(rtt === null || rtt > 120)}">${rtt === null ? '－' : rtt + 'ms'}</span>`
                + `　遅らせ ${NetSim.INPUT_DELAY}F`
                + `　巻き戻し <span class="${cls(s.maxDepth > 6)}">${s.rollbacks}回/最大${s.maxDepth}F</span>`
                + (s.stalls ? `　<span class="bad">待ち${s.stalls}F</span>` : '')
                + `　${conn}`;
        }, 500);
    },

    onConnected() {
        this.connected = true;
        this.active = true;
        this.started = false;
        this.setStatus('つながりました！');
        document.body.classList.add('online-mode');
        document.body.classList.toggle('official-mode', this.mode === 'official');   // 強さ50の制限は個人戦だけ
        if (this.mode === 'friend' && this.isLocalMode()) this.setConnType('local');
        else this.setConnType(this.link && this.link.direct ? 'direct' : 'relay');
        NetSim.begin(game, this.side, this.link);
        NetSim.onStall = (ms) => this.onStall(ms);
        NetSim.isHost = !!this.isHost;
        NetSim.delayChooser = () => this.chooseDelay();
        this.rtts = [];
        // 「数値を受け取ったか」は部屋に入る時に戻してある（つながる前に届くこともあるので、ここでは戻さない）
        if (this.isHost) this.rulesReceived = true;
        // 部屋を作った側：ゲームの数値（設定・力士の能力）を相手に送ってそろえ、通信の速さを測り始める
        if (this.isHost) this.link.send(this.rulesMessage());
        this.startPing();          // 往復時間は両方で測る（入力の遅らせ方は部屋を作った側が決める）
        this.startStats();
        this.theirDelayPref = null;
        this.theirBgm = 'random';
        this.sendBgmChoice();
        this.opponent = null;
        this.sendWho();
        // ランダムマッチ・公式戦：力士は選び済み。相手には見せずに知らせ合い、そのまま取組へ
        if (this.prepick) {
            this.setRandomStatus('相手が見つかりました！ 取組を始めます…');
            this.theirPickMsg = null;
            this.reported = false;
            this.link.send(this.teamMode ? this.teamPickMessage(this.myTeam) : this.pickMessage(this.myPick));
            this.tryStartPrepicked();
            return;
        }
        // フレンドマッチ：個人戦か団体戦かを選ぶ画面へ（どちらが押しても、2人とも同じ方へ進む）
        this.modeChosen = false;
        setTimeout(() => {
            this.show('friendmode-screen');
            const st = document.getElementById('friendmode-status');
            if (st) st.textContent = `${this.isHost ? '部屋に相手が入りました' : '部屋に入りました'}　${this.opponentText()}`;
        }, 600);
    },

    // ---------------------------------------------------------------
    // フレンドマッチ：個人戦・団体戦を選ぶ
    // ---------------------------------------------------------------
    teamMode: false,

    chooseFriendMode(kind, fromNet = false) {
        if (this.modeChosen) return;
        this.modeChosen = true;
        if (!fromNet && this.link) this.link.send({ t: 'fmode', kind });
        this.teamMode = (kind === 'team');
        document.getElementById('friendmode-screen').classList.remove('active');
        if (this.teamMode) {
            startTeamMode();
            setTimeout(() => this.updateTeamGuide(), 1600);
        } else {
            game.goToCharSelect('2P');
            setTimeout(() => this.updateSelectGuide(), 600);
        }
    },

    // ---------------------------------------------------------------
    // 団体戦（フレンドマッチ）
    // ---------------------------------------------------------------
    /** 自分の側の編成を変えた時（teamGame.selectTeamChar から呼ばれる） */
    sendTeamSelect(index, charId) {
        if (!this.connected) return;
        const msg = { t: 'tsel', index, id: charId };
        const d = (charId !== null) ? RIKISHI_DATA.find(x => x.id === charId) : null;
        if (d && d.custom) {
            const rec = CustomRikishi.load().find(r => r.id === charId);
            if (rec) msg.custom = rec;
        }
        this.link.send(msg);
    },

    applyRemoteTeamSelect(msg) {
        const other = this.side === 'p1' ? 'p2' : 'p1';
        const id = (msg.id === null) ? null : this.adoptRemotePick(msg);
        window.teamGame.selectTeamChar(other, msg.index, id, { fromNet: true });
    },

    updateTeamGuide() {
        const el = document.getElementById('team-select-instruction-text');
        if (el && this.active && this.teamMode && this.prepick) {
            el.textContent = 'コスト9以下の3人を選べ！（勝ち抜き戦・力士の重複なし）';
            return;
        }
        if (el && this.active && this.teamMode) {
            el.textContent = `自分の側（${this.side === 'p1' ? '左・1P組' : '右・2P組'}）の3人を選べ！ ルールは部屋を作った人の設定になります`;
        }
    },

    /** 団体戦を始める（部屋を作った側の取り組み形式・コスト・重複の設定で、両者同時に） */
    requestTeamStart() {
        if (this.isHost) this.startTeamMatchOnline();
        else { this.link.send({ t: 'tstartReq' }); settings.showToast('開始を相手に知らせました'); }
    },

    startTeamMatchOnline() {
        if (this.started) return;
        this.started = true;
        const val = id => document.getElementById(id)?.value;
        this.link.send({ t: 'tstart', rule: val('team-rule-select'), cost: val('team-cost-limit-select'), dup: val('team-dup-select'), bgm: this.chooseMatchBgm() });
        window.teamGame.startTeamMatch();
    },

    applyTeamStart(msg) {
        if (this.started) return;
        this.started = true;
        this.setMatchBgm(msg.bgm);
        const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
        set('team-rule-select', msg.rule);
        set('team-cost-limit-select', msg.cost);
        set('team-dup-select', msg.dup);
        window.teamGame.startTeamMatch();
    },

    /** 出場する力士（勝ち抜きは出場順）を決めた時。中身は送るが、相手の画面には「選出済」だけ出る */
    sendTeamSecret(round, sel, order) {
        if (this.link) this.link.send({ t: 'tsecret', round, sel, order });
    },

    onRemoteTeamSecret(msg) {
        this.pendingTeamSecret = msg;
        this.applyPendingTeamSecret();
    },

    /** 相手の選出が先に届いていた時、自分が同じ回の選出画面に来たら受け取る */
    applyPendingTeamSecret() {
        const msg = this.pendingTeamSecret;
        const tg = window.teamGame;
        if (!msg || !tg || !tg.state.isSecretPhase || tg.state.round !== msg.round) return;
        this.pendingTeamSecret = null;
        tg.applyRemoteSecret(this.side === 'p1' ? 'p2' : 'p1', msg.sel, msg.order);
    },

    // ---------------------------------------------------------------
    // 力士選択を送り合う
    // ---------------------------------------------------------------
    /** 自分の側の力士を選んだ時（game.selectChar から呼ばれる） */
    sendSelect(charId) {
        if (this.prepick) { this.updateSelectGuide(); return; }   // 相手を探す前の選択は送らない
        if (!this.connected) return;
        const msg = { t: 'sel', id: charId };
        const d = (charId !== null) ? RIKISHI_DATA.find(x => x.id === charId) : null;
        // 自作の力士は相手の端末に無いので、中身ごと送る
        if (d && d.custom) {
            const rec = CustomRikishi.load().find(r => r.id === charId);
            if (rec) msg.custom = rec;
        }
        this.link.send(msg);
        this.updateSelectGuide();
    },

    applyRemoteSelect(msg) {
        const otherSide = this.side === 'p1' ? 'p2' : 'p1';
        let id = msg.id;
        if (msg.custom) {
            // 相手の自作力士を、この取組の間だけ使える力士として加える（保存はしない）
            const d = CustomRikishi.toCharData({ ...msg.custom, id: 50000 + (++this.remoteCustomSeq) });
            d.custom = false;       // 自分の新弟子の段には並べない
            d.draft = true;         // 力士選択のマスにも並べない
            d.remoteCustom = true;
            RIKISHI_DATA.push(d);
            id = d.id;
        }
        // 公式戦：相手の力士がルール（強さ50以下）に合うか、こちらでも計算して確かめる
        if (this.official && id !== null && !this.officialOk(RIKISHI_DATA.find(x => x.id === id))) {
            settings.showToast('相手の力士が公式戦のルールに合わないため、選び直しを待っています');
            id = null;
        }
        game.selectChar(otherSide, id, { fromNet: true });
        this.updateSelectGuide();
    },

    /** 力士選択の案内（どちらが開始を押すか・待っているか） */
    updateSelectGuide() {
        if (!this.active) return;
        const text = document.getElementById('select-instruction-text');
        if (!text) return;
        const st = game.state.chars;
        const mine = st[this.side], theirs = st[this.side === 'p1' ? 'p2' : 'p1'];
        // ランダムマッチ・公式戦：選んでから相手を探す
        if (this.prepick) {
            const btn = document.getElementById('prepick-search');
            if (btn) btn.disabled = (st.p1 === null);
            text.textContent = (st.p1 === null)
                ? (this.official ? `力士を選べ！（公式戦：強さ${this.OFFICIAL_LIMIT}以下・三番勝負）` : '力士を選べ！（二番勝負・優勝決定戦あり）')
                : '';
            return;
        }
        if (mine === null) text.textContent = this.official
            ? `自分の力士を選べ！（公式戦：強さ${this.OFFICIAL_LIMIT}以下）`
            : '自分の力士を選べ！（自分の側のカードにドッキング）';
        else if (theirs === null) text.textContent = '相手が力士を選ぶのを待っています…';
        else text.textContent = '↑ をクリックして取組開始だ！';
    },

    // ---------------------------------------------------------------
    // 取組を始める（部屋を作った側の設定で、両者同時に始める）
    // ---------------------------------------------------------------
    requestStart() {
        if (this.isHost) this.startMatch();
        else { this.link.send({ t: 'startReq' }); settings.showToast('開始を相手に知らせました'); }
    },

    startMatch() {
        if (this.started) return;
        const st = game.state.chars;
        if (st.p1 === null || st.p2 === null) return;
        this.started = true;
        const matches = parseInt(document.getElementById('match-count-select').value, 10);
        const deuce = document.getElementById('deuce-check').checked;
        const adjust = !!document.getElementById('adjust-check')?.checked;
        this.link.send({ t: 'start', matches, deuce, adjust, bgm: this.chooseMatchBgm() });
        game.startGame();
    },

    applyStart(msg) {
        this.setMatchBgm(msg.bgm);   // 部屋を作った側が決めた曲（二人のどちらかが選んだ曲）
        if (this.started) return;
        // ランダムマッチ・公式戦：届いた両者の力士で、そのまま取組へ
        if (this.prepick && msg.picks && msg.team) {
            const other = this.side === 'p1' ? 'p2' : 'p1';
            const theirs = this.adoptRemoteTeam(msg.picks[other]);
            if (theirs === null) { this.abortMatch('相手の組がルールに合わないため、対戦を取りやめました'); return; }
            this.started = true;
            this.launchPrepickedTeam(this.myTeam, theirs);
            return;
        }
        if (this.prepick && msg.picks) {
            const other = this.side === 'p1' ? 'p2' : 'p1';
            const theirs = this.adoptRemotePick(msg.picks[other]);
            if (theirs === null) { this.abortMatch('相手の力士がルールに合わないため、対戦を取りやめました'); return; }
            this.started = true;
            this.launchPrepicked(this.myPick, theirs);
            return;
        }
        this.started = true;
        const sel = document.getElementById('match-count-select');
        if (sel) sel.value = String(msg.matches);
        const deuce = document.getElementById('deuce-check');
        if (deuce) deuce.checked = !!msg.deuce;
        const adjust = document.getElementById('adjust-check');
        if (adjust) adjust.checked = !!msg.adjust;   // 能力調整も部屋を作った側の設定にそろえる
        game.startGame();
    },

    /**
     * 優勝の画面のボタン（再戦・力士選択へ）。どちらかが押したら、両者で同じことをする。
     *   kind : 'rematch' | 'select'
     */
    finalDone: false,
    finalAction(kind, fromNet = false) {
        if (this.finalDone) return;   // 2人がほぼ同時に押しても1回だけ
        this.finalDone = true;
        if (!fromNet && this.link) this.link.send({ t: 'final', kind });
        if (kind === 'rematch') {
            game.rematch();
        } else if (kind === 'team-rematch') {
            window.teamGame.teamRematch();
        } else if (kind === 'team-select') {
            if (window.teamGame.finalAdvanceTimer) clearInterval(window.teamGame.finalAdvanceTimer);
            this.started = false;
            window.teamGame.goToTeamSelect('random');
            setTimeout(() => this.updateTeamGuide(), 1600);
        } else {
            if (game.finalAdvanceTimer) clearInterval(game.finalAdvanceTimer);
            game.goToCharSelect('init', 'none');
            this.onBackToSelect();
        }
    },

    /** ページを閉じる・読み込み直す時は、相手に「出ました」と知らせる */
    initPageHide() {
        window.addEventListener('pagehide', () => { this.closeLobby(); if (this.link) this.leave(); });
    },

    /** 取組がすべて終わって力士選択に戻った時（もう一度選び直して始められるようにする） */
    onBackToSelect() {
        if (!this.active) return;
        this.started = false;
        setTimeout(() => this.updateSelectGuide(), 600);
    }
};

Online.initPageHide();
Online.resumeAfterReload();
