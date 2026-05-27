import * as FileSystem from 'expo-file-system/legacy';

export type ModelFamily = 'qwen' | 'llama';

export interface ModelDefinition {
  id: string;
  name: string;
  family: ModelFamily;
  size: string;
  ramRequired: string;
  description: string;
  url: string;
  filename: string;
}

export const MODELS: ModelDefinition[] = [
  // Familia Qwen 2.5
  {
    id: 'qwen-0.5b',
    name: 'Qwen 2.5 0.5B Instruct',
    family: 'qwen',
    size: '382 MB',
    ramRequired: '500 MB',
    description: 'IA Qwen ultra-ligera y veloz. Funciona de forma excelente en cualquier celular de gama media o baja. Ideal para respuestas rápidas.',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    filename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'qwen-1.5b',
    name: 'Qwen 2.5 1.5B Instruct',
    family: 'qwen',
    size: '980 MB',
    ramRequired: '1.5 GB',
    description: 'IA Qwen equilibrada con mayor nivel de inteligencia y mejor gramática. Recomendado para celulares de gama media-alta.',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'qwen-3b',
    name: 'Qwen 2.5 3B Instruct',
    family: 'qwen',
    size: '1.9 GB',
    ramRequired: '3.0 GB',
    description: 'IA Qwen avanzada de alta precisión y excelente redacción en español. Recomendado para celulares potentes de gama alta.',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    filename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
  },
  
  // Familia Llama 3.2
  {
    id: 'llama-1b',
    name: 'Llama 3.2 1B Instruct',
    family: 'llama',
    size: '708 MB',
    ramRequired: '1.2 GB',
    description: 'IA Llama oficial de Meta optimizada para móviles. Súper veloz, ligera y con una gran capacidad para seguir instrucciones directas.',
    url: 'https://huggingface.co/lmstudio-community/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'llama-3b',
    name: 'Llama 3.2 3B Instruct',
    family: 'llama',
    size: '2.0 GB',
    ramRequired: '3.0 GB',
    description: 'IA Llama avanzada de Meta. Excelente lógica de razonamiento y formidable capacidad de redacción. Requiere un celular de gama alta.',
    url: 'https://huggingface.co/lmstudio-community/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  }
];

export const DownloadService = {
  /**
   * Obtiene la ruta de almacenamiento local de un archivo de modelo específico.
   */
  getModelPath(filename: string): string {
    return `${FileSystem.documentDirectory}${filename}`;
  },

  /**
   * Verifica si un archivo de modelo específico ya existe de forma local.
   */
  async checkIfModelExists(filename: string): Promise<boolean> {
    try {
      const path = this.getModelPath(filename);
      const fileInfo = await FileSystem.getInfoAsync(path);
      return fileInfo.exists;
    } catch (error) {
      console.error(`Error al verificar existencia del modelo ${filename}:`, error);
      return false;
    }
  },

  /**
   * Elimina un archivo de modelo específico del celular para liberar espacio.
   */
  async deleteModel(filename: string): Promise<boolean> {
    try {
      const path = this.getModelPath(filename);
      const exists = await this.checkIfModelExists(filename);
      if (exists) {
        await FileSystem.deleteAsync(path, { idempotent: true });
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Error al eliminar el modelo local ${filename}:`, error);
      return false;
    }
  },

  /**
   * Crea una instancia de descarga resumible para un modelo específico.
   */
  createModelDownloader(
    model: ModelDefinition,
    onProgress: (progressPercentage: number) => void
  ): FileSystem.DownloadResumable {
    const localUri = this.getModelPath(model.filename);

    return FileSystem.createDownloadResumable(
      model.url,
      localUri,
      {},
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        const percentage = Math.round(progress * 100);
        onProgress(percentage);
      }
    );
  }
};
