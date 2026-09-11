import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getSinapiComposition,
  getSinapiCompositionTree,
  getSinapiItem,
  getSinapiMetadata,
  searchSinapiCompositions,
  searchSinapiItems
} from '../services/SinapiService';

const router = Router();

router.use(authenticate);

router.get('/metadata', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await getSinapiMetadata() });
  } catch (error) {
    next(error);
  }
});

router.get('/compositions', async (req, res, next) => {
  try {
    const { data, meta } = await searchSinapiCompositions({
      search: req.query.search,
      unit: req.query.unit,
      state: req.query.state,
      month: req.query.month,
      isDesonerated: req.query.isDesonerated,
      page: req.query.page,
      limit: req.query.limit
    });
    res.json({ success: true, data, meta });
  } catch (error) {
    next(error);
  }
});

router.get('/compositions/:code', async (req, res, next) => {
  try {
    const data = await getSinapiComposition(req.params.code, {
      state: req.query.state,
      month: req.query.month,
      isDesonerated: req.query.isDesonerated
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/compositions/:code/tree', async (req, res, next) => {
  try {
    const data = await getSinapiCompositionTree(req.params.code, {
      state: req.query.state,
      month: req.query.month,
      isDesonerated: req.query.isDesonerated,
      maxDepth: req.query.maxDepth
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/items', async (req, res, next) => {
  try {
    const { data, meta } = await searchSinapiItems({
      search: req.query.search,
      unit: req.query.unit,
      state: req.query.state,
      month: req.query.month,
      isDesonerated: req.query.isDesonerated,
      page: req.query.page,
      limit: req.query.limit
    });
    res.json({ success: true, data, meta });
  } catch (error) {
    next(error);
  }
});

router.get('/items/:code', async (req, res, next) => {
  try {
    const data = await getSinapiItem(req.params.code, {
      state: req.query.state,
      month: req.query.month,
      isDesonerated: req.query.isDesonerated
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
