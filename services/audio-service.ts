import AudioRecord from 'react-native-audio-record';
import { Audio } from 'expo-av';

let isRecording = false;

export const AudioService = {
  /**
   * Solicita permisos de micrófono al sistema operativo del celular.
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error al solicitar permisos de micrófono:', error);
      return false;
    }
  },

  /**
   * Inicia la grabación del micrófono nativo con la configuración exacta para Whisper (16kHz, Mono, WAV PCM 16-bit).
   */
  async startRecording(): Promise<void> {
    try {
      // 1. Validar permisos
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Permiso de micrófono no otorgado por el usuario.');
      }

      // 2. Si ya hay una grabación corriendo, detenerla primero
      if (isRecording) {
        await this.stopRecording();
      }

      // 3. Configurar el modo de audio global del celular
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        playThroughEarpieceAndroid: false,
      });

      // 4. Opciones de grabación nativa PCM reales y compatibles con whisper.cpp
      // Formato: WAV PCM, 16000Hz de muestreo, 1 canal (mono), 16 bits de profundidad
      AudioRecord.init({
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6, // VOICE_RECOGNITION - Ideal para reconocimiento de voz en Android
        wavFile: 'whisper_recording.wav',
      });

      // 5. Iniciar la grabación
      AudioRecord.start();
      isRecording = true;
      console.log('Grabación nativa PCM WAV iniciada en 16kHz Mono.');
    } catch (error) {
      console.error('Error al iniciar la grabación de audio:', error);
      isRecording = false;
      throw error;
    }
  },

  /**
   * Detiene la grabación del micrófono, libera el recurso y retorna la ruta URI local del archivo WAV generado.
   */
  async stopRecording(): Promise<string | null> {
    if (!isRecording) return null;

    try {
      console.log('Deteniendo grabación de audio...');
      const filePath = await AudioRecord.stop();
      isRecording = false;
      
      // Restablecer el modo de audio para reproducción normal
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        playThroughEarpieceAndroid: false,
      });

      console.log('Grabación detenida. Archivo WAV real guardado localmente en:', filePath);
      
      if (!filePath) return null;

      // Asegurar el prefijo 'file://' para que whisper.rn lo localice correctamente
      const fileUri = filePath.startsWith('/') ? `file://${filePath}` : filePath;
      return fileUri;
    } catch (error) {
      console.error('Error al detener la grabación de audio:', error);
      isRecording = false;
      return null;
    }
  }
};
