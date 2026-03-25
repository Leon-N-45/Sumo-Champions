/**
 * SettingsManager
 */
class SettingsManager {
    constructor() {
        this.defaultSettings = {
            volume: { master: 100 }, 
            display: { screenSize: 'responsive' }, 
            dreamUnlocked: false,
            controls: {
                p1: { l: 'KeyA', r: 'KeyD', u: 'KeyW', d: 'KeyS' },
                p2: { l: 'ArrowLeft', r: 'ArrowRight', u: 'ArrowUp', d: 'ArrowDown' }
            }
        };
        this.current = JSON.parse(JSON.stringify(this.defaultSettings));
        this.waitingForKey = null; 
        this.saveKey = 'sumo_cham_settings_v2';
        this.load();
    }

    load() {
        const saved = localStorage.getItem(this.saveKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.current = { ...this.defaultSettings, ...parsed, 
                    volume: { ...this.defaultSettings.volume, ...parsed.volume },
                    display: { ...this.defaultSettings.display, ...parsed.display },
                    dreamUnlocked: parsed.dreamUnlocked || false,
                    controls: { 
                        p1: { ...this.defaultSettings.controls.p1, ...parsed.controls?.p1 },
                        p2: { ...this.defaultSettings.controls.p2, ...parsed.controls?.p2 }
                    }
                };
            } catch(e) { console.error(e); }
        }

        // ▼▼▼ 追加：読み込んだ音量データを設定画面のスライダーに反映させる ▼▼▼
        const volSlider = document.getElementById('setting-volume');
        const volVal = document.getElementById('setting-volume-val');
        if (volSlider && volVal) {
            volSlider.value = this.current.volume.master;
            volVal.textContent = this.current.volume.master;
        }
        // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

        this.apply();
    }

    save() {
        localStorage.setItem(this.saveKey, JSON.stringify(this.current));
        this.showToast("設定を保存しました");
    }

    resetDefaults() {
        // メッセージを少し変更して、リロードされることを伝えると親切です
        if(!confirm("設定を初期化しますか？\n※ページが再読み込みされます")) return;
        
        // 設定をデフォルトに戻して保存
        this.current = JSON.parse(JSON.stringify(this.defaultSettings));
        this.save();
        
        // ▼▼▼ 修正：設定反映のためにページをリロードする ▼▼▼
        location.reload(); 
    }

    apply() {
        // ... (キーバインドや画面サイズなどの既存の適用処理) ...

        // ▼▼▼ 追加：SoundFXが存在していれば実際の音量を変更する ▼▼▼
        if (typeof SoundFX !== 'undefined') {
            // 0〜100 の数値を 0.0〜1.0 に変換
            const vol = this.current.volume.master / 100; 
            
            // パターンA: SoundFXに専用の音量変更メソッドがある場合
            if (typeof SoundFX.setVolume === 'function') {
                SoundFX.setVolume(vol);
            } 
            // パターンB: AudioContext (masterGain) を使っている場合
            else if (SoundFX.masterGain && SoundFX.masterGain.gain) {
                SoundFX.masterGain.gain.value = vol;
            } 
            // パターンC: 直接プロパティとして持っている場合
            else {
                SoundFX.volume = vol;
                if (SoundFX.bgmAudio) SoundFX.bgmAudio.volume = vol;
            }
        }
        // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
    }

   // show() から名前を変更し、IDを 'settings-modal' に修正
    openMenu() {
        const s = document.getElementById('settings-modal');
        if(s) {
            s.classList.add('active');
            this.updateUI();
        }
    }
    
    // close() から名前を変更し、IDを 'settings-modal' に修正
    closeMenu() {
        const s = document.getElementById('settings-modal');
        if(s) s.classList.remove('active');
        this.save();
    }

    updateUI() {
        const volSlider = document.getElementById('vol-master');
        const volVal = document.getElementById('vol-val');
        if(volSlider) {
            volSlider.value = this.current.volume.master;
            volVal.textContent = this.current.volume.master + '%';
            volSlider.oninput = (e) => {
                this.current.volume.master = parseInt(e.target.value);
                volVal.textContent = this.current.volume.master + '%';
                this.apply();
            };
        }
        
        this.updateKeyBtn('p1', 'u'); this.updateKeyBtn('p1', 'd'); this.updateKeyBtn('p1', 'l'); this.updateKeyBtn('p1', 'r');
        this.updateKeyBtn('p2', 'u'); this.updateKeyBtn('p2', 'd'); this.updateKeyBtn('p2', 'l'); this.updateKeyBtn('p2', 'r');
        
        ['p1','p2'].forEach(p => {
            ['u','d','l','r'].forEach(k => {
                const btn = document.getElementById(`key-${p}-${k}`);
                if(btn) btn.onclick = () => this.startKeyConfig(p, k, btn);
            });
        });
    }

    updateKeyBtn(p, k) {
        const btn = document.getElementById(`key-${p}-${k}`);
        if(btn) {
            let code = this.current.controls[p][k];
            code = code.replace('Key', '');
            if (code === 'ArrowUp') code = '↑';
            if (code === 'ArrowDown') code = '↓';
            if (code === 'ArrowLeft') code = '←';
            if (code === 'ArrowRight') code = '→';
            btn.textContent = code;
            btn.classList.remove('waiting');
        }
    }

    startKeyConfig(p, k, btnElement) {
        if(this.waitingForKey) return; 
        this.waitingForKey = { p, k, btn: btnElement };
        btnElement.textContent = "押してください...";
        btnElement.classList.add('waiting');
    }

    handleKeyDown(e) {
        if (!this.waitingForKey) return false;
        e.preventDefault(); e.stopPropagation();
        const { p, k } = this.waitingForKey;
        this.current.controls[p][k] = e.code;
        this.waitingForKey = null;
        this.updateUI();
        return true; 
    }

    showToast(msg) {
        const t = document.getElementById('toast');
        if(t) {
            t.textContent = msg; t.classList.add('visible');
            setTimeout(()=>t.classList.remove('visible'), 2000);
        }
    }
    // ■ 追加: HTMLの「保存して戻る」ボタン用
    saveAndClose() {
        this.save();      // 保存処理
        this.closeMenu(); // 閉じる処理 (前回の修正で作成した関数)
    }

    // ■ 追加: HTMLの「設定を初期化」ボタン用
    confirmReset() {
        // 既存の初期化処理（resetDefaults）を呼び出す
        this.resetDefaults();
    }

/* js/settings.js の中 */

    // ... (他の設定処理) ...

    playSoundTest() {
        // 音声が読み込まれていれば「どすこい」を再生する
        if (typeof SoundFX !== 'undefined') {
            // ※ 'dosukoi' の部分は、実際の音声キー名（またはファイル名）に合わせてください
            SoundFX.playVoice('assets/se/dosukoi'); 
        }
    }
    
}



const settings = new SettingsManager();