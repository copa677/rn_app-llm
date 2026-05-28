import { initWhisper, WhisperContext } from 'whisper.rn';
import { DownloadService, WHISPER_MODELS } from './download-service';
import { StorageService } from './storage-service';

let whisperContext: WhisperContext | null = null;
let isInitializing = false;

export const WhisperService = {
  /**
   * Verifica si el modelo Whisper ya está cargado en la memoria RAM nativa.
   */
  isLoaded(): boolean {
    return whisperContext !== null;
  },

  /**
   * Carga el archivo .bin de Whisper en la memoria RAM nativa.
   */
  async initialize(): Promise<WhisperContext> {
    if (whisperContext) return whisperContext;
    if (isInitializing) {
      while (isInitializing) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (whisperContext) return whisperContext;
    }

    isInitializing = true;
    try {
      // 1. Obtener qué modelo de Whisper está seleccionado
      const selectedModelId = await StorageService.getSelectedWhisperModelId();
      const selectedModel = WHISPER_MODELS.find(m => m.id === selectedModelId) || WHISPER_MODELS[0];

      // 2. Verificar existencia física en el celular
      const exists = await DownloadService.checkIfModelExists(selectedModel.filename);
      if (!exists) {
        throw new Error(`El modelo de voz "${selectedModel.name}" no está descargado. Ve al menú "Descargar IA Local" para descargarlo.`);
      }

      const modelPath = DownloadService.getModelPath(selectedModel.filename);
      console.log('Cargando modelo Whisper en RAM desde:', modelPath);

      // 3. Inicializar el contexto nativo de whisper.cpp
      whisperContext = await initWhisper({
        filePath: modelPath,
      });

      console.log('Modelo Whisper cargado exitosamente en RAM.');
      return whisperContext;
    } catch (error) {
      console.error('Error al inicializar WhisperService:', error);
      throw error;
    } finally {
      isInitializing = false;
    }
  },

  /**
   * Transcribe un archivo de audio local (.wav) grabado por el micrófono a texto.
   * Ejecución 100% offline y acelerada por GPU/CPU local.
   */
  async transcribe(audioUri: string): Promise<string> {
    if (!whisperContext) {
      console.log('Contexto Whisper no inicializado. Cargando...');
      await this.initialize();
    }

    if (!whisperContext) {
      throw new Error('No se pudo inicializar el procesador de voz local.');
    }

    try {
      console.log('Iniciando transcripción local offline de:', audioUri);

      // Transcribir forzando el idioma español
      const { promise } = whisperContext.transcribe(audioUri, {
        language: 'es', // Forzar español para mayor precisión
        translate: false,
      });
      const { result } = await promise;

      console.log('Transcripción finalizada. Resultado:', result);
      return result.trim();
    } catch (error) {
      console.error('Error durante la transcripción de audio:', error);
      throw error;
    }
  },

  /**
   * Libera la memoria RAM nativa ocupada por el modelo de Whisper.
   */
  async unload(): Promise<void> {
    if (whisperContext) {
      try {
        console.log('Liberando modelo Whisper de la memoria RAM nativa...');
        await whisperContext.release();
        whisperContext = null;
        console.log('Modelo Whisper liberado.');
      } catch (error) {
        console.error('Error al liberar modelo Whisper:', error);
        // Si falla .release(), simplemente anulamos la referencia
        whisperContext = null;
      }
    }
  }
};
