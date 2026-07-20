import { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Input, Select } from '../../components/Input';
import { Button } from '../../components/Button';
import { DarkCard } from '../../components/Card';
import { ErrorBanner } from '../../components/Alert';
import { ProgressSteps } from '../../components/ProgressSteps';
import { UAE_BANKS } from '../../lib/banks';
import { calculateLoanClearFee, calculateSafePayFee, calculateNetProceeds, formatAed } from '../../lib/feeCalculator';
import { STAGES } from '../../lib/dealStages';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme/theme';

const SAFEPAY_MIN = 100000;

export default function NewDeal({ navigation, route }) {
  const [product, setProduct] = useState(route.params?.product === 'safepay' ? 'safepay' : 'loanclear');
  const [plate, setPlate] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanBank, setLoanBank] = useState(UAE_BANKS[0]);
  const [buyerPhone, setBuyerPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const salePriceNum = parseFloat(salePrice) || 0;
  const loanAmountNum = parseFloat(loanAmount) || 0;
  const accent = product === 'safepay' ? 'green' : 'gold';

  const { cdFee, netProceeds } = useMemo(() => {
    const fee = product === 'loanclear' ? calculateLoanClearFee(loanAmountNum) : calculateSafePayFee(salePriceNum);
    const net = calculateNetProceeds({ salePrice: salePriceNum, loanAmount: product === 'loanclear' ? loanAmountNum : 0, finesAmount: 0, cdFee: fee });
    return { cdFee: fee, netProceeds: net };
  }, [product, salePriceNum, loanAmountNum]);

  async function handleSubmit() {
    setError('');
    if (!plate.trim()) return setError('Plate number is required');
    if (!salePriceNum || salePriceNum <= 0) return setError('Enter a valid sale price');
    if (product === 'safepay' && salePriceNum < SAFEPAY_MIN) return setError(`SafePay requires a minimum sale price of ${formatAed(SAFEPAY_MIN)}`);
    if (product === 'loanclear' && (!loanAmountNum || loanAmountNum < 0)) return setError('Enter the approximate outstanding loan amount');

    setLoading(true);
    try {
      const { deal } = await api.post('/api/deals', {
        product,
        plate: plate.trim().toUpperCase(),
        salePrice: salePriceNum,
        loanAmount: product === 'loanclear' ? loanAmountNum : undefined,
        loanBank: product === 'loanclear' ? loanBank : undefined,
        buyerPhone: buyerPhone.trim() || undefined,
      });
      await api.put(`/api/deals/${deal.id}/stage`, { targetStage: STAGES.FINES_VERIFY });
      setPlate('');
      setSalePrice('');
      setLoanAmount('');
      setBuyerPhone('');
      navigation.getParent()?.navigate('MyDeals', { screen: 'DealDetail', params: { id: deal.id } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.navy }} contentContainerStyle={styles.wrap}>
      <ProgressSteps currentStage={STAGES.QUOTE} accent={accent} />
      <Text style={styles.heading}>Get your quote</Text>
      <Text style={styles.subheading}>Tell us about the car and sale — we'll calculate your net proceeds instantly.</Text>

      <ErrorBanner message={error} />

      <Select label="Product" selectedValue={product} onValueChange={setProduct}>
        <Select.Item label="LoanClear — car has a bank loan" value="loanclear" />
        <Select.Item label="SafePay — no loan, any private sale" value="safepay" />
      </Select>

      <Input label="Plate number" placeholder="e.g. A 12345" value={plate} onChangeText={setPlate} />
      <Input label="Agreed sale price (AED)" keyboardType="numeric" value={salePrice} onChangeText={setSalePrice} />

      {product === 'loanclear' && (
        <>
          <Select label="Bank" selectedValue={loanBank} onValueChange={setLoanBank}>
            {UAE_BANKS.map((b) => (
              <Select.Item key={b} label={b} value={b} />
            ))}
          </Select>
          <Input label="Approximate outstanding loan amount (AED)" keyboardType="numeric" value={loanAmount} onChangeText={setLoanAmount} />
        </>
      )}

      <Input
        label="Buyer's phone (optional — they must already have a ClearDrive account)"
        keyboardType="phone-pad"
        placeholder="+9715XXXXXXXX"
        value={buyerPhone}
        onChangeText={setBuyerPhone}
      />

      <DarkCard>
        <Row label="Sale Price" value={formatAed(salePriceNum)} />
        {product === 'loanclear' && <Row label="Loan Balance" value={formatAed(loanAmountNum)} />}
        <Row label="Traffic Fines" value="Pending verification" muted />
        <Row label={`${product === 'loanclear' ? 'LoanClear' : 'SafePay'} Fee`} value={formatAed(cdFee)} />
        <View style={styles.divider} />
        <View style={styles.netRow}>
          <Text style={styles.netLabel}>Your Net Proceeds</Text>
          <Text style={[styles.netValue, { color: accent === 'green' ? colors.green : colors.gold }]}>{formatAed(netProceeds)}</Text>
        </View>
      </DarkCard>

      <Button variant={accent} loading={loading} onPress={handleSubmit}>
        Get Started →
      </Button>
    </ScrollView>
  );
}

function Row({ label, value, muted }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={muted ? styles.rowValueMuted : styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40, gap: 16 },
  heading: { fontFamily: fonts.display, fontSize: 22, color: colors.white, marginTop: 8 },
  subheading: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  rowLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
  rowValue: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.white },
  rowValueMuted: { fontFamily: fonts.sans, fontSize: 13, color: colors.white40, fontStyle: 'italic' },
  divider: { borderTopWidth: 1, borderTopColor: colors.white8, marginVertical: 8 },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.white70 },
  netValue: { fontFamily: fonts.display, fontSize: 22, fontWeight: 'bold' },
});
