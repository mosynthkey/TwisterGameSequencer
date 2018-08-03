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
        this.history_ = [];
        this.selector_ = [[], [], [], [], [], [], [], []];
        this.selectorOccupation_ = ['', '', '', '', '', '', '', ''];

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
        ipcRenderer.on('changeSelector', (ev, message) => {
            this.changeSelector(message.index, message.sel);
        }); 
        ipcRenderer.on('changeMonoPoly', (ev, message) => {
            this.changeMonoPoly(message.index, message.m_p);
        }); 
    }

    trigger(e) {
        const now = e.playbackTime;
        let isPlaying = this.isPlaying_;

        // play step
        this.scheduler_.insert(now, (e) => {
            this.pattern_.forEach(function(seq) {
                seq.cnt = clip(seq.cnt, 0, seq.seq.length - 1);
                if (seq.seq[seq.cnt] != 0) {
                    const x = colorTable.indexOf(seq.grp.substr(0, 1));
                    const y = parseInt(seq.grp.substr(1, 1));
                    if (isPlaying[x][y]) {
                        const t0 = e.playbackTime;
                        const osc = audioContext.createBufferSource();
                        console.log(seq);
                        // monophonic
                        if (seq.m_p == 'mono')
                        {
                            if (seq.osc !== undefined) seq.osc.disconnect();
                            seq.osc = osc;
                        }

                        osc.buffer = seq.buf;
                        osc.playbackRate.value = seq.seq[seq.cnt]
                        osc.connect(seq.amp);
                        osc.start(t0);
                    }
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

        this.rebuildSelector();

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
        if (this.isPlaying_[x][y])
        {
            this.release(x, y);
        }
        else
        {
            this.put(x, y);
        }
        this.update(x, y);
    }

    put(x, y) {
        let bus = `${colorTable[x]}${y}`;
        let sel = this.getSelectorIndex(bus);
        if (this.selectorOccupation_[sel] != '') {
            let bus_i = this.selectorOccupation_[sel];
            if (bus_i !== undefined) {
                let x_i = colorTable.indexOf(bus_i.substr(0, 1));
                let y_i = parseInt(bus_i.substr(1, 1));
                if (0 <= x_i && x_i < 4 && 0 <= y_i && y_i < 6)
                {
                    this.isPlaying_[x_i][y_i] = false;
                    this.update(x_i, y_i);
                }
            }
        }
        this.selectorOccupation_[sel] = bus;
        this.isPlaying_[x][y] = true;
        this.history_.push(bus);
        this.update(x, y);
    }

    release(x, y) {
        let bus = `${colorTable[x]}${y}`;
        let sel = this.getSelectorIndex(bus);
        this.isPlaying_[x][y] = false;
        this.history_.some((v, i) => {
            if (v == bus) this.history_.splice(i, 1);
        });
        if (this.selectorOccupation_[sel] == bus) {
            for (let history_i = this.history_.length - 1; history_i >= 0; --history_i) {
                let bus_i = this.history_[history_i];
                if (this.getSelectorIndex(bus_i) == sel) {
                    let x_i = colorTable.indexOf(bus_i.substr(0, 1));
                    let y_i = parseInt(bus_i.substr(1, 1));
                    if (0 <= x_i && x_i < 4 && 0 <= y_i && y_i < 6)
                    {
                        this.selectorOccupation_[sel] = bus_i;
                        this.isPlaying_[x_i][y_i] = true;
                        this.update(x_i, y_i);
                        break;
                    }
                }
            }

            if (this.selectorOccupation_[sel] == bus) {
                this.selectorOccupation_[sel] = '';
            }
        }
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
    }

    changeVol(index, vol) {
        let seq = this.pattern_[index];
        seq.vol = vol;
        seq.amp.gain.setValueAtTime(seq.vol, 0);
    }

    changeSelector(index, sel) {
        let seq = this.pattern_[index];
        seq.sel = sel;
        this.selectorOccupation_ = ['', '', '', '', '', '', '', '']; // 強引
        this.rebuildSelector();
    }

    changeMonoPoly(index, m_p) {
        let seq = this.pattern_[index];
        seq.m_p = m_p;
    }

    getSelectorIndex(bus) {
        for (let selector_i = 0; selector_i < this.selector_.length; ++selector_i) {
            if (this.selector_[selector_i].indexOf(bus) >= 0) return selector_i;
        }
        return -1;
    }

    rebuildSelector()
    {
        let selector = [[], [], [], [], [], [], [], []];
        this.pattern_.forEach(function(seq) {
            let sel = seq.sel;
            let grp = seq.grp;
            selector[sel].push(grp);
        });
        this.selector_ = selector;
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
