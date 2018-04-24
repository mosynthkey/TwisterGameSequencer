// audio signal seq.amp -> それぞれのbus -> destination

'use strict'

const colorTable = ['r', 'b', 'y', 'g'];
const clip = (val, min, max) => { return (val < min) ? min : (val > max) ? max : val; };

class TwisterSequencer {
    constructor(audioCtx, destination) {
        this.audioCtx_ = audioCtx;
        this.bpm_ = 120;
        this.pattern_ = [];
        this.clickHandler_ = null;

        // 各busをmuteしてるかしてないかの管理。trueで再生されてる(muteされてない)
        this.isPlaying_ = [];
        for (var i = 0; i < 6; i++) this.isPlaying_.push([false, false, false, false]);

        // busの準備
        this.buses_ = {};
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < 6; y++) {
                let gain = audioCtx.createGain();
                gain.gain.setValueAtTime(0.0, 0.0);
                gain.connect(destination);
                this.buses_[`${colorTable[x]}${y}`] = gain;
            }
        }

        // scheduler関連
        const WebAudioScheduler = require("web-audio-scheduler");
        this.scheduler_ = new WebAudioScheduler({
            context: audioCtx
        });

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                this.scheduler_.aheadTime = 0.1;
            } else {
                this.scheduler_.aheadTime = 1.0;
                this.scheduler_.process();
            }
        });

        // ipc (editor.html -> main.js -> here)
        const ipcRenderer = require('electron').ipcRenderer;
        ipcRenderer.on('changeSeq', (ev, message) => {
            this.changeSeq(message.index, message.seq);
        }); 
        ipcRenderer.on('changePcm', (ev, message) => {
            this.changePcm(message.index, message.pcm);
        }); 
        ipcRenderer.on('changeVol', (ev, message) => {
            this.changeVol(message.index, message.vol);
        });
        ipcRenderer.on('changePattern', (ev, message) => {
            this.loadPattern(message);
        }); 
    }

    trigger(e) {
        const now = e.playbackTime;

        // play step
        this.scheduler_.insert(now, (e) => {
            this.pattern_.forEach(function(seq) {

                seq.cnt = clip(seq.cnt, 0, seq.seq.length - 1);
                if (seq.seq[seq.cnt] != 0) {
                    const t0 = e.playbackTime;
                    const osc = audioContext.createBufferSource();
                    osc.buffer = seq.buf;
                    osc.playbackRate.value = seq.seq[seq.cnt]
                    osc.connect(seq.amp);
                    osc.start(t0);
                }
                seq.cnt = (seq.cnt + 1) % seq.seq.length;
            });
        });

        // prepare for next step
        this.scheduler_.insert(now + (60.0 / this.bpm_) / 4, (e) => { this.trigger(e)} );

        // notificate to clickHander_
        if (this.clickHandler_ !== null) this.clickHandler_();
    }

    loadPattern(pattern) {
        // パターン切り替え
        this.scheduler_.stop(true);

        this.pattern_ = pattern;

        // オーディオファイルのロード
        const loadAudioFile = (url) => {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("GET", url, true);
                xhr.responseType = "arraybuffer";
                xhr.onload = () => {
                    if (xhr.response) this.audioCtx_.decodeAudioData(xhr.response, resolve, reject);
                };
                xhr.onerror = reject;
                xhr.send();
            });
        };

        let audioFiles = [];
        for (let seq of this.pattern_) {
            audioFiles.push(`pcm/${seq.pcm}`);
            seq.cnt = 0;
            seq.amp = audioContext.createGain();
            seq.amp.gain.setValueAtTime(seq.vol, 0);
            seq.amp.connect(this.buses_[seq.grp]);
        }
        Promise.all(audioFiles.map(loadAudioFile))
            .then((audioFiles) => {
                audioFiles.forEach((buf, index) => {
                    this.pattern_[index].buf = buf;
                });

                // start playing
                this.scheduler_.start((e) => {
                    this.trigger(e);
                });
            })
            .catch(console.error);
    }

    set clickHandler(handler) {
        this.clickHandler_ = handler;
    }

    set bpm(bpm) {
        this.bpm_ = bpm;
    }

    update(x, y) {
        let bus = `${colorTable[x]}${y}`;
        this.buses_[bus].gain.setValueAtTime(this.isPlaying_[x][y] ? 1.0 : 0.0, 0.0);
    }

    click(x, y) {
        this.isPlaying_[x][y] = !this.isPlaying_[x][y];
        this.update(x, y);
    }

    put(x, y) {
        this.isPlaying_[x][y] = true;
        this.update(x, y);
    }

    release(x, y) {
        this.isPlaying_[x][y] = false;
        this.update(x, y);
    }

    // ----- ipc関連 -----

    changeSeq(index, newSeq) {
        if (newSeq.length != this.pattern_[index].seq.length) {
            // 長さが違ったら全パートの再生位置をリセットする
            this.pattern_.forEach((seq) => {
                seq.cnt = 0;
            });
        }
        this.pattern_[index].seq = newSeq;
    }

    changePcm(index, newPcmFileName) {
        // needs to refactor
        const loadAudioFile = (url) => {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("GET", url, true);
                xhr.responseType = "arraybuffer";
                xhr.onload = () => {
                    if (xhr.response) this.audioCtx_.decodeAudioData(xhr.response, resolve, reject);
                };
                xhr.onerror = reject;
                xhr.send();
            });
        };

        loadAudioFile('pcm/' + newPcmFileName)
            .then((buf) => {
                this.pattern_[index]['pcm'] = newPcmFileName;
                this.pattern_[index]['buf'] = buf;
            })
            .catch(console.error);
    }

    changeVol(index, vol) {
        let seq = this.pattern_[index];
        seq.vol = vol;
        seq.amp.gain.setValueAtTime(seq.vol, 0);
    }

    reset() {
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < 6; y++) {
                this.isPlaying_[x][y] = false;
                let bus = `${colorTable[x]}${y}`;
                this.buses_[bus].gain.setValueAtTime(0.0, 0.0);
            }
        }
    }
}

module.exports = TwisterSequencer;
