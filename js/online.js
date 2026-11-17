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
        this.ensurePlayer();   // 遠征名・番付・レートを出す
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

    get official() { return this.mode === 'official'; },

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
            p = { id: this.randomHex(16), secret: this.randomHex(16), name: '力士' + Math.floor(1000 + Math.random() * 9000) };
            localStorage.setItem(this.PLAYER_KEY, JSON.stringify(p));
        }
        this.player = p;
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

    async renamePlayer(name) {
        const clean = String(name || '').replace(/[<>&"'`\\]/g, '').trim().slice(0, 10);
        if (!clean || !this.player) return;
        this.player.name = clean;
        localStorage.setItem(this.PLAYER_KEY, JSON.stringify(this.player));
        await this.ensurePlayer();
        settings.showToast('遠征名を変えました');
    },

    /** 遠征の画面に、遠征名・番付・レートを出す */
    paintProfile() {
        const p = this.profile;
        const nameEl = document.getElementById('net-player-name');
        if (nameEl && this.player && document.activeElement !== nameEl) nameEl.value = this.player.name;
        const rankEl = document.getElementById('net-player-rank');
        if (rankEl) {
            rankEl.innerHTML = p
                ? `<span class="net-rank-name">${p.rank}</span><span class="net-rank-rate">レート ${p.rating}</span><span class="net-rank-rec">${p.wins}勝${p.games - p.wins}敗${p.top ? `（上位${p.top}%）` : ''}</span>`
                : '<span class="net-rank-rate">名簿につながりません</span>';
        }
    },

    // ---------------------------------------------------------------
    // ランダムマッチ・公式戦
    //   先に自分の力士を選んでから相手を探す。相手の力士は取組が始まるまで分からない。
    //   公式戦は先に二勝した方の勝ち（三番勝負）。終わるとレートと番付が動く。
    // ---------------------------------------------------------------
    BEST_OF: 3,   // 取組数（過半数＝2勝で決着）

    /** 力士を選ぶ画面へ（相手を探す前） */
    startRandom(mode) {
        this.closeLobby();
        this.leave();
        this.mode = mode;
        this.prepick = true;
        this.active = true;
        this.side = 'p1';          // 選ぶ間は左のカードを使う（つながった後に本来の側へ移す）
        this.myPick = null;
        this.theirPick = null;
        this.matchOver = false;
        document.body.classList.add('online-mode', 'prepick-mode');
        document.body.classList.toggle('official-mode', mode === 'official');
        game.state.chars.p1 = null; game.state.chars.p2 = null;
        const title = document.getElementById('prepick-title');
        if (title) title.textContent = mode === 'official' ? '公式戦' : 'ランダムマッチ';
        if (mode === 'official') this.ensurePlayer();
        document.getElementById('expedition-screen').classList.remove('active');
        game.goToCharSelect('2P');
        setTimeout(() => this.updateSelectGuide(), 600);
    },

    /** 力士を決めて「相手を探す」 */
    beginSearch() {
        const pick = game.state.chars.p1;
        if (pick === null || pick === undefined) { settings.showToast('先に力士を選んでください'); return; }
        this.myPick = pick;
        const mode = this.mode;
        const title = document.getElementById('random-title');
        if (title) title.textContent = mode === 'official' ? '公式戦' : 'ランダムマッチ';
        const rule = document.getElementById('random-rule');
        if (rule) rule.textContent = mode === 'official'
            ? `強さ${this.OFFICIAL_LIMIT}以下の力士どうしで戦います（入門で作った新弟子も使えます）`
            : '同じ時間に探している人と対戦します';
        this.show('random-screen');
        this.searchStart = Date.now();
        this.setRandomStatus('相手を探しています…');

        let q = `mode=${mode}`;
        if (mode === 'official' && this.player) q += `&pid=${this.player.id}&secret=${this.player.secret}`;
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
        if (this.official && !this.officialOk(d)) return null;
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
        const theirs = this.adoptRemotePick(this.theirPickMsg);
        if (theirs === null) { this.abortMatch('相手の力士がルールに合わないため、対戦を取りやめました'); return; }
        this.started = true;
        const mine = this.myPick;
        const other = this.side === 'p1' ? 'p2' : 'p1';
        const picks = { [this.side]: this.pickMessage(mine), [other]: this.theirPickMsg };
        this.link.send({ t: 'start', matches: this.BEST_OF, deuce: false, picks });
        this.launchPrepicked(mine, theirs);
    },

    /** 力士をそれぞれの側に置いて取組を始める（相手探しの画面から直接） */
    launchPrepicked(mine, theirs) {
        const other = this.side === 'p1' ? 'p2' : 'p1';
        game.state.chars.p1 = null; game.state.chars.p2 = null;
        game.state.chars[this.side] = mine;
        game.state.chars[other] = theirs;
        const sel = document.getElementById('match-count-select');
        if (sel) sel.value = String(this.BEST_OF);
        const deuce = document.getElementById('deuce-check');
        if (deuce) deuce.checked = false;
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
        const before = this.profile ? this.profile.rating : null;
        try {
            const res = await fetch(ONLINE_SIGNAL_URL + '/rank/report', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: this.player.id, secret: this.player.secret, room: this.room, result })
            });
            const out = await res.json();
            if (out.me) this.profile = out.me;
            const el = document.getElementById('net-rate-result');
            if (el) {
                if (out.settled && out.me && before !== null) {
                    const d = out.me.rating - before;
                    el.textContent = `レート ${out.me.rating}（${d >= 0 ? '+' : ''}${d}）　番付：${out.me.rank}`;
                } else if (out.voided) {
                    el.textContent = '結果が食い違ったため、この勝負はレートに入りません';
                } else {
                    el.textContent = '相手の報告を待っています…';
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
            if (this.profile && me.games > this.profile.games) {
                this.profile = me;
                const d = me.rating - before;
                el.textContent = `レート ${me.rating}（${d >= 0 ? '+' : ''}${d}）　番付：${me.rank}`;
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
        const FAST_TYPES = new Set(['in', 'ready', 'sum']);
        let pc = null, fast = null, safe = null, closed = false, pingTimer = null;
        const pendingCands = [];
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
                }
            };
        };
        const startPeer = (offerer) => {
            pc = new RTCPeerConnection({ iceServers: ONLINE_STUN_SERVERS.map(urls => ({ urls })) });
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
        };
        const onSignal = async (d) => {
            if (!pc) return;
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
        const el = document.getElementById('net-conn-badge');
        if (el) el.textContent = { direct: '遠征中：直接つながっています', relay: '遠征中：サーバー経由', local: '遠征中：試験（同じパソコン）' }[type] || '';
    },

    /**
     * 同じパソコンの別の画面と BroadcastChannel でつなぐ（試験用）。
     * 選んだ時間だけわざと遅らせて届ける（遠くの相手との対戦を試せる）。
     */
    createLocalLink(room) {
        const ch = new BroadcastChannel('sumocham-room-' + room);
        const delayMs = () => parseInt(document.getElementById('net-delay')?.value || '0', 10);
        const link = {
            send: (msg) => {
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
                if (!this.isHost) this.applyStart(msg);
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
                if (!this.isHost) this.applyTeamStart(msg);
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

    onConnected() {
        this.connected = true;
        this.active = true;
        this.started = false;
        this.setStatus('つながりました！');
        document.body.classList.add('online-mode');
        document.body.classList.toggle('official-mode', this.official);
        if (this.mode === 'friend' && this.isLocalMode()) this.setConnType('local');
        else this.setConnType(this.link && this.link.direct ? 'direct' : 'relay');
        NetSim.begin(game, this.side, this.link);
        NetSim.onStall = (ms) => this.onStall(ms);
        // ランダムマッチ・公式戦：力士は選び済み。相手には見せずに知らせ合い、そのまま取組へ
        if (this.prepick) {
            this.setRandomStatus('相手が見つかりました！ 取組を始めます…');
            this.theirPickMsg = null;
            this.reported = false;
            this.link.send(this.pickMessage(this.myPick));
            this.tryStartPrepicked();
            return;
        }
        // フレンドマッチ：個人戦か団体戦かを選ぶ画面へ（どちらが押しても、2人とも同じ方へ進む）
        this.modeChosen = false;
        setTimeout(() => {
            this.show('friendmode-screen');
            const st = document.getElementById('friendmode-status');
            if (st) st.textContent = this.isHost ? '部屋に相手が入りました' : '部屋に入りました';
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
        this.link.send({ t: 'tstart', rule: val('team-rule-select'), cost: val('team-cost-limit-select'), dup: val('team-dup-select') });
        window.teamGame.startTeamMatch();
    },

    applyTeamStart(msg) {
        if (this.started) return;
        this.started = true;
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
                ? (this.official ? `力士を選べ！（公式戦：強さ${this.OFFICIAL_LIMIT}以下・三番勝負）` : '力士を選べ！（三番勝負）')
                : '「相手を探す」を押せ！ 相手の力士は取組まで分からない';
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
        this.link.send({ t: 'start', matches, deuce, adjust });
        game.startGame();
    },

    applyStart(msg) {
        if (this.started) return;
        // ランダムマッチ・公式戦：届いた両者の力士で、そのまま取組へ
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
