import React, { useRef } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

type Props = TextInputProps & {
  /** Caixa do campo: altura, fundo, borda e recuo. */
  boxStyle?: StyleProp<ViewStyle>;
  /** Só para campos que desenham o texto como filhos (sem `value`). */
  empty?: boolean;
  children?: React.ReactNode;
};

/**
 * Campo de uma linha com placeholder próprio. O placeholder nativo do iPhone saía abaixo do meio e
 * cortado (mudar altura ou espaçamento do campo não resolvia), então ele é um texto comum por cima.
 */
export default function CenteredTextInput({
  boxStyle,
  style,
  placeholder,
  placeholderTextColor,
  value,
  empty,
  accessibilityLabel,
  ...props
}: Props) {
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  const showPlaceholder = empty ?? !value;
  return (
    // Tocar em qualquer ponto da caixa abre o teclado.
    <Pressable style={boxStyle} onPress={() => (ref.current as any)?.focus()} accessible={false}>
      <View style={styles.area}>
        <TextInput
          {...props}
          ref={ref}
          value={value}
          accessibilityLabel={accessibilityLabel ?? placeholder}
          style={[styles.input, style]}
        />
        {showPlaceholder && placeholder ? (
          <View style={styles.placeholder} pointerEvents="none">
            <Text
              numberOfLines={1}
              style={[style as StyleProp<TextStyle>, styles.placeholderText, { color: placeholderTextColor as string }]}
            >
              {placeholder}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  area: { flex: 1, alignSelf: 'stretch' },
  input: { flex: 1, padding: 0, margin: 0, includeFontPadding: false, textAlignVertical: 'center' },
  placeholder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center' },
  placeholderText: { includeFontPadding: false },
});
