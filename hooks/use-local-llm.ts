import { useState, useEffect, useRef } from 'react';
import { ChatMessage, LocalLlama } from '@/services/local-llama';
import { StorageService } from '@/services/storage-service';
import { DownloadService, MODELS } from '@/services/download-service';
import { WhisperService } from '@/services/whisper-service';

export function useLocalLlm(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Referencia para leer el estado más reciente de los mensajes dentro de callbacks
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  // 1. Cargar historial de mensajes y verificar el modelo al montar
  useEffect(() => {
    let isMounted = true;

    const setupChat = async () => {
      try {
        // Cargar mensajes de la base de datos local
        const savedMessages = await StorageService.getMessages(sessionId);
        if (isMounted) {
          setMessages(savedMessages);
        }

        // 1. Obtener el modelo seleccionado para el chat
        const selectedModelId = await StorageService.getSelectedModelId();
        const selectedModel = MODELS.find(m => m.id === selectedModelId) || MODELS[0];

        // 2. Verificar si el archivo del modelo seleccionado existe en el celular
        const modelExists = await DownloadService.checkIfModelExists(selectedModel.filename);
        if (!modelExists) {
          if (isMounted) {
            setError(`El modelo "${selectedModel.name}" no está descargado. Ve a la pestaña "Descargar IA Local" para instalarlo.`);
          }
          return;
        }

        // Inicializar el contexto en RAM (si no está cargado ya)
        if (!LocalLlama.isLoaded()) {
          if (isMounted) setIsLoading(true);
          await LocalLlama.initialize();
        }
        
        if (isMounted) {
          setIsModelLoaded(true);
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error('Error al configurar el chat offline:', err);
        if (isMounted) {
          setError(err.message || 'Error al inicializar la IA local en la memoria RAM.');
          setIsLoading(false);
        }
      }
    };

    setupChat();

    // Limpieza al desmontar
    return () => {
      isMounted = false;
      // IMPORTANTE: Liberamos la RAM nativa de los dos motores (Texto y Voz)
      // al salir de la pantalla de chat para optimizar la batería y el rendimiento.
      LocalLlama.unload();
      WhisperService.unload();
    };
  }, [sessionId]);

  /**
   * Envía un mensaje del usuario, guarda el historial e inicia la generación de la IA en tiempo real.
   */
  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    setError(null);

    // 1. Crear y agregar el mensaje del usuario
    const userMessage: ChatMessage = {
      id: Math.random().toString(36).substring(2, 11),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messagesRef.current, userMessage];
    setMessages(updatedMessages);
    setIsLoading(true);

    // Guardar historial parcial con el mensaje del usuario
    await StorageService.saveMessages(sessionId, updatedMessages);

    // 2. Crear una burbuja de respuesta vacía para la IA (asistente)
    const assistantMessageId = Math.random().toString(36).substring(2, 11);
    const initialAssistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '', // Comenzará vacía e irá llenándose con tokens
      timestamp: Date.now(),
    };

    // Agregar la burbuja del asistente a la UI
    setMessages((prev) => [...prev, initialAssistantMessage]);

    try {
      let fullAssistantText = '';

      // 3. Invocar al motor LocalLlama pasándole la conversación para que genere en Streaming
      await LocalLlama.generateResponse(updatedMessages, (token) => {
        fullAssistantText += token;
        
        // Actualizar reactivamente la burbuja de la IA con el nuevo token acumulado
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: fullAssistantText }
              : msg
          )
        );
      });

      // 4. Guardar el historial final completo en base de datos local
      const finalAssistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: fullAssistantText,
        timestamp: Date.now(),
      };
      
      const finalHistory = [...updatedMessages, finalAssistantMessage];
      await StorageService.saveMessages(sessionId, finalHistory);
      
    } catch (err: any) {
      console.error('Error al generar respuesta offline:', err);
      
      // Mostrar el error directamente en la burbuja del asistente en caso de fallo nativo
      const errorText = '\n[Error de inferencia local: Asegúrate de tener suficiente RAM libre en tu dispositivo o de compilar en build de desarrollo].';
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: msg.content + errorText }
            : msg
        )
      );

      setError(err.message || 'Error durante la inferencia local.');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    messages,
    isLoading,
    isModelLoaded,
    error,
    sendMessage,
  };
}
