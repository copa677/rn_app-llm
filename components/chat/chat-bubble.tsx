import React, { useState } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { ThemedText } from '../themed-text';
import { ChatMessage } from '@/services/local-llama';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ChatBubbleProps {
  message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const [copied, setCopied] = useState(false);

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <ThemedText style={styles.systemText} type="default">
          {message.content}
        </ThemedText>
      </View>
    );
  }

  // Estilos adaptativos según el rol y el tema
  const bubbleStyle = [
    styles.bubble,
    isUser ? styles.userBubble : styles.assistantBubble,
    !isUser && {
      backgroundColor: colorScheme === 'dark' ? '#25282A' : '#F0F2F5',
    },
  ];

  const textStyle = [
    styles.text,
    isUser ? styles.userText : styles.assistantText,
  ];

  const handleLongPress = async () => {
    try {
      const Clipboard = require('expo-clipboard');
      const Haptics = require('expo-haptics');

      await Clipboard.setStringAsync(message.content);
      // Feedback háptico sutil y de alta calidad
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch (error) {
      console.error('Error al copiar texto:', error);
    }
  };

  // Renderizar la burbuja del chat
  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View style={{ position: 'relative', maxWidth: '100%' }}>
        <Pressable
          style={bubbleStyle}
          onLongPress={handleLongPress}
          delayLongPress={350} // Respuesta rápida y táctil
          android_ripple={{ color: isUser ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.05)', borderless: false }}
        >
          <ThemedText style={textStyle}>
            {message.content}
          </ThemedText>
          <ThemedText style={[styles.timeText, isUser ? styles.userTimeText : styles.assistantTimeText]}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </ThemedText>
        </Pressable>

        {copied && (
          <View style={[
            styles.copiedBadge,
            isUser ? styles.userCopiedBadge : styles.assistantCopiedBadge,
            { backgroundColor: colorScheme === 'dark' ? '#3A3F42' : '#333333' }
          ]}>
            <ThemedText style={styles.copiedText}>📋 Copiado</ThemedText>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 4,
    flexDirection: 'row',
  },
  userContainer: {
    justifyContent: 'flex-end',
    paddingLeft: 48, // Deja espacio en la izquierda para que no toque el borde
  },
  assistantContainer: {
    justifyContent: 'flex-start',
    paddingRight: 48, // Deja espacio en la derecha
  },
  systemContainer: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 24,
  },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1, // Sombra ligera en Android
  },
  userBubble: {
    backgroundColor: '#0a7ea4', // Color azulado premium para el usuario
    borderBottomRightRadius: 4, // Esquina chata
  },
  assistantBubble: {
    borderBottomLeftRadius: 4, // Esquina chata
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#FFFFFF',
  },
  assistantText: {
    // Hereda color dinámico de ThemedText
  },
  timeText: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  userTimeText: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  assistantTimeText: {
    color: 'rgba(104, 112, 118, 0.7)',
  },
  systemText: {
    fontSize: 12,
    color: '#8A8A8F',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  copiedBadge: {
    position: 'absolute',
    top: -24,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    zIndex: 99,
  },
  userCopiedBadge: {
    right: 8,
  },
  assistantCopiedBadge: {
    left: 8,
  },
  copiedText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
});
