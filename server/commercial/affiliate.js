import { createAffiliateCode, getUserByUid, listUsers, putUser } from '../store.js';

export const DEFAULT_AFFILIATE_COMMISSION_RATE = 0.5;
const LEGACY_DEFAULT_COMMISSION_RATE = 0.2;
const MAX_LEDGER_ENTRIES = 1000;

const normalizeCode = (value = '') => String(value || '').trim().toUpperCase();
const nowIso = () => new Date().toISOString();
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const normalizeRate = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    return DEFAULT_AFFILIATE_COMMISSION_RATE;
  }
  // Migrate the old hard-coded 20% default while preserving future negotiated rates.
  if (Math.abs(parsed - LEGACY_DEFAULT_COMMISSION_RATE) < 0.000001) {
    return DEFAULT_AFFILIATE_COMMISSION_RATE;
  }
  return parsed;
};

export const normalizeAffiliate = (record) => {
  const existing = record?.profile?.affiliate || {};
  const code = normalizeCode(existing.code || createAffiliateCode());
  const ledger = Array.isArray(existing.commissionLedger) ? existing.commissionLedger : [];

  return {
    ...existing,
    code,
    commissionRate: normalizeRate(existing.commissionRate),
    referrals: Math.max(0, Number(existing.referrals || existing.totalReferrals || 0)),
    totalReferrals: Math.max(0, Number(existing.totalReferrals || existing.referrals || 0)),
    totalEarnings: roundMoney(existing.totalEarnings),
    pendingPayout: roundMoney(existing.pendingPayout),
    paidOut: roundMoney(existing.paidOut),
    commissionLedger: ledger.slice(-MAX_LEDGER_ENTRIES),
    createdAt: existing.createdAt || nowIso(),
    isActive: existing.isActive !== false,
  };
};

export const ensureDurableAffiliate = async (record) => {
  if (!record) return null;
  const affiliate = normalizeAffiliate(record);
  const profile = {
    ...record.profile,
    affiliate,
  };
  await putUser({ ...record, profile });
  return { ...record, profile };
};

export const findAffiliateByCode = async (rawCode) => {
  const code = normalizeCode(rawCode);
  if (!code) return null;

  const users = await listUsers();
  const owner = users.find(
    (user) => normalizeCode(user?.profile?.affiliate?.code) === code,
  );
  if (!owner) return null;

  return {
    code,
    ownerId: owner.uid,
    ownerEmail: owner.email,
    ownerName: owner.profile?.displayName || owner.email?.split('@')?.[0] || 'Affiliate',
    ...normalizeAffiliate(owner),
  };
};

export const recordDurableReferral = async ({
  referredUserId,
  referralCode,
  referrerId,
}) => {
  const referred = await getUserByUid(referredUserId);
  if (!referred) return { recorded: false, reason: 'referred_user_not_found' };

  let referrer = referrerId ? await getUserByUid(referrerId) : null;
  if (!referrer && referralCode) {
    const match = await findAffiliateByCode(referralCode);
    if (match?.ownerId) referrer = await getUserByUid(match.ownerId);
  }
  if (!referrer || referrer.uid === referred.uid) {
    return { recorded: false, reason: 'invalid_referrer' };
  }

  const referrerWithAffiliate = await ensureDurableAffiliate(referrer);
  const affiliate = normalizeAffiliate(referrerWithAffiliate);

  const existingReferrerId = String(referred.profile?.referredByUserId || '').trim();
  if (existingReferrerId) {
    return {
      recorded: existingReferrerId === referrer.uid,
      reason: existingReferrerId === referrer.uid ? 'already_recorded' : 'already_attributed',
    };
  }

  const referredProfile = {
    ...referred.profile,
    referredByCode: affiliate.code,
    referredByUserId: referrer.uid,
    referralAttributedAt: nowIso(),
  };
  await putUser({ ...referred, profile: referredProfile });

  const nextAffiliate = {
    ...affiliate,
    referrals: Number(affiliate.referrals || 0) + 1,
    totalReferrals: Number(affiliate.totalReferrals || 0) + 1,
  };
  await putUser({
    ...referrerWithAffiliate,
    profile: {
      ...referrerWithAffiliate.profile,
      affiliate: nextAffiliate,
    },
  });

  return { recorded: true, affiliateCode: affiliate.code, referrerId: referrer.uid };
};

const sumTaxCents = (invoice) => {
  const legacyTax = Array.isArray(invoice?.total_tax_amounts)
    ? invoice.total_tax_amounts.reduce((sum, item) => sum + Math.max(0, Number(item?.amount) || 0), 0)
    : 0;
  const currentTax = Array.isArray(invoice?.total_taxes)
    ? invoice.total_taxes.reduce((sum, item) => sum + Math.max(0, Number(item?.amount) || 0), 0)
    : 0;
  return Math.max(legacyTax, currentTax);
};

export const eligibleInvoiceRevenueCents = (invoice) => {
  const amountPaid = Math.max(0, Number(invoice?.amount_paid) || 0);
  const excludingTax = Number(invoice?.total_excluding_tax);
  if (Number.isFinite(excludingTax) && excludingTax >= 0) {
    return Math.max(0, Math.min(amountPaid, excludingTax));
  }
  return Math.max(0, amountPaid - sumTaxCents(invoice));
};

const getAffiliateOwnerForSubscriber = async (subscriberRecord) => {
  const referrerId = String(subscriberRecord?.profile?.referredByUserId || '').trim();
  if (referrerId) return getUserByUid(referrerId);

  const referralCode = normalizeCode(subscriberRecord?.profile?.referredByCode);
  if (!referralCode) return null;
  const match = await findAffiliateByCode(referralCode);
  return match?.ownerId ? getUserByUid(match.ownerId) : null;
};

export const accrueAffiliateCommission = async ({
  subscriberRecord,
  invoice,
  eventId,
}) => {
  if (!subscriberRecord || !invoice) return { accrued: false, reason: 'missing_context' };

  const referrer = await getAffiliateOwnerForSubscriber(subscriberRecord);
  if (!referrer || referrer.uid === subscriberRecord.uid) {
    return { accrued: false, reason: 'no_referrer' };
  }

  const referrerWithAffiliate = await ensureDurableAffiliate(referrer);
  const affiliate = normalizeAffiliate(referrerWithAffiliate);
  if (!affiliate.isActive) return { accrued: false, reason: 'affiliate_inactive' };

  const invoiceId = String(invoice.id || '').trim();
  const uniqueEventId = String(eventId || invoiceId).trim();
  const ledger = [...affiliate.commissionLedger];
  if (
    ledger.some(
      (entry) =>
        (uniqueEventId && entry.eventId === uniqueEventId) ||
        (invoiceId && entry.invoiceId === invoiceId && entry.type === 'commission'),
    )
  ) {
    return { accrued: false, reason: 'duplicate' };
  }

  const eligibleRevenueCents = eligibleInvoiceRevenueCents(invoice);
  if (eligibleRevenueCents <= 0) return { accrued: false, reason: 'no_eligible_revenue' };

  const commissionRate = normalizeRate(affiliate.commissionRate);
  const commissionCents = Math.max(0, Math.floor(eligibleRevenueCents * commissionRate));
  if (commissionCents <= 0) return { accrued: false, reason: 'zero_commission' };

  ledger.push({
    id: `commission_${uniqueEventId || invoiceId || Date.now()}`,
    type: 'commission',
    eventId: uniqueEventId,
    invoiceId,
    subscriberUserId: subscriberRecord.uid,
    grossCollectedCents: Math.max(0, Number(invoice.amount_paid) || 0),
    eligibleRevenueCents,
    commissionRate,
    commissionCents,
    status: 'pending',
    createdAt: nowIso(),
  });

  const amount = commissionCents / 100;
  const nextAffiliate = {
    ...affiliate,
    commissionRate,
    totalEarnings: roundMoney(Number(affiliate.totalEarnings || 0) + amount),
    pendingPayout: roundMoney(Number(affiliate.pendingPayout || 0) + amount),
    commissionLedger: ledger.slice(-MAX_LEDGER_ENTRIES),
  };

  await putUser({
    ...referrerWithAffiliate,
    profile: { ...referrerWithAffiliate.profile, affiliate: nextAffiliate },
  });

  return {
    accrued: true,
    affiliateUserId: referrer.uid,
    eligibleRevenueCents,
    commissionCents,
    commissionRate,
  };
};

export const reverseAffiliateCommission = async ({
  subscriberRecord,
  invoiceId,
  adjustmentCents,
  eventId,
  reason = 'refund',
  cumulativeAdjustment = false,
}) => {
  if (!subscriberRecord || !invoiceId || !eventId) {
    return { reversed: false, reason: 'missing_context' };
  }

  const referrer = await getAffiliateOwnerForSubscriber(subscriberRecord);
  if (!referrer) return { reversed: false, reason: 'no_referrer' };

  const referrerWithAffiliate = await ensureDurableAffiliate(referrer);
  const affiliate = normalizeAffiliate(referrerWithAffiliate);
  const ledger = [...affiliate.commissionLedger];
  if (ledger.some((entry) => entry.eventId === eventId)) {
    return { reversed: false, reason: 'duplicate' };
  }

  const originalCommission = ledger
    .filter((entry) => entry.invoiceId === invoiceId && entry.type === 'commission')
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.commissionCents) || 0), 0);
  const priorReversals = ledger
    .filter((entry) => entry.invoiceId === invoiceId && entry.type === 'reversal')
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.commissionCents) || 0), 0);
  const remainingCommission = Math.max(0, originalCommission - priorReversals);
  if (remainingCommission <= 0) return { reversed: false, reason: 'nothing_to_reverse' };

  let requested = Math.max(0, Number(adjustmentCents) || 0);
  if (cumulativeAdjustment) {
    const alreadyAppliedBase = ledger
      .filter(
        (entry) =>
          entry.invoiceId === invoiceId &&
          entry.type === 'reversal' &&
          entry.reason === reason,
      )
      .reduce((sum, entry) => sum + Math.max(0, Number(entry.adjustmentCents) || 0), 0);
    requested = Math.max(0, requested - alreadyAppliedBase);
  }

  const calculated = requested > 0
    ? Math.floor(requested * normalizeRate(affiliate.commissionRate))
    : remainingCommission;
  const commissionCents = Math.min(remainingCommission, Math.max(0, calculated));
  if (commissionCents <= 0) return { reversed: false, reason: 'zero_reversal' };

  ledger.push({
    id: `reversal_${eventId}`,
    type: 'reversal',
    eventId,
    invoiceId,
    subscriberUserId: subscriberRecord.uid,
    reason,
    adjustmentCents: requested,
    commissionCents,
    status: 'applied',
    createdAt: nowIso(),
  });

  const amount = commissionCents / 100;
  const nextAffiliate = {
    ...affiliate,
    totalEarnings: roundMoney(Math.max(0, Number(affiliate.totalEarnings || 0) - amount)),
    pendingPayout: roundMoney(Math.max(0, Number(affiliate.pendingPayout || 0) - amount)),
    commissionLedger: ledger.slice(-MAX_LEDGER_ENTRIES),
  };

  await putUser({
    ...referrerWithAffiliate,
    profile: { ...referrerWithAffiliate.profile, affiliate: nextAffiliate },
  });

  return { reversed: true, commissionCents, adjustmentCents: requested };
};
