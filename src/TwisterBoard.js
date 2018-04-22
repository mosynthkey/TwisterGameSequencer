// TwisterGameSequencerのボードmodule

class TwisterBoard {
    constructor(canvasCtx) {
        this.canvasCtx_ = canvasCtx;

        // init board status
        this.status_ = [];
        for (let i = 0; i < 6; i++) this.status_.push([false, false, false, false]);

        // load pictures
        this.loadedImages_ = null;
        let imageNames = ['Board.png', 'Red.png', 'Blue.png', 'Yellow.png', 'Green.png', 'Shadow.png'];
        const loadImage = (src) => {
            return new Promise((resolve, reject) => {
                let img = new Image();
                img.src = "image/" + src;
                img.onload = () => resolve(img);
                img.error = () => reject();
            })
        };
        Promise.all(imageNames.map(loadImage))
            .then((images) => {
                this.loadedImages_ = images;
                this.drawAll();
            })
            .catch(console.error);
    }

    put(x, y) {
        this.status_[y][x] = true;
        this.draw(x, y);
    }

    release(c, r) {
        this.status_[y][x] = false;
        this.draw(x, y);
    }

    click(c, r) {
        this.status_[y][x] = !this.status_[y][x];
        this.draw(x, y);
    }

    getClickedCircle(e) {
        var rect = e.target.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;

        let c = Math.floor((x - 40) / 140);
        let r = Math.floor((y - 40) / 140);

        return [c, r];
    }

    drawAll() {
        if (this.loadedImages_ == null) return;

        // draw board
        this.canvasCtx_.drawImage(this.loadedImages_[0], 0, 0);

        // draw circle
        for (let x_i = 0; x_i < 4; x_i++) {
            for (let y_i = 0; y_i < 6; y_i++) {
                this.draw(x_i, y_i);
            }
        }
    }

    draw(x, y) {
        this.canvasCtx_.drawImage(this.loadedImages_[1 + x], 40 + 140 * x, 40 + 140 * y);
        if (this.status_[y][x]) this.canvasCtx_.drawImage(this.loadedImages_[5], 40 + 140 * x, 40 + 140 * y);
    }

    reset() {
        for (let x_i = 0; x_i < 4; x_i++) {
            for (let y_i = 0; y_i < 6; y_i++) {
                this.status_[y_i][x_i] = false;
            }
        }
        this.drawAll();
    }
}

module.exports = TwisterBoard;
