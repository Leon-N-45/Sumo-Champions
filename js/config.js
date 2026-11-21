/**
 * config.js
 * ゲームの設定値、定数、参照URLを管理するファイル
 */

// ============================================================
// ■ 参照スプレッドシート
// ------------------------------------------------------------
// 公開URLに含まれる "2PACX-..." の部分。
// 編集はこちら: https://docs.google.com/spreadsheets/d/1jyNjo6whQ_zzEDlIpVFNHb2nKfjZgUejTztTYF89puI/edit
// ============================================================
const SHEET_ID = '2PACX-1vSvQvaLULzjaLu5XmU5BrsGiuKVjW2I4Gz6M-16NUYVaxsX1V2vrRQWnk6pBdwZy1Sl1N2YMTeyD9q-';

const SHEET_GID = {
    CONFIG: '1162573541',
    CHARS:  '1541301449',
    BGM:    '1627618732',
    ALBUMS: '848223505'
};

const sheetCsvUrl = (gid) =>
    `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?gid=${gid}&single=true&output=csv`;

const DATA_URLS = {
    CONFIG: sheetCsvUrl(SHEET_GID.CONFIG),
    CHARS:  sheetCsvUrl(SHEET_GID.CHARS),
    BGM:    sheetCsvUrl(SHEET_GID.BGM),
    ALBUMS: sheetCsvUrl(SHEET_GID.ALBUMS)
};

// ============================================================
// ■ 無操作時の自動復帰
// ------------------------------------------------------------
// タイトル以外の画面で、この秒数だけ操作がなければタイトルへ戻す。
// 遊んでいる人が途中で離れても、次の人がタイトルから始められるようにする。
// 0 にすると無効。
// ============================================================
const IDLE_RETURN_SECONDS = 0;   // 0 = 無操作でタイトルへ戻す仕組みを使わない

// 遠征（オンライン対戦）の仲介サーバー（Cloudflare Workers）。中身は server/signaling
const ONLINE_SIGNAL_URL = 'https://sumocham-signal.leon-noguchi.workers.dev';
// 端末同士の直接通信で、自分の住所（通信先）を調べるための公開サーバー（無料）
const ONLINE_STUN_SERVERS = ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'];

// ============================================================
// ■ 個人戦の取組数
// ------------------------------------------------------------
// null なら相撲形式の画面から選べる。3 なら3番勝負の二本先取、1 なら1番勝負に固定する。
// ============================================================
const FIXED_MATCH_COUNT = null;

// ============================================================
// ■ 取組中のBGM
// ------------------------------------------------------------
// 空文字なら選曲できる。ファイル名を入れるとその1曲に固定する。
// ============================================================
const FIXED_BATTLE_BGM = '';

// ============================================================
// ■ オフラインモード
// ------------------------------------------------------------
// true  … 通信を一切せず js/data_local.js のデータだけで動く（ネットのない場所向け）
// false … スプシを参照する。失敗・遅延した場合は data_local.js へ自動的に退避する
//
// スプシを編集したら次を実行して data_local.js を焼き直すこと:
//     node tools/build_data.js
// ============================================================
const OFFLINE_MODE = false;

// スプシ参照時の打ち切り時間（ミリ秒）。応答が返らないまま起動が止まるのを防ぐ。
const FETCH_TIMEOUT_MS = 5000;

const CONFIG = {
    DEBUG: 0,

    // ■ システム定数 (SYSTEM_...)
    SYSTEM: {
        STAGE_WIDTH: 1200,      // ステージ全幅
        CENTER_X: 600,          // ステージ中心X
        RIKISHI_WIDTH: 130,     // 力士画像の幅
        START_OFFSET: 200       // 初期配置オフセット (SYSTEM_START_OFFSET)
    },

    // ■ ゲームルール (GAME_RULES_...)
    GAME_RULES: {
        RING_EDGE_RIGHT: 1085,
        RING_EDGE_LEFT: 115,
        EDGE_ZONE_WIDTH: 120,
        HIT_DIST: 100,
        THROW_RANGE: 120
    },

    // ■ ダメージ・判定 (DAMAGE_...)
    DAMAGE: {
        RINGOUT_PENALTY: 999,
        BASE_PUSH: 5,
        BASE_THROW: 15,
        BASE_THRUST: 8,
        CLASH_POWER_RATE: 0.5   // シートでは CLASH_POWER_RATE（data.js で読み替える）
    },

    // ■ 物理演算 (PHYSICS_...)
    PHYSICS: {
        GRAVITY: 0.8,
        // 速度を上げたので、滑りすぎないよう摩擦を強く(値を小さく)する
        FRICTION: 0.75,         // 元 0.85
        // 押し合う力を強くする
        PUSH_POWER_BASE: 3.5,   // 元 2
        SCALE_1: 0.75,
        SCALE_2: 0.85,
        SCALE_3: 1.0,
        SCALE_4: 1.15,
        SCALE_5: 1.3
    },

    // ■ アクション (ACTION_...)
    ACTION: {
        // 基本スピードを大幅アップ（ここがキビキビ感の命）
        SPEED_BASE: 8,        // 元 5 (2.8から倍増以上)

        MOVE_BACK_RATE: 0.6,
        SPEED_CHARGING_MOD: 0.3,
        CHARGE_BACK_RATE: 0.1,

        // 衝突時の弾かれ速度を上げ、重さを消す
        REBOUND_VELOCITY: 15,   // 元 8

        // 硬直時間を短くして、サクサク動けるようにする
        COOLDOWN_TIME: 40,      // 元 60
        INASHI_DURATION_BASE: 20, // 元 30
        INASHI_TECH_MOD: 2,
        STUMBLE_DURATION: 30,   // 元 45
        STUN_TIME_PUSH: 15,     // 元 20
        STUN_TIME_THROW: 30,    // 元 40

        // ぶちかまし後のダウンタイム（攻撃側が動き出せるまでの操作不能フレーム）。
        // ハヤサに反比例して決まる: cooldown = BASE * REF_SPEED / speed
        // ハヤサ=REF_SPEED のとき BASE フレーム。ハヤサが下がるほど長くなる。
        BUCHI_DOWNTIME_BASE: 20,        // 通常ぶちかましの基準フレーム（現状の値）
        BUCHI_CLASH_DOWNTIME_BASE: 40,  // 相打ち（大激突）の基準フレーム（現状の値）
        BUCHI_DOWNTIME_REF_SPEED: 10,   // 基準となるハヤサ
        BUCHI_DOWNTIME_MAX: 120,        // ダウンタイム上限（低ハヤサ時の暴走防止）

        // 溜めながら横に動いている間のゲージの増え方（1で減速なし、0.5で半分）
        CHARGE_MOVE_GAIN_RATE: 0.5,
        GRAPPLE_CHARGE_KEEP_RATE: 0.5,  // 組み止められた時に残るチャージの割合（0.5で半分）

        SWAP_DIST_NORMAL: 120,
        SWAP_DIST_SUPER: 250   // ACTION_SWAP_DIST_SUPER
    },

    // ■ ステータス補正・押し合い (STATUS_...)
    STATUS: {
        PWR_DMG_RATE: 0.1,      // 1.0 + (power-5) * rate の計算に使用
        PUSH_BASE_RATE: 0.8,
        PUSH_DIST_CONVERT: 0.4,
        PUSH_VS_CHARGE: 1.5,    // チャージ中の踏ん張り倍率（割り算に使用）
        GRAPPLE_SPD_RATE: 0.5,
        GRAPPLE_COST_RATE: 0.2,
        SP_PUSH_BASE: 50,
        SP_PUSH_RATE: 20,
        SP_SELF_BACK_RATE: 0.2,
        TECH_CHARGE_RATE: 0.25,
        SPD_MOVE_RATE: 0.15,
        SPD_BRAKE_RATE: 0.02,
        HP_PER_STAMINA: 20,
        SPIRIT_BUFF_RATE: 0.05,
        REV_BUFF_RATE: 0.06
    },

    // ■ スタミナ消費 (STAMINA_...)
    STAMINA: {
        INIT: 100,
        MAX_DECAY: 0.05,
        CHARGE_COST: 0.2,

        // 待機時間を短縮 (約3.3秒)
        RECOVERY_DELAY: 200,

        // PARRY_COST: 10,
        SWAP_COST_NORMAL: 15,
        MISS_PENALTY: 20,

        // 回復スピードを遅くする
        RECOVER_IDLE: 0.05,  // 元は 0.1
        RECOVER_MOVE: 0.02,  // 元は 0.05

        PUSH_COST: 0.3,
        MOVE_COST: 0.15,
        SUPER_PUSH_COST: 40,
        SUPER_SWAP_COST: 50
    },

    // ■ チャージ設定 (CHARGE_...)
    CHARGE: {
        // シートの CHARGE_THRESHOLDS_SUPER_PUSH / _SUPER_SWAP がここへ入る
        THRESHOLDS: { SUPER_PUSH: 50, SUPER_SWAP: 100 },
        BASE_GAIN: 0.5             // CHARGE_BASE_GAIN
    },

    // ■ AIパラメータ (LV1=幕下 〜 LV7=横綱)
    //   REACTION:思考間隔(小さいほど速い) / MISTAKE:無駄行動率 / ACCURACY:判断の正確さ / INASHIRATE:いなし精度
    AI: {
        LV1_REACTION: 64, LV1_MISTAKE: 0.55, LV1_ACCURACY: 0.22, LV1_INASHIRATE: 0.03,
        LV2_REACTION: 52, LV2_MISTAKE: 0.42, LV2_ACCURACY: 0.35, LV2_INASHIRATE: 0.06,
        LV3_REACTION: 42, LV3_MISTAKE: 0.32, LV3_ACCURACY: 0.48, LV3_INASHIRATE: 0.11,
        LV4_REACTION: 32, LV4_MISTAKE: 0.22, LV4_ACCURACY: 0.62, LV4_INASHIRATE: 0.18,
        LV5_REACTION: 25, LV5_MISTAKE: 0.15, LV5_ACCURACY: 0.74, LV5_INASHIRATE: 0.26,
        LV6_REACTION: 18, LV6_MISTAKE: 0.09, LV6_ACCURACY: 0.86, LV6_INASHIRATE: 0.34,
        LV7_REACTION: 9,  LV7_MISTAKE: 0.02, LV7_ACCURACY: 0.97, LV7_INASHIRATE: 0.45
    },

    // ■ UI設定 (UI_...)
    UI: {
        DMG_DURATION: 60,
        GYOJI_INTERVAL_MAX: 2500,
        GYOJI_INTERVAL_MIN: 800,
        // 必殺技の見た目の動き（ミリ秒）。見た目だけを動かし、勝敗や操作のタイミングは変えない
        THROW_FLIGHT_MS: 600,   // 掴み投げで相手が一回転しながら背後へ飛ばされ、着地するまでの時間（元 約765）
        THROW_STUN_MS: 650,     // 着地した後にふらつく時間（とどめの時はふらつかない）
        THRUST_SPIN_MS: 300,    // ぶちかましで相手が左右に回りながら飛ばされる時間
        THRUST_SPIN_TURNS: 2,   // その間に回る回数
        THRUST_STUN_MS: 530,    // 止まった後にふらつく時間（とどめの時はふらつかない）
        FINISH_SLOW_RATE: 2.5,  // 必殺技がとどめになった時、動きを何倍ゆっくりにするか
        FINISH_VOICE_RATE: 0.7, // その時の「どすこい」の再生速度（1で通常、小さいほどゆっくり。声の高さは変わらない）
        FINISH_ZOOM_MAX: 2.2,   // その時にカメラを寄せる最大倍率
        SPECIAL_POSE_MS: 600    // ぶちかまし・掴み投げの技を出した側の構えを見せる時間
    }
};

/* =========================================================
   共通ユーティリティ（全スクリプトから利用）
   ========================================================= */

// CONFIG の値をドット区切りパスで安全に取得する。
// 指定パスが未定義/null の場合のみ fallback を返す（0 や false はそのまま採用）。
// 例: cfg('GAME_RULES.HIT_DIST', 100) === (CONFIG.GAME_RULES && CONFIG.GAME_RULES.HIT_DIST) ? ... : 100
function cfg(path, fallback) {
    let v = CONFIG;
    const parts = path.split('.');
    for (let i = 0; i < parts.length; i++) {
        if (v == null || v[parts[i]] === undefined || v[parts[i]] === null) return fallback;
        v = v[parts[i]];
    }
    return v;
}

// スピード(1〜10)に応じたプレビューアニメの再生秒数（力士選択・編成プレビュー共通）
const SPEED_ANIM_DURATIONS = [1.75, 1.50, 1.35, 1.20, 1.05, 0.90, 0.75, 0.60, 0.45, 0.30];
function speedAnimDuration(speed) {
    const idx = Math.max(0, Math.min((speed || 5) - 1, 9));
    return SPEED_ANIM_DURATIONS[idx];
}

// ============================================================
// ■ 体画像（衣装）の出し分け
// ------------------------------------------------------------
// スプレッドシートの「衣装」列で、力士ごとの体画像を切り替える。
//
// 下の対応表にある値を書くと rikishi<p1|p2><接尾辞>.png が使われる。
//   例) 衣装列に「ドレス」→ rikiship1doresu.png / rikiship2doresu.png
// 空欄なら通常のまわし姿 rikiship1.png / rikiship2.png になる。
//
// 衣装を増やすときは、画像を assets/img に置いてこの表へ1行足すだけでよい。
//   例) ' 紋付': 'montsuki' → rikiship1montsuki.png を用意する
// ============================================================
const COSTUME_BODY_SUFFIX = {
    'まわし': '',        // 通常のまわし姿（rikiship1.png / rikiship2.png）
    'ドレス': 'doresu'
};

// 「衣装」列がまだ無いスプレッドシート向けの予備判定。
// 衣装列に値が入っている力士では、こちらは参照されない。
const DRESS_NAME_PREFIXES = ['北居の星'];

// その力士が使う体画像の接尾辞を返す（通常のまわし姿なら空文字）
function costumeSuffix(charData) {
    if (!charData) return '';

    const costume = (charData.costume || '').trim();
    if (costume) return COSTUME_BODY_SUFFIX[costume] || '';

    // 衣装列が未設定の場合のみ、名前の先頭一致で判定する
    const name = charData.name || '';
    return DRESS_NAME_PREFIXES.some(prefix => name.startsWith(prefix))
        ? COSTUME_BODY_SUFFIX['ドレス']
        : '';
}

function usesDressBody(charData) {
    return costumeSuffix(charData) === COSTUME_BODY_SUFFIX['ドレス'];
}

/**
 * 力士の体画像のファイル名を決める。
 *   playerId : 'p1' | 'p2'（詳細表示など、それ以外の値は p2 の見た目を使う）
 *   isCPU    : CPU操作なら true（CPU専用の体を使うため衣装は反映しない）
 *   charData : RIKISHI_DATA の1件
 */
function bodyImageFile(playerId, isCPU, charData) {
    if (isCPU) return 'rikishiCPU.png';
    // updatePreview は 'detailview' のようなプレイヤー以外の識別子でも呼ばれる。
    // 存在しないファイル名を組み立てないよう、p1以外はすべてp2の体に寄せる。
    const side = (playerId === 'p1') ? 'p1' : 'p2';
    return `rikishi${side}${costumeSuffix(charData)}.png`;
}

// ============================================================
// ■ 力士ごとの専用背景
// ------------------------------------------------------------
// 顔画像の名前に「bs_」を付けた画像を assets/img に置くと、
// その力士の背景として自動で使われる（コードの変更は不要）。
//   例) 顔が hino2.png なら、背景は bs_hino2.png
// 置いていない力士は、従来どおりタイプ別（パワー・スピード等）の背景になる。
// アイコン・力士カード・団体戦の枠のすべてに反映される。
//
// 仕組み: 専用背景とタイプ別背景を重ねて指定し、専用背景が無ければ
// その層が空になって下のタイプ別背景が見える。ブラウザはフォルダの中身を
// 調べられないため、この方法で「置いたら反映」を実現している。
// ============================================================
const CUSTOM_BG_PREFIX = 'bs_';

// 命名規則に合わない背景を使いたい時だけ、ここに書く（キーは顔画像のファイル名）。
// スプレッドシートに「背景画像」列があれば、そちらが最優先になる。
const CUSTOM_BACKGROUNDS = {
    // 'hino1.png': 'special_bg.png'
};

/**
 * その力士の背景画像を、上に重ねる順で返す。
 * [専用背景, タイプ別背景]。専用背景が実在しなければ下の層が見える。
 */
function charBgFiles(charData) {
    const files = [];
    // 自作力士の顔は画像データそのもの（data:〜）なので、ファイル名から専用背景は探さない
    const isDataImg = (charData.img || '').startsWith('data:');
    const imgName = isDataImg ? '' : (charData.img || '').split('/').pop();   // パス付きで渡る場合もある
    const explicit = (charData.bgImage || '').trim() || CUSTOM_BACKGROUNDS[imgName];
    if (explicit) files.push(explicit);
    else if (imgName && CUSTOM_BG_PREFIX) files.push(CUSTOM_BG_PREFIX + imgName);

    const typeBg = charTypeAssets(charData).bg;
    if (typeBg) files.push(typeBg);
    return files;
}

/** background-image にそのまま入れられる形で返す */
function charBgCss(charData) {
    // 入門で背景を単色にした新弟子は、その色だけにする（模様の画像は使わない）
    if (charData && charData.bgColor) return `linear-gradient(${charData.bgColor}, ${charData.bgColor})`;
    return charBgFiles(charData).map(f => `url('assets/img/${f}')`).join(', ');
}

// タイプ(desc)＋カテゴリから、背景画像ファイル名とタイプアイコン名を決定する。
// いずれのタイプにも一致しない場合は bg:'' を返す（呼び出し側で必要に応じてフォールバック）。
function charTypeAssets(charData) {
    const isLegend = (charData.category === "レジェンド");
    const desc = charData.desc || "";

    let typed;
    if (desc.includes('パワー'))          typed = { bg: isLegend ? 'chikara2_bg.png' : 'chikara1_bg.png', typeImg: 'TypePower.png' };
    else if (desc.includes('スピード'))   typed = { bg: isLegend ? 'hayasa2_bg.png'  : 'hayasa1_bg.png',  typeImg: 'TypeSpeed.png' };
    else if (desc.includes('テクニック')) typed = { bg: isLegend ? 'gizyutu2_bg.png' : 'gizyutu1_bg.png', typeImg: 'TypeTech.png' };
    else if (desc.includes('バランス'))   typed = { bg: isLegend ? 'baransu2_bg.png' : 'baransu1_bg.png', typeImg: 'TypeBalance.png' };
    else                                  typed = { bg: '', typeImg: 'TypeBalance.png' };

    // 専用背景の重ね合わせは charBgFiles / charBgCss で行う
    return typed;
}

// ============================================================
// ■ 強さ・タイプ・コストの計算（スプレッドシートの式と同じ）
// ------------------------------------------------------------
// 新力士入門（自作力士）で使う。スプシの既存力士もこの式で強さが決まっている。
//   強さ = (チカラ×5.5 + ギジュツ×3.5 + ハヤサ×2 + タイリョク×2 + キモチ + ギャクテン) ÷ 150 × 100
//   タイプ = チカラ・ギジュツ・ハヤサのうち、他の2つより1以上高いものがあればそのタイプ、無ければバランス
// ============================================================
const STRENGTH_WEIGHTS = { power: 5.5, tech: 3.5, speed: 2, stamina: 2, spirit: 1, reversal: 1 };
const STAT_KEYS = ['power', 'tech', 'speed', 'stamina', 'spirit', 'reversal'];

function calcStrength(s) {
    const sum = STAT_KEYS.reduce((t, k) => t + (Number(s[k]) || 0) * STRENGTH_WEIGHTS[k], 0);
    return Math.round(sum / 150 * 100);
}

function calcPlayType(s) {
    const p = Number(s.power) || 0, t = Number(s.tech) || 0, sp = Number(s.speed) || 0;
    if (p >= t + 1 && p >= sp + 1) return 'パワー';
    if (t >= p + 1 && t >= sp + 1) return 'テクニック';
    if (sp >= p + 1 && sp >= t + 1) return 'スピード';
    return 'バランス';
}

/**
 * 能力調整（個人戦の試験的なルール）：力士の特徴を残したまま、強さを 49〜51 にそろえる（表示は50）。
 *   1. 6つの能力に同じ数を足す・引く（能力どうしの差がそのまま残るので、得意・不得意も型も変わらない）
 *      強い力士は全体に下がり、弱い力士は全体に上がる
 *   2. それでも 49〜51 に入らない分は、能力を1〜数個だけ ±1 して合わせる。
 *      その時は「タイプが変わらない」「能力の高い低いの順番がなるべく崩れない」組み合わせを選ぶ
 * 返り値は能力6つ（power〜reversal）の入ったオブジェクト。強さは必ず 49〜51（51 を超えない）。
 */
const ADJUST_MIN = 49, ADJUST_MAX = 51;

function adjustToStrength(src) {
    const base = {};
    STAT_KEYS.forEach(k => { base[k] = Math.max(1, Math.min(10, Number(src[k]) || 1)); });
    const clamp = v => Math.max(1, Math.min(10, v));
    const typeOf = s => calcPlayType(s);
    const baseType = typeOf(base);

    // 能力の高い低いの順番が、元とどれだけ食い違っているか（同点になる・入れ替わる組の数）
    const inversions = (t) => {
        let n = 0;
        for (let i = 0; i < STAT_KEYS.length; i++) {
            for (let j = i + 1; j < STAT_KEYS.length; j++) {
                const a = STAT_KEYS[i], b = STAT_KEYS[j];
                if (Math.sign(base[a] - base[b]) !== Math.sign(t[a] - t[b])) n++;
            }
        }
        return n;
    };

    // 1. 全体を同じ数だけずらす：強さが 50 に一番近くなるずらし方
    let shifted = null, shiftedGap = Infinity;
    for (let c = -9; c <= 9; c++) {
        const t = {};
        STAT_KEYS.forEach(k => { t[k] = clamp(base[k] + c); });
        const gap = Math.abs(calcStrength(t) - 50) + (calcStrength(t) > ADJUST_MAX ? 0.5 : 0);
        if (gap < shiftedGap) { shifted = t; shiftedGap = gap; }
    }

    // 2. 49〜51 に入るまで、能力を ±1 する組み合わせを探す（変える数が少なく、特徴を崩さないものほど良い）
    let best = null, bestCost = Infinity;
    const score = (t, steps) => {
        const s = calcStrength(t);
        if (s < ADJUST_MIN || s > ADJUST_MAX) return Infinity;
        if (typeOf(t) !== baseType) return Infinity;   // タイプは変えない
        // 1つの能力を大きく動かすほど特徴が崩れるので、動かした量の2乗で数える（少しずつ散らす方が良い）
        let moved = 0;
        STAT_KEYS.forEach(k => { const d = t[k] - shifted[k]; moved += d * d; });
        return moved + inversions(t) * 3 + Math.abs(s - 50) * 0.5;
    };
    const search = (t, steps, from) => {
        const c = score(t, steps);
        if (c < bestCost) { bestCost = c; best = { ...t }; }
        if (steps >= 4) return;
        for (let i = from; i < STAT_KEYS.length * 2; i++) {
            const k = STAT_KEYS[i >> 1], d = (i & 1) ? -1 : 1;
            const v = t[k] + d;
            if (v < 1 || v > 10) continue;
            t[k] = v;
            search(t, steps + 1, i);
            t[k] -= d;
        }
    };
    search({ ...shifted }, 0, 0);

    // 念のため：見つからない時（ほぼ無いはず）は、タイプを問わず 49〜51 に入る一番近い形にする
    if (!best) {
        best = { ...shifted };
        for (let guard = 0; guard < 60 && calcStrength(best) > ADJUST_MAX; guard++) {
            const k = STAT_KEYS.filter(x => best[x] > 1).sort((a, b) => best[a] - best[b])[0];
            if (!k) break; best[k]--;
        }
        for (let guard = 0; guard < 60 && calcStrength(best) < ADJUST_MIN; guard++) {
            const k = STAT_KEYS.filter(x => best[x] < 10 && calcStrength({ ...best, [x]: best[x] + 1 }) <= ADJUST_MAX)
                .sort((a, b) => best[b] - best[a])[0];
            if (!k) break; best[k]++;
        }
    }
    return best;
}

// 団体戦のコスト（既存力士の強さとコストの対応に合わせた段階）
function costFromStrength(str) {
    if (str >= 85) return 6;
    if (str >= 75) return 5;
    if (str >= 65) return 4;
    if (str >= 60) return 3;
    if (str >= 50) return 2;
    if (str >= 40) return 1;
    return 0;
}

/**
 * コストの八角形バッジのHTML（団体戦・個人戦の力士アイコン、入門の新弟子一覧で共通）。
 *   isLarge : 団体戦の編成枠に出す大きいバッジなら true
 */
function costBadgeHtml(cost, isLarge = false) {
    let bg = '';
    if (cost === '?') bg = '#3f3f46';   // ランダム枠（中身が分からない）
    else if (cost <= 1) bg = '#a1a1aa';
    else if (cost === 2) bg = '#4ade80';
    else if (cost === 3) bg = '#ec4899';
    else if (cost === 4) bg = '#3b82f6';
    else if (cost === 5) bg = '#eab308';
    else bg = '#745399';

    const size = isLarge ? 36 : 28;
    const fontSize = isLarge ? 18 : 14;
    // 編成枠の大きいバッジと、力士一覧の小さいバッジで位置を分ける
    const bottomPos = isLarge ? "13px" : "0px";
    const rightPos  = isLarge ? "13px" : "0px";

    return `
    <div class="cost-badge" style="position:absolute; bottom:${bottomPos}; right:${rightPos}; width:${size}px; height:${size}px; z-index:5; display:flex; align-items:center; justify-content:center; pointer-events:none;">
        <svg width="${size}" height="${size}" viewBox="0 0 100 100" style="position:absolute; top:0; left:0; z-index:-1;">
            <polygon points="30,4 70,4 96,30 96,70 70,96 30,96 4,70 4,30" fill="${bg}" stroke="#000000" stroke-width="8" stroke-linejoin="round" />
        </svg>
        <span style="color:#ffffff; font-size:${fontSize}px; font-weight:900; font-family:'M PLUS Rounded 1c', sans-serif; -webkit-text-stroke:1px #000;">${cost}</span>
    </div>
    `;
}

// 力士選択グリッドの大きさ（横の列数 × 縦の段数）。
// 上の5段（OFFICIAL_ROWS）はスプシの力士、一番下の1段は新力士入門で作った「新弟子」の段。
// 変えるときは css/ui.css の #icon-grid の grid-template-columns も揃えること。
const CHAR_GRID = { COLS: 5, ROWS: 6, OFFICIAL_ROWS: 5 };
CHAR_GRID.SIZE = CHAR_GRID.COLS * CHAR_GRID.ROWS;
CHAR_GRID.OFFICIAL_SIZE = CHAR_GRID.COLS * CHAR_GRID.OFFICIAL_ROWS;   // スプシの力士のマス（ランダム含む）
CHAR_GRID.CUSTOM_START = CHAR_GRID.OFFICIAL_SIZE;                     // 新弟子の段の最初のマス
CHAR_GRID.CUSTOM_COUNT = CHAR_GRID.SIZE - CHAR_GRID.OFFICIAL_SIZE;    // 新弟子の段のマスの数

// 力士選択画面の倍率。横幅で決まる時は「外枠の内側〜カード」と「カード〜アイコン欄」の
// 余白が同じになるように縮める（カードは基準枠より左右へ10pxはみ出している）。
// 数値は css/ui.css の値（外枠16px・カード幅400px・左右-10px・アイコン100px・間隔10px・縮小0.82）。
function selectScreenScale() {
    const FRAME = 16;
    const cardSpan = 1260 + 10 * 2;                                       // 左カードの左端〜右カードの右端
    const gridW = (CHAR_GRID.COLS * 100 + (CHAR_GRID.COLS - 1) * 10) * 0.82;
    const innerGap = (1260 - gridW) / 2 - (400 - 10);                     // カード〜アイコン欄
    const byWidth = (window.innerWidth - FRAME * 2) / (cardSpan + innerGap * 2);
    return Math.min(byWidth, (window.innerHeight - 60) / 900);
}

// スプシの力士の段の一番右下のマスは「ランダム」。選ぶと、スプシの力士から1人を抽選する。
const RANDOM_CHAR_ID = -1;
const RANDOM_CHAR_IMG = 'assets/img/random.png';   // 選曲画面の「ランダム」と同じ画像
const RANDOM_SLOT = { id: RANDOM_CHAR_ID, random: true };
const RANDOM_SLOT_INDEX = CHAR_GRID.OFFICIAL_SIZE - 1;

/**
 * ランダムのマスが選ばれた時に、実際の力士を抽選して ID を返す。
 * accept で候補を絞れる（団体戦の重複・コスト上限など）。候補がいなければ null。
 * 新弟子は抽選に入れない（スプシの力士だけから選ぶ）。
 */
function pickRandomCharId(accept = () => true) {
    const pool = buildCharGridSlots({ silent: true })
        .filter(d => d && !d.random && !d.custom && d.category !== '空きスロット' && accept(d));
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null;
}

// 力士アイコンをグリッドへ配置する共通ロジック。
// 並び順は Characters シートの ID で決まる（ID 0 が左上、以降が右へ）。
// 空き番号をつくれば、その位置をマスごと空けられる。
// ID が空欄の行は準備中の力士として扱い、マスには出さない。
// スプシの力士の段の右下はランダム用に空けておく（力士に使えるIDは 0〜OFFICIAL_SIZE-2）。
// 一番下の段は新弟子（作った順に左から）。
function buildCharGridSlots({ silent = false } = {}) {
    const gridSlots = new Array(CHAR_GRID.SIZE).fill(null);
    gridSlots[RANDOM_SLOT_INDEX] = RANDOM_SLOT;
    const unplaced = [];
    const conflicts = [];   // IDが重複していて指定位置に置けなかった力士
    const noId = [];        // IDが範囲外の力士

    RIKISHI_DATA.forEach(d => {
            if (d.draft || d.custom) return;
            const valid = Number.isFinite(d.id) && d.id >= 0 && d.id < RANDOM_SLOT_INDEX;
            if (valid && gridSlots[d.id] === null) {
                gridSlots[d.id] = d;
                return;
            }
            if (valid) conflicts.push(`${d.name}(ID${d.id}は${gridSlots[d.id].name}が使用中)`);
            else noId.push(d.name);
            unplaced.push(d);
        });

    // 指定通りに置けなかった力士は空きマスへ順に流し込まれる。
    // 静かに位置がずれると気づきにくいため、原因をコンソールへ出す。
    if (!silent && (conflicts.length || noId.length)) {
        console.warn(
            'スプレッドシートのID指定に問題があります。空いているマスへ自動配置しました。\n'
            + (conflicts.length ? `  重複: ${conflicts.join(' / ')}\n` : '')
            + (noId.length ? `  範囲外: ${noId.join(' / ')}\n` : '')
            + `  Charactersシートの ID 列（0〜${RANDOM_SLOT_INDEX - 1}で重複なし。右下はランダム用）を見直してください。`
        );
    }

    let idx = 0;
    for (let i = 0; i < CHAR_GRID.OFFICIAL_SIZE; i++) {
        if (gridSlots[i] === null && idx < unplaced.length) gridSlots[i] = unplaced[idx++];
    }

    // 新弟子の段
    RIKISHI_DATA.filter(d => d.custom).slice(0, CHAR_GRID.CUSTOM_COUNT)
        .forEach((d, i) => { gridSlots[CHAR_GRID.CUSTOM_START + i] = d; });
    return gridSlots;
}

/** そのマスが新弟子の段（空きマス含む）かどうか */
function isCustomRowIndex(i) {
    return i >= CHAR_GRID.CUSTOM_START && i < CHAR_GRID.SIZE;
}

if (typeof module !== 'undefined') module.exports = CONFIG;