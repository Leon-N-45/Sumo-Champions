/**
 * config.js
 * ゲームの設定値、定数、参照URLを管理するファイル
 */

const DATA_URLS = {
    CONFIG: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSvQvaLULzjaLu5XmU5BrsGiuKVjW2I4Gz6M-16NUYVaxsX1V2vrRQWnk6pBdwZy1Sl1N2YMTeyD9q-/pub?gid=1162573541&single=true&output=csv',
    CHARS:  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSvQvaLULzjaLu5XmU5BrsGiuKVjW2I4Gz6M-16NUYVaxsX1V2vrRQWnk6pBdwZy1Sl1N2YMTeyD9q-/pub?gid=1541301449&single=true&output=csv',
    BGM: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSvQvaLULzjaLu5XmU5BrsGiuKVjW2I4Gz6M-16NUYVaxsX1V2vrRQWnk6pBdwZy1Sl1N2YMTeyD9q-/pub?gid=1627618732&single=true&output=csv',
    ALBUMS: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSvQvaLULzjaLu5XmU5BrsGiuKVjW2I4Gz6M-16NUYVaxsX1V2vrRQWnk6pBdwZy1Sl1N2YMTeyD9q-/pub?gid=848223505&single=true&output=csv'
};

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
        BASE_THRUST: 8
    },

    // ■ 物理演算 (PHYSICS_...)
    PHYSICS: {
        GRAVITY: 0.8,
        // ★変更: 速度を上げたので、滑りすぎないよう摩擦を強く(値を小さく)する
        FRICTION: 0.75,         // 元 0.85
        // ★変更: 押し合う力を強くする
        PUSH_POWER_BASE: 3.5,   // 元 2
        SCALE_1: 0.75,
        SCALE_2: 0.85,
        SCALE_3: 1.0,
        SCALE_4: 1.15,
        SCALE_5: 1.3
    },

    // ■ アクション (ACTION_...)
    ACTION: {
        // ★変更: 基本スピードを大幅アップ（ここがキビキビ感の命）
        SPEED_BASE: 8,        // 元 5 (2.8から倍増以上)
        
        MOVE_BACK_RATE: 0.6,
        SPEED_CHARGING_MOD: 0.3,
        CHARGE_BACK_RATE: 0.1,
        
        // ★変更: 衝突時の弾かれ速度を上げ、重さを消す
        REBOUND_VELOCITY: 15,   // 元 8
        
        // ★変更: 硬直時間を短くして、サクサク動けるようにする
        COOLDOWN_TIME: 40,      // 元 60
        INASHI_DURATION_BASE: 20, // 元 30
        INASHI_TECH_MOD: 2,
        STUMBLE_DURATION: 30,   // 元 45
        STUN_TIME_PUSH: 15,     // 元 20
        STUN_TIME_THROW: 30,    // 元 40
        
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

        //PARRY_COST: 10,
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
        THRESHOLDS_SUPER_PUSH: 100, // CHARGE_THRESHOLDS_SUPER_PUSH
        THRESHOLDS_SUPER_SWAP: 100,
        BASE_GAIN: 0.5             // CHARGE_BASE_GAIN
    },

    // ■ AIパラメータ (AI_LV...)
    AI: {
        LV1_ACCURACY: 0.2,
        LV1_MISTAKE: 0.5,
        LV1_REACTION: 60,
        LV1_INASHIRATE: 0.05
    },

    // ■ UI設定 (UI_...)
    UI: {
        DMG_DURATION: 60,
        GYOJI_INTERVAL_MAX: 2500,
        GYOJI_INTERVAL_MIN: 800
    }
};

if (typeof module !== 'undefined') module.exports = CONFIG;