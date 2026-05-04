import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ConstructionMaterialController } from '../controllers/ConstructionMaterialController';
import { authenticate } from '../middleware/auth';
import { backendUploadsRoot } from '../lib/uploads';

const router = Router();
const constructionMaterialController = new ConstructionMaterialController();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Apenas arquivos de imagem são permitidos'));
  }
});

router.use(authenticate);

// Upload de imagem do produto
router.post('/upload-image', (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Erro no upload da imagem';
      res.status(400).json({ success: false, message });
      return;
    }
    next();
  });
}, (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ success: false, message: 'Selecione uma imagem para enviar' });
      return;
    }

    const uploadsDir = path.join(backendUploadsRoot, 'construction-materials');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const ext = path.extname(req.file.originalname || '') || '.bin';
    const fileName = `${uuidv4()}${ext.length <= 8 ? ext : '.bin'}`;
    fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);

    res.json({
      success: true,
      data: {
        url: `/uploads/construction-materials/${fileName}`,
        originalName: req.file.originalname || fileName
      }
    });
  } catch (error) {
    next(error);
  }
});

// Listar todos os materiais
router.get('/', (req, res, next) => 
  constructionMaterialController.getAllMaterials(req, res, next)
);

// Obter material por ID
router.get('/:id', (req, res, next) => 
  constructionMaterialController.getMaterialById(req, res, next)
);

// Criar novo material
router.post('/', (req, res, next) => 
  constructionMaterialController.createMaterial(req, res, next)
);

// Atualizar material
router.patch('/:id', (req, res, next) => 
  constructionMaterialController.updateMaterial(req, res, next)
);

// Deletar material
router.delete('/:id', (req, res, next) => 
  constructionMaterialController.deleteMaterial(req, res, next)
);

export default router;

