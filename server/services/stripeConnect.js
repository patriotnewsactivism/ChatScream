import Stripe from 'stripe';

const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
const stripe = new Stripe(stripeKey, {
  apiVersion: '2023-10-16',
});

export class StripeConnectService {
  /**
   * Create a Stripe Connect Custom Account for instant streamer payouts
   */
  async createStreamerAccount(streamerData) {
    const { email, country = 'US', streamerId, businessProfile = {} } = streamerData;

    const account = await stripe.accounts.create({
      type: 'custom',
      country,
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: {
        mcc: '5815',
        url: businessProfile.url || 'https://chatscream.live',
        ...businessProfile,
      },
      metadata: {
        streamerId,
        platform: 'chatscream',
      },
    });

    return account;
  }

  /**
   * Generate onboarding Account Link
   */
  async createAccountLink(accountId, returnUrl, refreshUrl) {
    return await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
  }

  /**
   * Transfer earnings to streamer's connected account
   */
  async transferToStreamer(accountId, amountInCents, currency = 'usd', transferGroup = null) {
    return await stripe.transfers.create({
      amount: Math.round(amountInCents),
      currency,
      destination: accountId,
      transfer_group: transferGroup || `payout_${Date.now()}`,
    });
  }

  /**
   * Trigger instant payout from connected account to their debit card / bank
   */
  async executeInstantPayout(accountId, amountInCents, currency = 'usd') {
    return await stripe.payouts.create(
      {
        amount: Math.round(amountInCents),
        currency,
        method: 'instant',
      },
      {
        stripeAccount: accountId,
      }
    );
  }

  /**
   * Fetch connected account balance and payout eligibility
   */
  async getAccountStatus(accountId) {
    const [account, balance] = await Promise.all([
      stripe.accounts.retrieve(accountId),
      stripe.balance.retrieve({ stripeAccount: accountId }),
    ]);

    return {
      id: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      availableBalance: balance.available,
      pendingBalance: balance.pending,
      instantPayoutEligible: account.payouts_enabled,
    };
  }
}

export const stripeConnectService = new StripeConnectService();
