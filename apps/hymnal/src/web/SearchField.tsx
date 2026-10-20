/**
 * The web's search field. On a phone the search field is the native header's
 * (`headerSearchBarOptions`), so `SearchField.native.tsx` draws nothing.
 */

import { StyleSheet, TextInput } from 'react-native';

import { color } from '~/color';

export function SearchField({
  label,
  value,
  onChangeText,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
}) {
  return (
    <TextInput
      role="searchbox"
      aria-label={label}
      placeholder={label}
      placeholderTextColor={color.secondaryLabel}
      autoFocus
      value={value}
      onChangeText={onChangeText}
      style={styles.field}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    marginHorizontal: 16,
    marginBottom: 8,
    fontSize: 17,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    color: color.label,
    backgroundColor: color.separator,
  },
});
