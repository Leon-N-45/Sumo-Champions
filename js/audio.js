/**
 * audio.js
 * 3系統の音量管理とリアルタイム反映に対応
 */
const SoundFX = {
    openingAudio: null,
    charSelectAudio: null, // ★追加: キャラ選択用Audio
    ctx: null, 
    noiseBuffer: null, 
    activeOsc: {}, 
    activeInashi: {}, 
    selectedBgmFile: 'random', // 初期値
    
    // 各音量を 0.0 〜 1.0 で管理（初期値は最大）
    bgmVolume: 1.0,    
    seVolume: 1.0,     
    voiceVolume: 1.0,  
    bgmAudio: null,
    testAudio: null,

    // ▼▼▼ 変更：2曲を事前読み込み ▼▼▼
    preloadSelectBGMs() {
        if (!this.openingAudio) {
            this.openingAudio = new Audio('assets/bgm/opening.mp3');
            this.openingAudio.preload = 'auto';
            this.openingAudio.loop = true;
            this.openingAudio.load();
        }
        if (!this.charSelectAudio) {
            this.charSelectAudio = new Audio('assets/bgm/charaselect.mp3');
            this.charSelectAudio.preload = 'auto';
            this.charSelectAudio.loop = true;
            this.charSelectAudio.load();
        }
    },

    // ▼▼▼ ここから修正ブロック（既存の PlayRandomBGM などを消してこれを貼る） ▼▼▼

    // メインの再生処理（小文字始まりで定義）
    playRandomBGM() {
        // 1. フリーズ防止：既に再生中なら何もしない
        if (this.bgmAudio && !this.bgmAudio.paused) {
            return;
        }

        this.stopBGM();

        let targetFile = 'random';

        // 優先順位1: セーブデータ (settings)
        if (typeof settings !== 'undefined' && settings.current && settings.current.bgmFile) {
            targetFile = settings.current.bgmFile;
        }
        // 優先順位2: 一時的な選択 (selectedBgmFile)
        else if (this.selectedBgmFile && this.selectedBgmFile !== 'random') {
            targetFile = this.selectedBgmFile;
        }

        // 「random」または未設定なら、リストから抽選
        if (!targetFile || targetFile === 'random') {
            if (typeof BGM_DATA !== 'undefined' && BGM_DATA.length > 0) {
                // opening.mp3 を除外してランダムに選ぶ
                const battleBgms = BGM_DATA.filter(b => b.file !== 'opening.mp3');
                if (battleBgms.length > 0) {
                    const r = battleBgms[Math.floor(Math.random() * battleBgms.length)];
                    targetFile = r.file;
                }
            }
        }

        // ファイル名がなければ終了
        if (!targetFile) return;

        // 再生実行
        this.bgmAudio = new Audio(`assets/bgm/${targetFile}`);
        this.bgmAudio.volume = this.bgmVolume* 0.66;;
        this.bgmAudio.loop = true;
        this.bgmAudio.play().catch(e => console.warn("BGM Play Error:", e));

        // 画面に曲名を表示 (トースト)
        if (typeof BGM_DATA !== 'undefined') {
            const track = BGM_DATA.find(b => b.file === targetFile);
            if (track) {
                // game.ui がある場合
                if (typeof game !== 'undefined' && game.ui && game.ui.showBGMToast) {
                    game.ui.showBGMToast(track.name);
                } 
                // グローバル ui がある場合
                else if (typeof ui !== 'undefined' && ui.showBgmToast) {
                    ui.showBgmToast(track.name);
                }
            }
        }
    },

    // ★エイリアスを追加（大文字で呼ばれても小文字の方を実行する）
    PlayRandomBGM() {
        this.playRandomBGM();
    },

    // ▲▲▲ 修正ブロックここまで ▲▲▲
    // ▼▼▼ 変更：ランダム再生 ▼▼▼
    playRandomSelectBGM() {
        this.stopBGM();
        this.preloadSelectBGMs(); 
        
        // 50%の確率でどちらかの曲を選ぶ
        const isOpening = Math.random() < 0.5;
        this.bgmAudio = isOpening ? this.openingAudio : this.charSelectAudio;
        
        this.bgmAudio.currentTime = 0; 
        this.updateBGMVolume();
        this.bgmAudio.play().catch(e => console.warn("選曲BGM再生エラー:", e));
    },

    updateBGMVolume() {
        if (this.bgmAudio) {
            this.bgmAudio.volume = this.bgmVolume * 0.4;
        }
    },

    

    stopBGM() {
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
            this.bgmAudio = null;
        }
    },

    init() { 
        if(!this.ctx) { 
            this.ctx = new (window.AudioContext||window.webkitAudioContext)(); 
            this.createNoise(); 
        } 
        if(this.ctx.state==='suspended') this.ctx.resume(); 
    },
    
    createNoise() { 
        if(!this.ctx) return; 
        const b = this.ctx.createBuffer(1, this.ctx.sampleRate*2, this.ctx.sampleRate); 
        const d = b.getChannelData(0); 
        for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; 
        this.noiseBuffer = b; 
    },

    // --- 【修正】ボイスとテスト音（重ならないように管理） ---
    playVoice(name, volume = 1.0) { 
        return new Promise((resolve) => {
            if(!name) { resolve(); return; }
            
            // 重要：前のテスト音が鳴っていたら、即座に止める
            if (this.testAudio) {
                this.testAudio.pause();
                this.testAudio = null;
            }

            let src = name;
            if (!src.includes('/')) src = 'assets/se/' + src;
            if (!src.toLowerCase().endsWith('.mp3')) src = src + '.mp3';

            try { 
                const audio = new Audio(src); 
                this.testAudio = audio; // 今回の音を記録
                audio.volume = Math.max(0, Math.min(1, volume * this.voiceVolume));
                audio.onended = () => { this.testAudio = null; resolve(); }; 
                audio.onerror = () => { resolve(); }; 
                audio.play().catch(e => { resolve(); }); 
            } catch(e) { resolve(); }
        });
    },

    playTone(type) { 
        if(!this.ctx)return; 
        const t=this.ctx.currentTime; 
        const o=this.ctx.createOscillator(); 
        const g=this.ctx.createGain(); 
        // seVolume を参照するように変更
        const vol = (type==='parry' ? 0.4 : 0.3) * this.seVolume;
        let isValid = true;
        if(type==='parry'){ 
            o.frequency.setValueAtTime(1200,t); o.frequency.exponentialRampToValueAtTime(2000,t+0.1); 
            g.gain.setValueAtTime(vol, t); 
            g.gain.linearRampToValueAtTime(0.01,t+0.4);
        } else if(type==='reversal'){ 
            o.type='triangle'; o.frequency.setValueAtTime(400,t); o.frequency.linearRampToValueAtTime(800,t+0.5); 
            g.gain.setValueAtTime(vol, t); 
            g.gain.linearRampToValueAtTime(0.01,t+0.3);
        } else if(type==='miss') { 
            o.type='sawtooth'; o.frequency.setValueAtTime(200,t); o.frequency.linearRampToValueAtTime(50,t+0.3); 
            g.gain.setValueAtTime(vol, t); 
            g.gain.linearRampToValueAtTime(0.01,t+0.3);
        } else { isValid = false; }
        if(isValid) {
            o.connect(g); g.connect(this.ctx.destination); 
            o.start(t); o.stop(t+0.5); 
        }
    },

    playHit(isHeavy) { 
        if(!this.ctx||!this.noiseBuffer)return; 
        const t=this.ctx.currentTime; 
        const src=this.ctx.createBufferSource(); 
        src.buffer=this.noiseBuffer; 
        const f=this.ctx.createBiquadFilter(); 
        f.type='lowpass'; f.frequency.value=isHeavy?300:800; 
        const g=this.ctx.createGain(); 
        // seVolume を参照
        const vol = (isHeavy?0.8:0.5) * this.seVolume;
        g.gain.setValueAtTime(vol, t); 
        g.gain.exponentialRampToValueAtTime(0.01, t+(isHeavy?0.4:0.2)); 
        src.connect(f); f.connect(g); g.connect(this.ctx.destination); 
        src.start(t); 
    },

    updateCharge(id, active, level) { 
        if(!this.ctx)return; 
        if(active){ 
            if(!this.activeOsc[id]){ 
                const o=this.ctx.createOscillator(); o.type='sawtooth'; const g=this.ctx.createGain(); const f=this.ctx.createBiquadFilter(); f.type='lowpass'; 
                o.connect(f); f.connect(g); g.connect(this.ctx.destination); o.start(); 
                this.activeOsc[id]={o,g,f}; 
            } 
            const obj=this.activeOsc[id]; 
            const freq = 50 + (level*2); 
            obj.o.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1); 
            obj.f.frequency.setTargetAtTime(freq*2, this.ctx.currentTime, 0.1); 
            // seVolume を参照
            const vol = 0.1 * this.seVolume;
            obj.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1); 
        } else { 
            if(this.activeOsc[id]){ 
                const obj=this.activeOsc[id]; 
                obj.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); 
                setTimeout(()=>{ if(obj.o) obj.o.stop(); }, 200); 
                delete this.activeOsc[id]; 
            } 
        } 
    },

    // --- 【修正】いなし音（seVolume参照） ---
    updateInashi(id, active, immediate = false) {
        if(!this.ctx) return;
        if(active) {
            if(!this.activeInashi[id]) {
                const t = this.ctx.currentTime;
                const o = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                o.type = 'sine';
                o.frequency.setValueAtTime(800, t);
                o.frequency.linearRampToValueAtTime(1200, t + 1.0); 
                // seVolume を参照
                const vol = 0.3 * this.seVolume;
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(vol, t + 0.05);
                o.connect(g);
                g.connect(this.ctx.destination);
                o.start(t);
                this.activeInashi[id] = { o, g };
            }
        } else {
            if(this.activeInashi[id]) {
                const t = this.ctx.currentTime;
                const { o, g } = this.activeInashi[id];
                const timeConst = immediate ? 0.005 : 0.05; 
                g.gain.cancelScheduledValues(t);
                g.gain.setTargetAtTime(0, t, timeConst);
                const stopDelay = immediate ? 0.05 : 0.25;
                setTimeout(()=>{ if(o) o.stop(); }, stopDelay * 1000);
                delete this.activeInashi[id];
            }
        }
    }

    
};