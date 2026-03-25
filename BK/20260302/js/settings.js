/**
 * SettingsManager
 */
class SettingsManager {
    constructor() {
        this.defaultSettings = {
            volume: { bgm: 100, se: 100, voice: 100 }, 
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
        this.backup = null;
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
        const bgmSlider = document.getElementById('setting-bgm');
        const bgmVal = document.getElementById('setting-bgm-val');
        if (bgmSlider && bgmVal) {
            bgmSlider.value = this.current.volume.bgm;
            bgmVal.textContent = this.current.volume.bgm;
        }

        const seSlider = document.getElementById('setting-se');
        const seVal = document.getElementById('setting-se-val');
        if (seSlider && seVal) {
            seSlider.value = this.current.volume.se;
            seVal.textContent = this.current.volume.se;
        }

        const voiceSlider = document.getElementById('setting-voice');
        const voiceVal = document.getElementById('setting-voice-val');
        if (voiceSlider && voiceVal) {
            voiceSlider.value = this.current.volume.voice;
            voiceVal.textContent = this.current.volume.voice;
        }

        this.apply();
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
            // 3つの音量をそれぞれ 0.0〜1.0 に変換して audio.js に渡す
            SoundFX.bgmVolume = this.current.volume.bgm / 100;
            SoundFX.seVolume = this.current.volume.se / 100;
            SoundFX.voiceVolume = this.current.volume.voice / 100;

            // BGMがすでに鳴っている場合は即座に音量を更新
            if (typeof SoundFX.updateBGMVolume === 'function') {
                SoundFX.updateBGMVolume();
            }
        }
        // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
    }

   // show() から名前を変更し、IDを 'settings-modal' に修正
    openMenu() {
    const s = document.getElementById('settings-modal');
    if(s) {
        // 開いた瞬間の状態をバックアップ（ディープコピー）
        this.backup = JSON.parse(JSON.stringify(this.current));
        s.classList.add('active');
        this.updateUI();
    }
}

/* closeMenu を修正（勝手に保存しないようにする） */
closeMenu() {
    const s = document.getElementById('settings-modal');
    if(s) s.classList.remove('active');
    // this.save(); は削除！
}
cancelMenu() {
    if (this.backup) {
        // バックアップから元の値を復元
        this.current = JSON.parse(JSON.stringify(this.backup));
        // 音声やUIに即座に反映させる
        this.apply();
        this.updateUI();
    }
    this.closeMenu();
}
    updateUI() {
        const bgmSlider = document.getElementById('setting-bgm');
        const bgmVal = document.getElementById('setting-bgm-val');
        if(bgmSlider && bgmVal) {
            bgmSlider.value = this.current.volume.bgm;
            bgmVal.textContent = this.current.volume.bgm;
        }

        const seSlider = document.getElementById('setting-se');
        const seVal = document.getElementById('setting-se-val');
        if(seSlider && seVal) {
            seSlider.value = this.current.volume.se;
            seVal.textContent = this.current.volume.se;
        }

        const voiceSlider = document.getElementById('setting-voice');
        const voiceVal = document.getElementById('setting-voice-val');
        if(voiceSlider && voiceVal) {
            voiceSlider.value = this.current.volume.voice;
            voiceVal.textContent = this.current.volume.voice;
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