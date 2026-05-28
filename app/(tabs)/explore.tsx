import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Pressable, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { DownloadService, MODELS, WHISPER_MODELS, ModelDefinition } from '@/services/download-service';
import { StorageService } from '@/services/storage-service';
import * as FileSystem from 'expo-file-system/legacy';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ExploreScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  
  // Estados para multi-modelos
  const [downloadedModelIds, setDownloadedModelIds] = useState<Record<string, boolean>>({});
  const [selectedModelId, setSelectedModelId] = useState('qwen-0.5b');
  const [selectedWhisperModelId, setSelectedWhisperModelId] = useState('whisper-tiny');
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [checking, setChecking] = useState(true);
  
  // Referencia al descargador activo
  const downloadResumableRef = useRef<FileSystem.DownloadResumable | null>(null);

  // Cargar estado de todos los modelos (LLMs y Whisper) al montar
  const loadModelsStatus = async () => {
    setChecking(true);
    try {
      // 1. Obtener modelos activos seleccionados
      const activeModelId = await StorageService.getSelectedModelId();
      const activeWhisperId = await StorageService.getSelectedWhisperModelId();
      setSelectedModelId(activeModelId);
      setSelectedWhisperModelId(activeWhisperId);

      // 2. Escanear existencia física de cada modelo (Qwen, Llama y Whisper)
      const statusMap: Record<string, boolean> = {};
      const allModels = [...MODELS, ...WHISPER_MODELS];
      for (const model of allModels) {
        const exists = await DownloadService.checkIfModelExists(model.filename);
        statusMap[model.id] = exists;
      }
      setDownloadedModelIds(statusMap);
    } catch (error) {
      console.error('Error al verificar estado de modelos:', error);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    loadModelsStatus();
  }, []);

  /**
   * Inicia el proceso de descarga de un modelo específico (LLM o Whisper).
   */
  const handleDownload = async (model: ModelDefinition) => {
    if (downloadingModelId) {
      Alert.alert('Descarga en curso', 'Por favor, espera a que termine la descarga activa actual.');
      return;
    }

    setDownloadingModelId(model.id);
    setDownloadProgress(0);

    try {
      const downloader = DownloadService.createModelDownloader(model, (progressPercentage) => {
        setDownloadProgress(progressPercentage);
      });
      
      downloadResumableRef.current = downloader;

      console.log(`Iniciando descarga de: ${model.name}...`);
      const result = await downloader.downloadAsync();
      
      if (result && result.status === 200) {
        // Actualizar estado de archivos locales
        setDownloadedModelIds((prev) => ({ ...prev, [model.id]: true }));
        
        // Auto-seleccionar el modelo recién descargado por conveniencia
        if (model.family === 'whisper') {
          await handleSelectWhisperModel(model.id);
        } else {
          await handleSelectModel(model.id);
        }
        
        Alert.alert(
          '¡Descarga Exitosa!',
          `El modelo "${model.name}" ha sido instalado localmente y está activo.`
        );
      } else {
        throw new Error('Descarga cancelada o fallida.');
      }
    } catch (error: any) {
      console.error(`Error al descargar ${model.name}:`, error);
      Alert.alert(
        'Error de Descarga',
        'Hubo un problema al descargar el modelo local. Asegúrate de tener conexión estable a Internet y suficiente almacenamiento en el móvil.'
      );
    } finally {
      setDownloadingModelId(null);
      downloadResumableRef.current = null;
    }
  };

  /**
   * Elimina el archivo físico de un modelo para liberar espacio.
   */
  const handleDelete = (model: ModelDefinition) => {
    Alert.alert(
      '¿Eliminar Modelo Local?',
      `Se borrará el archivo de "${model.name}" del celular. Perderás ${model.size} de almacenamiento.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const deleted = await DownloadService.deleteModel(model.filename);
            if (deleted) {
              setDownloadedModelIds((prev) => ({ ...prev, [model.id]: false }));
              
              // Si el modelo eliminado era el seleccionado, re-seleccionar el default
              if (model.family === 'whisper') {
                if (selectedWhisperModelId === model.id) {
                  await handleSelectWhisperModel('whisper-tiny');
                }
              } else {
                if (selectedModelId === model.id) {
                  await handleSelectModel('qwen-0.5b');
                }
              }
              
              Alert.alert('Modelo Eliminado', `Se liberaron ${model.size} de almacenamiento.`);
            }
          },
        },
      ]
    );
  };

  /**
   * Selecciona activamente un modelo de texto (Qwen/Llama) para responder.
   */
  const handleSelectModel = async (modelId: string) => {
    try {
      await StorageService.setSelectedModelId(modelId);
      setSelectedModelId(modelId);
    } catch (error) {
      console.error('Error al guardar selección de modelo de texto:', error);
    }
  };

  /**
   * Selecciona activamente un modelo de voz (Whisper) para transcribir.
   */
  const handleSelectWhisperModel = async (modelId: string) => {
    try {
      await StorageService.setSelectedWhisperModelId(modelId);
      setSelectedWhisperModelId(modelId);
    } catch (error) {
      console.error('Error al guardar selección de modelo Whisper:', error);
    }
  };

  const isDark = colorScheme === 'dark';

  // Renderizador genérico de tarjetas de modelos
  const renderModelCard = (model: ModelDefinition, isWhisper = false) => {
    const exists = downloadedModelIds[model.id] || false;
    const isActive = isWhisper ? selectedWhisperModelId === model.id : selectedModelId === model.id;
    const isThisDownloading = downloadingModelId === model.id;

    return (
      <View
        key={model.id}
        style={[
          styles.card,
          { backgroundColor: isDark ? '#1C1E21' : '#F2F2F7' },
          isActive && { borderColor: '#34C759', borderWidth: 2 },
        ]}
      >
        {/* Cabecera del Modelo */}
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <IconSymbol
              name={exists ? 'checkmark.circle.fill' : 'exclamationmark.circle.fill'}
              size={22}
              color={exists ? '#34C759' : '#FF9500'}
            />
            <ThemedText style={styles.modelName} type="subtitle">
              {model.name}
            </ThemedText>
          </View>
          
          {isActive && (
            <View style={styles.activeBadge}>
              <ThemedText style={styles.activeBadgeText} type="defaultSemiBold">ACTIVO</ThemedText>
            </View>
          )}
        </View>

        {/* Descripción */}
        <ThemedText style={styles.modelDescription} type="default">
          {model.description}
        </ThemedText>

        {/* Especificaciones */}
        <View style={styles.specsContainer}>
          <View style={styles.infoRow}>
            <ThemedText style={styles.infoLabel} type="defaultSemiBold">Tamaño:</ThemedText>
            <ThemedText type="default">{model.size}</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText style={styles.infoLabel} type="defaultSemiBold">RAM Requerida:</ThemedText>
            <ThemedText type="default">{model.ramRequired}</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText style={styles.infoLabel} type="defaultSemiBold">Estado:</ThemedText>
            <ThemedText
              style={[styles.statusText, { color: exists ? '#34C759' : '#FF9500' }]}
              type="defaultSemiBold"
            >
              {exists ? 'Descargado' : 'No Descargado'}
            </ThemedText>
          </View>
        </View>

        {/* Zona de Botones / Descarga */}
        <View style={styles.actionsWrapper}>
          {isThisDownloading ? (
            <View style={styles.progressContainer}>
              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: `${downloadProgress}%` }]} />
              </View>
              <ThemedText style={styles.progressText} type="default">
                Descargando... {downloadProgress}%
              </ThemedText>
            </View>
          ) : exists ? (
            <View style={styles.existActionsContainer}>
              {isActive ? (
                <View style={styles.activePlaceholder}>
                  <IconSymbol name="checkmark.circle.fill" size={16} color="#34C759" />
                  <ThemedText style={styles.activePlaceholderText} type="defaultSemiBold">
                    Cargado en memoria
                  </ThemedText>
                </View>
              ) : (
                <Pressable
                  style={styles.selectButton}
                  onPress={() => isWhisper ? handleSelectWhisperModel(model.id) : handleSelectModel(model.id)}
                >
                  <IconSymbol name="bolt.fill" size={14} color="#FFFFFF" />
                  <ThemedText style={styles.selectButtonText} type="defaultSemiBold">
                    Cargar en RAM y Usar
                  </ThemedText>
                </Pressable>
              )}
              
              <Pressable style={styles.deleteButton} onPress={() => handleDelete(model)}>
                <IconSymbol name="trash.fill" size={16} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[styles.button, downloadingModelId !== null && styles.buttonDisabled]}
              onPress={() => handleDownload(model)}
              disabled={downloadingModelId !== null}
            >
              <IconSymbol name="square.and.arrow.down.fill" size={16} color="#FFFFFF" />
              <ThemedText style={styles.buttonText} type="defaultSemiBold">
                Instalar localmente ({model.size})
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isDark ? '#151718' : '#FFFFFF' }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="title">Centro de Control Offline</ThemedText>
        </ThemedView>

        <ThemedText style={styles.introText}>
          Descarga y configura los cerebros de texto y voz de tu celular. Todo funciona 100% offline y de forma independiente.
        </ThemedText>

        {checking ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#0a7ea4" />
            <ThemedText style={styles.checkingText}>Escaneando almacenamiento local...</ThemedText>
          </View>
        ) : (
          <View>
            {/* Sección 1: Inteligencia de Texto (LLMs) */}
            <ThemedText style={styles.sectionTitle} type="subtitle">
              🧠 Cerebros de Texto (Chat IA)
            </ThemedText>
            {MODELS.map((model) => renderModelCard(model, false))}

            {/* Sección 2: Transcripción de Voz (Whisper) */}
            <ThemedText style={[styles.sectionTitle, { marginTop: 12 }]} type="subtitle">
              🎙️ Modelos de Voz (Speech-to-Text)
            </ThemedText>
            {WHISPER_MODELS.map((model) => renderModelCard(model, true))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },
  titleContainer: {
    marginVertical: 12,
  },
  introText: {
    fontSize: 16,
    color: '#8E8E93',
    lineHeight: 22,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 8,
    color: '#0a7ea4',
  },
  loaderContainer: {
    marginTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkingText: {
    marginTop: 12,
    color: '#8E8E93',
    fontSize: 14,
  },
  card: {
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  modelName: {
    marginLeft: 8,
    fontSize: 17,
    flexShrink: 1,
  },
  activeBadge: {
    backgroundColor: '#34C759',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activeBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  modelDescription: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
    marginBottom: 14,
  },
  specsContainer: {
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(142, 142, 147, 0.15)',
  },
  infoLabel: {
    fontSize: 13,
  },
  statusText: {
    fontSize: 13,
  },
  actionsWrapper: {
    marginTop: 4,
  },
  button: {
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  buttonDisabled: {
    backgroundColor: 'rgba(10, 126, 164, 0.5)',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  progressContainer: {
    width: '100%',
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: 'rgba(142, 142, 147, 0.2)',
    borderRadius: 4,
    width: '100%',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#34C759',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
  },
  existActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  activePlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  activePlaceholderText: {
    color: '#34C759',
    fontSize: 14,
  },
  selectButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    flex: 1,
    gap: 6,
  },
  selectButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
