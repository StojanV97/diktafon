import * as whisperService from "./whisperService";
import * as assemblyAIService from "./assemblyAIService";

export async function transcribeLocal(fileUri, filename, onProgress) {
  return whisperService.transcribe(fileUri, onProgress);
}

export async function submitAssemblyAI(fileUri, filename) {
  return assemblyAIService.submitAndGetId(fileUri);
}

export async function checkAssemblyAI(assemblyaiId) {
  return assemblyAIService.checkTranscript(assemblyaiId);
}
