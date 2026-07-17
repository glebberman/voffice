// Детектор речи по громкости аудио-потока (AnalyserNode). Дёргает onChange,
// когда участник начинает/перестаёт говорить.
export class AudioMeter {
    private ctx: AudioContext;
    private analyser: AnalyserNode;
    private source: MediaStreamAudioSourceNode;
    private data: Uint8Array;
    private raf = 0;
    private speaking = false;

    constructor(
        stream: MediaStream,
        private onChange: (speaking: boolean) => void,
    ) {
        this.ctx = new AudioContext();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 512;
        this.source = this.ctx.createMediaStreamSource(stream);
        this.source.connect(this.analyser);
        this.data = new Uint8Array(this.analyser.frequencyBinCount);
        this.tick();
    }

    private tick = (): void => {
        this.analyser.getByteFrequencyData(this.data);
        let sum = 0;
        for (const v of this.data) {
            sum += v;
        }
        const level = sum / this.data.length; // 0..255
        const speaking = level > 12;
        if (speaking !== this.speaking) {
            this.speaking = speaking;
            this.onChange(speaking);
        }
        this.raf = requestAnimationFrame(this.tick);
    };

    destroy(): void {
        cancelAnimationFrame(this.raf);
        this.source.disconnect();
        void this.ctx.close();
    }
}
