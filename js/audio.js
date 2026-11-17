/**
 * audio.js
 * BGM・効果音・ボイスの再生と3系統（BGM/SE/VOICE）の音量管理を担当
 */
const SoundFX = {
    openingAudio: null,
    charSelectAudio: null, // キャラ選択用Audio
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

    // 選曲画面用の2曲（オープニング・キャラ選択）を事前読み込みする
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

    // 選曲BGMを停止しつつ、ブラウザの自動再生制限を解除（無音で一瞬再生→即停止）する前処理。
    // 個人戦(goToCharSelect)・団体戦(goToTeamSelect)から共通利用。
    unlockSelectBGM() {
        this.stopBGM();
        this.currentRandomBgm = null;
        this.preloadSelectBGMs();
        const unlock = (audioObj) => {
            if (!audioObj) return;
            // ミュートせずに再生すると、止めるまでの一瞬だけ曲の頭が鳴ってしまう
            audioObj.muted = true;
            const playPromise = audioObj.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    // 既に本番のBGMとして鳴らし始めていたら止めない
                    if (this.bgmAudio === audioObj) return;
                    audioObj.pause();
                    audioObj.currentTime = 0;
                    audioObj.muted = false;
                }).catch(() => { audioObj.muted = false; });
            } else {
                audioObj.pause();
                audioObj.muted = false;
            }
        };
        unlock(this.openingAudio);
        unlock(this.charSelectAudio);
    },

    // 試合用BGMの再生（設定・選択・ランダム抽選の優先順で曲を決める）
    playRandomBGM() {
        // フリーズ防止：既に再生中なら何もしない
        if (this.bgmAudio && !this.bgmAudio.paused) {
            return;
        }

        this.stopBGM();

        let targetFile = 'random';

        // config.js で取組中のBGMを1曲に固定している場合は、選曲より優先する
        if (typeof FIXED_BATTLE_BGM !== 'undefined' && FIXED_BATTLE_BGM) {
            targetFile = FIXED_BATTLE_BGM;
        }
        // 優先順位1: セーブデータ (settings)
        else if (typeof settings !== 'undefined' && settings.current && settings.current.bgmFile) {
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
        this.bgmAudio.volume = this.bgmVolume * 0.66;
        this.bgmAudio.loop = true;
        this.bgmAudio.play().catch(e => console.warn("BGM Play Error:", e));

        // 画面に曲名を表示 (トースト)
        if (typeof BGM_DATA !== 'undefined') {
            const track = BGM_DATA.find(b => b.file === targetFile);
            if (track) {
                this.currentTrackName = track.name;
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

    // タイトルでボタンを押した時のボイス。満員御礼は少し出にくくする（どすこい40%・ごっちゃん40%・満員御礼20%）
    pickTitleVoice() {
        const voices = [ { id: 'dosukoi', weight: 40 }, { id: 'gottyan', weight: 40 }, { id: 'maninonrei', weight: 20 } ];
        let pick = Math.random() * voices.reduce((sum, v) => sum + v.weight, 0);
        for (const v of voices) {
            if ((pick -= v.weight) < 0) return v.id;
        }
        return voices[0].id;
    },

    // 選曲画面BGMのランダム再生（オープニング曲かキャラ選択曲を50%で選ぶ）
    playRandomSelectBGM() {
        this.stopBGM();
        this.preloadSelectBGMs();

        const isOpening = Math.random() < 0.5;
        this.bgmAudio = isOpening ? this.openingAudio : this.charSelectAudio;

        this.bgmAudio.currentTime = 0;
        this.bgmAudio.muted = false;   // 自動再生制限の解除で付けたミュートが残らないようにする
        this.updateBGMVolume();
        this.bgmAudio.play().catch(e => console.warn("選曲BGM再生エラー:", e));
    },

    updateBGMVolume() {
        if (this.bgmAudio) {
            this.bgmAudio.volume = this.bgmVolume * 0.66;
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

    // ボイス再生（前の音が鳴っていれば止めて重ならないように管理する）
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
                    // とどめの演出中は、行司の声などもゆっくりにする（声の高さは変えない）
                    if (this.voiceSlowRate && this.voiceSlowRate !== 1) {
                        audio.preservesPitch = true;
                        audio.playbackRate = this.voiceSlowRate;
                    }
                    audio.volume = Math.max(0, Math.min(1, volume * this.voiceVolume));
                    audio.onended = () => { this.testAudio = null; resolve(); };
                    audio.onerror = () => { resolve(); };
                    audio.play().catch(e => { resolve(); });
                } catch(e) { resolve(); }
            });
    },

    /**
     * 掛け声（必殺技の「どすこい」など）を、ほかのボイスと別に最後まで鳴らす。
     * playVoice は新しいボイスで前のボイスを止めるため、取組中に行司の「のこった」が
     * 鳴ると掛け声が途中で切れてしまう。こちらは止めず、止められもしない。
     */
    playShout(name, volume = 1.0) {
        if (!name) return;
        let src = name;
        if (!src.includes('/')) src = 'assets/se/' + src;
        if (!src.toLowerCase().endsWith('.mp3')) src = src + '.mp3';
        try {
            const audio = new Audio(src);
            audio.volume = Math.max(0, Math.min(1, volume * this.voiceVolume));
            audio.play().catch(() => {});
        } catch (e) {}
    },

    /**
     * とどめの演出用：ボイスをゆっくり（低く）再生し、エコーをかける。
     *   rate : 再生速度（0.6 なら6割の速さ。声の高さは変えない）
     * Web Audio を使えない環境では、ゆっくり再生だけ行う。
     */
    async playVoiceDramatic(name, rate = 0.6) {
        if (!name) return;
        let src = name;
        if (!src.includes('/')) src = 'assets/se/' + src;
        if (!src.toLowerCase().endsWith('.mp3')) src = src + '.mp3';

        if (!this.ctx) { try { this.init(); } catch (e) {} }

        // 声の高さを保ったまま、速さだけ遅くする（ブラウザの再生機能を使う）
        const audio = new Audio(src);
        audio.preservesPitch = true;
        audio.playbackRate = rate;

        try {
            if (!this.ctx) throw new Error('no audio context');
            if (this.ctx.state === 'suspended') this.ctx.resume();
            const ctx = this.ctx;
            // 声の長さ（やまびこの間隔に使う）
            if (!(audio.duration > 0)) {
                await new Promise((res) => { audio.onloadedmetadata = res; audio.onerror = res; setTimeout(res, 1500); });
            }
            const source = ctx.createMediaElementSource(audio);

            const vol = Math.max(0, Math.min(1, this.voiceVolume));
            const dry = ctx.createGain(); dry.gain.value = vol;
            // やまびこ：声を言い終わってから、同じ声が遠くからだんだん小さく返ってくる。
            // 返ってくる間隔は声の長さ＋少しの間。返るたびに小さく、少しこもった音にする
            const voiceSec = (audio.duration > 0 ? audio.duration : 1) / rate;
            const gap = Math.min(4.5, voiceSec + 0.12);
            const delay = ctx.createDelay(5.0); delay.delayTime.value = gap;
            const feedback = ctx.createGain(); feedback.gain.value = 0.5;     // 1回返るごとに半分の大きさ
            const muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 2200;
            const wet = ctx.createGain(); wet.gain.value = vol * 0.55;

            source.connect(dry); dry.connect(ctx.destination);
            source.connect(delay); delay.connect(muffle); muffle.connect(feedback); feedback.connect(delay);
            muffle.connect(wet); wet.connect(ctx.destination);
            audio.play().catch(() => {});
            // 4回ほど返ったら、繰り返しの経路を切る（切る前に静かに消しておく）
            audio.onended = () => {
                const now = ctx.currentTime, endAt = now + gap * 4;
                wet.gain.setValueAtTime(wet.gain.value, endAt - gap);
                wet.gain.linearRampToValueAtTime(0, endAt);
            };
            setTimeout(() => {
                try { source.disconnect(); feedback.disconnect(); muffle.disconnect(); delay.disconnect(); wet.disconnect(); dry.disconnect(); } catch (e) {}
            }, (voiceSec + gap * 4) * 1000 + 400);
        } catch (e) {
            audio.volume = Math.max(0, Math.min(1, this.voiceVolume));
            audio.play().catch(() => {});
        }
    },

    // ---------------------------------------------------------------
    // とどめの演出：曲と行司の声を、とどめの間だけゆっくりにする
    // ---------------------------------------------------------------

    /**
     * とどめの演出を始める。曲と行司の声を、音の高さはそのままで遅くする。
     *   rate : 速さ（0.7 なら7割）
     */
    startFinisherAudio(rate = 0.7) {
        this.voiceSlowRate = rate;
        const bgm = this.bgmAudio;
        if (!bgm) return;
        bgm.preservesPitch = true;
        bgm.playbackRate = rate;
    },

    /** とどめの演出を終え、曲と声を元の速さに戻す */
    endFinisherAudio() {
        this.voiceSlowRate = 1;
        if (this.bgmAudio) this.bgmAudio.playbackRate = 1;
    },

    // 再生中のボイス（四股名・開始コール・紹介ボイス等）を止める
    stopVoices() {
        if (this.testAudio) {
            try { this.testAudio.pause(); } catch (e) {}
            this.testAudio = null;
        }
        if (this._hyoshigi) {
            try { this._hyoshigi.pause(); } catch (e) {}
            this._hyoshigi = null;
        }
    },

    playTone(type) {
        // 初戦の選出などまだ ctx 未生成のことがあるため、ここで生成する（キー入力＝ユーザー操作中なので可）
        if(!this.ctx){ try { this.init(); } catch(e) {} }
        if(!this.ctx)return;
        // 稀に AudioContext が suspended のままになり無音化するため、鳴らす直前に再開する
        if(this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') this.ctx.resume();
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

    // いなし音の開始・停止（immediate=true なら即時停止）
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