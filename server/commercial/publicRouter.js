import express from 'express';
import { findAffiliateByCode } from './affiliate.js';

const router = express.Router();

router.get('/affiliate/:code', async (req, res, next) => {
  try {
    const affiliate = await findAffiliateByCode(req.params.code);
    if (!affiliate || affiliate.isActive === false) {
      res.status(404).json({ message: 'Affiliate code not found.' });
      return;
    }

    res.json({
      affiliate: {
        code: affiliate.code,
        ownerName: affiliate.ownerName || 'ChatScream creator',
        bonusTrialDays: Math.max(0, Number(affiliate.bonusTrialDays || 3)),
        isActive: true,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
