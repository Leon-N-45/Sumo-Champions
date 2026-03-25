// js/team_game.js

class TeamGameManager {
    constructor() {
        console.log("★TeamGameManagerが生成されました！生成時刻:", new Date().getTime());
        this.state = {
            teams: { p1: [null, null, null], p2: [null, null, null] },
            currentIndex: { p1: 0, p2: 0 },
            isPlaying: false,
            isTransitioning: false,

            // シークレット選出画面用の状態管理
            round: 1, 
            usedChars: { p1: [false, false, false], p2: [false, false, false] },
            secretReady: { p1: false, p2: false },
            secretSelection: { p1: null, p2: null }, 
            isSecretPhase: false,

            // ▼ 追加：チームの勝星（スコア）を管理 ▼
            teamWins: { p1: 0, p2: 0 } 
        };
        this.init();
        
        this.handleKeyDown = this.handleKeyDown.bind(this);
        document.addEventListener('keydown', this.handleKeyDown);
    }

    async init() {
        this.ui = new TeamUIManager(this);
        document.body.classList.add('loaded');
    }

    selectTeamChar(player, index, charId) {
        this.state.teams[player][index] = charId;
        this.ui.updateTeamDisplay();
    }

    goToTeamSelect(seType = 'random') {
        if (typeof SoundFX !== 'undefined') {
            SoundFX.stopBGM();
            SoundFX.currentRandomBgm = null;
            SoundFX.preloadSelectBGMs();
            const unlockAudio = (audioObj) => {
                if (!audioObj) return;
                const playPromise = audioObj.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        audioObj.pause();
                        audioObj.currentTime = 0;
                    }).catch(() => {});
                }
            };
            unlockAudio(SoundFX.openingAudio);
            unlockAudio(SoundFX.charSelectAudio);
        }

        if (this.state.isTransitioning) return;
        this.state.isTransitioning = true;

        const curtain = document.getElementById('transition-curtain');
        const gameWrapper = document.getElementById('game-wrapper');
        const isReturningFromGame = gameWrapper && gameWrapper.style.display !== 'none';

        if (seType !== 'none' && !isReturningFromGame) {
            let soundFile = 'dosukoi';
            if (seType === 'random') {
                const sounds = ['dosukoi', 'gottyan', 'maninonrei'];
                soundFile = sounds[Math.floor(Math.random() * sounds.length)];
            } else {
                soundFile = seType;
            }
            const audio = new Audio(`assets/se/${soundFile}.mp3`);
            if (typeof SoundFX !== 'undefined') audio.volume = SoundFX.voiceVolume;
            audio.play().catch(()=>{});
        }

        if (curtain) {
            curtain.classList.add('active');
            setTimeout(() => {
                document.getElementById('start-screen').classList.remove('active');
                if (gameWrapper) gameWrapper.style.display = 'none';
                const resOverlay = document.getElementById('result-overlay');
                if (resOverlay) resOverlay.classList.remove('final-mode', 'visible');

                const secretScreen = document.getElementById('team-secret-screen');
                if (secretScreen) secretScreen.classList.remove('active');
                const teamResult = document.getElementById('team-result-screen');
    if (teamResult) {
        teamResult.classList.remove('active');
        teamResult.style.display = 'none';
    }

                if (isReturningFromGame) {
                    const teamPopover = document.getElementById('team-format-popover');
                    if (teamPopover) teamPopover.classList.remove('active');
                    const soloPopover = document.getElementById('format-popover');
                    if (soloPopover) soloPopover.classList.remove('active');
                    if (typeof settings !== 'undefined' && typeof settings.closeMenu === 'function') settings.closeMenu();
                }

                const teamScreen = document.getElementById('team-select-screen');
                if (teamScreen) {
                    teamScreen.classList.add('active');
                    if (isReturningFromGame) {
                        const fastForward = () => {
                            const anims = teamScreen.getAnimations({ subtree: true });
                            anims.forEach(anim => {
                                if (anim.effect && anim.effect.getTiming().iterations === Infinity) return;
                                try { anim.finish(); } catch(e) {}
                            });
                        };
                        requestAnimationFrame(() => {
                            fastForward();
                            setTimeout(fastForward, 50);
                            setTimeout(fastForward, 150);
                            setTimeout(fastForward, 300); 
                            setTimeout(fastForward, 500);
                        });
                    }
                }
            }, 400);

            setTimeout(() => {
                curtain.classList.remove('active');
                this.state.isTransitioning = false;
                if (typeof SoundFX !== 'undefined') SoundFX.playRandomSelectBGM();
            }, 1500);
        } else {
            document.getElementById('start-screen').classList.remove('active');
            document.getElementById('team-select-screen').classList.add('active');
            this.state.isTransitioning = false;
            if (typeof SoundFX !== 'undefined') SoundFX.playRandomSelectBGM();
        }
    }

    startTeamMatch() {
        document.getElementById('team-select-screen').classList.remove('active');
        this.state.round = 1;
        this.state.usedChars = { p1: [false, false, false], p2: [false, false, false] };
        
        // ▼ 追加：チームの勝星をリセット ▼
        this.state.teamWins = { p1: 0, p2: 0 };
        
        this.showSecretScreen();
    }

    showSecretScreen() {
        this.state.isSecretPhase = true;
        this.state.secretReady = { p1: false, p2: false };
        this.state.secretSelection = { p1: null, p2: null };

        const secretScreen = document.getElementById('team-secret-screen');
        if (secretScreen) secretScreen.classList.add('active');

        const roundNameEl = document.getElementById('secret-round-name');
        const roundNames = ["", "先鋒戦", "中堅戦", "大将戦"];
        if (roundNameEl) roundNameEl.textContent = roundNames[this.state.round] || "延長戦";

        document.getElementById('secret-p1-ready').classList.remove('active');
        document.getElementById('secret-p2-ready').classList.remove('active');

        this.buildSecretPanel('p1');
        this.buildSecretPanel('p2');

        const checkCPU = (player) => {
            const toggle = document.getElementById(`cpu-toggle-${player}`);
            if (toggle && toggle.checked) {
                const unusedIndexes = [0, 1, 2].filter(idx => !this.state.usedChars[player][idx]);
                if (unusedIndexes.length > 0) {
                    const randomIdx = unusedIndexes[Math.floor(Math.random() * unusedIndexes.length)];
                    setTimeout(() => {
                        this.state.secretSelection[player] = randomIdx;
                        this.state.secretReady[player] = true;
                        document.getElementById(`secret-${player}-ready`).classList.add('active');
                        if (typeof SoundFX !== 'undefined') SoundFX.playTone('parry');
                        this.checkSecretReady();
                    }, 500 + Math.random() * 1000);
                }
            }
        };
        checkCPU('p1');
        checkCPU('p2');
    }

    buildSecretPanel(player) {
        const listEl = document.getElementById(`secret-${player}-list`);
        if (!listEl) return;
        listEl.innerHTML = '';

        const team = this.state.teams[player];
        const used = this.state.usedChars[player];
        const controls = typeof settings !== 'undefined' ? settings.current.controls[player] : null;

        const keys = controls ? [controls.l, controls.u, controls.r] : ['A', 'W', 'D'];
        const formatKey = (k) => {
            let name = k.replace('Key', '');
            if(name === 'ArrowLeft') return '←';
            if(name === 'ArrowUp') return '↑';
            if(name === 'ArrowRight') return '→';
            return name;
        };

        team.forEach((charId, index) => {
            const charData = RIKISHI_DATA.find(d => d.id === charId);
            if (!charData) return;

            const isUsed = used[index];
            const row = document.createElement('div');
            row.className = `secret-char-row ${isUsed ? 'used-char' : ''}`;

            const imgSrc = charData.img.includes('/') ? charData.img : `assets/img/${charData.img}`;

            row.innerHTML = `
                <div class="secret-char-icon" style="background-image: url('${imgSrc}')"></div>
                <div class="secret-char-info">${charData.name}</div>
                <div class="secret-key-hint">${formatKey(keys[index])}</div>
            `;
            listEl.appendChild(row);
        });
    }

    handleKeyDown(e) {
        if (!this.state.isSecretPhase) return;
        const controls = typeof settings !== 'undefined' ? settings.current.controls : null;
        if (!controls) return;

        if (!this.state.secretReady.p1) {
            const k = controls.p1;
            let idx = -1;
            if (e.code === k.l) idx = 0;
            else if (e.code === k.u) idx = 1;
            else if (e.code === k.r) idx = 2;

            if (idx !== -1 && !this.state.usedChars.p1[idx]) {
                this.state.secretSelection.p1 = idx;
                this.state.secretReady.p1 = true;
                document.getElementById('secret-p1-ready').classList.add('active');
                if (typeof SoundFX !== 'undefined') SoundFX.playTone('parry'); 
                this.checkSecretReady();
            }
        }

        if (!this.state.secretReady.p2) {
            const k = controls.p2;
            let idx = -1;
            if (e.code === k.l) idx = 0;
            else if (e.code === k.u) idx = 1;
            else if (e.code === k.r) idx = 2;

            if (idx !== -1 && !this.state.usedChars.p2[idx]) {
                this.state.secretSelection.p2 = idx;
                this.state.secretReady.p2 = true;
                document.getElementById('secret-p2-ready').classList.add('active');
                if (typeof SoundFX !== 'undefined') SoundFX.playTone('parry'); 
                this.checkSecretReady();
            }
        }
    }

   checkSecretReady() {
    if (this.state.secretReady.p1 && this.state.secretReady.p2) {
        this.state.isSecretPhase = false;
        setTimeout(() => {
            // ここは関数を呼ぶだけでOK！
            this.transitionToTeamBattle();
        }, 1500); 
    }
}

 transitionToTeamBattle() {
    // 【重要】すでに遷移中なら何もしない（二重実行を完全にブロック）
    if (this.state.isTransitioningBattle) return;
    this.state.isTransitioningBattle = true;

    document.getElementById('team-secret-screen').classList.remove('active');

    const p1Idx = this.state.secretSelection.p1;
    const p2Idx = this.state.secretSelection.p2;
    
    // 正しい位置で確実に記録
    this.state.usedChars.p1[p1Idx] = true;
    this.state.usedChars.p2[p2Idx] = true;

    console.log(`--- Round ${this.state.round} 記録完了 ---`);
    console.log("現在の使用済みリスト:", JSON.stringify(this.state.usedChars));

    const charP1 = this.state.teams.p1[p1Idx];
    const charP2 = this.state.teams.p2[p2Idx];

    if (typeof game !== 'undefined') {
        game.state.chars.p1 = charP1;
        game.state.chars.p2 = charP2;
        game.state.isTeamMode = true; 
        game.teamRound = this.state.round; 
        game.state.matches = 1;
        game.startGame(true);
    }

    // 2秒後にガードを解除（次の試合に備える）
    setTimeout(() => { this.state.isTransitioningBattle = false; }, 2000);
}

    // ==========================================
    // ▼ 追加：試合終了時のループと団体戦リザルト ▼
    // ==========================================
    onRoundEnd(winner) {
        // 1. 勝った方に1勝をプラス
        if (winner === 'p1' || winner === 'p2') {
            this.state.teamWins[winner]++;
        }

        // 2. 勝敗判定（2勝したチームがあれば優勝！）
        if (this.state.teamWins.p1 >= 2) {
            this.showTeamResult('p1');
        } else if (this.state.teamWins.p2 >= 2) {
            this.showTeamResult('p2');
        } else if (this.state.round >= 3) {
            // 万が一、3戦終わっても2勝していない場合（引き分けなど）
            if (this.state.teamWins.p1 > this.state.teamWins.p2) this.showTeamResult('p1');
            else if (this.state.teamWins.p2 > this.state.teamWins.p1) this.showTeamResult('p2');
            else this.showTeamResult('draw'); 
        } else {
            // 3. まだ決着がついていない場合は、ラウンドを進めて選出画面へ戻る！
            this.state.round++;
            
            const curtain = document.getElementById('transition-curtain');
            if (curtain) curtain.classList.add('active');

            setTimeout(() => {
                const gameWrapper = document.getElementById('game-wrapper');
                if (gameWrapper) gameWrapper.style.display = 'none';
                
                // バトルのリザルトを消す
                const resOverlay = document.getElementById('result-overlay');
                if (resOverlay) resOverlay.classList.remove('final-mode', 'visible');

                // 再びシークレット選出画面を表示
                this.showSecretScreen();
                console.log(`Round ${this.state.round} 選出画面表示。現在のusedChars:`, JSON.stringify(this.state.usedChars));
            }, 400);

            setTimeout(() => {
                if (curtain) curtain.classList.remove('active');
                if (typeof SoundFX !== 'undefined') SoundFX.playRandomSelectBGM();
            }, 1500);
        }
    }

    showTeamResult(winner) {
    const curtain = document.getElementById('transition-curtain');
    if (curtain) curtain.classList.add('active');

    setTimeout(() => {
        const gameWrapper = document.getElementById('game-wrapper');
        if (gameWrapper) gameWrapper.style.display = 'none';
        const resOverlay = document.getElementById('result-overlay');
        if (resOverlay) resOverlay.classList.remove('final-mode', 'visible');

        let teamResult = document.getElementById('team-result-screen');
        if (!teamResult) {
            teamResult = document.createElement('div');
            teamResult.id = 'team-result-screen';
            teamResult.className = 'screen';
            teamResult.style.zIndex = '9999';
            teamResult.style.background = 'rgba(0,0,0,0.85)';
            // ここでの display: flex 設定を削除するか、初期は none にします
            teamResult.style.flexDirection = 'column';
            teamResult.style.justifyContent = 'center';
            teamResult.style.alignItems = 'center';
            document.body.appendChild(teamResult);
        }

        // 表示するときだけ flex にする
        teamResult.style.display = 'flex'; 

        let titleText = "決着！！";
        let descText = "引き分け";
        let nameColor = "#fff";

        if (winner === 'p1') {
            descText = "1P チームの優勝！";
            nameColor = "var(--p1-color)";
        } else if (winner === 'p2') {
            descText = "2P チームの優勝！";
            nameColor = "var(--p2-color)";
        }

        teamResult.innerHTML = `
            <div style="font-family: 'tamanegi', sans-serif; font-size: 8rem; color: #ffcc00; text-shadow: 6px 6px 0 #000; margin-bottom: 20px;">
                ${titleText}
            </div>
            <div style="font-family: 'M PLUS Rounded 1c', sans-serif; font-size: 5rem; color: ${nameColor}; font-weight: 900; text-shadow: 3px 3px 0 #fff; margin-bottom: 60px;">
                ${descText}
            </div>
            <button id="team-result-ok-btn" class="btn" style="font-size: 2.5rem; padding: 15px 50px;">編成に戻る</button>
        `;
        teamResult.classList.add('active');

        // 【修正ポイント】ボタン押下時に確実に非表示にする
        document.getElementById('team-result-ok-btn').addEventListener('click', () => {
            teamResult.classList.remove('active');
            teamResult.style.display = 'none'; // 物理的に非表示にする
            this.goToTeamSelect('random');
        });

    }, 400);

    setTimeout(() => {
        if (curtain) curtain.classList.remove('active');
        if (typeof SoundFX !== 'undefined') SoundFX.playTone('parry'); 
    }, 1500);
}
}
// team_game.js の末尾
window.addEventListener('load', () => {
    const startBtn = document.getElementById('team-start-btn');
    if (startBtn) {
        // すでにインスタンスがあればそれを使う。なければ何もしない（startTeamModeで生成されるため）
        startBtn.onclick = () => {
            if (window.teamGame) window.teamGame.startTeamMatch();
        };
    }
});