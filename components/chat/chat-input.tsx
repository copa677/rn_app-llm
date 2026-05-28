import React, { useState } from 'react';
import { StyleSheet, TextInput, View, Pressable, ActivityIndicator, Alert } from 'react-native';
import { IconSymbol } from '../ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AudioService } from '@/services/audio-service';
import { WhisperService } from '@/services/whisper-service';
import { DownloadService, WHISPER_MODELS } from '@/services/download-service';
import { StorageService } from '@/services/storage-service';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled = false, placeholder = 'Escribe un mensaje...' }: ChatInputProps) {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const colorScheme = useColorScheme() ?? 'light';

  const handleSend = () => {
    if (text.trim() && !disabled) {
      onSend(text.trim());
      setText('');
    }
  };

  /**
   * Manejador de presionar el micrófono (Grabar/Detener y Transcribir)
   */
  const handleMicPress = async () => {
    if (isTranscribing || disabled) return;

    if (!isRecording) {
      // 1. Iniciar Grabación
      try {
        // Validar si hay un modelo de voz Whisper descargado y listo
        const activeWhisperId = await StorageService.getSelectedWhisperModelId();
        const activeWhisper = WHISPER_MODELS.find(m => m.id === activeWhisperId) || WHISPER_MODELS[0];
        
        const exists = await DownloadService.checkIfModelExists(activeWhisper.filename);
        if (!exists) {
          Alert.alert(
            'Modelo de Voz Requerido',
            `Antes de usar el micrófono, debes descargar el modelo de voz "${activeWhisper.name}" en la pestaña "Descargar IA Local".`,
            [{ text: 'Entendido' }]
          );
          return;
        }

        console.log('Iniciando grabación para Whisper...');
        await AudioService.startRecording();
        setIsRecording(true);
      } catch (err: any) {
        console.error('Error al iniciar micrófono:', err);
        Alert.alert('Error', 'No se pudo acceder al micrófono del celular.');
      }
    } else {
      // 2. Detener y Transcribir (Opción B: Auto-enviar)
      setIsRecording(false);
      setIsTranscribing(true);

      try {
        const audioUri = await AudioService.stopRecording();
        if (!audioUri) {
          throw new Error('No se generó ningún archivo de audio.');
        }

        // Llamar al transcriptor local offline
        const transcribedText = await WhisperService.transcribe(audioUri);
        
        if (transcribedText.trim()) {
          console.log('Voz transcrita exitosamente. Enviando automáticamente...');
          // Opción B aprobada: Auto-enviar de inmediato al chat
          onSend(transcribedText);
        } else {
          Alert.alert('Sin voz detectada', 'No pudimos reconocer ninguna palabra. Inténtalo de nuevo.');
        }
      } catch (err: any) {
        console.error('Error al procesar voz nativa:', err);
        Alert.alert('Error de Transcripción', err.message || 'Hubo un error al transcribir tu audio localmente.');
      } finally {
        setIsTranscribing(false);
      }
    }
  };

  const isDark = colorScheme === 'dark';
  const inputPlaceholder = isRecording
    ? 'Escuchando tu voz... Toca el micrófono para enviar'
    : isTranscribing
    ? 'Transcribiendo voz localmente...'
    : placeholder;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: isDark ? '#1A1C1E' : '#F5F5F7',
            borderColor: isDark ? '#2E3134' : '#E5E5EA',
          },
          isRecording && { borderColor: '#FF3B30', borderWidth: 2 } // Borde rojo palpitante
        ]}
      >
        {/* Botón de Micrófono (Lado Izquierdo) */}
        <Pressable
          style={[
            styles.micButton,
            isRecording && styles.micButtonRecording
          ]}
          onPress={handleMicPress}
          disabled={disabled || isTranscribing}
        >
          {isTranscribing ? (
            <ActivityIndicator size="small" color="#0a7ea4" />
          ) : (
            <IconSymbol
              name="mic.fill"
              size={20}
              color={isRecording ? '#FFFFFF' : isDark ? '#8E8E93' : '#687076'}
            />
          )}
        </Pressable>

        {/* Input de Texto */}
        <TextInput
          style={[
            styles.input,
            {
              color: isDark ? '#FFFFFF' : '#11181C',
            },
          ]}
          placeholder={inputPlaceholder}
          placeholderTextColor={isRecording ? '#FF3B30' : isDark ? '#8E8E93' : '#AEAEB2'}
          value={text}
          onChangeText={setText}
          editable={!disabled && !isRecording && !isTranscribing}
          multiline
          maxLength={1000}
        />
        
        {/* Botón de Enviar (Lado Derecho) */}
        {!isRecording && !isTranscribing && (
          <Pressable
            style={[
              styles.sendButton,
              {
                backgroundColor: text.trim() && !disabled ? '#0a7ea4' : 'transparent',
              },
            ]}
            onPress={handleSend}
            disabled={!text.trim() || disabled}
          >
            <IconSymbol
              name="paperplane.fill"
              size={18}
              color={text.trim() && !disabled ? '#FFFFFF' : isDark ? '#4E5256' : '#AEAEB2'}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 8,
    paddingVertical: 8,
    maxHeight: 100,
    lineHeight: 20,
    textAlignVertical: 'center',
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  micButtonRecording: {
    backgroundColor: '#FF3B30', // Botón rojo encendido al grabar
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
});
