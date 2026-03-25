/**
 * ai.js
 * AIController Class
 * "思考"パラメータに基づいた行動決定を行うクラス
 */
class AIController {
    constructor() {
        this.aiKeys = new Set();
        this.actionTimer = 0;   
        this.thinkTimer = 0;    
        this.currentPersonality = '素直'; 
        
        this.targetCharge = 0; 
        this.chargeKey = null;
        this.chargeMoveIntent = null;
    }

    reset() {
        this.currentPersonality = null;
        this.targetCharge = 0;
        this.chargeKey = null;
        this.chargeMoveIntent = null;
        this.aiKeys.clear();
        this.actionTimer = 0;
        this.thinkTimer = 0;
    }

    /**
     * CONFIGからAIパラメータを取得するヘルパー
     */
    getAIParam(level, paramName) {
        // キー例: LV3_REACTION
        const key = `AI_LV${level}_${paramName.toUpperCase()}`;
        if (CONFIG.AI && CONFIG.AI[key] !== undefined) {
            return CONFIG.AI[key];
        }
        // デフォルト値 (Lv3相当)
        const defaults = {
            REACTION: 30, MISTAKE: 0.3, ACCURACY: 0.4, INASHIRATE: 0.2
        };
        return defaults[paramName.toUpperCase()] || 0;
    }

    think(me, opp, grapple) {
        if (this.actionTimer > 0) {
            this.actionTimer--;
            return this.aiKeys;
        }

        const level = me.cpuLevel || 3;
        const reactionTime = this.getAIParam(level, 'REACTION'); // 反応速度

        if (this.thinkTimer > 0) {
            this.thinkTimer--;
            return this.aiKeys;
        }
        
        this.thinkTimer = reactionTime;
        this.aiKeys.clear();

        // 組み合い中
        if (grapple.active) {
            this.thinkGrapple(me, opp, grapple, level);
            return this.aiKeys;
        }

        // 通常時
        this.thinkNormal(me, opp, level);
        return this.aiKeys;
    }

    thinkNormal(me, opp, level) {
        const dist = Math.abs(me.x - opp.x);
        const hitDist = (CONFIG.GAME_RULES && CONFIG.GAME_RULES.HIT_DIST) ? CONFIG.GAME_RULES.HIT_DIST : 100;
        const isTouching = dist <= hitDist;
        const facingRight = me.x < opp.x;
        const k = me.controls;
        
        // パラメータ取得
        const mistakeRate = this.getAIParam(level, 'MISTAKE');
        const inashiRateBase = this.getAIParam(level, 'INASHIRATE');
        
        // ミス判定
        if (Math.random() < mistakeRate) {
            // 何もしない、またはランダムなキーを押す
            if (Math.random() < 0.5) return;
        }

        // いなし判定
        const oppAttacking = opp.isPushing;
        if (oppAttacking && isTouching) {
            if (Math.random() < inashiRateBase) {
                this.setAction(k.u, 10);
                return;
            }
        }

        // 基本行動決定
        const type = me.baseStats.aiType || '素直';
        
        // 前進キー
        const keyFwd = facingRight ? k.r : k.l;

        // タイプ別ロジック
        if (type === '慎重') {
            if (!isTouching) this.setAction(keyFwd, 20);
            else if (me.charge < 100) this.setChargeGoal(100, k.d);
            else this.setAction(keyFwd, 10);
        }
        else if (type === '好戦的' || type === '力押し') {
            if (!isTouching) this.setAction(keyFwd, 15);
            else this.setAction(keyFwd, 5); 
        }
        else { // 素直、バランス
            if (!isTouching) this.setAction(keyFwd, 20);
            else {
                if (me.charge < 50) this.setChargeGoal(50, k.d);
                else this.setAction(keyFwd, 10);
            }
        }
    }

    thinkGrapple(me, opp, grapple, level) {
        const isMaster = (grapple.master === me);
        const k = me.controls;
        const accuracy = this.getAIParam(level, 'ACCURACY');

        // 正確性判定
        if (Math.random() > accuracy) return; // 棒立ち

        if (isMaster) {
            // 攻め手: チャージして押すか、投げる
            if (me.charge >= 100) {
                // 必殺投げ
                this.setAction(k.u, 5); 
            } else {
                // 押す
                const facingRight = me.x < opp.x;
                const keyFwd = facingRight ? k.r : k.l;
                this.setAction(keyFwd, 5);
            }
        } else {
            // 受け手: いなし、またはチャージして対抗
            if (Math.random() < 0.3) {
                this.setAction(k.u, 5); // いなし試行
            } else {
                this.setChargeGoal(100, k.d); // チャージ抵抗
            }
        }
    }

    setAction(key, duration) {
        if(key) this.aiKeys.add(key);
        this.actionTimer = duration;
    }

    setChargeGoal(target, key) {
        this.targetCharge = target;
        this.chargeKey = key;
        this.aiKeys.add(key);
        this.actionTimer = 5; 
    }
}