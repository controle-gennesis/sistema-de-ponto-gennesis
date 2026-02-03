// Carregar variáveis de ambiente PRIMEIRO, antes de qualquer importação
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

// Log de configuração das variáveis de ambiente
console.log('🔧 Configuração carregada:');
console.log(`   📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
console.log(`   🗄️  Database: ${process.env.DATABASE_URL ? '✅ Configurada' : '❌ Não configurada'}`);
console.log(`   🔐 JWT Secret: ${process.env.JWT_SECRET ? '✅ Configurada' : '❌ Não configurada'}`);
console.log(`   ☁️  AWS S3: ${process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? '✅ Configurado' : '❌ Não configurado'}`);
console.log(`   📦 Bucket: ${process.env.AWS_S3_BUCKET || 'sistema-ponto-fotos'}`);
console.log('');

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import timeRecordRoutes from './routes/timeRecords';
import vacationRoutes from './routes/vacations';
import overtimeRoutes from './routes/overtime';
import reportRoutes from './routes/reports';
import companyRoutes from './routes/company';
import dashboardRoutes from './routes/dashboard';
import bankHoursRoutes from './routes/bankHours';
import medicalCertificateRoutes from './routes/medicalCertificates';
import payrollRoutes from './routes/payroll';
// import borderRoutes from './routes/border';
import salaryAdjustmentRoutes from './routes/salaryAdjustments';
import salaryDiscountRoutes from './routes/salaryDiscounts';
import pointCorrectionRoutes from './routes/pointCorrections';
import holidayRoutes from './routes/holidays';
import chatRoutes from './routes/chats';
// import chatGPTRoutes from './routes/chatgpt';
// import materialRequestRoutes from './routes/materialRequests';
// import costCenterRoutes from './routes/costCenters';
// import constructionMaterialRoutes from './routes/constructionMaterials';

console.log('🚀 Iniciando aplicação...');

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Configurar trust proxy para funcionar corretamente com Railway/proxy reverso
// Confia apenas no primeiro proxy (Railway), não em todos os proxies
// Isso permite obter o IP real do cliente via X-Forwarded-For de forma segura
app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.RAILWAY_ENVIRONMENT === 'production' ||
                     !process.env.NODE_ENV ||
                     !!process.env.PORT;

const allowedOrigins = [
  'https://sistema-pontofrontend-production.up.railway.app',
  'https://sistema-pontobackend-production.up.railway.app',
  'http://localhost:3000',
  'http://localhost:19006'
];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin) || 
        origin.includes('railway.app') || origin.includes('localhost') || 
        !isProduction) {
      return callback(null, true);
    }
    console.error('❌ Origem não permitida pelo CORS:', origin);
    callback(new Error('Não permitido pelo CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Handler para requisições OPTIONS (preflight CORS) - DEVE estar ANTES do rate limiter
app.options('*', cors(corsOptions));

// Middleware de segurança - Configurado para não bloquear CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Muitas tentativas de acesso. Tente novamente em 15 minutos.',
}));

// Rate limiting geral - ignorar requisições OPTIONS (preflight CORS)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // máximo 1000 requests por IP (mais permissivo para desenvolvimento)
  message: 'Muitas tentativas de acesso. Tente novamente em 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS', // Ignorar requisições OPTIONS (preflight)
  handler: (req, res) => {
    // Garantir que headers CORS sejam enviados mesmo quando rate limit é atingido
    const origin = req.headers.origin;
    if (origin && (origin.includes('railway.app') || origin.includes('localhost'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.status(429).json({
      success: false,
      message: 'Muitas tentativas de acesso. Tente novamente em 15 minutos.'
    });
  }
});

// Rate limiting mais permissivo para /auth/me (endpoint usado frequentemente)
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // máximo 100 requests por minuto por IP
  message: 'Muitas tentativas de acesso. Tente novamente em 1 minuto.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS', // Ignorar requisições OPTIONS (preflight)
  handler: (req, res) => {
    // Garantir que headers CORS sejam enviados mesmo quando rate limit é atingido
    const origin = req.headers.origin;
    if (origin && (origin.includes('railway.app') || origin.includes('localhost'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.status(429).json({
      success: false,
      message: 'Muitas tentativas de acesso. Tente novamente em 1 minuto.'
    });
  }
});

app.use(limiter);

// Aplicar rate limiter mais permissivo para /auth/me antes das rotas
app.use('/api/auth/me', authLimiter);

// Logging
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if ((process.env.STORAGE_PROVIDER || '').toLowerCase() === 'local' || !process.env.AWS_ACCESS_KEY_ID) {
  app.use('/uploads', express.static(path.join(process.cwd(), 'apps', 'backend', 'uploads')));
}

app.options('*', cors(corsOptions));
// Handler OPTIONS já foi movido para antes do rate limiter acima

// Health check
app.get('/health', (req, res) => {
  console.log('🔍 Health check solicitado');
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    port: PORT,
  });
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/time-records', timeRecordRoutes);
app.use('/api/vacations', vacationRoutes);
app.use('/api/overtime', overtimeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/bank-hours', bankHoursRoutes);
app.use('/api/medical-certificates', medicalCertificateRoutes);
app.use('/api/payroll', payrollRoutes);
// app.use('/api/border', borderRoutes);
app.use('/api/salary-adjustments', salaryAdjustmentRoutes);
app.use('/api/salary-discounts', salaryDiscountRoutes);
app.use('/api/solicitacoes', pointCorrectionRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/chats', chatRoutes);
// app.use('/api/chatgpt', chatGPTRoutes);
// app.use('/api/material-requests', materialRequestRoutes);
// app.use('/api/cost-centers', costCenterRoutes);
// app.use('/api/construction-materials', constructionMaterialRoutes);

// Middleware de erro 404
app.use(notFound);

// Middleware de tratamento de erros
app.use(errorHandler);

// Configurar timezone
process.env.TZ = 'America/Sao_Paulo';

// Iniciar servidor
try {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('🎉 SERVIDOR INICIADO COM SUCESSO!');
    console.log('═══════════════════════════════════════');
    console.log(`🚀 Porta: ${PORT}`);
    console.log(`📊 Ambiente: ${process.env.NODE_ENV}`);
    console.log(`🌍 Timezone: ${process.env.TZ}`);
    console.log(`🔗 Health check: http://0.0.0.0:${PORT}/health`);
    console.log(`🌐 API Base: http://0.0.0.0:${PORT}/api`);
    console.log('═══════════════════════════════════════');
    console.log('');
  });
} catch (error) {
  console.error('❌ Erro ao iniciar servidor:', error);
  process.exit(1);
}

export default app;
