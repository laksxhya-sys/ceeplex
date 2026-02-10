import { getAI } from './geminiService';
import { LiveServerMessage, Modality } from '@google/genai';

const LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

export class LiveService {
  private session: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputNode: ScriptProcessorNode | null = null;
  private outputNode: GainNode | null = null;
  private stream: MediaStream | null = null;
  private sources: Set<AudioBufferSourceNode> = new Set();
  private nextStartTime: number = 0;

  constructor() {
    this.nextStartTime = 0;
  }

  async connect(onVolumeChange?: (vol: number) => void) {
    const ai = getAI();
    
    // Initialize Audio Contexts
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
    this.outputAudioContext = new AudioContextClass({ sampleRate: 24000 });
    
    // Ensure contexts are running (handling browser autoplay policies)
    if (this.inputAudioContext.state === 'suspended') {
      await this.inputAudioContext.resume();
    }
    if (this.outputAudioContext.state === 'suspended') {
      await this.outputAudioContext.resume();
    }

    this.outputNode = this.outputAudioContext.createGain();
    this.outputNode.connect(this.outputAudioContext.destination);

    // Get Microphone
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      console.error("Microphone permission denied", e);
      throw new Error("Microphone access is required for Live mode.");
    }

    // Connect to Gemini Live
    // Note: Using 'AUDIO' string fallback if Modality enum is undefined in some ESM environments
    const modality = Modality?.AUDIO || 'AUDIO';
    
    this.session = ai.live.connect({
      model: LIVE_MODEL,
      config: {
        responseModalities: [modality],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        systemInstruction: "You are Ceeplex, a helpful and witty AI assistant created and trained by Lakshya. Keep responses concise and conversational.",
      },
      callbacks: {
        onopen: () => {
          console.log("Live Session Opened");
          this.startAudioInput(onVolumeChange);
        },
        onmessage: async (message: LiveServerMessage) => {
          await this.handleServerMessage(message);
        },
        onclose: (e) => {
          console.log("Live Session Closed", e);
        },
        onerror: (e) => {
          console.error("Live Session Error", e);
        }
      }
    });

    // Wait for the session to establish or fail
    // This catches immediate "Network error" or auth failures
    try {
        await this.session;
    } catch (e) {
        // Cleanup if connection fails immediately
        await this.disconnect();
        throw e;
    }

    return this.session;
  }

  private startAudioInput(onVolumeChange?: (vol: number) => void) {
    if (!this.inputAudioContext || !this.stream || !this.session) return;

    const source = this.inputAudioContext.createMediaStreamSource(this.stream);
    this.inputNode = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
    
    this.inputNode.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate volume for visualizer
      if (onVolumeChange) {
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        onVolumeChange(Math.min(rms * 5, 1)); 
      }

      const pcmBlob = this.createBlob(inputData);
      
      this.session?.then(session => {
        session.sendRealtimeInput({ media: pcmBlob });
      }).catch(err => {
          // Session might have closed or failed
          console.debug("Skipping input, session not ready");
      });
    };

    source.connect(this.inputNode);
    this.inputNode.connect(this.inputAudioContext.destination);
  }

  private async handleServerMessage(message: LiveServerMessage) {
      if (!this.outputAudioContext || !this.outputNode) return;

      const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
      
      if (base64Audio) {
          // Sync timing
          this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);

          try {
            const audioBuffer = await this.decodeAudioData(
                this.decodeBase64(base64Audio),
                this.outputAudioContext,
                24000,
                1
            );

            const source = this.outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.outputNode);
            
            source.addEventListener('ended', () => {
                this.sources.delete(source);
            });

            source.start(this.nextStartTime);
            this.nextStartTime += audioBuffer.duration;
            this.sources.add(source);
          } catch (e) {
              console.error("Error decoding audio", e);
          }
      }

      if (message.serverContent?.interrupted) {
          this.sources.forEach(s => {
              try { s.stop(); } catch(e){}
          });
          this.sources.clear();
          this.nextStartTime = 0;
      }
  }

  async disconnect() {
    // Stop all playing sources
    this.sources.forEach(s => {
        try { s.stop(); } catch(e){}
    });
    this.sources.clear();

    if (this.session) {
        // Attempt to close session if the object has a close method (best effort)
        this.session.then((s: any) => {
            // Note: The new SDK LiveSession might not expose close() directly on the resolved object 
            // depending on version, but usually it does or the promise wrapper handles it.
            if (s && typeof s.close === 'function') {
                s.close();
            }
        }).catch(() => {});
    }
    
    if (this.inputNode) {
        try {
            this.inputNode.disconnect();
            this.inputNode = null;
        } catch(e) {}
    }
    
    if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
    }

    if (this.inputAudioContext) {
        try {
            await this.inputAudioContext.close();
        } catch(e) {}
        this.inputAudioContext = null;
    }

    if (this.outputAudioContext) {
        try {
            await this.outputAudioContext.close();
        } catch(e) {}
        this.outputAudioContext = null;
    }
    
    this.session = null;
    this.nextStartTime = 0;
  }

  // --- Utils ---

  private createBlob(data: Float32Array): { data: string, mimeType: string } {
      const l = data.length;
      const int16 = new Int16Array(l);
      for (let i = 0; i < l; i++) {
          int16[i] = data[i] * 32768;
      }
      return {
          data: this.encodeBase64(new Uint8Array(int16.buffer)),
          mimeType: 'audio/pcm;rate=16000'
      };
  }

  private encodeBase64(bytes: Uint8Array): string {
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
  }

  private decodeBase64(base64: string): Uint8Array {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
  }

  private async decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
      const dataInt16 = new Int16Array(data.buffer);
      const frameCount = dataInt16.length / numChannels;
      const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
      
      for (let channel = 0; channel < numChannels; channel++) {
          const channelData = buffer.getChannelData(channel);
          for (let i = 0; i < frameCount; i++) {
              channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
          }
      }
      return buffer;
  }
}
