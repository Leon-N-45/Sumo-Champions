/**
 * SettingsManager
 */
class SettingsManager {
    constructor() {
        this.defaultSettings = {
            volume: { master: 100 }, 
            display: { screenSize: 'responsive' }, 
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
                    controls: { 
                        p1: { ...this.defaultSettings.controls.p1, ...parsed.controls?.p1 },
                        p2: { ...this.defaultSettings.controls.p2, ...parsed.controls?.p2 }
                    }
                };
            } catch(e) { console.error(e); }
        }
        this.apply();
    }

    save() {
        localStorage.setItem(this.saveKey, JSON.stringify(this.current));
        this.showToast("設定を保存しました");
    }

    resetDefaults() {
        if(!confirm("設定を初期化しますか？")) return;
        this.current = JSON.parse(JSON.stringify(this.defaultSettings));
        this.save();
        this.apply();
        this.updateUI();
    }

    apply() {
        if(typeof SoundFX !== 'undefined') {
            SoundFX.setVolume(this.current.volume.master / 100);
        }
        if(typeof game !== 'undefined' && game.ui) {
            game.ui.updateControlsDisplay();
        }
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
}

const settings = new SettingsManager();