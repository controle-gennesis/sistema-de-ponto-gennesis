import { Router } from 'express';
import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { trainingService } from '../services/TrainingService';

const router = Router();

/** Administração da central de treinamentos (criar cursos, aulas e avaliações). */
const TRAINING_ADMIN_KEY = pathToModuleKey('/ponto/treinamentos/administracao');

async function assertCanManageTraining(req: AuthRequest) {
  if (!req.user) throw createError('Usuário não autenticado', 401);
  if (req.user.isAdmin) return req.user.id;
  const allowed = await prisma.userPermission.findFirst({
    where: {
      userId: req.user.id,
      module: TRAINING_ADMIN_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true
    }
  });
  if (!allowed) throw createError('Sem permissão para administrar treinamentos', 403);
  return req.user.id;
}

function requireUserId(req: AuthRequest) {
  if (!req.user) throw createError('Usuário não autenticado', 401);
  return req.user.id;
}

router.use(authenticate);

// ── Aluno ───────────────────────────────────────────────────────────

router.get('/my-courses', async (req: AuthRequest, res, next) => {
  try {
    const data = await trainingService.listMyCourses(requireUserId(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/my-certificates', async (req: AuthRequest, res, next) => {
  try {
    const data = await trainingService.listMyCertificates(requireUserId(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/certificates/:code', async (req: AuthRequest, res, next) => {
  try {
    const userId = requireUserId(req);
    const data = await trainingService.getCertificate({
      code: req.params.code,
      userId: req.user?.isAdmin ? undefined : userId
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/courses/:id/student', async (req: AuthRequest, res, next) => {
  try {
    const data = await trainingService.getCourseForStudent(req.params.id, requireUserId(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/courses/:id/enroll', async (req: AuthRequest, res, next) => {
  try {
    const data = await trainingService.enrollSelf(req.params.id, requireUserId(req));
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/courses/:id/lessons/:lessonId/complete', async (req: AuthRequest, res, next) => {
  try {
    const data = await trainingService.completeLesson(
      req.params.id,
      req.params.lessonId,
      requireUserId(req)
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/courses/:id/quiz', async (req: AuthRequest, res, next) => {
  try {
    const data = await trainingService.submitQuiz(
      req.params.id,
      requireUserId(req),
      req.body?.answers
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ── Administração ───────────────────────────────────────────────────

router.get('/admin/courses', async (req: AuthRequest, res, next) => {
  try {
    await assertCanManageTraining(req);
    const data = await trainingService.listCourses({
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      includeUnpublished: true
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/courses/:id', async (req: AuthRequest, res, next) => {
  try {
    await assertCanManageTraining(req);
    const data = await trainingService.getCourseAdmin(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/courses', async (req: AuthRequest, res, next) => {
  try {
    const userId = await assertCanManageTraining(req);
    const data = await trainingService.createCourse(req.body ?? {}, userId);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/courses/:id', async (req: AuthRequest, res, next) => {
  try {
    await assertCanManageTraining(req);
    const data = await trainingService.updateCourse(req.params.id, req.body ?? {});
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/courses/:id', async (req: AuthRequest, res, next) => {
  try {
    await assertCanManageTraining(req);
    const data = await trainingService.deleteCourse(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/courses/:id/lessons', async (req: AuthRequest, res, next) => {
  try {
    await assertCanManageTraining(req);
    const data = await trainingService.createLesson(req.params.id, req.body ?? {});
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/lessons/:lessonId', async (req: AuthRequest, res, next) => {
  try {
    await assertCanManageTraining(req);
    const data = await trainingService.updateLesson(req.params.lessonId, req.body ?? {});
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/lessons/:lessonId', async (req: AuthRequest, res, next) => {
  try {
    await assertCanManageTraining(req);
    const data = await trainingService.deleteLesson(req.params.lessonId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/courses/:id/lessons/reorder', async (req: AuthRequest, res, next) => {
  try {
    await assertCanManageTraining(req);
    const data = await trainingService.reorderLessons(req.params.id, req.body?.lessonIds);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/courses/:id/questions', async (req: AuthRequest, res, next) => {
  try {
    await assertCanManageTraining(req);
    const data = await trainingService.createQuestion(req.params.id, req.body ?? {});
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/questions/:questionId', async (req: AuthRequest, res, next) => {
  try {
    await assertCanManageTraining(req);
    const data = await trainingService.updateQuestion(req.params.questionId, req.body ?? {});
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/questions/:questionId', async (req: AuthRequest, res, next) => {
  try {
    await assertCanManageTraining(req);
    const data = await trainingService.deleteQuestion(req.params.questionId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/courses/:id/enrollments', async (req: AuthRequest, res, next) => {
  try {
    await assertCanManageTraining(req);
    const data = await trainingService.listEnrollments(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/courses/:id/enrollments', async (req: AuthRequest, res, next) => {
  try {
    await assertCanManageTraining(req);
    const data = await trainingService.enrollUsers(req.params.id, req.body?.userIds);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/enrollments/:enrollmentId', async (req: AuthRequest, res, next) => {
  try {
    await assertCanManageTraining(req);
    const data = await trainingService.removeEnrollment(req.params.enrollmentId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
