import React from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';

const REQUIRED_COLOR = '#dc2626';

/** Label de formulário com asterisco vermelho quando obrigatório. */
export default function FormFieldLabel({
  label,
  required,
  style,
}: {
  label: string;
  required?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const clean = label.replace(/\s*\*\s*$/, '').trimEnd();
  return (
    <Text style={style}>
      {clean}
      {required ? <Text style={{ color: REQUIRED_COLOR }}> *</Text> : null}
    </Text>
  );
}
