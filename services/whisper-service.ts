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

      // Transcribir optimizando parámetros para fiabilidad
      const { promise } = whisperContext.transcribe(audioUri, {
        language: 'es', // Forzar español para mayor precisión
        translate: false,
        temperature: 0.0, // Evitar creatividad para máxima fidelidad
        beamSize: 5, // Aumentar calidad de búsqueda de palabras

      });
      const { result } = await promise;

      console.log('Transcripción finalizada (cruda):', result);

      // Aplicar normalización de caracteres especiales
      const cleanText = this.normalizeSpecialCharacters(result);
      console.log('Transcripción finalizada (normalizada):', cleanText);

      return cleanText;
    } catch (error) {
      console.error('Error durante la transcripción de audio:', error);
      throw error;
    }
  },

  /**
   * Normaliza palabras habladas de puntuación y símbolos a sus respectivos caracteres especiales.
   */
  normalizeSpecialCharacters(text: string): string {
    let normalized = text;

    // 1. Reemplazar "arroba" (y variantes de espaciado)
    normalized = normalized.replace(/\s*arroba\s*/gi, '@');

    // 2. Reemplazar extensiones de dominio comunes
    normalized = normalized.replace(/\s*punto\s+com\b/gi, '.com');
    normalized = normalized.replace(/\s*punto\s+net\b/gi, '.net');
    normalized = normalized.replace(/\s*punto\s+org\b/gi, '.org');
    normalized = normalized.replace(/\s*punto\s+es\b/gi, '.es');

    // 3. Quitar espacios accidentales alrededor de símbolos de correo
    normalized = normalized.replace(/\s*@\s*/g, '@');

    // 4. Reemplazar guiones y barras
    normalized = normalized.replace(/\s*guion\s+bajo\s*/gi, '_');
    normalized = normalized.replace(/\s*guión\s+bajo\s*/gi, '_');
    normalized = normalized.replace(/\s*guion\s+/gi, '-');
    normalized = normalized.replace(/\s*guión\s+/gi, '-');
    normalized = normalized.replace(/\s*barra\s+inclinada\s*/gi, '/');
    normalized = normalized.replace(/\s*barra\s+/gi, '/');
    normalized = normalized.replace(/\s*diagonal\s*/gi, '/');

    // 5. Corregir posibles espacios dobles residuales
    normalized = normalized.replace(/\s+/g, ' ');

    return normalized.trim();
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
