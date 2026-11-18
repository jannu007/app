/* マイク入力を一定量ずつまとめてメインスレッドに渡すだけの AudioWorklet。
   データは同じ端末内のメインスレッドにしか渡さない。 */

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

const CHUNK = 4096;

class RecorderProcessor extends AudioWorkletProcessor {
  private buf = new Float32Array(CHUNK);
  private filled = 0;

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    let i = 0;
    while (i < channel.length) {
      const n = Math.min(channel.length - i, CHUNK - this.filled);
      this.buf.set(channel.subarray(i, i + n), this.filled);
      this.filled += n;
      i += n;
      if (this.filled === CHUNK) {
        this.port.postMessage(this.buf, [this.buf.buffer]);
        this.buf = new Float32Array(CHUNK);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("kotonoha-recorder", RecorderProcessor);
