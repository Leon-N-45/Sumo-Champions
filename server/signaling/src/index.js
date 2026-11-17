/**
 * スモチャン 遠征（オンライン対戦）の仲介サーバー（Cloudflare Workers + Durable Objects）
 *
 * 役目
 *   1. 部屋（Room）：部屋番号ごとに、部屋を作った人（host）と入った人（guest）を引き合わせ、
 *      2人のあいだの通信をそのまま相手へ渡す
 *      - 端末同士の直接通信（WebRTC）を始めるための情報の受け渡し
 *      - 直接つながらなかった時の、取組の入力の中継（予備の道）
 *   2. 相手探し（Lobby）：ランダムマッチ・公式戦で待っている人を2人ずつ組み合わせ、
 *      2人に同じ部屋番号を渡す（その後は 1 の部屋でつながる）
 *
 * 接続
 *   wss://<このサーバー>/room/<部屋番号>?role=host|guest
 *     部屋番号：フレンドマッチは4けたの数字、相手探しで決まる部屋は英数字10文字
 *   wss://<このサーバー>/lobby?mode=free|official
 */

// どのサイトからでも呼べるようにする（ゲームは GitHub Pages・アプリ・手元のどれからでも開かれるため）
// 公式戦の名簿の名前。変えると、まっさらな名簿（レート・番付）から始め直せる
const RANKING_TABLE = 'season1';

const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type'
};

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const isWs = request.headers.get('Upgrade') === 'websocket';

        // 公式戦のレート・番付（Ranking）
        if (url.pathname.startsWith('/rank/')) {
            if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
            const res = await env.RANKING.get(env.RANKING.idFromName(RANKING_TABLE)).fetch(request);
            const out = new Response(res.body, res);
            for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
            return out;
        }

        const room = url.pathname.match(/^\/room\/([0-9a-z]{4,12})$/);
        if (room) {
            if (!isWs) return new Response('WebSocket で接続してください', { status: 426 });
            return env.ROOMS.get(env.ROOMS.idFromName(room[1])).fetch(request);
        }
        if (url.pathname === '/lobby') {
            if (!isWs) return new Response('WebSocket で接続してください', { status: 426 });
            // 相手探しは1か所に集める（全員が同じ待合室に入る）
            return env.LOBBY.get(env.LOBBY.idFromName('main')).fetch(request);
        }
        return new Response('sumocham signaling', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
};

// ============================================================
// 部屋：最大2人。受け取った通信をもう1人へ渡す
// ============================================================
export class Room {
    constructor(state) {
        this.state = state;
    }

    /** 部屋にいる人の一覧（休止から戻っても分かるよう、接続に付けた印から数える） */
    members() {
        return this.state.getWebSockets().map(ws => ({ ws, role: ws.deserializeAttachment()?.role }));
    }

    async fetch(request) {
        const url = new URL(request.url);
        const role = url.searchParams.get('role') === 'host' ? 'host' : 'guest';
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        const others = this.members();
        const hasHost = others.some(o => o.role === 'host');
        const hasGuest = others.some(o => o.role === 'guest');

        this.state.acceptWebSocket(server);
        server.serializeAttachment({ role });

        // 部屋に入れない場合は、理由を伝えて閉じる
        let refuse = null;
        if (role === 'host' && hasHost) refuse = 'taken';       // その番号の部屋はもう使われている
        if (role === 'guest' && !hasHost) refuse = 'no-host';   // その番号の部屋は無い
        if (role === 'guest' && hasGuest) refuse = 'full';      // もう2人いる
        if (refuse) {
            server.send(JSON.stringify({ t: refuse }));
            server.close(4000, refuse);
            return new Response(null, { status: 101, webSocket: client });
        }

        server.send(JSON.stringify({ t: 'entered', role }));
        if (role === 'guest') {
            // 部屋を作った人に「相手が入ってきた」と知らせる
            others.forEach(o => { try { o.ws.send(JSON.stringify({ t: 'joined' })); } catch (e) {} });
        }
        return new Response(null, { status: 101, webSocket: client });
    }

    /** 受け取った通信を、部屋のもう1人へそのまま渡す */
    async webSocketMessage(ws, message) {
        if (typeof message !== 'string' || message.length > 200000) return;
        for (const o of this.members()) {
            if (o.ws !== ws) { try { o.ws.send(message); } catch (e) {} }
        }
    }

    async webSocketClose(ws) {
        for (const o of this.members()) {
            if (o.ws !== ws) { try { o.ws.send(JSON.stringify({ t: 'left' })); } catch (e) {} }
        }
    }

    async webSocketError(ws) {
        await this.webSocketClose(ws);
    }
}

// ============================================================
// 相手探し：同じ種類（自由／公式戦）で待っている人を2人ずつ組み合わせる
// ============================================================
export class Lobby {
    waiting(mode, except) {
        return this.state.getWebSockets().filter(ws => {
            const a = ws.deserializeAttachment();
            return ws !== except && a && a.mode === mode && !a.matched;
        });
    }

    constructor(state, env) {
        this.state = state;
        this.env = env;
    }

    async fetch(request) {
        const url = new URL(request.url);
        const mode = url.searchParams.get('mode') === 'official' ? 'official' : 'free';
        const pid = url.searchParams.get('pid') || '';
        const secret = url.searchParams.get('secret') || '';
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.state.acceptWebSocket(server);

        // 公式戦は、登録した力士名簿（レート）の本人であることを確かめてから待合室に入れる
        if (mode === 'official') {
            const ok = await this.ranking('/rank/verify', { id: pid, secret });
            if (!ok || !ok.ok) {
                server.send(JSON.stringify({ t: 'need-login' }));
                server.close(4001, 'need-login');
                return new Response(null, { status: 101, webSocket: client });
            }
        }
        server.serializeAttachment({ mode, pid, matched: false, since: Date.now() });

        // 先に待っている人がいれば、一番長く待っている人と組む（公式戦は自分自身とは組まない）
        const others = this.waiting(mode, server)
            .filter(ws => mode !== 'official' || ws.deserializeAttachment().pid !== pid)
            .sort((a, b) => a.deserializeAttachment().since - b.deserializeAttachment().since);
        if (others.length) {
            const host = others[0];
            const room = this.newRoomCode();
            const hostPid = host.deserializeAttachment().pid;
            host.serializeAttachment({ ...host.deserializeAttachment(), matched: true });
            server.serializeAttachment({ mode, pid, matched: true, since: Date.now() });
            // 公式戦は、どの2人がこの部屋で戦うかを名簿に記録する（結果の報告を確かめるため）
            if (mode === 'official') await this.ranking('/rank/room', { room, a: hostPid, b: pid });
            try { host.send(JSON.stringify({ t: 'match', room, role: 'host' })); } catch (e) {}
            server.send(JSON.stringify({ t: 'match', room, role: 'guest' }));
        } else {
            server.send(JSON.stringify({ t: 'waiting' }));
        }
        return new Response(null, { status: 101, webSocket: client });
    }

    /** 名簿（Ranking）へ問い合わせる */
    async ranking(path, body) {
        try {
            const stub = this.env.RANKING.get(this.env.RANKING.idFromName(RANKING_TABLE));
            const res = await stub.fetch('https://rank.internal' + path, { method: 'POST', body: JSON.stringify(body) });
            return await res.json();
        } catch (e) { return null; }
    }

    /** 相手探しで使う部屋番号（英小文字と数字10文字。フレンドマッチの4けたとは重ならない） */
    newRoomCode() {
        const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
        let s = '';
        const bytes = crypto.getRandomValues(new Uint8Array(10));
        for (const b of bytes) s += chars[b % chars.length];
        return s;
    }

    async webSocketMessage(ws, message) {
        // 待っている間の合図（接続を保つため）。中身は使わない
    }

    async webSocketClose(ws) {}
    async webSocketError(ws) {}
}

// ============================================================
// 名簿（公式戦のレート・番付）
//   力士名簿は端末ごとに作る「遠征ID＋合言葉」で本人を見分ける（ログイン不要）。
//   公式戦の結果は、同じ部屋の2人の報告が食い違わない時だけレートに反映する。
//   片方しか報告しない時（相手が途中で抜けた等）は、3分待ってからその報告を反映する。
//   番付は、対戦したことのある人の中で、レートが上から何パーセントにいるかで決める。
// ============================================================
const START_RATING = 1500;
const ELO_K = 32;
const LONE_REPORT_WAIT_MS = 3 * 60 * 1000;
// [番付名, 上位何パーセントまで]
const BANZUKE = [
    ['横綱', 1], ['大関', 3], ['関脇', 6], ['小結', 10], ['前頭', 35],
    ['十両', 45], ['幕下', 60], ['三段目', 75], ['序二段', 90], ['序ノ口', 100]
];

export class Ranking {
    constructor(state) {
        this.state = state;
        this.sql = state.storage.sql;
        this.sql.exec(`CREATE TABLE IF NOT EXISTS players (
            id TEXT PRIMARY KEY, secret TEXT NOT NULL, name TEXT NOT NULL,
            rating REAL NOT NULL, games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
            updated INTEGER NOT NULL)`);
        this.sql.exec(`CREATE TABLE IF NOT EXISTS rooms (
            room TEXT PRIMARY KEY, a TEXT NOT NULL, b TEXT NOT NULL, created INTEGER NOT NULL,
            ra TEXT, rb TEXT, reported INTEGER, done INTEGER NOT NULL DEFAULT 0)`);
    }

    json(obj, status = 200) {
        return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
    }

    player(id) {
        return this.sql.exec('SELECT * FROM players WHERE id = ?', id).toArray()[0] || null;
    }

    /** 本人確認：遠征IDと合言葉が合っているか */
    auth(id, secret) {
        const p = id ? this.player(id) : null;
        return (p && p.secret === secret) ? p : null;
    }

    /** レートから番付を決める（まだ一度も戦っていなければ「前相撲」） */
    profile(p) {
        if (!p) return null;
        let rank = '前相撲', top = null;
        if (p.games > 0) {
            const total = this.sql.exec('SELECT COUNT(*) AS n FROM players WHERE games > 0').one().n;
            const above = this.sql.exec('SELECT COUNT(*) AS n FROM players WHERE games > 0 AND rating > ?', p.rating).one().n;
            top = Math.max(0.1, Math.round((above + 1) / total * 1000) / 10);   // 上位何％か
            rank = (BANZUKE.find(([, pct]) => top <= pct) || BANZUKE[BANZUKE.length - 1])[0];
        }
        return { id: p.id, name: p.name, rating: Math.round(p.rating), games: p.games, wins: p.wins, rank, top };
    }

    async fetch(request) {
        const url = new URL(request.url);
        const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
        this.finalizeLoneReports();

        switch (url.pathname) {
            // 名簿に登録する（初めての人）・名前を変える
            case '/rank/player': {
                const id = String(body.id || ''), secret = String(body.secret || '');
                const name = String(body.name || '').replace(/[<>&"'`\\]/g, '').slice(0, 10) || '名無し';
                if (!/^[0-9a-f]{32}$/.test(id) || secret.length < 16) return this.json({ error: 'bad id' }, 400);
                const p = this.player(id);
                if (p && p.secret !== secret) return this.json({ error: 'forbidden' }, 403);
                if (p) this.sql.exec('UPDATE players SET name = ?, updated = ? WHERE id = ?', name, Date.now(), id);
                else this.sql.exec('INSERT INTO players (id, secret, name, rating, updated) VALUES (?, ?, ?, ?, ?)', id, secret, name, START_RATING, Date.now());
                return this.json(this.profile(this.player(id)));
            }
            // 自分のレート・番付を見る
            case '/rank/me': {
                const p = this.player(url.searchParams.get('id') || '');
                return p ? this.json(this.profile(p)) : this.json({ error: 'not found' }, 404);
            }
            // 番付表（上位）
            case '/rank/top': {
                const rows = this.sql.exec('SELECT * FROM players WHERE games > 0 ORDER BY rating DESC LIMIT 30').toArray();
                return this.json(rows.map(p => this.profile(p)));
            }
            // 待合室から：本人確認
            case '/rank/verify':
                return this.json({ ok: !!this.auth(body.id, body.secret) });
            // 待合室から：この部屋で戦う2人を記録
            case '/rank/room':
                this.sql.exec('INSERT OR REPLACE INTO rooms (room, a, b, created) VALUES (?, ?, ?, ?)', String(body.room), String(body.a), String(body.b), Date.now());
                return this.json({ ok: true });
            // 試合の結果の報告（result: 'win' | 'lose'）
            case '/rank/report': {
                const me = this.auth(body.id, body.secret);
                if (!me) return this.json({ error: 'forbidden' }, 403);
                const room = this.sql.exec('SELECT * FROM rooms WHERE room = ?', String(body.room)).toArray()[0];
                if (!room) return this.json({ error: 'no room' }, 404);
                const side = room.a === me.id ? 'ra' : room.b === me.id ? 'rb' : null;
                if (!side) return this.json({ error: 'not in room' }, 403);
                const result = body.result === 'win' ? 'win' : 'lose';
                if (!room.done && !room[side]) {
                    this.sql.exec(`UPDATE rooms SET ${side} = ?, reported = ? WHERE room = ?`, result, Date.now(), room.room);
                    this.settle(room.room);
                }
                const after = this.sql.exec('SELECT * FROM rooms WHERE room = ?', room.room).one();
                return this.json({ settled: after.done === 1, voided: after.done === 2, me: this.profile(this.player(me.id)) });
            }
        }
        return this.json({ error: 'not found' }, 404);
    }

    /** 2人の報告がそろったら、食い違いが無ければレートを動かす */
    settle(roomCode) {
        const room = this.sql.exec('SELECT * FROM rooms WHERE room = ?', roomCode).one();
        if (room.done || !room.ra || !room.rb) return;
        if (room.ra === room.rb) {   // 両方が勝った（負けた）と言っている → 無効
            this.sql.exec('UPDATE rooms SET done = 2 WHERE room = ?', roomCode);
            return;
        }
        this.apply(room, room.ra === 'win' ? room.a : room.b);
    }

    /** 片方しか報告していない部屋は、3分たったらその報告どおりにする（途中で抜けた人の負け） */
    finalizeLoneReports() {
        const old = Date.now() - LONE_REPORT_WAIT_MS;
        const rows = this.sql.exec('SELECT * FROM rooms WHERE done = 0 AND reported IS NOT NULL AND reported < ?', old).toArray();
        for (const room of rows) {
            if (room.ra && room.rb) continue;
            const r = room.ra || room.rb;
            const reporter = room.ra ? room.a : room.b;
            const other = room.ra ? room.b : room.a;
            this.apply(room, r === 'win' ? reporter : other);
        }
    }

    /** イロレーティングで、勝った人を上げ・負けた人を下げる */
    apply(room, winnerId) {
        const loserId = winnerId === room.a ? room.b : room.a;
        const w = this.player(winnerId), l = this.player(loserId);
        if (!w || !l) { this.sql.exec('UPDATE rooms SET done = 2 WHERE room = ?', room.room); return; }
        const expected = 1 / (1 + Math.pow(10, (l.rating - w.rating) / 400));
        const delta = ELO_K * (1 - expected);
        const now = Date.now();
        this.sql.exec('UPDATE players SET rating = rating + ?, games = games + 1, wins = wins + 1, updated = ? WHERE id = ?', delta, now, w.id);
        this.sql.exec('UPDATE players SET rating = rating - ?, games = games + 1, updated = ? WHERE id = ?', delta, now, l.id);
        this.sql.exec('UPDATE rooms SET done = 1 WHERE room = ?', room.room);
    }
}
