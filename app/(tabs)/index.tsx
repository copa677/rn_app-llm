import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StorageService, ChatSession } from '@/services/storage-service';
import { DownloadService, MODELS } from '@/services/download-service';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [modelExists, setModelExists] = useState(false);
  const [loading, setLoading] = useState(true);

  // Recargar datos cada vez que la pantalla entra en foco (se abre)
  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;

      const loadData = async () => {
        setLoading(true);
        try {
          const loadedSessions = await StorageService.getSessions();
          const selectedModelId = await StorageService.getSelectedModelId();
          const selectedModel = MODELS.find(m => m.id === selectedModelId) || MODELS[0];
          const exists = await DownloadService.checkIfModelExists(selectedModel.filename);
          
          if (isMounted) {
            setSessions(loadedSessions);
            setModelExists(exists);
          }
        } catch (error) {
          console.error('Error al cargar historial de sesiones:', error);
        } finally {
          if (isMounted) setLoading(false);
        }
      };

      loadData();

      return () => {
        isMounted = false;
      };
    }, [])
  );

  /**
   * Crea una nueva sesión de chat e inicia navegación hacia ella.
   */
  const handleCreateChat = async () => {
    if (!modelExists) {
      Alert.alert(
        'IA Offline Requerida',
        'Antes de iniciar un chat, debes descargar el modelo seleccionado en la pestaña "Descargar IA Local".',
        [
          { text: 'Ir a Descargar', onPress: () => router.push('/explore' as any) },
          { text: 'Cancelar', style: 'cancel' }
        ]
      );
      return;
    }

    try {
      const newSession = await StorageService.createSession('Nueva conversación offline');
      // Navegación dinâmica de Expo Router
      router.push(`/chat/${newSession.id}` as any);
    } catch (error) {
      console.error('Error al crear chat:', error);
      Alert.alert('Error', 'No se pudo crear una nueva sesión de chat.');
    }
  };

  /**
   * Elimina una sesión de chat específica.
   */
  const handleDeleteSession = (sessionId: string, title: string) => {
    Alert.alert(
      '¿Eliminar Conversación?',
      `Se borrará permanentemente todo el historial del chat "${title}".`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await StorageService.deleteSession(sessionId);
            const updated = await StorageService.getSessions();
            setSessions(updated);
          }
        }
      ]
    );
  };

  const isDark = colorScheme === 'dark';

  return (
    <ThemedView style={styles.container}>
      {/* Cabecera Premium */}
      <View style={styles.header}>
        <View>
          <ThemedText type="title" style={styles.headerTitle}>Qwen Offline</ThemedText>
          <ThemedText style={styles.headerSubtitle}>Tus chats locales e independientes</ThemedText>
        </View>
        <Pressable
          style={[styles.newChatButtonHeader, { backgroundColor: '#0a7ea4' }]}
          onPress={handleCreateChat}
        >
          <IconSymbol name="plus" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Alerta si el modelo no está descargado */}
      {!loading && !modelExists && (
        <Pressable
          style={[styles.alertBanner, { backgroundColor: isDark ? '#2A1805' : '#FFF3CD', borderColor: isDark ? '#5C390A' : '#FFEBAA' }]}
          onPress={() => router.push('/explore')}
        >
          <IconSymbol name="exclamationmark.triangle.fill" size={18} color="#FF9500" />
          <ThemedText style={[styles.alertText, { color: isDark ? '#FF9500' : '#856404' }]}>
            IA no descargada en celular. Toca aquí para instalarla.
          </ThemedText>
        </Pressable>
      )}

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#0a7ea4" />
        </View>
      ) : sessions.length === 0 ? (
        // Estado vacío estético
        <View style={styles.emptyContainer}>
          <IconSymbol name="paperplane.fill" size={64} color={isDark ? '#2E3134' : '#E5E5EA'} />
          <ThemedText style={styles.emptyTitle} type="subtitle">No hay chats activos</ThemedText>
          <ThemedText style={styles.emptyDescription}>
            Descarga el modelo desde la sección Explore y crea un chat local.
          </ThemedText>
          
          <Pressable style={styles.emptyButton} onPress={handleCreateChat}>
            <IconSymbol name="plus" size={16} color="#FFFFFF" />
            <ThemedText style={styles.emptyButtonText} type="defaultSemiBold">Iniciar Chat Local</ThemedText>
          </Pressable>
        </View>
      ) : (
        // Lista de chats activos
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.sessionCard, { backgroundColor: isDark ? '#1C1E21' : '#F2F2F7' }]}
              onPress={() => router.push(`/chat/${item.id}` as any)}
            >
              <View style={styles.sessionLeft}>
                <View style={[styles.chatIconBadge, { backgroundColor: isDark ? '#2A2E32' : '#E5E5EA' }]}>
                  <IconSymbol name="bubble.left.and.bubble.right.fill" size={18} color="#0a7ea4" />
                </View>
                <View style={styles.sessionInfo}>
                  <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.sessionTitle}>
                    {item.title}
                  </ThemedText>
                  <ThemedText style={styles.sessionDate}>
                    {new Date(item.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </ThemedText>
                </View>
              </View>

              <Pressable
                style={styles.deleteButton}
                onPress={() => handleDeleteSession(item.id, item.title)}
              >
                <IconSymbol name="trash.fill" size={16} color="#FF3B30" />
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60, // Deja espacio debajo de la barra de estado superior
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
  },
  newChatButtonHeader: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 10,
  },
  alertText: {
    fontSize: 13,
    flex: 1,
    fontWeight: '600',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  sessionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sessionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  chatIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sessionInfo: {
    flex: 1,
    paddingRight: 8,
  },
  sessionTitle: {
    fontSize: 16,
  },
  sessionDate: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  deleteButton: {
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    textAlign: 'center',
    color: '#8E8E93',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#0a7ea4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
});
