import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage } from './local-llama';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
}

const CHAT_SESSIONS_KEY = 'offline_llm_sessions';
const MESSAGES_PREFIX = 'offline_llm_messages_';

export const StorageService = {
  /**
   * Obtiene todas las sesiones de chat almacenadas, ordenadas de más reciente a más antigua.
   */
  async getSessions(): Promise<ChatSession[]> {
    try {
      const jsonValue = await AsyncStorage.getItem(CHAT_SESSIONS_KEY);
      if (!jsonValue) return [];
      const sessions: ChatSession[] = JSON.parse(jsonValue);
      return sessions.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('Error al obtener sesiones de chat:', error);
      return [];
    }
  },

  /**
   * Crea una nueva sesión de chat con un título inicial.
   */
  async createSession(title: string): Promise<ChatSession> {
    try {
      const sessions = await this.getSessions();
      const newSession: ChatSession = {
        id: Math.random().toString(36).substring(2, 11),
        title: title,
        createdAt: Date.now(),
      };
      
      sessions.push(newSession);
      await AsyncStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessions));
      return newSession;
    } catch (error) {
      console.error('Error al crear nueva sesión de chat:', error);
      throw error;
    }
  },

  /**
   * Obtiene los mensajes de una sesión de chat específica.
   */
  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    try {
      const jsonValue = await AsyncStorage.getItem(`${MESSAGES_PREFIX}${sessionId}`);
      return jsonValue ? JSON.parse(jsonValue) : [];
    } catch (error) {
      console.error(`Error al obtener mensajes para la sesión ${sessionId}:`, error);
      return [];
    }
  },

  /**
   * Guarda e integra una lista completa de mensajes para una sesión específica.
   */
  async saveMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
    try {
      await AsyncStorage.setItem(`${MESSAGES_PREFIX}${sessionId}`, JSON.stringify(messages));
      
      // Actualizar dinámicamente el título del chat si es el primer mensaje del usuario
      const userMessages = messages.filter(m => m.role === 'user');
      if (userMessages.length === 1) {
        await this.updateSessionTitle(sessionId, userMessages[0].content.slice(0, 30) + '...');
      }
    } catch (error) {
      console.error(`Error al guardar mensajes para la sesión ${sessionId}:`, error);
    }
  },

  /**
   * Actualiza el título de una sesión de chat existente.
   */
  async updateSessionTitle(sessionId: string, newTitle: string): Promise<void> {
    try {
      const sessions = await this.getSessions();
      const sessionIndex = sessions.findIndex(s => s.id === sessionId);
      if (sessionIndex !== -1) {
        sessions[sessionIndex].title = newTitle;
        await AsyncStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessions));
      }
    } catch (error) {
      console.error(`Error al actualizar título de la sesión ${sessionId}:`, error);
    }
  },

  /**
   * Elimina una sesión de chat y todos sus mensajes asociados del celular.
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      // 1. Eliminar mensajes de la sesión
      await AsyncStorage.removeItem(`${MESSAGES_PREFIX}${sessionId}`);

      // 2. Eliminar de la lista de sesiones
      const sessions = await this.getSessions();
      const updatedSessions = sessions.filter(s => s.id !== sessionId);
      await AsyncStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(updatedSessions));
    } catch (error) {
      console.error(`Error al eliminar sesión de chat ${sessionId}:`, error);
    }
  },

  /**
   * Obtiene el ID del modelo actualmente seleccionado para responder.
   * Por defecto retorna 'qwen-0.5b'.
   */
  async getSelectedModelId(): Promise<string> {
    try {
      const modelId = await AsyncStorage.getItem('selected_llm_model_id');
      return modelId || 'qwen-0.5b';
    } catch (error) {
      console.error('Error al obtener modelo seleccionado:', error);
      return 'qwen-0.5b';
    }
  },

  /**
   * Guarda el ID del modelo seleccionado para responder.
   */
  async setSelectedModelId(modelId: string): Promise<void> {
    try {
      await AsyncStorage.setItem('selected_llm_model_id', modelId);
    } catch (error) {
      console.error('Error al guardar modelo seleccionado:', error);
    }
  }
};
