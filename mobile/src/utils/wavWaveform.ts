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
    const file = new File(fileUri);
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

    // Scan RIFF sub-chunks to find 'fmt ' and 'data' chunks
    let numChannels = 1;
    let bitsPerSample = 16;
    let dataOffset = -1;
    let dataSize = 0;
    let offset = 12; // skip RIFF header (4) + file size (4) + WAVE (4)

    while (offset + 8 <= bytes.length) {
      const chunkId = String.fromCharCode(
        bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]
      );
      const chunkSize =
        bytes[offset + 4] |
        (bytes[offset + 5] << 8) |
        (bytes[offset + 6] << 16) |
        (bytes[offset + 7] << 24);

      if (chunkId === "fmt " && offset + 8 + chunkSize <= bytes.length) {
        numChannels = bytes[offset + 10] | (bytes[offset + 11] << 8);
        bitsPerSample = bytes[offset + 22] | (bytes[offset + 23] << 8);
      } else if (chunkId === "data") {
        dataOffset = offset + 8;
        dataSize = chunkSize;
        break;
      }

      // Advance to next chunk (align to 2-byte boundary per WAV spec)
      offset += 8 + chunkSize;
      if (chunkSize % 2 !== 0) offset++;
    }

    if (dataOffset === -1) return [];

    const bytesPerSample = bitsPerSample / 8;
    const totalSamples = Math.floor(dataSize / (bytesPerSample * numChannels));
    if (totalSamples <= 0) return [];

    const samplesPerBar = Math.floor(totalSamples / barCount);
    if (samplesPerBar <= 0) return [];
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
