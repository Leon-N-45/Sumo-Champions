const SoundFX = {
  ctx: null, noiseBuffer: null, activeOsc: {}, activeInashi: {}, // ★追加: いなし音管理用
  masterVolume: 0.5,

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
  
  setVolume(val) {
      this.masterVolume = Math.max(0, Math.min(1, val));
  },

  playVoice(name, volume = 1.0) { 
      return new Promise((resolve) => {
          if(!name) { resolve(); return; }
          let src = name;
          if (!src.includes('/')) src = 'assets/se/' + src;
          if (!src.toLowerCase().endsWith('.mp3')) src = src + '.mp3';

          try { 
              const audio = new Audio(src); 
              audio.volume = Math.max(0, Math.min(1, volume * this.masterVolume));
              audio.onended = resolve; 
              audio.onerror = (e) => { console.log('Audio load failed:', src, e); resolve(); }; 
              audio.play().catch(e => { console.log('Audio play failed:', e); resolve(); }); 
          } catch(e) { console.error(e); resolve(); }
      });
  },

  // toneType: 'parry', 'reversal', 'miss' など (evadeは削除し updateInashi に移行)
  playTone(type) { 
      if(!this.ctx)return; 
      const t=this.ctx.currentTime; 
      const o=this.ctx.createOscillator(); 
      const g=this.ctx.createGain(); 
      
      const vol = (type==='parry' ? 0.4 : 0.3) * this.masterVolume;

      if(type==='parry'){ 
          o.frequency.setValueAtTime(1200,t); o.frequency.exponentialRampToValueAtTime(2000,t+0.1); 
          g.gain.setValueAtTime(vol, t); 
          g.gain.linearRampToValueAtTime(0.01,t+0.4);
      } else if(type==='reversal'){ 
          o.type='triangle'; o.frequency.setValueAtTime(400,t); o.frequency.linearRampToValueAtTime(800,t+0.5); 
          g.gain.setValueAtTime(vol, t); 
          g.gain.linearRampToValueAtTime(0.01,t+0.3);
      } else { 
          // Miss
          o.type='sawtooth'; o.frequency.setValueAtTime(200,t); o.frequency.linearRampToValueAtTime(50,t+0.3); 
          g.gain.setValueAtTime(vol, t); 
          g.gain.linearRampToValueAtTime(0.01,t+0.3);
      } 
      
      o.connect(g); g.connect(this.ctx.destination); 
      o.start(t); o.stop(t+0.5); 
  },

  playHit(isHeavy) { 
      if(!this.ctx||!this.noiseBuffer)return; 
      const t=this.ctx.currentTime; 
      const src=this.ctx.createBufferSource(); 
      src.buffer=this.noiseBuffer; 
      const f=this.ctx.createBiquadFilter(); 
      f.type='lowpass'; f.frequency.value=isHeavy?300:800; 
      const g=this.ctx.createGain(); 
      
      const vol = (isHeavy?0.8:0.5) * this.masterVolume;
      
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
          
          const vol = 0.1 * this.masterVolume;
          obj.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1); 
      } else { 
          if(this.activeOsc[id]){ 
              const obj=this.activeOsc[id]; 
              obj.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); 
              setTimeout(()=>{ if(obj.o) obj.o.stop(); }, 200); 
              delete this.activeOsc[id]; 
          } 
      } 
  },

  // ★追加: いなし音の持続管理
  // activeがtrueの間だけ鳴り、falseになるとスッと消える
  updateInashi(id, active) {
      if(!this.ctx) return;
      
      if(active) {
          if(!this.activeInashi[id]) {
              const t = this.ctx.currentTime;
              const o = this.ctx.createOscillator();
              const g = this.ctx.createGain();
              
              o.type = 'sine';
              o.frequency.setValueAtTime(800, t);
              o.frequency.linearRampToValueAtTime(1200, t + 1.0); // 長引くと音程が上がる
              
              const vol = 0.3 * this.masterVolume;
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
              
              // 即座にフェードアウトして停止
              g.gain.cancelScheduledValues(t);
              g.gain.setValueAtTime(g.gain.value, t);
              g.gain.linearRampToValueAtTime(0, t + 0.05);
              
              o.stop(t + 0.05);
              delete this.activeInashi[id];
          }
      }
  }
};