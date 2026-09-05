import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneInput } from '../src/microphone-input.js';

function harness(getMedia) {
  const track = new EventTarget();
  track.readyState = 'live';
  track.stops = 0;
  track.stop = () => { track.stops++; track.readyState = 'ended'; };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const context = new EventTarget();
  Object.assign(context, {
    state: 'running', sampleRate: 48000, closes: 0,
    resume: async () => {},
    close: async () => { context.closes++; context.state = 'closed'; },
    createAnalyser: () => ({ disconnect() {}, getFloatFrequencyData: (data) => data.fill(-60), getFloatTimeDomainData: (data) => data.fill(0.1) }),
    createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
  });
  const statuses = [];
  let requests = 0;
  const mic = new MicrophoneInput({
    createAudioContext: () => context,
    getUserMedia: async (constraints) => {
      requests++;
      assert.equal(constraints.video, false);
      return getMedia ? getMedia() : stream;
    },
    onStatus: (status) => statuses.push(status),
  });
  return { mic, track, stream, context, statuses, requests: () => requests };
}

test('one capture session serves mode switches; stop releases all resources', async () => {
  const h = harness();
  assert.equal(await h.mic.start('music'), true);
  assert.ok(Math.abs(h.mic.sample(1000).rms - 0.1) < 0.001);
  assert.equal(h.mic.sample(1001), null);
  await h.mic.start('sound');
  assert.equal(h.requests(), 1);
  h.mic.stop();
  assert.equal(h.track.stops, 1);
  assert.equal(h.context.closes, 1);
  assert.equal(h.mic.sample(2000), null);
  h.mic.stop();
  assert.equal(h.context.closes, 1);
});

test('cancel while permission is pending stops a late-granted stream', async () => {
  let grant;
  const h = harness(() => new Promise((resolve) => { grant = resolve; }));
  const start = h.mic.start('music');
  assert.equal(await h.mic.start('music'), false);
  h.mic.stop();
  grant(h.stream);
  assert.equal(await start, false);
  assert.equal(h.mic.status, 'idle');
  assert.equal(h.track.stops, 1);
  assert.equal(h.context.closes, 1);
  assert.equal(h.requests(), 1);
});

test('denied permission is recoverable and closes its audio context', async () => {
  const h = harness(() => { throw new DOMException('Denied', 'NotAllowedError'); });
  assert.equal(await h.mic.start('music'), false);
  assert.equal(h.mic.status, 'denied');
  assert.equal(h.context.closes, 1);
  h.mic.getUserMedia = async () => h.stream;
  h.context.state = 'running';
  assert.equal(await h.mic.start('music'), true);
  h.mic.stop();
});

test('a late rejection after cancel cannot overwrite a new session', async () => {
  let reject;
  const h = harness(() => new Promise((resolve, no) => { reject = no; }));
  const start = h.mic.start('music');
  h.mic.stop();
  h.context.state = 'running';
  h.mic.getUserMedia = async () => h.stream;
  assert.equal(await h.mic.start('sound'), true);
  reject(new Error('old request'));
  assert.equal(await start, false);
  assert.equal(h.mic.status, 'listening');
  h.mic.stop();
});

test('audio setup failure after capture releases the microphone', async () => {
  const h = harness();
  h.context.createMediaStreamSource = () => { throw new Error('device lost'); };
  assert.equal(await h.mic.start('music'), false);
  assert.equal(h.track.stops, 1);
  assert.equal(h.context.closes, 1);
  assert.equal(h.mic.status, 'error');
});

test('device unplug and audio interruption stop capture', async () => {
  for (const kind of ['ended', 'statechange']) {
    const h = harness();
    await h.mic.start('music');
    if (kind === 'ended') h.track.dispatchEvent(new Event('ended'));
    else { h.context.state = 'suspended'; h.context.dispatchEvent(new Event('statechange')); }
    assert.equal(h.mic.status, 'interrupted');
    assert.equal(h.track.stops, 1);
    assert.equal(h.context.closes, 1);
  }
});

test('a sampling failure releases capture without breaking the render loop', async () => {
  const h = harness();
  await h.mic.start('music');
  h.mic.session.analyser.getFloatFrequencyData = () => { throw new Error('input failed'); };
  assert.equal(h.mic.sample(1000), null);
  assert.equal(h.mic.status, 'error');
  assert.equal(h.track.stops, 1);
  assert.equal(h.context.closes, 1);
});
