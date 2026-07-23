import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, Share, Alert as RNAlert } from 'react-native';
import { DarkCard } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input, Select } from '../../components/Input';
import { Badge, ProductBadge } from '../../components/Badge';
import { ErrorBanner, SuccessBanner } from '../../components/Alert';
import { ProgressSteps } from '../../components/ProgressSteps';
import { SkeletonCard } from '../../components/Skeleton';
import { STAGES, STAGE_ORDER, STAGE_LABELS, stageIndex } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme/theme';

function vehicleTitle(deal) {
  const parts = [deal.year, deal.make, deal.model].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

// Manual-override toggles — mirror backend/controllers/adminController.js's
// OVERRIDABLE_FIELDS. Used to unblock deals while TrustIn KYC / SignNow
// signing / Claude Vision fines extraction aren't yet live integrations (or
// are currently failing), or when a verification/signature/payment was
// collected outside the platform.
const OVERRIDE_FIELDS = [
  { key: 'fines_verified', label: 'Traffic fines verified' },
  { key: 'seller_kyc_complete', label: 'Seller KYC complete' },
  { key: 'buyer_kyc_complete', label: 'Buyer KYC complete' },
  { key: 'mulkiya_verified', label: 'Mulkiya (front) verified' },
  { key: 'mulkiya_back_verified', label: 'Mulkiya (back) verified' },
  { key: 'settlement_verified', label: 'Bank settlement letter verified', loanOnly: true },
  { key: 'bank_proof_verified', label: 'Proceeds account proof verified' },
  { key: 'doc001_signed', label: 'DOC-001 signed (Transaction & Escrow Agreement)' },
  { key: 'doc002_signed', label: 'DOC-002 signed (Limited Power of Attorney)' },
  { key: 'doc003_signed', label: 'DOC-003 signed (Referral Agreement)', requiresPartner: true },
  { key: 'funds_confirmed', label: 'Escrow funds confirmed received' },
];

// Every stage the state machine knows about, including the terminal ones —
// the normal PUT /:id/stage route only ever allows moving one step forward,
// or to "cancelled" from a non-terminal stage, so there's no way to reopen a
// cancelled deal, revert a stage, or un-complete a deal through it. Backs the
// "Force stage" escape hatch below.
const ALL_STAGES = [...STAGE_ORDER, STAGES.CANCELLED];

// Mirrors backend's REFERRAL_SOURCES / the referral_source column comment.
const REFERRAL_SOURCES = ['dealer', 'broker', 'dubizzle', 'facebook', 'direct'];

const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

// Vehicle/financial fields admin can manually correct — mirrors backend's
// ADMIN_DETAIL_FIELDS in adminController.js. Safety net for when Claude
// Vision misreads the Mulkiya or bank settlement letter photo — admin checks
// the source photo (mulkiya_image_url/settlement_image_url) and types the
// correct value here instead of what was auto-extracted.
const DETAIL_FIELDS = [
  { key: 'plate', label: 'Plate number' },
  { key: 'vin', label: 'VIN' },
  { key: 'make', label: 'Make' },
  { key: 'model', label: 'Model' },
  { key: 'year', label: 'Year', numeric: true },
  { key: 'colour', label: 'Colour' },
  { key: 'mileage', label: 'Mileage (km)', numeric: true },
  { key: 'sale_price', label: 'Sale price (AED)', numeric: true },
  { key: 'loan_amount', label: 'Loan/settlement amount (AED)', numeric: true, loanOnly: true },
  { key: 'loan_account', label: 'Loan reference number', loanOnly: true },
  { key: 'loan_bank', label: 'Loan bank', loanOnly: true },
  { key: 'seller_iban', label: 'Seller payout IBAN' },
  { key: 'seller_acc_name', label: 'Seller payout account name' },
  { key: 'seller_proc_bank', label: 'Seller payout bank' },
];

export default function AdminDealDetail({ route }) {
  const { id } = route.params;
  const [deal, setDeal] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [finesAmount, setFinesAmount] = useState('');
  const [transferCertUrl, setTransferCertUrl] = useState('');
  const [detailsForm, setDetailsForm] = useState(null);
  const [links, setLinks] = useState(null);
  const [auditLog, setAuditLog] = useState(null);
  const [forceStageTarget, setForceStageTarget] = useState('');
  const [forceStageReason, setForceStageReason] = useState('');
  const [reassignRole, setReassignRole] = useState('buyer');
  const [reassignPhone, setReassignPhone] = useState('');
  const [identityRole, setIdentityRole] = useState('seller');
  const [identityForm, setIdentityForm] = useState({ full_name: '', emirates_id: '', nationality: '', phone: '', email: '' });
  const [receivedAmount, setReceivedAmount] = useState('');
  const [referralPhone, setReferralPhone] = useState('');
  const [referralSource, setReferralSource] = useState('direct');
  const [referralFee, setReferralFee] = useState('');

  const load = useCallback(async () => {
    try {
      const { deal, links } = await api.get(`/api/admin/deals/${id}`);
      setDeal(deal);
      setLinks(links);
    } catch (err) {
      setError(err.message);
    }
    try {
      const { log } = await api.get(`/api/admin/deals/${id}/audit-log`);
      setAuditLog(log);
    } catch {
      // Non-critical — the audit log is a diagnostic convenience, don't block the screen on it.
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Populate the manual-correction form once when the deal first loads (or
  // after a save resets it to null) — never overwrite while admin is mid-edit.
  useEffect(() => {
    if (deal && !detailsForm) {
      setDetailsForm({
        plate: deal.plate || '',
        vin: deal.vin || '',
        make: deal.make || '',
        model: deal.model || '',
        year: deal.year || '',
        colour: deal.colour || '',
        emirate: deal.emirate || EMIRATES[0],
        mileage: deal.mileage || '',
        sale_price: deal.sale_price || '',
        loan_amount: deal.loan_amount || '',
        loan_account: deal.loan_account || '',
        loan_bank: deal.loan_bank || '',
        seller_iban: deal.seller_iban || '',
        seller_acc_name: deal.seller_acc_name || '',
        seller_proc_bank: deal.seller_proc_bank || '',
      });
    }
  }, [deal, detailsForm]);

  function setDetailField(field, value) {
    setDetailsForm((f) => ({ ...f, [field]: value }));
  }

  async function submitDetailsForm() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { deal: updated, documentsRegenerated, warning } = await api.put(`/api/admin/deals/${id}/override`, detailsForm);
      setDeal(updated);
      setDetailsForm(null);
      if (documentsRegenerated?.length > 0) {
        setSuccess(`Details updated. Regenerated and re-sent for signature: ${documentsRegenerated.join(', ')}.`);
      } else {
        setSuccess('Vehicle & financial details updated');
      }
      if (warning) setError(warning);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleField(field) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const body = { [field]: !deal[field] };
      // If admin is marking fines as verified and has entered a figure, include it
      // so cd_fee/net_proceeds get recalculated the same way the automated path does.
      if (field === 'fines_verified' && !deal.fines_verified && finesAmount !== '') {
        body.finesAmount = Number(finesAmount);
      }
      // Lets admin record what was actually received when manually confirming
      // funds after a trustin_funds_mismatch (see Audit log below) — logged
      // alongside the override for reconciliation, doesn't change sale_price.
      if (field === 'funds_confirmed' && !deal.funds_confirmed && receivedAmount !== '') {
        body.receivedAmount = Number(receivedAmount);
      }
      const { deal: updated } = await api.put(`/api/admin/deals/${id}/override`, body);
      setDeal(updated);
      setSuccess('Updated');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitTransferCert() {
    if (!transferCertUrl.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { deal: updated } = await api.put(`/api/admin/deals/${id}/override`, { transferCertUrl: transferCertUrl.trim() });
      setDeal(updated);
      setSuccess('Transfer certificate saved');
      setTransferCertUrl('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitForceStage() {
    if (!forceStageTarget || !forceStageReason.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { deal: updated, warning } = await api.put(`/api/admin/deals/${id}/force-stage`, {
        targetStage: forceStageTarget,
        reason: forceStageReason,
      });
      setDeal(updated);
      setDetailsForm(null);
      setForceStageTarget('');
      setForceStageReason('');
      setSuccess(`Stage force-set to "${STAGE_LABELS[updated.status] || updated.status}"`);
      if (warning) setError(warning);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function cancelDeal() {
    RNAlert.alert('Cancel deal', `Cancel deal ${deal.ref}? This can be reversed later using "Force stage" if needed.`, [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Cancel deal',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          setError('');
          setSuccess('');
          try {
            const { deal: updated } = await api.put(`/api/deals/${id}/stage`, { targetStage: 'cancelled' });
            setDeal(updated);
            setSuccess('Deal cancelled');
            load();
          } catch (err) {
            setError(err.message);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  async function submitReassign() {
    if (!reassignPhone.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { deal: updated, documentsRegenerated, warning } = await api.put(`/api/admin/deals/${id}/reassign`, {
        role: reassignRole,
        phone: reassignPhone.trim(),
      });
      setDeal(updated);
      setDetailsForm(null);
      setReassignPhone('');
      setSuccess(
        documentsRegenerated?.length > 0
          ? `${reassignRole === 'seller' ? 'Seller' : 'Buyer'} reassigned. Regenerated and re-sent for signature: ${documentsRegenerated.join(', ')}.`
          : `${reassignRole === 'seller' ? 'Seller' : 'Buyer'} reassigned.`
      );
      if (warning) setError(warning);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitIdentity() {
    const body = {};
    for (const [k, v] of Object.entries(identityForm)) {
      if (v.trim()) body[k] = v.trim();
    }
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { documentsRegenerated, warning } = await api.put(`/api/admin/deals/${id}/party/${identityRole}/identity`, body);
      setIdentityForm({ full_name: '', emirates_id: '', nationality: '', phone: '', email: '' });
      setSuccess(
        documentsRegenerated?.length > 0
          ? `${identityRole === 'seller' ? 'Seller' : 'Buyer'} identity updated. Regenerated and re-sent for signature: ${documentsRegenerated.join(', ')}.`
          : `${identityRole === 'seller' ? 'Seller' : 'Buyer'} identity updated.`
      );
      if (warning) setError(warning);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function resendInvite(doc) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { regenerated, warning } = await api.post(`/api/admin/deals/${id}/resend-signing-invite`, { doc });
      setSuccess(`Re-sent for signature: ${regenerated.join(', ')}.`);
      if (warning) setError(warning);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitReferral() {
    const body = {};
    if (referralPhone.trim()) body.partnerPhone = referralPhone.trim();
    if (referralSource) body.referralSource = referralSource;
    if (referralFee !== '') body.referralFee = Number(referralFee);
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { deal: updated, documentsRegenerated, warning } = await api.put(`/api/admin/deals/${id}/referral`, body);
      setDeal(updated);
      setReferralPhone('');
      setReferralFee('');
      setSuccess(
        documentsRegenerated?.length > 0
          ? `Referral info updated. Regenerated and re-sent for signature: ${documentsRegenerated.join(', ')}.`
          : 'Referral info updated.'
      );
      if (warning) setError(warning);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function removeReferralPartner() {
    RNAlert.alert('Remove referral partner', 'Remove the referral partner from this deal? Any DOC-003 already generated will be cleared.', [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          setError('');
          setSuccess('');
          try {
            const { deal: updated, warning } = await api.put(`/api/admin/deals/${id}/referral`, { partnerPhone: '' });
            setDeal(updated);
            setSuccess('Referral partner removed.');
            if (warning) setError(warning);
            load();
          } catch (err) {
            setError(err.message);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  async function shareLink(link) {
    try {
      await Share.share({ message: link });
    } catch {
      setError('Could not open share sheet — copy the link manually');
    }
  }

  if (!deal) {
    return (
      <ScrollView style={{ backgroundColor: colors.navy }} contentContainerStyle={styles.wrap}>
        <SkeletonCard />
        <ErrorBanner message={error} />
      </ScrollView>
    );
  }

  const accent = deal.product === 'safepay' ? 'green' : 'gold';

  return (
    <ScrollView style={{ backgroundColor: colors.navy }} contentContainerStyle={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.ref}>{deal.ref}</Text>
        <ProductBadge product={deal.product} />
        {deal.stuck && <Badge variant="error">Stuck</Badge>}
        {deal.status !== 'complete' && deal.status !== 'cancelled' && (
          <Button variant="secondary" loading={saving} onPress={cancelDeal} style={styles.headerBtn}>
            Cancel deal
          </Button>
        )}
      </View>
      {vehicleTitle(deal) ? (
        <Text style={styles.plate}>{vehicleTitle(deal)} · {deal.plate}</Text>
      ) : (
        <Text style={styles.plate}>{deal.plate}</Text>
      )}

      <ProgressSteps currentStage={deal.status} accent={accent} />

      <View style={{ marginTop: 12 }}>
        <ErrorBanner message={error} />
        <SuccessBanner message={success} />
      </View>

      {deal.blockedOn?.length > 0 && (
        <DarkCard style={[styles.blockedCard, { marginTop: 16 }]}>
          <Text style={styles.blockedTitle}>Why this deal is stuck at "{STAGE_LABELS[deal.status] || deal.status}"</Text>
          <View style={{ gap: 6 }}>
            {deal.blockedOn.map((b) => (
              <View key={b.field} style={styles.blockedRow}>
                <Text style={styles.blockedDot}>●</Text>
                <Text style={styles.blockedLabel}>{b.label}</Text>
              </View>
            ))}
          </View>
        </DarkCard>
      )}

      <DarkCard style={{ marginTop: 16 }}>
        <Text style={styles.cardTitle}>Vehicle</Text>
        <Row label="Plate" value={deal.plate || '—'} />
        <Row label="VIN" value={deal.vin || '—'} mono />
        <Row label="Make / Model" value={[deal.make, deal.model].filter(Boolean).join(' ') || '—'} />
        <Row label="Year" value={deal.year || '—'} />
        <Row label="Colour" value={deal.colour || '—'} />
        <Row label="Mileage" value={deal.mileage ? `${Number(deal.mileage).toLocaleString('en-AE')} km` : '—'} />
        <Row label="Emirate" value={deal.emirate || '—'} />
      </DarkCard>

      <DarkCard style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Deal summary</Text>
        <Row label="Sale price" value={formatAed(deal.sale_price)} />
        {deal.product === 'loanclear' && <Row label="Loan amount" value={formatAed(deal.loan_amount)} />}
        <Row label="Fines" value={deal.fines_verified ? formatAed(deal.fines_amount) : 'Not verified'} />
        <Row label="ClearDrive fee" value={formatAed(deal.cd_fee)} />
        <Row label="Net proceeds" value={formatAed(deal.net_proceeds)} />
      </DarkCard>

      <DarkCard style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Parties & escrow</Text>
        <Row label="Seller ID" value={deal.seller_id?.slice(0, 8) || '—'} mono />
        <Row label="Buyer ID" value={deal.buyer_id ? deal.buyer_id.slice(0, 8) : 'Not attached'} mono />
        <Row label="Escrow IBAN" value={deal.trustin_escrow_iban || '—'} mono />
        <Row label="Funds confirmed" value={deal.funds_confirmed ? 'Yes' : 'No'} />
      </DarkCard>

      {(deal.mulkiya_image_url || deal.mulkiya_back_image_url || deal.settlement_image_url || deal.bank_proof_image_url) && (
        <DarkCard style={{ marginTop: 12 }}>
          <Text style={styles.cardTitle}>Uploaded attachments</Text>
          <Text style={[styles.cardBody, { marginBottom: 12 }]}>Check the original photo if the fields below look wrong — Claude Vision extraction isn't perfect.</Text>
          <View style={{ gap: 8 }}>
            {deal.mulkiya_image_url && (
              <Text style={styles.linkText} onPress={() => Linking.openURL(deal.mulkiya_image_url)}>
                View uploaded Mulkiya — front (vehicle registration card)
              </Text>
            )}
            {deal.mulkiya_back_image_url && (
              <Text style={styles.linkText} onPress={() => Linking.openURL(deal.mulkiya_back_image_url)}>
                View uploaded Mulkiya — back
              </Text>
            )}
            {deal.settlement_image_url && (
              <Text style={styles.linkText} onPress={() => Linking.openURL(deal.settlement_image_url)}>
                View uploaded bank settlement letter
              </Text>
            )}
            {deal.bank_proof_image_url && (
              <Text style={styles.linkText} onPress={() => Linking.openURL(deal.bank_proof_image_url)}>
                View uploaded proof of proceeds account (IBAN/name match)
              </Text>
            )}
          </View>
        </DarkCard>
      )}

      <DarkCard style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Vehicle & financial details — manual correction</Text>
        <Text style={[styles.cardBody, { marginBottom: 12 }]}>
          Use this if Claude Vision misread the Mulkiya or settlement letter — check the attachment above, then correct the field(s) here. Saving
          re-checks whether the deal can now advance. If DOC-001 and/or DOC-002 were already generated (even already signed), correcting a field
          they print automatically regenerates the document and re-sends it for signature — no need to restart the deal.
        </Text>
        {detailsForm && (
          <View style={{ gap: 12 }}>
            {DETAIL_FIELDS.filter((f) => !f.loanOnly || deal.product === 'loanclear').map((f) => (
              <Input
                key={f.key}
                label={f.label}
                keyboardType={f.numeric ? 'numeric' : 'default'}
                value={String(detailsForm[f.key])}
                onChangeText={(v) => setDetailField(f.key, v)}
              />
            ))}
            <Select label="Emirate" selectedValue={detailsForm.emirate} onValueChange={(v) => setDetailField('emirate', v)}>
              {EMIRATES.map((em) => (
                <Select.Item key={em} label={em} value={em} />
              ))}
            </Select>
            <Button variant={accent} loading={saving} onPress={submitDetailsForm}>
              Save corrections
            </Button>
          </View>
        )}
      </DarkCard>

      <DarkCard style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Manual overrides</Text>
        <Text style={[styles.cardBody, { marginBottom: 12 }]}>Use only for edge cases — e.g. a signature or ID check collected outside the platform.</Text>
        <View style={{ gap: 10 }}>
          {OVERRIDE_FIELDS.filter((f) => (!f.requiresPartner || deal.referral_partner_id) && (!f.loanOnly || deal.product === 'loanclear')).map((f) => (
            <View key={f.key} style={styles.overrideItem}>
              <View style={styles.overrideRow}>
                <Text style={styles.overrideLabel}>{f.label}</Text>
                <Button
                  variant={deal[f.key] ? 'secondary' : accent}
                  loading={saving}
                  onPress={() => toggleField(f.key)}
                  style={styles.overrideBtn}
                >
                  {deal[f.key] ? 'Undo' : 'Mark complete'}
                </Button>
              </View>
              {f.key === 'fines_verified' && !deal.fines_verified && (
                <Input
                  label="Fines amount (AED) — optional, e.g. read off the RTA screenshot yourself"
                  keyboardType="numeric"
                  value={finesAmount}
                  onChangeText={setFinesAmount}
                  style={{ marginTop: 12 }}
                />
              )}
              {f.key === 'funds_confirmed' && !deal.funds_confirmed && (
                <Input
                  label={`Amount actually received (AED) — optional, to reconcile a mismatch (expected ${formatAed(deal.sale_price)})`}
                  keyboardType="numeric"
                  value={receivedAmount}
                  onChangeText={setReceivedAmount}
                  style={{ marginTop: 12 }}
                />
              )}
            </View>
          ))}
        </View>

        {deal.status === 'tasjeel' && !deal.transfer_cert_url && (
          <View style={styles.transferForm}>
            <Text style={styles.overrideLabel}>Tasjeel transfer certificate URL/reference</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Input
                value={transferCertUrl}
                onChangeText={setTransferCertUrl}
                placeholder="https://... or manual reference"
                style={{ flex: 1 }}
              />
              <Button variant={accent} loading={saving} onPress={submitTransferCert} style={styles.overrideBtn}>
                Save
              </Button>
            </View>
          </View>
        )}
        {deal.transfer_cert_url && (
          <Text style={styles.transferCaption}>
            Transfer certificate on file: <Text style={{ fontFamily: 'monospace' }}>{deal.transfer_cert_url}</Text>
          </Text>
        )}
      </DarkCard>

      {links && Object.values(links).some(Boolean) && (
        <DarkCard style={{ marginTop: 12 }}>
          <Text style={styles.cardTitle}>Links (manual share)</Text>
          <Text style={[styles.cardBody, { marginBottom: 12 }]}>
            WhatsApp delivery is mocked in this environment — share these manually until it's live.
          </Text>
          <View style={{ gap: 8 }}>
            {links.join && <LinkRow label="Join link" link={links.join} onShare={shareLink} />}
            {links.kycSeller && <LinkRow label="Seller KYC link" link={links.kycSeller} onShare={shareLink} />}
            {links.kycBuyer && <LinkRow label="Buyer KYC link" link={links.kycBuyer} onShare={shareLink} />}
            {links.signingSeller && <LinkRow label="Seller signing link" link={links.signingSeller} onShare={shareLink} />}
            {links.signingBuyer && <LinkRow label="Buyer signing link" link={links.signingBuyer} onShare={shareLink} />}
          </View>
        </DarkCard>
      )}

      {(deal.doc001_url || deal.doc002_url) && (
        <DarkCard style={{ marginTop: 12 }}>
          <Text style={styles.cardTitle}>Resend signing invite</Text>
          <Text style={[styles.cardBody, { marginBottom: 12 }]}>
            Regenerates the document fresh and re-sends it via SignNow — use if a party says they never received it, or the original upload failed.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {deal.doc001_url && (
              <Button variant="secondary" loading={saving} onPress={() => resendInvite('doc001')} style={styles.overrideBtn}>
                Resend DOC-001
              </Button>
            )}
            {deal.doc002_url && (
              <Button variant="secondary" loading={saving} onPress={() => resendInvite('doc002')} style={styles.overrideBtn}>
                Resend DOC-002
              </Button>
            )}
          </View>
        </DarkCard>
      )}

      <DarkCard style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Reassign seller/buyer</Text>
        <Text style={[styles.cardBody, { marginBottom: 12 }]}>
          Use if the wrong person was attached. Any KYC/signature already collected under the old identity is reset — it doesn't represent the
          actual party anymore.
        </Text>
        <View style={{ gap: 10 }}>
          <Select label="Role" selectedValue={reassignRole} onValueChange={setReassignRole}>
            <Select.Item label="Seller" value="seller" />
            <Select.Item label="Buyer" value="buyer" />
          </Select>
          <Input label="New phone number" value={reassignPhone} onChangeText={setReassignPhone} placeholder="+9715..." />
          <Button variant={accent} loading={saving} onPress={submitReassign}>
            Reassign
          </Button>
        </View>
      </DarkCard>

      <DarkCard style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Correct seller/buyer identity</Text>
        <Text style={[styles.cardBody, { marginBottom: 12 }]}>
          Fixes a KYC misread name/Emirates ID/nationality, or a typo'd phone/email. These fields print on DOC-001/DOC-002 — correcting them
          regenerates and re-sends any document already generated.
        </Text>
        <View style={{ gap: 10 }}>
          <Select label="Party" selectedValue={identityRole} onValueChange={setIdentityRole}>
            <Select.Item label="Seller" value="seller" />
            <Select.Item label="Buyer" value="buyer" />
          </Select>
          <Input label="Full name" value={identityForm.full_name} onChangeText={(v) => setIdentityForm((f) => ({ ...f, full_name: v }))} />
          <Input label="Emirates ID" value={identityForm.emirates_id} onChangeText={(v) => setIdentityForm((f) => ({ ...f, emirates_id: v }))} />
          <Input label="Nationality" value={identityForm.nationality} onChangeText={(v) => setIdentityForm((f) => ({ ...f, nationality: v }))} />
          <Input label="Phone" value={identityForm.phone} onChangeText={(v) => setIdentityForm((f) => ({ ...f, phone: v }))} />
          <Input label="Email" value={identityForm.email} onChangeText={(v) => setIdentityForm((f) => ({ ...f, email: v }))} />
          <Button variant={accent} loading={saving} onPress={submitIdentity}>
            Save identity correction
          </Button>
        </View>
      </DarkCard>

      <DarkCard style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Referral partner</Text>
        <Text style={[styles.cardBody, { marginBottom: 12 }]}>
          Attach, correct, or remove the dealer/broker who referred this deal — sellers often only mention this after the deal has already
          started, or the wrong one gets entered. Attaching/changing a partner on a deal that already has DOC-001 generates DOC-003 (or
          regenerates it if a fee override is also saved) and sends it for signature.
        </Text>
        <View style={styles.overrideItem}>
          <Row label="Partner ID" value={deal.referral_partner_id ? deal.referral_partner_id.slice(0, 8) : 'None attached'} mono />
          <Row label="Source" value={deal.referral_source || '—'} />
          <Row label="Referral fee" value={deal.referral_fee ? formatAed(deal.referral_fee) : '—'} />
          <Row label="Fee paid" value={deal.referral_fee_paid ? 'Yes' : 'No'} />
          {deal.referral_partner_id && (
            <Button variant="secondary" loading={saving} onPress={removeReferralPartner} style={[styles.overrideBtn, { marginTop: 8 }]}>
              Remove referral partner
            </Button>
          )}
        </View>
        <View style={{ gap: 10, marginTop: 12 }}>
          <Input
            label="Partner phone (attach or change)"
            value={referralPhone}
            onChangeText={setReferralPhone}
            placeholder="+9715... — leave blank to only change source/fee"
          />
          <Select label="Referral source" selectedValue={referralSource} onValueChange={setReferralSource}>
            {REFERRAL_SOURCES.map((s) => (
              <Select.Item key={s} label={s} value={s} />
            ))}
          </Select>
          <Input
            label="Referral fee override (AED) — optional"
            keyboardType="numeric"
            value={referralFee}
            onChangeText={setReferralFee}
          />
          <Button variant={accent} loading={saving} onPress={submitReferral}>
            Save referral info
          </Button>
        </View>
      </DarkCard>

      <DarkCard style={[styles.blockedCard, { marginTop: 12 }]}>
        <Text style={styles.cardTitle}>Force stage (advanced)</Text>
        <Text style={[styles.cardBody, { marginBottom: 12 }]}>
          Bypasses the normal forward-only flow — the only way to reopen a cancelled deal, revert a stage, or un-complete a deal. Does NOT
          re-trigger automation for the new stage (no WhatsApp, no document generation, no TrustIn/escrow calls) — use the tools above afterwards
          if the new stage needs any of that. Moving to an earlier stage automatically resets the verification flag(s) that stage requires (e.g.
          KYC-complete, signed, funds-confirmed), so the deal can't silently skip back past it — you'll still need to manually share the affected
          party the relevant link (see Links card above) since no notification is sent automatically.
        </Text>
        <View style={{ gap: 10 }}>
          <Select label="Target stage" selectedValue={forceStageTarget} onValueChange={setForceStageTarget}>
            <Select.Item label="Select a stage…" value="" />
            {ALL_STAGES.map((s) => (
              <Select.Item key={s} label={STAGE_LABELS[s] || s} value={s} />
            ))}
          </Select>
          <Input
            label="Reason (required, for the audit log)"
            value={forceStageReason}
            onChangeText={setForceStageReason}
            placeholder="e.g. cancelled by mistake, both parties want to resume"
          />
          <Button variant="secondary" loading={saving} onPress={submitForceStage} disabled={!forceStageTarget || !forceStageReason.trim()}>
            Force stage change
          </Button>
        </View>
      </DarkCard>

      {auditLog?.length > 0 && (
        <DarkCard style={{ marginTop: 12 }}>
          <Text style={styles.cardTitle}>Audit log</Text>
          <View style={{ gap: 8 }}>
            {auditLog.map((entry) => (
              <View key={entry.id} style={styles.overrideItem}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[styles.overrideLabel, { flex: 0, fontWeight: 'bold' }]}>{entry.action}</Text>
                  <Text style={{ color: entry.status === 'failed' ? colors.error : colors.white40, fontSize: 11 }}>{entry.status}</Text>
                </View>
                <Text style={{ color: colors.white40, fontSize: 11, marginTop: 2 }}>{new Date(entry.created_at).toLocaleString('en-AE')}</Text>
                {entry.payload && <Text style={{ color: colors.white50, fontSize: 11, marginTop: 4 }}>{JSON.stringify(entry.payload)}</Text>}
              </View>
            ))}
          </View>
        </DarkCard>
      )}

      <View style={{ marginTop: 24 }}>
        <Timeline currentStage={deal.status} />
      </View>
    </ScrollView>
  );
}

function LinkRow({ label, link, onShare }) {
  return (
    <View style={[styles.overrideItem, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.white40, fontSize: 10 }}>{label}</Text>
        <Text style={{ color: colors.white70, fontSize: 12, fontFamily: 'monospace' }} numberOfLines={1}>
          {link}
        </Text>
      </View>
      <Button variant="secondary" onPress={() => onShare(link)} style={styles.overrideBtn}>
        Share
      </Button>
    </View>
  );
}

function Row({ label, value, mono }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && { fontFamily: 'monospace' }]}>{value}</Text>
    </View>
  );
}

function Timeline({ currentStage }) {
  const currentIdx = stageIndex(currentStage);
  return (
    <View>
      <Text style={styles.timelineHeading}>Timeline</Text>
      <View style={{ gap: 8 }}>
        {STAGE_ORDER.map((stage, idx) => (
          <View key={stage} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ color: idx <= currentIdx ? colors.green : colors.white20 }}>{idx < currentIdx ? '✓' : idx === currentIdx ? '●' : '○'}</Text>
            <Text style={{ color: idx <= currentIdx ? colors.white70 : colors.white30, fontFamily: fonts.sans, fontSize: 13 }}>{STAGE_LABELS[stage]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 48 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  headerBtn: { marginLeft: 'auto', paddingVertical: 6, paddingHorizontal: 12 },
  ref: { fontFamily: fonts.display, fontSize: 20, fontWeight: 'bold', color: colors.white },
  plate: { fontFamily: fonts.sans, fontSize: 13, color: colors.white40, marginBottom: 8 },
  cardTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.white, marginBottom: 8 },
  cardBody: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
  rowValue: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.white },
  overrideItem: { borderRadius: 10, borderWidth: 1, borderColor: colors.white8, backgroundColor: colors.white4, padding: 12 },
  overrideRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  overrideLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.white70, flex: 1 },
  overrideBtn: { paddingVertical: 8, paddingHorizontal: 14 },
  timelineHeading: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.white40, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  blockedCard: { borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)' },
  blockedTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.white, marginBottom: 8 },
  blockedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  blockedDot: { color: colors.error, marginTop: 2, fontSize: 12 },
  blockedLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.white70, flex: 1 },
  transferForm: { marginTop: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.white8, backgroundColor: colors.white4, padding: 12 },
  transferCaption: { fontFamily: fonts.sans, fontSize: 11, color: colors.white40, marginTop: 12 },
  linkText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.gold, textDecorationLine: 'underline' },
});
