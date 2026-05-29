import React, { useRef, useEffect } from 'react';
import { StyleSheet, View, FlatList, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ChatBubble } from '@/components/chat/chat-bubble';
import { ChatInput } from '@/components/chat/chat-input';
import { TypingIndicator } from '@/components/chat/typing-indicator';
import { useLocalLlm } from '@/hooks/use-local-llm';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  
  // Invocar al hook del chat con el ID de la conversación
  const { messages, isLoading, isModelLoaded, error, agentState, sendMessage } = useLocalLlm(id as string);
  
  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll al final del chat cuando llegan nuevos mensajes o tokens
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, messages[messages.length - 1]?.content]);

  const isDark = colorScheme === 'dark';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isDark ? '#151718' : '#FFFFFF' }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={styles.keyboardContainer}
      >
        {/* Cabecera del Chat */}
        <View style={[styles.header, { borderBottomColor: isDark ? '#2E3134' : '#E5E5EA' }]}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <IconSymbol name="chevron.left" size={24} color="#0a7ea4" />
          </Pressable>
          <View style={styles.headerInfo}>
            <ThemedText type="defaultSemiBold" style={styles.headerTitle}>
              IA Qwen Offline
            </ThemedText>
            <ThemedText style={styles.headerStatus}>
              {isLoading ? (agentState || 'Generando respuesta...') : isModelLoaded ? '100% Local y Offline' : 'Cargando IA...'}
            </ThemedText>
          </View>
        </View>

        {/* Zona del historial del chat */}
        <ThemedView style={styles.chatArea}>
          {error && !isModelLoaded ? (
            // Error de carga del modelo (ej: no descargado)
            <View style={styles.errorContainer}>
              <IconSymbol name="exclamationmark.triangle.fill" size={48} color="#FF9500" />
              <ThemedText style={styles.errorTitle} type="subtitle">
                IA Offline no lista
              </ThemedText>
              <ThemedText style={styles.errorDescription}>
                {error}
              </ThemedText>
              <Pressable style={styles.errorButton} onPress={() => router.push('/explore')}>
                <ThemedText style={styles.errorButtonText} type="defaultSemiBold">
                  Ir al Centro de Descargas
                </ThemedText>
              </Pressable>
            </View>
          ) : !isModelLoaded && isLoading ? (
            // Spinner de carga del modelo al entrar
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0a7ea4" />
              <ThemedText style={styles.loadingText} type="default">
                Cargando modelo GGUF en memoria RAM...
              </ThemedText>
              <ThemedText style={styles.loadingSubtext}>
                Esto puede demorar unos segundos según la velocidad de tu celular.
              </ThemedText>
            </View>
          ) : (
            // Lista de mensajes del chat
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => <ChatBubble message={item} />}
              ListFooterComponent={() => {
                // Si la IA está pensando y no ha empezado a escupir texto, mostrar typing indicator
                const lastMessage = messages[messages.length - 1];
                const showTyping = isLoading && (!lastMessage || lastMessage.role !== 'assistant' || lastMessage.content === '');
                
                return showTyping ? <TypingIndicator /> : null;
              }}
            />
          )}
        </ThemedView>

        {/* Campo de entrada de texto inferior */}
        <View style={[styles.inputWrapper, { borderTopColor: isDark ? '#2E3134' : '#E5E5EA' }]}>
          <ChatInput
            onSend={sendMessage}
            disabled={!isModelLoaded || isLoading}
            placeholder={
              !isModelLoaded
                ? 'Cargando IA en memoria RAM...'
                : isLoading
                ? 'Qwen está respondiendo...'
                : 'Escribe un mensaje...'
            }
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 10,
  },
  headerInfo: {
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 18,
  },
  headerStatus: {
    fontSize: 12,
    color: '#34C759', // Verde estético que simboliza la ejecución offline local
    marginTop: 2,
  },
  chatArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
  },
  inputWrapper: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  errorDescription: {
    textAlign: 'center',
    color: '#8E8E93',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: '#0a7ea4',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  errorButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
});
