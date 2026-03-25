/**
 * ai.js
 * AIController Class Ver 4.6.1
 * 【完全統合版】戦術維持 ＋ ぶちかまし再タップ ＋ HP1決着
 */
class AIController {
    constructor() {
        this.aiKeys = new Set();
        this.actionTimer = 0;   
        this.thinkTimer = 0;    
        
        this.effectiveType = null; 
        
        // 戦術状態管理 (Ver 3.7 継承)
        this.tacticState = null; // 'feint_fwd', 'feint_back', 'wait' など
        this.tacticTimer = 0;

        // ★追加: タップ状態管理用（既存の挙動を壊さないための最小限の追加）
        this.buchiTap = false; 
    }

    reset() {
        this.effectiveType = null;
        this.tacticState = null;
        this.tacticTimer = 0;
        this.aiKeys.clear();
        this.actionTimer = 0;
        this.thinkTimer = 0;
        this.buchiTap = false;
    }

    getAIParam(level, paramName) {
        const key = `AI_LV${level}_${paramName.toUpperCase()}`;
        if (CONFIG.AI && CONFIG.AI[key] !== undefined) return CONFIG.AI[key];
        const defaults = { REACTION: 30, MISTAKE: 0.3, ACCURACY: 0.4, INASHIRATE: 0.2 };
        return defaults[paramName.toUpperCase()] || 0;
    }

    determineType(baseType) {
        if (this.effectiveType) return this.effectiveType;
        if (baseType === '変則') {
            const types = ['力押し', '技狙い', '素直'];
            this.effectiveType = types[Math.floor(Math.random() * types.length)];
        } else {
            const validTypes = ['力押し', '技狙い', '素直'];
            this.effectiveType = validTypes.includes(baseType) ? baseType : '素直';
        }
        return this.effectiveType;
    }

    think(me, opp, grapple) {
        // 自滅防止
        if (me.stun > 0 || me.isThrown || me.isDefeated) {
            this.aiKeys.clear();
            this.actionTimer = 0;
            this.tacticState = null;
            return this.aiKeys;
        }

        // 戦術アクション（フェイント等）実行中
        if (this.tacticState && this.tacticTimer > 0) {
            this.executeTactic(me, opp);
            return this.aiKeys;
        }

        // アクション継続中
        if (this.actionTimer > 0) {
            this.actionTimer--;
            // ★重要：チャージ維持（actionTimerによる待機中も下キーを離さない）
            if (me.charge > 0 && grapple.active) this.aiKeys.add(me.controls.d);
            return this.aiKeys;
        }

        const type = this.determineType(me.baseStats.aiType);
        const level = me.cpuLevel || 3;

        // 思考ウェイト
        if (this.thinkTimer > 0) {
            this.thinkTimer--;
            // 思考停止中もチャージを維持
            if (me.charge > 0 && grapple.active) return this.aiKeys;
            return this.aiKeys;
        }
        
        const reactionBase = this.getAIParam(level, 'REACTION');
        this.thinkTimer = Math.max(1, reactionBase - (level * 2) + Math.floor(Math.random()*5)); // ★元に戻す
        this.aiKeys.clear();

        if (grapple.active) {
            this.thinkGrapple(me, opp, grapple, level, type);
            return this.aiKeys;
        }

        this.thinkNormal(me, opp, level, type);
        return this.aiKeys;
    }

    // =========================================================================
    // 戦術シーケンスの実行 (完全維持)
    // =========================================================================
    executeTactic(me, opp) {
        this.tacticTimer--;
        this.aiKeys.clear();
        const k = me.controls;
        const facingRight = me.x < opp.x;
        const keyFwd = facingRight ? k.r : k.l;
        const keyBack = facingRight ? k.l : k.r;

        if (this.tacticState === 'feint_fwd') {
            this.aiKeys.add(keyFwd);
            if (this.tacticTimer <= 0) {
                this.tacticState = 'feint_back';
                this.tacticTimer = 15; 
            }
        }
        else if (this.tacticState === 'feint_back') {
            this.aiKeys.add(keyBack);
            if (this.tacticTimer <= 0) this.tacticState = null; 
        }
        else if (this.tacticState === 'wait') {
            if (this.tacticTimer <= 0) this.tacticState = null;
        }
    }

    // =========================================================================
    // 通常時のロジック (完全維持)
    // =========================================================================
    thinkNormal(me, opp, level, type) {
        const dist = Math.abs(me.x - opp.x);
        const hitDist = (CONFIG.GAME_RULES && CONFIG.GAME_RULES.HIT_DIST) ? CONFIG.GAME_RULES.HIT_DIST : 100;
        const isTouching = dist <= hitDist + 20; 
        const k = me.controls;
        const facingRight = me.x < opp.x;
        const keyFwd = facingRight ? k.r : k.l;
        const keyBack = facingRight ? k.l : k.r;

        if (opp.isPushing && dist < 150) {
            let inashiProb = 0.1; 
            if (type === '力押し') inashiProb = 0.02;
            if (type === '技狙い') inashiProb = 0.35 + (level * 0.03); 
            if (type === '素直')   inashiProb = 0.15 + (level * 0.02);
            if (Math.random() < inashiProb) { this.setAction(k.u, 5); return; }
        }

        if (opp.stamina < 15 && me.stamina > 10 && dist < 300) {
            this.setAction(keyFwd, 20); 
            return;
        }

        if (type === '力押し') {
            if (me.stamina < 20 && isTouching) { this.setAction(keyBack, 10); }
            else { this.setAction(keyFwd, 15); }
        }
        else if (type === '技狙い') {
            if (!isTouching && dist < 300 && dist > 150) {
                const rand = Math.random();
                if (rand < 0.2) { this.tacticState = 'feint_fwd'; this.tacticTimer = 8; return; }
                else if (rand < 0.4) { this.tacticState = 'wait'; this.tacticTimer = 30; return; }
            }
            if (!isTouching) {
                if (me.charge < 100) this.setAction(k.d, 10);
                else this.setAction(keyFwd, 10);
            } else {
                if (opp.charge > 80 && me.stamina < 50) this.setAction(keyBack, 10);
                else {
                    if (me.stamina > 40) this.setAction(k.d, 5);
                    else this.setAction(keyFwd, 5);
                }
            }
        }
        else { 
            if (me.stamina < 30) {
                if (!isTouching) this.setAction(k.d, 10);
                else this.setAction(keyBack, 10);
                return;
            }
            if (!isTouching) {
                if (me.charge < 50) this.setAction(k.d, 10);
                else this.setAction(keyFwd, 20);
            } else {
                this.setAction(keyFwd, 10);
            }
        }
    }

    // =========================================================================
    // 組み合い（寄り）中のロジック (Ver 4.6 修正版)
    // =========================================================================
    thinkGrapple(me, opp, grapple, level, type) {
        const isMaster = (grapple.master === me);
        const k = me.controls;
        const facingRight = me.x < opp.x;
        const keyFwd = facingRight ? k.r : k.l;
        const stageL = (CONFIG.SYSTEM && CONFIG.SYSTEM.GAME_RULES_RING_EDGE_LEFT) || 115;
        const stageR = (CONFIG.SYSTEM && CONFIG.SYSTEM.GAME_RULES_RING_EDGE_RIGHT) || 1085;

        // ★HP1決着ロジック (完全維持)
        if (me.stamina <= 1.1 || opp.stamina <= 1.1) {
            this.setAction(keyFwd, 10);
            return;
        }

        // 移動チャージ（ブルドーザー）ヘルパー
        const bulldozerPush = (techKey, duration) => {
            this.setAction(techKey, duration);
            this.aiKeys.add(k.d); 
        };

        if (isMaster) {
            if (me.stamina < 10) return; 
            const oppEdge = (opp.x < stageL + 280 || opp.x > stageR - 280);
            
            if (oppEdge && level >= 4 && (type === '技狙い' || type === '力押し')) {
                 if (Math.random() < 0.3) return; 
            }

            if (type === '力押し') {
                if (me.charge >= 50) {
                    // ▼▼▼ 修正点：ぶちかまし「再入力」ロジック ▼▼▼
                    if (!this.buchiTap) {
                        // 1フレームだけ前キーを離す（KeyDownを発生させるためのタメ）
                        this.aiKeys.delete(keyFwd);
                        this.aiKeys.add(k.d); // チャージは絶対離さない
                        this.buchiTap = true;
                        this.actionTimer = 1; // 1フレーム後に think を再発動
                    } else {
                        // 次のフレームで前キーを叩き直す！
                        this.setAction(keyFwd, 5);
                        this.aiKeys.add(k.d); 
                        this.buchiTap = false; // タップ完了
                    }
                    // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
                } else {
                    this.buchiTap = false;
                    if (me.charge > 0 || Math.random() < 0.5) {
                        bulldozerPush(keyFwd, 5); 
                    } else {
                        this.setAction(keyFwd, 10); 
                    }
                }
            }
            else if (type === '技狙い') {
                if (me.charge >= 100) { this.setAction(k.u, 5); this.aiKeys.add(k.d); }
                else { 
                    if (me.stamina > 50) this.setAction(k.d, 5);
                    else this.setAction(keyFwd, 5);
                }
            }
            else { 
                if (me.charge >= 80) { this.setAction(k.u, 5); this.aiKeys.add(k.d); }
                else this.setAction(keyFwd, 10);
            }
        }
        else {
            if (type === '技狙い') {
                if (me.charge >= 100) { this.setAction(k.u, 5); this.aiKeys.add(k.d); }
                else this.setAction(k.d, 3);
            }
            else {
                //Slave側のぶちかまし脱出
                if (me.charge >= 50) {
                    if (!this.buchiTap) {
                        this.aiKeys.delete(keyFwd);
                        this.aiKeys.add(k.d);
                        this.buchiTap = true;
                        this.actionTimer = 1;
                    } else {
                        this.setAction(keyFwd, 5);
                        this.aiKeys.add(k.d);
                        this.buchiTap = false;
                    }
                } else {
                    this.buchiTap = false;
                    bulldozerPush(keyFwd, 5); 
                }
            }
        }
    }

    setAction(key, duration) {
        if(key) this.aiKeys.add(key);
        this.actionTimer = duration; 
    }
}