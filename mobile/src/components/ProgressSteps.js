import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme/theme';
import { STAGE_ORDER, STAGE_LABELS, stageIndex } from '../lib/dealStages';

export function ProgressSteps({ currentStage, accent }) {
  const currentIdx = stageIndex(currentStage);
  const accentColor = accent === 'green' ? colors.green : colors.gold;

  return (
    <View style={styles.wrap}>
      {STAGE_ORDER.map((stage, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <View key={stage} style={styles.step}>
            <View
              style={[
                styles.dot,
                done && { backgroundColor: accentColor },
                active && { borderColor: accentColor, borderWidth: 2 },
                !done && !active && { backgroundColor: colors.white8 },
              ]}
            />
            {idx < STAGE_ORDER.length - 1 && (
              <View style={[styles.line, done && { backgroundColor: accentColor }]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  step: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  line: { flex: 1, height: 2, backgroundColor: colors.white8 },
});
