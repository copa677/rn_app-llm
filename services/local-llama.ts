import { initLlama, LlamaContext } from 'llama.rn';
import { DownloadService, MODELS } from './download-service';
import { StorageService } from './storage-service';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

let llamaContext: LlamaContext | null = null;
let isInitializing = false;

export const LocalLlama = {
  /**
   * Verifica si el contexto de Llama ya está cargado en la memoria RAM.
   */
  isLoaded(): boolean {
    return llamaContext !== null;
  },

  /**
   * Carga el archivo GGUF descargado en la RAM física del dispositivo.
   */
  async initialize(): Promise<LlamaContext> {
    if (llamaContext) return llamaContext;
    if (isInitializing) {
      // Esperar brevemente si ya se está inicializando
      while (isInitializing) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (llamaContext) return llamaContext;
    }

    isInitializing = true;
    try {
      // 1. Obtener el modelo seleccionado para responder
      const selectedModelId = await StorageService.getSelectedModelId();
      const selectedModel = MODELS.find(m => m.id === selectedModelId) || MODELS[0];

      // 2. Verificar si está descargado en el celular
      const exists = await DownloadService.checkIfModelExists(selectedModel.filename);
      if (!exists) {
        throw new Error(`El modelo "${selectedModel.name}" no está descargado. Ve al menú "Descargar IA Local" para descargarlo.`);
      }

      const modelPath = DownloadService.getModelPath(selectedModel.filename);

      console.log('Cargando modelo local en RAM desde:', modelPath);
      
      // Inicializar el contexto nativo de Llama
      llamaContext = await initLlama({
        model: modelPath,
        use_mlock: true,      // Bloquear páginas de memoria RAM para evitar paginación lenta
        n_ctx: 4096,          // Tamaño del contexto de conversación (tokens)
        n_gpu_layers: 99,     // Aceleración de GPU por defecto (Metal en iOS o Vulkan/OpenCL en Android)
        n_threads: 4,         // Hilos de procesamiento óptimos para CPUs móviles
      });

      console.log('Modelo cargado exitosamente en RAM.');
      return llamaContext;
    } catch (error) {
      console.error('Error al inicializar LocalLlama:', error);
      throw error;
    } finally {
      isInitializing = false;
    }
  },

  /**
   * Ejecuta el chat y genera tokens en streaming.
   * Da formato a toda la conversación según la familia del modelo seleccionado (Qwen o Llama).
   */
  async generateResponse(
    history: ChatMessage[],
    onToken: (token: string) => void,
    customStopTokens?: string[]
  ): Promise<string> {
    if (!llamaContext) {
      console.log('Contexto no inicializado. Iniciando...');
      await this.initialize();
    }

    if (!llamaContext) {
      throw new Error('No se pudo inicializar el contexto de la IA local.');
    }

    // 1. Obtener la familia del modelo seleccionado
    const selectedModelId = await StorageService.getSelectedModelId();
    const selectedModel = MODELS.find(m => m.id === selectedModelId) || MODELS[0];
    const isLlama = selectedModel.family === 'llama';

    let prompt = '';
    let stopTokens: string[] = [];

    if (isLlama) {
      // Formatear al estilo Llama 3.2 Instruct (Meta)
      prompt += '<|begin_of_text|>';
      
      const hasSystemMessage = history.some(msg => msg.role === 'system');
      if (!hasSystemMessage) {
        prompt += `<|start_header_id|>system<|end_header_id|>\n\nEres un asistente de inteligencia artificial amigable, útil y preciso de la familia Llama de Meta. Respondes de forma directa en español y ejecutas de forma 100% offline y local en el celular del usuario.<|eot_id|>\n`;
      }
      
      for (const msg of history) {
        prompt += `<|start_header_id|>${msg.role}<|end_header_id|>\n\n${msg.content}<|eot_id|>\n`;
      }
      
      prompt += `<|start_header_id|>assistant<|end_header_id|>\n\n`;
      stopTokens = ['<|eot_id|>', '<|start_header_id|>', '<|end_of_text|>', 'assistant\n', 'user\n'];
    } else {
      // Formatear al estilo Qwen 2.5 Instruct (ChatML)
      const hasSystemMessage = history.some(msg => msg.role === 'system');
      if (!hasSystemMessage) {
        prompt += `<|im_start|>system\nEres un asistente de inteligencia artificial amigable, útil y preciso de la familia Qwen. Respondes de forma directa en español y ejecutas de forma 100% offline y local en el celular del usuario.<|im_end|>\n`;
      }

      for (const msg of history) {
        prompt += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
      }

      prompt += `<|im_start|>assistant\n`;
      stopTokens = ['<|im_end|>', '<|im_start|>', 'assistant\n', 'user\n'];
    }

    if (customStopTokens) {
      stopTokens = [...stopTokens, ...customStopTokens];
    }

    let generatedText = '';

    console.log(`Iniciando inferencia local con familia: ${selectedModel.family}...`);

    // Ejecutar inferencia nativa con streaming
    await llamaContext.completion(
      {
        prompt: prompt,
        stop: stopTokens, // Tokens de parada dinámicos
        temperature: 0.7,
        top_k: 40,
        top_p: 0.9,
        n_predict: 1024, // Límite de tokens de salida
      },
      (tokenData) => {
        const token = tokenData.token;
        generatedText += token;
        onToken(token); // Enviar el token generado a la UI en tiempo real
      }
    );

    console.log('Inferencia local finalizada.');
    return generatedText.trim();
  },

  /**
   * Libera la memoria RAM nativa eliminando el contexto de Llama.
   */
  async unload(): Promise<void> {
    if (llamaContext) {
      try {
        console.log('Liberando contexto de Llama para ahorrar memoria RAM...');
        await llamaContext.release();
        llamaContext = null;
        console.log('Contexto liberado.');
      } catch (error) {
        console.error('Error al liberar contexto de Llama:', error);
      }
    }
  }
};
