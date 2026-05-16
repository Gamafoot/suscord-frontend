import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';
import type { DenoiseState, Rnnoise } from '@shiguredo/rnnoise-wasm';

const RNNOISE_SAMPLE_RATE = 48_000;
const RNNOISE_SCALE = 32_768;
const PROCESSOR_BUFFER_SIZE = 2_048;

let rnnoisePromise: Promise<Rnnoise> | null = null;

function loadRnnoise() {
  if (!rnnoisePromise) {
    rnnoisePromise = import('@shiguredo/rnnoise-wasm').then(({ Rnnoise: RnnoiseModule }) => RnnoiseModule.load());
  }

  return rnnoisePromise;
}

export class RnnoiseAudioProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = 'rnnoise-audio-processor';

  processedTrack?: MediaStreamTrack;

  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private denoiseState: DenoiseState | null = null;
  private frameSize = 0;
  private inputQueue: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private outputQueue: Float32Array<ArrayBufferLike> = new Float32Array(0);

  async init({ audioContext, track }: AudioProcessorOptions) {
    await this.setupGraph(audioContext, track);
  }

  async restart({ audioContext, track }: AudioProcessorOptions) {
    await this.destroy();
    await this.setupGraph(audioContext, track);
  }

  async destroy() {
    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
    }
    this.sourceNode?.disconnect();
    this.processorNode?.disconnect();
    this.destinationNode?.disconnect();
    this.processedTrack?.stop();
    this.denoiseState?.destroy();

    this.sourceNode = null;
    this.processorNode = null;
    this.destinationNode = null;
    this.processedTrack = undefined;
    this.denoiseState = null;
    this.frameSize = 0;
    this.inputQueue = new Float32Array(0);
    this.outputQueue = new Float32Array(0);
  }

  private async setupGraph(audioContext: AudioContext, track: MediaStreamTrack) {
    if (audioContext.sampleRate !== RNNOISE_SAMPLE_RATE) {
      throw new Error(`RNNoise requires ${RNNOISE_SAMPLE_RATE} Hz AudioContext, got ${audioContext.sampleRate} Hz`);
    }

    const rnnoise = await loadRnnoise();
    const denoiseState = rnnoise.createDenoiseState();
    const sourceNode = audioContext.createMediaStreamSource(new MediaStream([track]));
    const processorNode = audioContext.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
    const destinationNode = audioContext.createMediaStreamDestination();

    this.denoiseState = denoiseState;
    this.frameSize = rnnoise.frameSize;
    this.sourceNode = sourceNode;
    this.processorNode = processorNode;
    this.destinationNode = destinationNode;
    this.processedTrack = destinationNode.stream.getAudioTracks()[0];

    processorNode.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const output = event.outputBuffer.getChannelData(0);

      this.pushInput(input);
      this.pullOutput(output);

      for (let channelIndex = 1; channelIndex < event.outputBuffer.numberOfChannels; channelIndex += 1) {
        event.outputBuffer.copyToChannel(output, channelIndex);
      }
    };

    sourceNode.connect(processorNode);
    processorNode.connect(destinationNode);
  }

  private pushInput(chunk: Float32Array<ArrayBufferLike>) {
    this.inputQueue = concatFloat32(this.inputQueue, chunk);

    while (this.inputQueue.length >= this.frameSize) {
      const frame = copyFloat32(this.inputQueue, 0, this.frameSize);
      this.inputQueue = copyFloat32(this.inputQueue, this.frameSize);

      for (let index = 0; index < frame.length; index += 1) {
        frame[index] = Math.max(-1, Math.min(1, frame[index])) * RNNOISE_SCALE;
      }

      this.denoiseState?.processFrame(frame);

      for (let index = 0; index < frame.length; index += 1) {
        frame[index] /= RNNOISE_SCALE;
      }

      this.outputQueue = concatFloat32(this.outputQueue, frame);
    }
  }

  private pullOutput(output: Float32Array<ArrayBufferLike>) {
    if (this.outputQueue.length >= output.length) {
      output.set(copyFloat32(this.outputQueue, 0, output.length));
      this.outputQueue = copyFloat32(this.outputQueue, output.length);
      return;
    }

    output.fill(0);

    if (!this.outputQueue.length) {
      return;
    }

    output.set(this.outputQueue, 0);
    this.outputQueue = new Float32Array(0);
  }
}

function concatFloat32(left: Float32Array<ArrayBufferLike>, right: Float32Array<ArrayBufferLike>) {
  if (!left.length) {
    return new Float32Array(right);
  }

  if (!right.length) {
    return left;
  }

  const result = new Float32Array(left.length + right.length);
  result.set(left, 0);
  result.set(right, left.length);
  return result;
}

function copyFloat32(source: Float32Array<ArrayBufferLike>, start: number, end?: number) {
  const chunk = source.subarray(start, end);
  const result = new Float32Array(chunk.length);
  result.set(chunk, 0);
  return result;
}
