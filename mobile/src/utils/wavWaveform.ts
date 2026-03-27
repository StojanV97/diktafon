import { File } from "expo-file-system";

/**
 * Extract amplitude peaks from a decrypted WAV file for waveform visualization.
 * Returns normalized amplitudes (0.0–1.0) for the requested number of bars.
 */
export function extractWaveformData(
  fileUri: string,
  barCount = 64
): number[] {
  try {
    // File constructor expects a filesystem path, not a file:// URI
    const path = fileUri.startsWith("file://") ? fileUri.slice(7) : fileUri;
    const file = new File(path);
    if (!file.exists) return [];

    const bytes = file.bytesSync();
    if (bytes.length < 44) return [];

    // Verify RIFF header
    if (
      bytes[0] !== 0x52 || // R
      bytes[1] !== 0x49 || // I
      bytes[2] !== 0x46 || // F
      bytes[3] !== 0x46    // F
    ) {
      return [];
    }

    const numChannels = bytes[22] | (bytes[23] << 8);
    const bitsPerSample = bytes[34] | (bytes[35] << 8);
    const dataSize = bytes[40] | (bytes[41] << 8) | (bytes[42] << 16) | (bytes[43] << 24);

    const bytesPerSample = bitsPerSample / 8;
    const totalSamples = Math.floor(dataSize / (bytesPerSample * numChannels));
    if (totalSamples <= 0) return [];

    const samplesPerBar = Math.floor(totalSamples / barCount);
    if (samplesPerBar <= 0) return [];

    const dataOffset = 44;
    const amplitudes: number[] = [];

    for (let bar = 0; bar < barCount; bar++) {
      const startSample = bar * samplesPerBar;
      let sumSquares = 0;
      // Sample a subset for performance (up to 2048 samples per bar)
      const step = Math.max(1, Math.floor(samplesPerBar / 2048));
      let count = 0;

      for (let s = 0; s < samplesPerBar; s += step) {
        const sampleIndex = startSample + s;
        const byteIndex = dataOffset + sampleIndex * numChannels * bytesPerSample;
        if (byteIndex + 1 >= bytes.length) break;

        // Read 16-bit signed LE sample (first channel)
        const lo = bytes[byteIndex];
        const hi = bytes[byteIndex + 1];
        let sample = lo | (hi << 8);
        if (sample >= 0x8000) sample -= 0x10000;

        sumSquares += sample * sample;
        count++;
      }

      const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
      amplitudes.push(rms);
    }

    // Normalize to 0.0–1.0
    const max = Math.max(...amplitudes);
    if (max === 0) return amplitudes.map(() => 0);
    return amplitudes.map((a) => a / max);
  } catch {
    return [];
  }
}
