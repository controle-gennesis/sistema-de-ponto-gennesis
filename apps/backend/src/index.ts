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
import salaryAdjustmentRoutes from './routes/salaryAdjustments';
import salaryDiscountRoutes from './routes/salaryDiscounts';
import pointCorrectionRoutes from './routes/pointCorrections';
import holidayRoutes from './routes/holidays';
import chatRoutes from './routes/chats';

console.log('🚀 Iniciando aplicação...');

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Configurar trust proxy para funcionar corretamente com Railway/proxy reverso
// Confia apenas no primeiro proxy (Railway), não em todos os proxies
// Isso permite obter o IP real do cliente via X-Forwarded-For de forma segura
app.set('trust proxy', 1);

// CORS - DEVE VIR ANTES DO HELMET
// Verificar se está em produção (Railway geralmente não define NODE_ENV, então verificamos pela URL)
const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.RAILWAY_ENVIRONMENT === 'production' ||
                     !process.env.NODE_ENV || // Se não está definido, assumir produção no Railway
                     process.env.PORT; // Se tem PORT definido, provavelmente é produção

const allowedOrigins = [
  'https://sistema-pontofrontend-production.up.railway.app',
  'https://sistema-pontobackend-production.up.railway.app',
  'http://localhost:3000',
  'http://localhost:19006'
];

console.log('🌐 CORS configurado para origens:', allowedOrigins);
console.log('📊 Ambiente:', process.env.NODE_ENV || 'development');
console.log('📊 RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT);
console.log('🔍 É produção?', isProduction);

// Configuração de CORS mais robusta e permissiva
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Permitir requisições sem origin (ex: mobile apps, Postman, curl)
    if (!origin) {
      console.log('⚠️  Requisição sem origin - permitindo');
      return callback(null, true);
    }
    
    // Verificar se a origem está na lista permitida
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else if (origin.includes('railway.app') || origin.includes('localhost')) {
      // Permitir qualquer subdomínio do Railway ou localhost
      console.log('✅ Origem Railway/localhost permitida:', origin);
      callback(null, true);
    } else if (!isProduction) {
      // Em desenvolvimento, permitir qualquer origem
      console.log('⚠️  Ambiente de desenvolvimento - permitindo origem:', origin);
      callback(null, true);
    } else {
      // Em produção, mas permitir Railway mesmo assim (fallback de segurança)
      if (origin.includes('railway') || origin.includes('localhost')) {
        console.log('✅ Origem Railway permitida (fallback):', origin);
        callback(null, true);
      } else {
        console.error('❌ Origem não permitida pelo CORS:', origin);
        callback(new Error('Não permitido pelo CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Middleware de segurança - Configurado para não bloquear CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());

// Rate limiting geral
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // máximo 1000 requests por IP (mais permissivo para desenvolvimento)
  message: 'Muitas tentativas de acesso. Tente novamente em 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting mais permissivo para /auth/me (endpoint usado frequentemente)
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // máximo 100 requests por minuto por IP
  message: 'Muitas tentativas de acesso. Tente novamente em 1 minuto.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Aplicar rate limiter mais permissivo para /auth/me antes das rotas
app.use('/api/auth/me', authLimiter);

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir uploads locais quando STORAGE_PROVIDER=local
if ((process.env.STORAGE_PROVIDER || '').toLowerCase() === 'local' || !process.env.AWS_ACCESS_KEY_ID) {
  const uploadsPath = path.join(process.cwd(), 'apps', 'backend', 'uploads');
  app.use('/uploads', express.static(uploadsPath));
}

// Handler para requisições OPTIONS (preflight CORS) - usando a mesma configuração
app.options('*', cors(corsOptions));

// Middleware adicional para garantir que CORS funcione mesmo se houver problemas
app.use((req: express.Request, res: express.Response, next: express.NextFunction): void => {
  const origin = req.headers.origin;
  
  // Se a origem for do Railway ou localhost, sempre permitir
  if (origin && (origin.includes('railway.app') || origin.includes('localhost'))) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  }
  
  // Se for uma requisição OPTIONS, responder imediatamente
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  
  next();
});

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
app.use('/api/salary-adjustments', salaryAdjustmentRoutes);
app.use('/api/salary-discounts', salaryDiscountRoutes);
app.use('/api/solicitacoes', pointCorrectionRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/chats', chatRoutes);

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
