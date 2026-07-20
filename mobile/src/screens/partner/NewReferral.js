import { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Input, Select } from '../../components/Input';
import { Button } from '../../components/Button';
import { DarkCard } from '../../components/Card';
import { ErrorBanner } from '../../components/Alert';
import { UAE_BANKS } from '../../lib/banks';
import { calculateLoanClearFee, calculateSafePayFee, formatAed } from '../../lib/feeCalculator';
import { STAGES } from '../../lib/dealStages';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme/theme';

const SAFEPAY_MIN = 100000;

export default function NewReferral({ navigation }) {
  const [product, setProduct] = useState('loanclear');
  const [sellerPhone, setSellerPhone] = useState('');
  const [plate, setPlate] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanBank, setLoanBank] = useState(UAE_BANKS[0]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const salePriceNum = parseFloat(salePrice) || 0;
  const loanAmountNum = parseFloat(loanAmount) || 0;
  const accent = product === 'safepay' ? 'green' : 'gold';

  const cdFee = useMemo(
    () => (product === 'loanclear' ? calculateLoanClearFee(loanAmountNum) : calculateSafePayFee(salePriceNum)),
    [product, salePriceNum, loanAmountNum]
  );

  async function handleSubmit() {
    setError('');
    if (!sellerPhone.trim()) return setError("Seller's phone number is required");
    if (!plate.trim()) return setError('Plate number is required');
    if (!salePriceNum || salePriceNum <= 0) return setError('Enter a valid sale price');
    if (product === 'safepay' && salePriceNum < SAFEPAY_MIN) return setError(`SafePay requires a minimum sale price of ${formatAed(SAFEPAY_MIN)}`);
    if (product === 'loanclear' && (!loanAmountNum || loanAmountNum < 0)) return setError('Enter the approximate outstanding loan amount');

    setLoading(true);
    try {
      const { deal } = await api.post('/api/deals', {
        product,
        sellerPhone: sellerPhone.trim(),
        plate: plate.trim().toUpperCase(),
        salePrice: salePriceNum,
        loanAmount: product === 'loanclear' ? loanAmountNum : undefined,
        loanBank: product === 'loanclear' ? loanBank : undefined,
      });
      await api.put(`/api/deals/${deal.id}/stage`, { targetStage: STAGES.FINES_VERIFY });
      setSellerPhone('');
      setPlate('');
      setSalePrice('');
      setLoanAmount('');
      navigation.getParent()?.navigate('MyReferrals', { screen: 'DealDetail', params: { id: deal.id } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.navy }} contentContainerStyle={styles.wrap}>
      <Text style={styles.heading}>New referral</Text>
      <Text style={styles.subheading}>
        The seller must already have a ClearDrive account — enter their phone number to attach them to this deal.
      </Text>

      <ErrorBanner message={error} />

      <Select label="Product" selectedValue={product} onValueChange={setProduct}>
        <Select.Item label="LoanClear — car has a bank loan" value="loanclear" />
        <Select.Item label="SafePay — no loan, any private sale" value="safepay" />
      </Select>

      <Input label="Seller's phone (must already have an account)" keyboardType="phone-pad" placeholder="+9715XXXXXXXX" value={sellerPhone} onChangeText={setSellerPhone} />
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

      <DarkCard>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{product === 'loanclear' ? 'LoanClear' : 'SafePay'} Fee</Text>
          <Text style={styles.rowValue}>{formatAed(cdFee)}</Text>
        </View>
      </DarkCard>

      <Button variant={accent} loading={loading} onPress={handleSubmit}>
        Create Referral →
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40, gap: 16 },
  heading: { fontFamily: fonts.display, fontSize: 22, color: colors.white, marginTop: 8 },
  subheading: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
  rowValue: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.white },
});
