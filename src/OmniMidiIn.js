class OmniMidiIn {
    constructor() {
        this.midiAccess_ = null;
        this.handler_ = null;

        navigator.requestMIDIAccess().then(((midiAccess) => {

            let inputs = [];
            if (typeof midiAccess.inputs == 'function') {
                // For Old Chrome
                inputs = midiAccess.inputs();
            } else {
                // For New Chrome
                var it = midiAccess.inputs.values();
                for (var o = it.next(); !o.done; o = it.next()) {
                    inputs.push(o.value);
                }
            }

            for (var input_i = 0; input_i < inputs.length; input_i++) {
                let name = inputs[input_i].name;
                inputs[input_i].onmidimessage = (e) => { this.onMidiMessage(name, e); };
            }
        }), (() => {
            console.log("no midi input devices");
        }));
    }

    set handler(h) {
        this.handler_ = h;
    }

    onMidiMessage(devName, event) {
        var e_data = event.data;
        var ch = (0x0f & e_data[0]);
        var notenum = e_data[1];
        var vel = e_data[2];
        var message = { "device":devName, "ch":ch, "event":"noteOn", "note":notenum };

        if ((e_data[0] & 0xf0) == 0x90 && vel != 0) {
            // Note On
            message['event'] = 'noteOn';
            if (this.handler_ != null) this.handler_(message);
        } else if ((e_data[0] & 0xf0) == 0x80 || ((e_data[0] & 0xf0) == 0x90 && vel == 0)) {
            // Note Off
            message['event'] = 'noteOff';
            if (this.handler_ != null) this.handler_(message);
        }
    }
}

module.exports = OmniMidiIn;
