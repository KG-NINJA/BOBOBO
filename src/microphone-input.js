/** @typedef {'sound' | 'music'} MicrophoneMode */
/** @typedef {'idle' | 'requesting' | 'listening' | 'unavailable' | 'denied' | 'interrupted' | 'error'} MicrophoneStatus */
/** @typedef {{ context: AudioContext, stream: MediaStream | null, source: MediaStreamAudioSourceNode | null, analyser: AnalyserNode | null, samples: Float32Array<ArrayBuffer>, spectrum: Float32Array<ArrayBuffer> }} Session */

export class MicrophoneInput {
  constructor({
    getUserMedia = (/** @type {MediaStreamConstraints} */ constraints) => navigator.mediaDevices.getUserMedia(constraints),
    createAudioContext = () => new AudioContext(),
    onStatus = (/** @type {MicrophoneStatus} */ status, /** @type {MicrophoneMode} */ mode) => {},
  } = {}) {
    this.getUserMedia = getUserMedia;
    this.createAudioContext = createAudioContext;
    this.onStatus = onStatus;
    /** @type {MicrophoneMode} */
    this.mode = 'sound';
    /** @type {MicrophoneStatus} */
    this.status = 'idle';
    /** @type {Session | null} */
    this.session = null;
    this.lastSample = -Infinity;
  }

  /** @param {MicrophoneStatus} status */
  report(status) {
    this.status = status;
    this.onStatus(status, this.mode);
  }

  /** Called directly from a user gesture; never starts itself after backgrounding.
   * @param {MicrophoneMode} mode */
  async start(mode) {
    if (this.status === 'requesting') return false;
    this.mode = mode;
    if (this.status === 'listening') {
      this.report('listening');
      return true;
    }
    this.report('requesting');
    /** @type {Session | null} */
    let session = null;
    try {
      const context = this.createAudioContext();
      session = { context, stream: null, source: null, analyser: null,
        samples: new Float32Array(2048), spectrum: new Float32Array(1024) };
      this.session = session;
      // Resume during the click (iOS). Attach a rejection handler before permission waits.
      const resumed = context.resume().then(() => null, (error) => error);
      session.stream = await this.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      if (this.session !== session) {
        session.stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      const resumeError = await resumed;
      if (this.session !== session) return false;
      if (resumeError) throw resumeError;
      if (context.state !== 'running') throw new Error('audio_not_running');
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.1;
      session.analyser = analyser;
      session.source = context.createMediaStreamSource(session.stream);
      session.source.connect(analyser); // No connection to speakers, no recording or network.
      const tracks = session.stream.getAudioTracks();
      if (!tracks.length || tracks.every((track) => track.readyState === 'ended')) throw new Error('audio_ended');
      for (const track of tracks) {
        track.addEventListener('ended', () => {
          if (this.session === session) this.stop('interrupted');
        }, { once: true });
      }
      context.addEventListener('statechange', () => {
        if (this.session === session && context.state !== 'running') this.stop('interrupted');
      });
      this.lastSample = -Infinity;
      this.report('listening');
      return true;
    } catch (error) {
      if (session && this.session !== session) return false;
      const name = error instanceof Error ? error.name : '';
      this.stop(name === 'NotAllowedError' ? 'denied' : name === 'NotFoundError' ? 'unavailable' : 'error');
      return false;
    }
  }

  /** @param {number} now */
  sample(now) {
    const session = this.session;
    if (!Number.isFinite(now) || this.status !== 'listening' || !session?.analyser || now - this.lastSample < 16) return null;
    this.lastSample = now;
    try {
      session.analyser.getFloatTimeDomainData(session.samples);
      session.analyser.getFloatFrequencyData(session.spectrum);
      let sum = 0;
      for (const value of session.samples) sum += value * value;
      return { rms: Math.sqrt(sum / session.samples.length), spectrum: session.spectrum,
        sampleRate: session.context.sampleRate };
    } catch {
      this.stop('error');
      return null; // Device failure must not break the animation loop.
    }
  }

  /** @param {MicrophoneStatus} status */
  stop(status = 'idle') {
    const session = this.session;
    this.session = null; // Invalidates pending permissions before cleanup.
    if (session) {
      session.stream?.getTracks().forEach((track) => track.stop());
      session.source?.disconnect();
      session.analyser?.disconnect();
      void session.context.close().catch(() => {});
    }
    this.report(status);
  }
}
