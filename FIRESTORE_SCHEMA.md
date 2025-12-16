# Firestore Schema Notes

## Collections

### `screams`
Documents keyed by Stripe `paymentIntent` IDs and created via the Stripe webhook when a Chat Screamer donation succeeds.
- `streamerId` (string): UID of the streamer receiving the donation.
- `donorName` (string): Display name of the donor.
- `message` (string): Sanitized donation message.
- `amount` (number): Donation amount in USD.
- `tier` (string): Scream tier (`standard`, `loud`, `maximum`).
- `paymentIntentId` (string): Stripe PaymentIntent ID.
- `createdAt` (timestamp): Server timestamp when the record was written.

### `stripe_events`
Processed Stripe webhook events used for idempotency and replay protection.
- `type` (string): Stripe event type (e.g., `payment_intent.succeeded`).
- `paymentIntentId` (string|null): Related PaymentIntent ID when present.
- `processed` (bool): Whether the event handlers finished successfully.
- `createdAt` (timestamp): When the event was first observed.
- `processedAt` (timestamp): When the event was marked complete.

## Indexing

No composite indexes are required for the webhook changes. Single-field lookups on `screams.paymentIntentId` and `stripe_events` documents rely on default indexes.
