import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { colors, fonts } from '../theme/theme';

export function Input({ label, style, ...props }) {
  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        placeholderTextColor={colors.white30}
        style={[styles.input, style]}
        {...props}
      />
    </View>
  );
}

export function Select({ label, selectedValue, onValueChange, children }) {
  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.pickerWrap}>
        <Picker selectedValue={selectedValue} onValueChange={onValueChange} style={styles.picker} dropdownIconColor={colors.white70}>
          {children}
        </Picker>
      </View>
    </View>
  );
}

Select.Item = Picker.Item;

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    color: colors.white50,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.white8,
    backgroundColor: colors.white4,
    color: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  pickerWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.white8,
    backgroundColor: colors.white4,
    overflow: 'hidden',
  },
  picker: { color: colors.white },
});
