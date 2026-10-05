// The capture's AudioWorklet processor. It runs on the audio thread, in the
// worklet's own global scope, so it cannot import anything: `captureModule`
// is written self-contained and its source (`workletSource`) is the module
// the page loads, from a Blob URL (the lab's bundle carries it, and nothing
// else serves it). Every block of BLOCK samples of the input's one channel (channel 0, as the node takes it)
// goes to the page untouched, as float PCM at the context's own rate, with
// the block's peak and RMS for the meter; a message from the page flushes
// the part-block it holds, marked `last`, so a stop keeps every sample.
// What it posts is declared once here (`WorkletBlock`); only `captureModule`'s
// own source goes to the worklet, so the module may import what the page needs.

import { Schema } from 'effect';

/** The worklet scope's base class and registry: declared here, present only in the worklet. */
declare const AudioWorkletProcessor: {
  new (): { readonly port: MessagePort };
};
declare const registerProcessor: (name: string, processor: typeof AudioWorkletProcessor) => void;

/** The name the processor registers under. */
export const PROCESSOR = 'film-capture';

/**
 * What the processor posts for each block: the thread boundary's contract,
 * which the page checks each message against (`capture-browser.ts`).
 */
export const WorkletBlock = Schema.Struct({
  samples: Schema.instanceOf(Float32Array),
  peak: Schema.Finite,
  rms: Schema.Finite,
  /** The flush a page's message asked for: the last samples before a stop. */
  last: Schema.Boolean,
});
export type WorkletBlock = typeof WorkletBlock.Type;

/** Runs in the worklet: registers the processor. Never called on the page. */
function captureModule() {
  const BLOCK = 1024;
  class FilmCapture extends AudioWorkletProcessor {
    buffer = new Float32Array(BLOCK);
    at = 0;
    peak = 0;
    sum = 0;
    constructor() {
      super();
      this.port.onmessage = () => this.flush(true);
    }
    flush(last: boolean) {
      const samples = this.buffer.slice(0, this.at);
      const rms = Math.sqrt(this.sum / Math.max(1, this.at));
      this.port.postMessage({ samples, peak: this.peak, rms, last }, [samples.buffer]);
      this.at = 0;
      this.peak = 0;
      this.sum = 0;
    }
    process(inputs: ReadonlyArray<ReadonlyArray<Float32Array>>) {
      for (const x of inputs[0]?.[0] ?? []) {
        this.buffer[this.at] = x;
        this.at += 1;
        this.peak = Math.max(this.peak, Math.abs(x));
        this.sum += x * x;
        if (this.at === BLOCK) this.flush(false);
      }
      return true;
    }
  }
  registerProcessor('film-capture', FilmCapture);
}

/** The processor's module source, as the worklet loads it. */
export const workletSource = `(${captureModule.toString()})();\n`;
