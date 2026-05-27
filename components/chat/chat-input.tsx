import React, { useState } from 'react';
import { StyleSheet, TextInput, View, Pressable } from 'react-native';
import { IconSymbol } from '../ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled = false, placeholder = 'Escribe un mensaje...' }: ChatInputProps) {
  const [text, setText] = useState('');
  const colorScheme = useColorScheme() ?? 'light';

  const handleSend = () => {
    if (text.trim() && !disabled) {
      onSend(text.trim());
      setText('');
    }
  };

  const isDark = colorScheme === 'dark';

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: isDark ? '#1A1C1E' : '#F5F5F7',
            borderColor: isDark ? '#2E3134' : '#E5E5EA',
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            {
              color: isDark ? '#FFFFFF' : '#11181C',
            },
          ]}
          placeholder={placeholder}
          placeholderTextColor={isDark ? '#8E8E93' : '#AEAEB2'}
          value={text}
          onChangeText={setText}
          editable={!disabled}
          multiline
          maxLength={1000}
        />
        
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 100, // Limita el crecimiento vertical para textos largos
    lineHeight: 20,
    textAlignVertical: 'center',
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
