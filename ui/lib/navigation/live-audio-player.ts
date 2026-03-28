"use client";

function decodeBase64(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function pcmToFloat32(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(bytes.byteLength / 2);

  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 32768;
  }

  return samples;
}

export class LiveAudioPlayer {
  private audioContext: AudioContext;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private playbackQueue = Promise.resolve();

  constructor() {
    this.audioContext = new window.AudioContext({
      sampleRate: 24000,
      latencyHint: "interactive",
    });
  }

  async prepare() {
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  async enqueue(base64Pcm: string) {
    this.playbackQueue = this.playbackQueue.then(async () => {
      await this.prepare();

      const pcm = pcmToFloat32(decodeBase64(base64Pcm));
      const buffer = this.audioContext.createBuffer(1, pcm.length, 24000);
      buffer.getChannelData(0).set(pcm);

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      source.onended = () => {
        this.activeSources.delete(source);
      };

      const now = this.audioContext.currentTime;
      if (this.nextStartTime < now + 0.03) {
        this.nextStartTime = now + 0.03;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration;
      this.activeSources.add(source);
    });

    await this.playbackQueue;
  }

  stop() {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // Ignore races when a chunk has already finished.
      }
    }

    this.activeSources.clear();
    this.nextStartTime = this.audioContext.currentTime;
    this.playbackQueue = Promise.resolve();
  }
}
