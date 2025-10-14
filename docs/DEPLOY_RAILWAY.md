# 🚀 Guia de Deploy no Railway

Este guia te ajudará a fazer o deploy do Sistema de Ponto Genesis no Railway sem usar Docker.

## 📋 Pré-requisitos

1. Conta no [Railway](https://railway.app)
2. Conta no [GitHub](https://github.com) (para conectar o repositório)
3. Node.js 18+ instalado localmente
4. Git configurado

## 🔧 Passo a Passo

### 1. Preparar o Repositório

1. **Faça commit de todas as alterações:**
   ```bash
   git add .
   git commit -m "Preparar para deploy no Railway"
   git push origin main
   ```

### 2. Configurar no Railway

1. **Acesse [Railway](https://railway.app) e faça login**

2. **Crie um novo projeto:**
   - Clique em "New Project"
   - Selecione "Deploy from GitHub repo"
   - Conecte sua conta GitHub
   - Selecione o repositório do sistema

3. **Configure o banco de dados:**
   - No dashboard do projeto, clique em "New"
   - Selecione "Database" → "PostgreSQL"
   - Railway criará automaticamente um banco PostgreSQL

### 3. Configurar Variáveis de Ambiente

1. **No dashboard do Railway, vá em "Variables"**

2. **Adicione as seguintes variáveis (copie do arquivo `env.production.example`):**

   **Obrigatórias:**
   ```
   NODE_ENV=production
   PORT=5000
   HOST=0.0.0.0
   TIMEZONE=America/Sao_Paulo
   ```

   **Banco de Dados (copie da conexão do PostgreSQL do Railway):**
   ```
   DATABASE_URL=postgresql://postgres:senha@containers-us-west-xxx.railway.app:xxxx/railway
   ```

   **JWT (IMPORTANTE: Use chaves seguras):**
   ```
   JWT_SECRET=sua_chave_secreta_jwt_muito_segura_aqui_minimo_32_caracteres
   JWT_EXPIRES_IN=7d
   JWT_REFRESH_SECRET=sua_chave_secreta_refresh_muito_segura_aqui_minimo_32_caracteres
   JWT_REFRESH_EXPIRES_IN=30d
   ```

   **Configurações da Empresa:**
   ```
   COMPANY_NAME=Genensis Engenharia
   COMPANY_CNPJ=38.294.339/0001-10
   COMPANY_ADDRESS=24, St. de Habitações Individuais Sul QI 11 - Lago Sul, Brasília - DF, 70297-400
   ```

   **Configurações de Horário:**
   ```
   WORK_START_TIME=07:00
   WORK_END_TIME=17:00
   LUNCH_START_TIME=12:00
   LUNCH_END_TIME=13:00
   TOLERANCE_MINUTES=10
   MAX_OVERTIME_HOURS=2
   ```

   **Outras configurações:**
   ```
   SKIP_LOCATION_VALIDATION=true
   MAX_FILE_SIZE=5242880
   ALLOWED_FILE_TYPES=image/jpeg,image/png,image/webp
   DEFAULT_LATITUDE=-15.835840
   DEFAULT_LONGITUDE=-47.873407
   MAX_DISTANCE_METERS=1000
   ```

### 4. Executar Migrações do Banco

1. **No Railway, vá em "Deployments"**
2. **Clique no deployment mais recente**
3. **Vá na aba "Logs"**
4. **Execute as migrações manualmente:**

   No terminal do Railway (ou via CLI):
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

### 5. Configurar Domínio (Opcional)

1. **No dashboard do projeto, vá em "Settings"**
2. **Na seção "Domains", clique em "Generate Domain"**
3. **Railway gerará um domínio público (ex: `seuprojeto.railway.app`)**

### 6. Verificar Deploy

1. **Acesse o domínio gerado pelo Railway**
2. **Teste o endpoint de health check:** `https://seuprojeto.railway.app/health`
3. **Verifique os logs em "Deployments" → "Logs"**

## 🔍 Troubleshooting

### Problemas Comuns:

1. **Erro de Build:**
   - Verifique se todas as dependências estão no `package.json`
   - Confirme se o Node.js está na versão 18+

2. **Erro de Banco de Dados:**
   - Verifique se a `DATABASE_URL` está correta
   - Execute as migrações: `npx prisma migrate deploy`

3. **Erro de Variáveis de Ambiente:**
   - Confirme se todas as variáveis obrigatórias estão configuradas
   - Verifique se não há espaços extras nas variáveis

4. **Erro de CORS:**
   - Atualize a configuração de CORS no backend para incluir o domínio do Railway

### Logs Úteis:

- **Build logs:** Mostram erros de compilação
- **Deploy logs:** Mostram erros de inicialização
- **Runtime logs:** Mostram erros em tempo de execução

## 📱 Deploy do Frontend (Separado)

Para o frontend, você pode:

1. **Criar outro projeto no Railway**
2. **Ou usar Vercel/Netlify (recomendado para Next.js)**
3. **Ou servir o frontend junto com o backend**

## 🔄 Atualizações

Para atualizar o sistema:

1. **Faça as alterações no código**
2. **Commit e push para o GitHub**
3. **Railway fará deploy automático**
4. **Verifique os logs para confirmar sucesso**

## 📞 Suporte

Se encontrar problemas:

1. Verifique os logs do Railway
2. Teste localmente primeiro
3. Consulte a documentação do Railway
4. Verifique se todas as variáveis estão configuradas

---

**🎉 Pronto! Seu sistema estará rodando no Railway!**
