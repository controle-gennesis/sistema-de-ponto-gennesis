# Arquitetura do sistema — Gennesis Conecta (sistema-de-ponto-gennesis)

> Documento feito a partir da leitura do código (sem alterar nenhum arquivo de código). Versão pública: não inclui a análise de segurança.
> Escrito para quem **não programa todo dia**: onde aparece um nome de arquivo, ele serve para você
> (ou um programador) saber onde olhar. Números como "203 modelos" são contagens reais do projeto
> na data da leitura (04/11/2026) e vão mudar com o tempo.
> Onde eu **não consegui confirmar** algo, está escrito "não confirmei" ou "parece".

---

## 1. Visão geral

### O que o sistema faz
Apesar do nome da pasta ("sistema de ponto"), o projeto hoje é uma **plataforma de gestão completa**
de uma empresa de engenharia (o menu do sistema se chama **Conecta**). O registro de ponto continua
no centro, mas em volta dele existem vários "mundos":

| Área do menu | Para que serve (resumo) |
|---|---|
| **Principal** | Painel, aprovações do Fluig, solicitações internas, frota, abastecimento, chamados, treinamentos, ajuda |
| **Departamento Pessoal (DP)** | Funcionários, folha de pagamento, atestados, férias, feriados, banco de horas, ponto |
| **Financeiro / Métricas** | Controle financeiro, boletos, receitas, espelhos de NF, balanço, gastos por contrato |
| **Engenharia** | Contratos, orçamentos, ordens de serviço, pleitos, fichas de demanda (FD), cronogramas, empreiteiros |
| **Suprimentos** | Requisições de materiais, mapa de cotação, ordens de compra (OC), estoque, entregas, frota, ferramentas |
| **Contratos e Licitações** | Licitações, PNCP, responsáveis técnicos (CREA), anuidades, controle de contratos |
| **Jurídico** | Processos trabalhistas |
| **Contabilidade** | Comunicação do DP com a contabilidade |
| **Cadastros** | Fornecedores, materiais, obras, veículos, centros de custo, etc. |
| **Registros de Ponto** | A tela de bater o ponto e consultar registros |

Também existe um **aplicativo de celular** (`apps/mobile`) com ponto, banco de horas, chamados, abastecimento etc.

### Quem usa — "perfis" de usuário
Um ponto importante: **o sistema não tem mais uma lista de perfis tipo "Gerente / RH / Funcionário"**.
Na tabela de usuários, o campo `role` só aceita o valor `EMPLOYEE` (`apps/backend/prisma/schema.prisma`,
`enum UserRole`). O que define o que cada pessoa faz hoje é a **combinação** de:

1. **Cargo** (`Employee.position`). Quem tem o cargo **"Administrador"** é tratado como administrador
   (`isAdmin` em `apps/backend/src/middleware/auth.ts`) e passa por quase tudo.
2. **Permissões por módulo** (tabela `UserPermission`): cada submenu do sistema é um "módulo" que
   pode ser liberado ou não para cada pessoa (ver seção 7).
3. **Vínculos de aprovação**: contratos / centros de custo em que a pessoa é aprovadora
   (DP, FD, combustível, empreiteiros — tabelas `UserDpApprovalContract`, `UserFdApprovalContract` etc.).
4. **Departamento** da pessoa (ex.: DP, Financeiro, Sócios) — algumas telas olham isso.
5. **Tipo de conta especial**: *empreiteiros* (têm um caminho próprio de telas) e o *robô* "Gennecy"
   (assistente de chat).

---

## 2. Estrutura de pastas

```
sistema-de-ponto-gennesis/
├── apps/
│   ├── backend/     → a API (servidor). Node.js + Express + Prisma
│   ├── frontend/    → o site. Next.js + React
│   └── mobile/      → o aplicativo de celular (Expo / React Native)
├── packages/
│   ├── permission-modules/ → lista única de "módulos" (telas) para permissões; usada por backend E frontend
│   └── types/              → tipos TypeScript compartilhados (User, Employee, etc.)
├── tools/nfe-distribuicao/ → programa em Java que consulta NF-e na SEFAZ (compilado no deploy)
├── scripts/                → scripts de build do Railway (railway-build-backend.sh / -frontend.sh) e utilidades
├── docs/                   → documentos antigos de planejamento e deploy (ver pontos de atenção)
├── .github/workflows/ci.yml → checagem automática a cada push (ver seção 10)
├── railway.json, nixpacks.toml, .railwayignore → configuração de deploy
├── docker-compose.yml      → banco PostgreSQL para rodar local
├── env.production.example  → exemplo de variáveis para produção
└── package.json            → "raiz" do monorepo (comandos npm que rodam tudo)
```

### `apps/backend` (a API)
| Pasta / arquivo | O que tem |
|---|---|
| `src/index.ts` | **Ponto de entrada**: liga o servidor, configura segurança, registra todas as rotas, agenda tarefas automáticas |
| `src/routes/` (89 arquivos) | Define os **endereços** da API (ex.: `/api/time-records/punch`) e quem pode chamar |
| `src/controllers/` (87) | Recebem o pedido, validam e chamam a regra de negócio. **Boa parte da regra mora aqui** |
| `src/services/` (138) | Regras de negócio maiores e integrações (Fluig, TOTVS, e-mail, ponto, OC...) |
| `src/lib/` (124) | Funções de apoio: regras de acesso (`*Access.ts`), criptografia, "ensure*Schema", logs, TOTVS |
| `src/middleware/` | Autenticação (`auth.ts`), permissões (`permissionAuth.ts`), upload (`upload.ts`), erros |
| `src/realtime/` | WebSocket: chamadas de áudio/vídeo (`wsCallSignaling.ts`) e presença no orçamento |
| `prisma/schema.prisma` | **O desenho do banco de dados** (203 modelos, 73 enums) |
| `prisma/migrations/` | **351 migrações** — histórico de mudanças do banco |
| `scripts/` | Scripts avulsos: criar admin, testes de carga, diagnósticos, importações |
| `vendor/`, `native/` | O programa Java de NF-e (`nfe-distribuicao.jar`) |
| `uploads/` | Arquivos enviados (fotos, anexos) quando guardados em disco |
| `env.example` | Modelo do arquivo `.env` com as variáveis |

### `apps/frontend` (o site)
| Pasta | O que tem |
|---|---|
| `src/app/` | **Uma pasta por tela** (o Next.js usa o nome da pasta como endereço). As telas do sistema ficam em `src/app/ponto/<nome>/page.tsx` (98 pastas) |
| `src/components/` | Peças reutilizáveis: `layout/` (menu lateral e barra do topo), `ui/` (botões, modais, tabelas), e uma pasta por assunto (`ponto/`, `oc/`, `orcamento/`, `contract/`...) |
| `src/hooks/` | "Ganchos" React: `usePermissions.ts`, `usePunchInOut.ts`, `useGeolocation.ts`... |
| `src/lib/` | Funções de apoio e o cliente da API (`api.ts`) |
| `src/context/`, `src/contexts/` | Estados globais (tema, título da página, chamadas). Existem **duas** pastas — ver pontos de atenção |

### `apps/mobile`
App Expo/React Native. `src/screens/` tem as telas (Punch, Home, BankHours, Kanban, GestaoOs...),
`src/services/punchOfflineQueue.ts` guarda pontos batidos **sem internet** para enviar depois.

### `packages/*`
- **`permission-modules`**: um único arquivo (`src/index.ts`, ~620 linhas) com a lista de todos os módulos
  e funções para gerar chaves de permissão. É **compilado** (`dist/`) e usado pelo backend e pelo frontend.
- **`types`**: tipos compartilhados (`index.ts`).

---

## 3. Tecnologias

### Linguagens
**TypeScript** em quase tudo (backend, frontend, mobile, pacotes). **Java** só no leitor de NF-e.
**SQL** nas migrações. Scripts de apoio em PowerShell/Shell/Python.

### Backend
| Tecnologia | Para que serve |
|---|---|
| **Node.js + Express** | O servidor web / API |
| **Prisma** (v5.22) | Conversa com o banco: define as tabelas (`schema.prisma`) e gera as consultas |
| **PostgreSQL** | O banco de dados |
| **jsonwebtoken (JWT)** + **bcryptjs** | Login: token de acesso e criptografia da senha (a senha é tratada em `src/lib/passwordHash.ts`) |
| **helmet, cors, express-rate-limit, compression, morgan** | Segurança, origem permitida, limite de tentativas, compressão e log de acessos |
| **multer** | Recebe arquivos enviados (fotos, anexos) — `src/middleware/upload.ts` |
| **ws** | WebSocket (chamadas em tempo real) |
| **node-cron** | Tarefas agendadas (sincronizações automáticas) |
| **exceljs, xlsx, pdfkit, pdf-parse, nfe-danfe-pdf, qrcode** | Ler/gerar planilhas e PDFs, DANFE de NF-e, QR Code |
| **axios, oauth-1.0a** | Chamadas a sistemas externos (o Fluig usa OAuth 1) |
| **nodemailer, resend** | Envio de e-mail |
| **@aws-sdk (S3, Rekognition)** | Guardar arquivos na Amazon S3 e comparar rosto (selfie) com a foto cadastrada |
| **@sentry/node** | Monitoramento de erros |
| **joi** | Validação de dados |
| **jest** | Testes automáticos (só 4 arquivos de teste — ver pontos de atenção) |

### Frontend
| Tecnologia | Para que serve |
|---|---|
| **Next.js 15 + React 19** | O site (telas, rotas) |
| **Tailwind CSS** | Estilo visual |
| **@tanstack/react-query** | Busca e "cache" de dados da API (evita pedir a mesma coisa duas vezes) |
| **axios** | Faz as chamadas à API (`src/lib/api.ts`) |
| **react-hook-form + zod** | Formulários e validação |
| **recharts, @xyflow/react, bpmn-js, leaflet** | Gráficos, diagramas de fluxo/BPMN, mapas |
| **exceljs, xlsx, jspdf, pdfjs-dist, mammoth** | Exportar/ler planilhas, PDF e Word |
| **react-webcam, react-easy-crop** | Câmera (selfie do ponto) e recorte de foto |
| **lucide-react, react-hot-toast, sonner** | Ícones e avisos na tela |

### Mobile
**Expo / React Native**, com navegação, câmera, localização e fila offline do ponto.

---

## 4. Banco de dados

O banco é **PostgreSQL**, descrito em `apps/backend/prisma/schema.prisma` (6.094 linhas).
São **203 modelos (tabelas)** e **73 enums** (listas fixas de valores). Abaixo, só os grupos principais.

### O coração: pessoas e ponto
```
User (usuário: e-mail, CPF, senha, cargo no Employee, tokenVersion)
  └── 1 Employee (funcionário: matrícula, departamento, cargo, salário, jornada,
        │           locais permitidos, centro de custo, VA/VT)
        ├── muitos TimeRecord (cada batida de ponto)
        ├── muitos Vacation (férias)
        ├── muitos Overtime (horas extras)
        ├── SalaryAdjustment / SalaryDiscount (acréscimos e descontos de salário)
        └── MedicalCertificate (atestados)
```
- **`TimeRecord`**: tipo (`ENTRY`, `EXIT`, `LUNCH_START`, `LUNCH_END`, `BREAK_START`, `BREAK_END`,
  `ABSENCE_JUSTIFIED`), horário, latitude/longitude, foto (URL e chave no S3), resultado da
  comparação de rosto, QR/localidade usada, se é válido e o motivo, valor de VA/VT do dia e centro de custo.
- Outros relacionados a ponto: `PointCorrectionRequest` (pedido de ajuste de ponto), `Holiday`,
  `CompanySettings` (configurações do ponto e da cerca de localização), `PayrollStatus`, `ManualInssValue`.

### Permissões e acesso
`UserPermission` (usuário + módulo + ação + liberado?), `PositionPermissionTemplate` (modelo de
permissões **por cargo**), e vários vínculos de aprovação (`UserDpApprovalContract`,
`UserFdApprovalContract`, `UserFuelApprovalContract`, `UserEmpreiteiroApprovalContract`,
`UserOrcamentoUnlockCostCenter`...), mais `AuditLog` e `UserLoginEvent` (histórico).

### Contratos, obras e engenharia
`Contract` (contrato) → `ContractAddendum` (aditivos), `ContractAnnualValue`, `ContractBilling`
(faturamento), `ContractWeeklyProduction`, `Pleito`, `DemandSheetApproval` (ficha de demanda — FD),
`Obra`, `CostCenter` (centro de custo), `Empreiteiro*` (empreiteiros, contratos, medições diárias).
Os orçamentos ficam ligados a contratos e à FD (`orcamento*`).

### Suprimentos e compras
`MaterialRequest` (+ itens e comentários) → `QuoteMap` (mapa de cotação, com fornecedores e itens vencedores)
→ `PurchaseOrder` (ordem de compra, com itens, parcelas de boleto, comentários e notas) → `StockMovement`
(estoque), `StockShortfall` (furo de estoque), `MaterialDelivery`, `Supplier`, `PaymentCondition`,
`ToolRentalRequest` (pedidos de ferramentas), `Vehicle`/`VehicleReservation`, `FuelRefuelRequest`.

### Financeiro e contratos
`FinancialControlEntry`, `BoletoControlEntry`/`BoletoControlManager` (controle de boletos),
`ExtratoCaixaAjuste`, `ReceitaFinanceira`, `EspelhoNf*` (espelho de NF), `NfeRecebida` (NF-e recebidas),
`ControleAnuidade`, `ControlePagamentoArt`, `ResponsavelTecnico`,
`ContractRegistryEntry` / `ContractRegistryAddendum` / `ContractRegistryCat` (Controle de Contratos).

### Comunicação, tarefas e apoio
`Chat`, `Message`, `ChatParticipant`... (chat interno e chamadas); `WhatsAppConversation`/`WhatsAppMessage`
(atendimento por WhatsApp); `Kanban*`, `Planner*` (quadros e agenda); `Drive*` (arquivos);
`HelpTutorial`, `Training*` (treinamentos), `ScheduledNews`, `SupportTicket`, `PushToken`, `AppFeedback`.

### Gestão de OS (chamados de manutenção)
Família `GestaoOs*` (locais, equipamentos, equipes, planos de manutenção, ordens de serviço).

### Licitações e jurídico
`Licitacao*`, `Pncp*`, `JuridicoProcesso*`.

### Integrações guardadas no banco
`Fluig*` (espelho de datasets do Fluig, log de chamadas), `UserTotvsCredential` (credencial TOTVS de cada
usuário, criptografada), `GoogleCalendarConnection`.

> **Como o banco muda:** cada mudança no `schema.prisma` precisa de uma **migração** em
> `prisma/migrations/`. Ao iniciar, o backend roda `prisma migrate deploy`. Ver seções 10 e 12.

---

## 5. Backend

### Como um pedido é tratado (caminho geral)
1. **`src/index.ts`** recebe o pedido: CORS, `helmet`, compressão, limite de tentativas (login),
   leitura do corpo (até 50 MB).
2. A **rota** (`src/routes/*.ts`) casa o endereço. Quase todas começam com `router.use(authenticate)`.
3. **`authenticate`** (`src/middleware/auth.ts`) confere o token JWT, confere no banco se o usuário
   existe/está ativo e se o token não foi revogado.
4. Um **middleware de permissão** decide se aquela pessoa pode usar aquele módulo
   (`requireModuleAccess(...)` em `src/middleware/permissionAuth.ts`).
5. O **controller** valida os dados e chama o **service** / usa o **Prisma** direto.
6. A resposta volta como JSON (`{ success, data }`); erros passam por `src/middleware/errorHandler.ts`.

### Rotas por assunto
(todas começam com `/api`; a coluna do meio é o arquivo em `src/routes/`; "lógica na rota" = não tem controller separado)

**Login, usuários e permissões**
| Prefixo | Arquivo | Controller(s) / onde está a regra |
|---|---|---|
| `/auth` | `auth.ts` | `AuthController` — login (e-mail **ou CPF**), logout, esqueci/redefinir senha (por link e por código), refresh de token, perfil, foto de rosto, trocar senha, **entrar como outro usuário** (impersonação, 2 h) |
| `/users` | `users.ts` | `UserController`, `EmployeeController`, `EmployeeImportController`, `UserActivityController` |
| `/permissions` | `permissions.ts` | lógica na rota — matriz de permissões por usuário e por cargo |

**Ponto, jornada e DP**
| Prefixo | Arquivo | Controller(s) |
|---|---|---|
| `/time-records` | `timeRecords.ts` | `TimeRecordController` (+ `TimeRecordService`, `LocationService`, `FaceMatchService`, `PhotoService`) — bater ponto, consultar, validar, importar planilha, lançar falta |
| `/solicitacoes` | `pointCorrections.ts` | `PointCorrectionController` — pedidos de alteração de ponto |
| `/bank-hours`, `/overtime` | `bankHours.ts`, `overtime.ts` | `BankHoursController`, `OvertimeController` |
| `/vacations`, `/holidays` | `vacations.ts`, `holidays.ts` | `VacationController`, `HolidayController` |
| `/medical-certificates`, `/aso` | idem | `MedicalCertificateController`, `AsoController` |
| `/payroll`, `/salary-adjustments`, `/salary-discounts`, `/border` | idem | folha, acréscimos/descontos e borderô/CNAB (`PayrollService`, `Cnab*Service`, `BorderService`) |
| `/solicitacoes-dp`, `/dp-contabilidade` | `dpRequests.ts`, `dpContabilidade.ts` | `DpRequestController`, `DpContabilidadeController` |
| `/reports`, `/dashboard`, `/company` | idem | relatórios, painel e dados da empresa |

**Contratos, engenharia e obras**
| Prefixo | Controller(s) |
|---|---|
| `/contracts` | `ContractController`, `ContractBillingController`, `ContractAddendumController`, `ContractAnnualValueController`, `ContractPleitoController`, `ContractWeeklyProductionController` |
| `/orcamento` | `OrcamentoController` (+ `OrcamentoService`, `OrcafascioService`) |
| `/demand-sheet-approvals` | `DemandSheetApprovalController` — fichas de demanda (FD) |
| `/pleitos`, `/obras`, `/empreiteiros`, `/service-orders`, `/cost-centers` | controllers com o mesmo nome |
| `/gestao-os` | `GestaoOsController` e outros (87 rotas — o maior módulo) |
| `/relatorios-fotograficos`, `/reunioes`, `/kanban`, `/planner-*`, `/drive` | relatórios fotográficos, reuniões, quadros, agenda e arquivos |

**Suprimentos**
| Prefixo | Onde está a regra |
|---|---|
| `/material-requests` | lógica na rota (+ `MaterialRequestService`) |
| `/quote-maps` | lógica na rota (+ `QuoteMapService`) |
| `/purchase-orders` | lógica na rota (38 rotas) + **`PurchaseOrderService.ts` (~5.300 linhas)** — o centro das regras de OC, boletos e envio ao TOTVS |
| `/stock`, `/stock-locations`, `/material-deliveries`, `/logistics-delivery-requests` | `StockController`, etc. |
| `/suppliers`, `/payment-conditions`, `/construction-materials` | cadastros e sincronização com TOTVS |
| `/vehicles`, `/vehicle-reservations`, `/fuel-*`, `/tool-rental-requests` | frota, abastecimento e ferramentas |

**Financeiro e contratos/licitações**
| Prefixo | Controller(s) |
|---|---|
| `/financial-control`, `/financial-analysis`, `/extrato-caixa`, `/financeiro-receitas`, `/ocs-boleto-pix` | financeiro e balanço |
| `/boleto-control`, `/contract-registry` | `BoletoControlController`, `ContractRegistryController` |
| `/controle-nfs`, `/espelho-nf`, `/nfe-recebidas` | NFs |
| `/responsaveis-tecnicos`, `/controle-anuidade`, `/controle-pagamentos-art` | CREA/ART |
| `/licitacoes`, `/pncp` | `LicitacaoController`, `PncpController` |
| `/juridico-processos` | `JuridicoProcessoController` |

**Comunicação e apoio**
`/chats` (44 rotas), `/whatsapp`, `/call-history`, `/news`, `/help-tutorials`, `/training`,
`/support-tickets`, `/push-tokens`, `/app-feedback`, `/app-version`, `/flow` (diagramas de processo).

**Integrações (rotas)**: `/fluig`, `/orcafascio`, `/sinapi`.

### Onde mora cada tipo de regra de negócio
- **Regras do ponto** (sequência de batidas, férias, localização, rosto, VA/VT): `controllers/TimeRecordController.ts`
  (1.918 linhas) e `services/TimeRecordService.ts` (cálculo de horas).
- **Quem pode ver/fazer o quê**: `middleware/permissionAuth.ts` e uma família de arquivos
  `lib/*Access.ts` (ex.: `fdApprovalAccess.ts`, `dpApprovalAccess.ts`, `controleNfsAccess.ts`).
- **Compras (OC)**: `services/PurchaseOrderService.ts`, `lib/ocTotvsRm.ts`.
- **Orçamentos**: `services/OrcamentoService.ts`, `lib/orcamentoTrava.ts`.
- **Tarefas automáticas**: `lib/totvsSyncSchedule.ts`, `services/FluigDatasetMirrorSync.ts`,
  `services/NfeRecebidaAutoFetch.ts`, `services/PncpIngestService.ts`.

---

## 6. Frontend

### Como o site é organizado
- **Cada pasta de `src/app/ponto/<nome>/` é uma tela.** O arquivo `page.tsx` dentro dela é a tela.
  Ex.: `src/app/ponto/controle-contratos/page.tsx` → endereço `/ponto/controle-contratos`.
- **O menu lateral** está em `src/components/layout/Sidebar.tsx` (grupos e itens com permissão).
  A barra do topo e o "caminho" (breadcrumb) estão em `TopNavbar.tsx` e `src/lib/pageTitle.ts`.
- **Proteção de tela:** `src/components/auth/ProtectedRoute.tsx` e `src/hooks/usePermissions.ts`
  escondem/bloqueiam telas conforme as permissões.
- **Chamada à API:** sempre por `src/lib/api.ts` (coloca o token em cada pedido e renova o token
  quando expira). A URL da API vem de `NEXT_PUBLIC_API_URL` (`src/lib/apiBaseUrl.ts`).

### Telas principais (menu → arquivo `page.tsx` em `src/app`)
| Tela | Endereço / pasta |
|---|---|
| **Registros de Ponto / bater ponto** | `ponto/page.tsx` (usa `components/ponto/PunchCard.tsx`) |
| Login / esqueci a senha | `auth/login`, `auth/esqueci-senha`, `auth/redefinir-senha` |
| Painel do Sistema | `ponto/painel-do-sistema` |
| Funcionários e Externos | `ponto/funcionarios` |
| Folha de Pagamento | `ponto/folha-pagamento` |
| Banco de Horas | `ponto/banco-horas` |
| Férias / Gerenciar férias | `ponto/ferias`, `ponto/gerenciar-ferias` |
| Alterações de ponto | `ponto/solicitacoes`, `ponto/gerenciar-solicitacoes` |
| Atestados | `ponto/atestados`, `ponto/gerenciar-atestados` |
| Configurações do Ponto | `ponto/configuracoes-ponto` |
| Permissões | `ponto/permissoes` |
| Contratos (lista e detalhe) | `ponto/contratos`, `ponto/contratos/[id]` (~8.600 linhas) |
| Controle de Contratos | `ponto/controle-contratos` |
| Orçamentos | `ponto/orcamentos`, `ponto/orcamento` (`OrcamentoPageView.tsx`, ~24.900 linhas) |
| Fichas de Demanda | `ponto/aprovacao-fds`, `ponto/fds-aprovadas` |
| Ordens de Compra | `ponto/ordem-de-compra` (`components/oc/OcPurchaseOrdersPanel.tsx`, ~8.000 linhas) |
| Mapa de Cotação / Requisições | `ponto/mapa-cotacao`, `ponto/gerenciar-materiais`, `ponto/solicitar-materiais` |
| Estoque / Entregas | `ponto/estoque`, `ponto/controle-entregas`, `ponto/entregas-logistica` |
| Financeiro | `ponto/financeiro/controle-financeiro`, `.../controle-boletos`, `.../dashboard-boletos`, `.../receitas` |
| Espelhos de NF | `ponto/espelho-nf`, `ponto/financeiro/espelhos-aprovados` |
| Licitações / PNCP | `ponto/licitacoes`, `ponto/licitacoes-pncp` |
| Responsáveis Técnicos / Anuidades / ARTs | `ponto/responsaveis-tecnicos`, `ponto/controle-anuidade`, `ponto/controle-pagamentos-art` |
| Jurídico | `ponto/juridico/processos` |
| Central de Chamados (Gestão de OS) | `ponto/sistema-gestao-os` |
| Chat e WhatsApp | `ponto/conversas`, `ponto/conversas-whatsapp` |
| Kanban / Agenda | `ponto/kanban`, `ponto/agenda` |
| Frota / Abastecimento / Ferramentas | `ponto/reserva-veiculos`, `ponto/solicitar-combustivel`, `ponto/solicitar-ferramentas` |
| Treinamentos / Ajuda | `ponto/treinamentos`, `ponto/central-de-ajuda` |
| Cadastros | `ponto/fornecedores`, `ponto/obras`, `ponto/veiculos`, `ponto/centros-custo`, etc. |

---

## 7. Permissões

### O pacote `permission-modules`
`packages/permission-modules/src/index.ts` é o **cardápio oficial** de módulos:
- Cada **módulo** é um submenu do sistema: `{ key, name, href, category }`.
- A **chave** nasce do endereço da tela: `pathToModuleKey('/ponto/folha-pagamento')` → `ponto_folha-pagamento`.
- Há **ações**: `acesso` (liberar o módulo inteiro) e, em alguns módulos, `ver`, `criar`, `editar`, `excluir`.
- Há listas especiais: módulos **abertos a todos** (Drive, Kanban, Flow, Central de Ajuda, Treinamentos),
  módulos que **todo funcionário novo recebe** (solicitações do DP, reserva de veículos, solicitar
  combustível) e a aba "Controle" (permissões mais finas, como fluxos de OC).

Como o pacote é usado **dos dois lados**, quando se cria uma tela nova ela entra na lista **uma vez** e
passa a existir tanto no menu quanto na tela de permissões e na checagem do servidor.
(Depois de mudar esse arquivo é preciso recompilar o pacote: `npm run build:permission-modules`.)

### Como o sistema decide quem pode o quê
**No servidor (a regra que vale de verdade):**
1. `authenticate` identifica a pessoa e marca `isAdmin` (cargo "Administrador").
2. **Administrador passa direto** em quase tudo (`requireModuleAccess` e `authorize` liberam).
3. Para os demais, `requireModuleAccess('<chave do módulo>')` procura em `UserPermission` uma linha
   `{ usuário, módulo, ação 'acesso', allowed = true }`. Sem ela → erro 403 "Você não tem permissão".
4. Regras mais específicas (aprovar FD, ver Controle de NFs, etc.) ficam em `src/lib/*Access.ts`
   e usam os vínculos de aprovação (contratos/centros de custo da pessoa).
5. Algumas áreas exigem ser administrador **ou** quem gerencia permissões
   (`requirePermissionManagerOrAdministrator`).

**No site:** `src/hooks/usePermissions.ts` busca `/api/permissions/me` e esconde menus e telas;
`ProtectedRoute` bloqueia a tela. **Isso é conforto para o usuário, não segurança** — quem protege é a API.

**Quem edita as permissões:** a tela `ponto/permissoes` (rotas `routes/permissions.ts`). Existem **modelos por
cargo** (`PositionPermissionTemplate`) que podem ser aplicados a usuários.

---

## 8. Integrações

| Integração | Para que serve | Onde está o código |
|---|---|---|
| **Fluig** | Processos/aprovações da empresa: lê "datasets", cria e acompanha solicitações. Usa OAuth 1 | `services/FluigService.ts`, `controllers/FluigController.ts`, `routes/fluig.ts`; cópia local diária dos dados em `services/FluigDatasetMirrorSync.ts` (cron 2h, 3h, 4h e 12h30); registro de chamadas em `lib/fluigRequestLog.ts`. Variáveis `FLUIG_*` |
| **TOTVS RM** | ERP: envia OC, consulta movimentos, fornecedores, materiais, condições de pagamento, locais de estoque e relatórios financeiros | `services/TotvsRmMovimentoService.ts`, `TotvsRmRelatorioFinService.ts`, `MaterialTotvsSyncService.ts`, `SupplierTotvsSyncService.ts`, `PaymentConditionTotvsSync.ts`, `StockLocationTotvsSync.ts`; regras em `lib/ocTotvsRm.ts`, `lib/totvsRmConsulta.ts`; agenda em `lib/totvsSyncSchedule.ts` (uma rodada de madrugada e outra por volta do almoço; o horário exato varia por tipo de dado). **Cada usuário tem a própria credencial TOTVS**, guardada criptografada (`services/UserTotvsCredentialService.ts`, `lib/totvsCredentialCrypto.ts`). Variáveis `TOTVS_RM_*` |
| **E-mail** | Recuperação de senha e avisos | `services/EmailService.ts`. **Usa Resend** (se `RESEND_API_KEY` existir) **ou SMTP** (nodemailer: `SMTP_HOST`, `SMTP_USER`...). ⚠️ **Não encontrei AWS SES** em lugar nenhum do código |
| **AWS S3** | Guardar fotos de ponto, anexos, arquivos do Drive | `services/PhotoService.ts`, `lib/persistentUpload.ts`, `services/DriveService.ts`, `services/ChatService.ts`. Com `STORAGE_PROVIDER=local` grava em disco (`uploads/`) |
| **AWS Rekognition** | Comparar a selfie do ponto com a foto de rosto cadastrada | `services/FaceMatchService.ts` (limiar `FACE_MATCH_THRESHOLD`) |
| **WhatsApp (Meta)** | Central de atendimento e robô (abastecimento, chamados, reserva de veículo, avaliação) | `services/MetaWhatsAppService.ts`, `WhatsAppBotService.ts`, `WhatsApp*FlowHandler.ts`, `controllers/WhatsAppController.ts`. Variáveis `WHATSAPP_*` |
| **Anthropic (IA)** | Assistente "Gennecy", análise de licitações, leitura de documentos, desenho de fluxos | `services/AnthropicDocumentService.ts`, `GennecyChatAssistantService.ts`, `FlowAi*`, serviços de `Licitacao*`. Variáveis `ANTHROPIC_*`. (Há variáveis `OPENAI_*` no `env.example` e tabelas `ChatGPT*` no banco, mas **não achei serviço usando OpenAI hoje**) |
| **PNCP** | Portal Nacional de Contratações: busca licitações | `controllers/PncpController.ts`, `services/Pncp*Service.ts` (sincronização por agenda) |
| **Orçafascio** | Base de composições/orçamentos | `services/OrcafascioService.ts`, `controllers/OrcafascioController.ts`. Variáveis `ORCAFASCIO_*` |
| **SINAPI / AutoSINAPI** | Preços de referência da construção | `services/SinapiService.ts`, `routes/sinapi.ts`. Variáveis `AUTOSINAPI_*` |
| **NF-e / SEFAZ** | Busca de NF-e recebidas | Programa Java em `tools/nfe-distribuicao` (compilado no deploy) + `services/NfeRecebidaService.ts`, `NfeRecebidaAutoFetch.ts`, `lib/ensureNfeJavaRuntime.ts`. Variáveis `NFE_*` |
| **Google (Agenda e Planilhas)** | Sincronizar agenda; ler/gravar planilhas (licitações, controle de NFs, banco de CATs) | `services/googleCalendarSync.ts`, `googleSheetsWrite.ts`, `*SheetsService.ts`. Variáveis `GOOGLE_*`, `BANCO_CATS_*` |
| **Trello** | Migração de quadros para o Kanban interno | `controllers/KanbanController.ts`, `lib/kanbanTrello*.ts` |
| **Notificações push (Expo)** | Avisos no celular | `services/PushNotificationService.ts`, tabela `PushToken` |
| **Sentry** | Monitoramento de erros | `src/index.ts` (variável `SENTRY_DSN`) |
| **FIPE** | Consulta de valor de veículos | `services/FipeService.ts` |

---

## 9. Fluxo de ponta a ponta: "bater o ponto"

### Passo a passo (web)
1. **Login.** Tela `app/auth/login/page.tsx` → `POST /api/auth/login` → `routes/auth.ts` →
   `AuthController.login` (procura por e-mail ou CPF em `lib/loginIdentifier.ts`, confere a senha com
   `lib/passwordHash.ts`, gera o JWT de 7 dias).
2. **Abrir a tela de ponto.** `app/ponto/page.tsx` mostra o `components/ponto/PunchCard.tsx`.
3. **Preparar.** O `PunchCard` pede ao servidor a **política de ponto** (`GET /time-records/punch-policy`:
   exige selfie? QR? cerca de localização?) e os **registros de hoje** (`GET /time-records/my-records/today`).
   Pega a localização do aparelho (`hooks/useGeolocation.ts`) e abre a câmera para a selfie.
4. **Enviar.** Ao clicar, `hooks/usePunchInOut.ts` monta um formulário (tipo da batida, **horário local do
   aparelho**, latitude/longitude, foto, observação, QR) e chama `POST /api/time-records/punch`
   via `lib/api.ts` (que junta o token).
5. **Servidor — entrada.** `src/index.ts` (segurança, CORS, limites) → `routes/timeRecords.ts`:
   `authenticate` confere o token → `middleware/upload.ts` (multer) recebe a foto.
6. **Servidor — regras** em `TimeRecordController.punchInOut`, nesta ordem:
   1. Busca o funcionário (`Employee`) do usuário.
   2. **Bloqueia** se a pessoa está em **férias aprovadas** nesse dia.
   3. Valida o **tipo** da batida.
   4. **Localização** (`services/LocationService.ts`): confere a cerca de locais permitidos, se estiver ligada
      nas configurações da empresa (pode só registrar ou bloquear fora do local).
   5. **Forma de bater**: foto de rosto e/ou **QR Code** da localidade (a política varia por local).
   6. Grava a foto (`services/PhotoService.ts` → S3 ou disco).
   7. **Comparação de rosto** (`services/FaceMatchService.ts` → AWS Rekognition) quando o caminho é a selfie;
      se não bate, recusa.
   8. Recusa se **já existe** a mesma batida hoje e valida a **sequência**: entrada → início do almoço →
      fim do almoço → saída; avisa quando as 4 batidas do dia já foram feitas.
   9. Define o horário (usa o horário do aparelho, guardado "como está no relógio").
   10. Na **entrada**, soma o **VA/VT** do dia (do cadastro do funcionário).
7. **Banco.** `prisma.timeRecord.create(...)` grava na tabela `time_records` (com centro de custo do
   funcionário e o motivo/localização). Depois `persistPunchExtras` grava os dados extras (resultado do
   rosto, QR, localidade).
8. **Saída.** Se a batida for `EXIT`, `services/TimeRecordService.calculateWorkHours` calcula as horas do dia.
9. **Resposta** `201` com o registro. De volta no site, `usePunchInOut` mostra "Ponto registrado com sucesso!"
   e atualiza as listas (`time-records`, `today-records`).

### No celular
Mesmo endpoint, mas a tela é `apps/mobile/src/screens/PunchScreen.tsx`. Se **não houver internet**, o ponto
vai para `apps/mobile/src/services/punchOfflineQueue.ts` e é enviado depois (guarda o horário real da batida).

---

## 10. Deploy (Railway)

### Como está montado
Na Railway o projeto tem **três peças**: **Front-end** (o site, no domínio `www.gennesisconecta.com.br`),
**Back-end** (a API) e **Database** (PostgreSQL). O deploy dispara quando se envia código para a
branch **`main`** do GitHub.

### Arquivos de configuração
| Arquivo | Papel |
|---|---|
| `railway.json` (raiz) | Diz que o construtor é o **RAILPACK** |
| `apps/backend/railway.json` | Backend: build `bash scripts/railway-build-backend.sh`; start `cd apps/backend && npm run start`; teste de saúde em `/health` (30 s); reinicia em falha (até 10 vezes) |
| `apps/frontend/railway.json` | Frontend: build `bash scripts/railway-build-frontend.sh`; start `npm run start --workspace=@sistema-ponto/frontend`; teste de saúde em `/` (60 s) |
| `scripts/railway-build-backend.sh` | `npm install`, compila `permission-modules`, compila o backend e **compila o leitor Java de NF-e** (baixa JDK 17 + Maven se preciso) |
| `scripts/railway-build-frontend.sh` | `npm install --include=dev`, compila `permission-modules`, faz o build do Next.js |
| `nixpacks.toml` | Pede o pacote `unzip` (extração de ZIPs jurídicos). *Não confirmei* se o Railpack ainda lê este arquivo |
| `.railwayignore` | O que não sobe (node_modules, `.git`, `*.md`, `docs/`, `apps/mobile/`...) |
| `.github/workflows/ci.yml` | A cada push/PR na `main`: backend (`prisma generate` + `tsc --noEmit` + `jest`) e frontend (`tsc --noEmit` + `next build`). **Não faz o deploy**; só confere |

### O que acontece quando o backend inicia
`npm run start` (em `apps/backend/package.json`) faz, em ordem:
`node scripts/resolve-migrations.js` → `npx prisma migrate deploy` → `node dist/index.js`.
Ou seja: **as migrações do banco rodam sozinhas a cada deploy**. Depois, o `index.ts` ainda roda
`ensureProductionSchema` (verificação de tabelas/colunas críticas).

### Variáveis de ambiente (nomes — os valores ficam só na Railway)
**Obrigatórias** (sem elas o sistema não funciona direito):
`DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `PORT`, `HOST`, `TIMEZONE`, `FRONTEND_URL`.
No **frontend**: `NEXT_PUBLIC_API_URL` (URL da API terminando em `/api`).

**Arquivos/armazenamento:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`,
`STORAGE_PROVIDER`, `MAX_FILE_SIZE`, `ALLOWED_FILE_TYPES`.
**E-mail:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL` *ou* `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
**Ponto:** `DEFAULT_LATITUDE`, `DEFAULT_LONGITUDE`, `MAX_DISTANCE_METERS`, `WORK_START_TIME`, `WORK_END_TIME`,
`LUNCH_START_TIME`, `LUNCH_END_TIME`, `TOLERANCE_MINUTES`, `MAX_OVERTIME_HOURS`, `FACE_MATCH_THRESHOLD`,
`SKIP_LOCATION_VALIDATION` (só para teste).
**Integrações:** `FLUIG_*`, `TOTVS_RM_*` e `TOTVS_CREDENTIALS_SECRET`, `ORCAFASCIO_*`, `ANTHROPIC_*`,
`WHATSAPP_*`, `GOOGLE_*`, `BANCO_CATS_*`, `AUTOSINAPI_*`, `NFE_*`, `SENTRY_DSN`, `TRELLO_*`.
**Empresa/PDF:** `COMPANY_NAME`, `COMPANY_CNPJ`, `COMPANY_ADDRESS`, `OC_PDF_COMPANY_*`.

O modelo de variáveis está em `apps/backend/env.example` e `env.production.example` (este último é um
pouco desatualizado — ver seção 12).

---

## 11. Como rodar localmente (passo a passo)

**Você precisa de:** Node.js 18 ou mais novo (o CI usa o 20), Git, e um PostgreSQL (o jeito mais simples é o Docker).

1. **Baixar e instalar**
   ```bash
   git clone <url-do-repositorio>
   cd sistema-de-ponto-gennesis
   npm install
   ```
   (o `npm install` da raiz já compila o pacote `permission-modules` sozinho.)
2. **Subir o banco** (usuário `postgres`, senha `1234`, banco `DP`, porta 5432 — de `docker-compose.yml`):
   ```bash
   docker compose up -d postgres
   ```
3. **Configurar o backend**: copie `apps/backend/env.example` para `apps/backend/.env` e preencha, no mínimo:
   - `DATABASE_URL="postgresql://postgres:1234@localhost:5432/DP"`
   - `JWT_SECRET=` qualquer texto longo
   - o resto (S3, e-mail, Fluig, TOTVS...) é opcional para o básico; **sem as integrações,
     essas partes ficam desligadas** em desenvolvimento.
4. **Criar as tabelas** (aplica as 351 migrações):
   ```bash
   cd apps/backend
   npx prisma migrate deploy
   ```
5. **Criar um administrador** (um dos dois): `npm run db:seed` ou
   `npx ts-node scripts/create-admin-user.ts` (dentro de `apps/backend`).
6. **Ligar tudo** (na raiz do projeto):
   ```bash
   npm run dev
   ```
   - Site: http://localhost:3000
   - API: http://localhost:5000 (teste de saúde: http://localhost:5000/health)
7. **Entrar** com o usuário criado no passo 5. A primeira abertura de cada tela é lenta (o site compila na hora).

**Dicas do Windows (aprendidas na prática):**
- Se o PowerShell reclamar que "o arquivo npm.ps1 não está assinado", use `npm.cmd` e `npx.cmd`
  (ex.: `npm.cmd run dev`).
- Depois de mudar o `schema.prisma`, **pare os servidores** antes de `npx prisma generate`; com o servidor
  rodando o Windows trava o arquivo e dá erro `EPERM`.
- Se aparecer `ChunkLoadError` no navegador logo após subir, espere um minuto e use Ctrl+Shift+R.

---

## 12. Pontos de atenção (resumo)

Esta seção lista só as melhorias de organização e qualidade do código. Os pontos de segurança e de
regras de acesso foram avaliados à parte e **não** ficam neste documento público.

### Banco de dados
- **Banco "consertado" em tempo de execução.** Existem arquivos `ensure*` em `src/lib/` (ex.:
  `ensureProductionSchema.ts`) que criam tabelas/colunas no boot, além de `scripts/resolve-migrations.js`.
  Isso duplica o trabalho das migrações do Prisma e pode esconder problemas.
- **Toda coluna nova precisa de migração.** Um campo no `schema.prisma` sem a migração correspondente já
  derrubou a produção. São 351 migrações e o `migrate deploy` roda sozinho a cada início do backend.
- **Horário do ponto "como no relógio".** O servidor guarda o horário local enviado pelo aparelho como se
  fosse UTC. Quem lê esses horários (relatórios, folha, banco de horas) precisa tratar do mesmo jeito.

### Código grande, duplicado ou sobrando
- **Arquivos gigantes:** `OrcamentoPageView.tsx` (~24.900 linhas), `contratos/[id]/page.tsx` (~8.600),
  `OcPurchaseOrdersPanel.tsx` (~8.000), `PurchaseOrderService.ts` (~5.300), `TimeRecordController.ts`
  (~1.900). Difíceis de entender, revisar e testar.
- **Dependências duplicadas ou sem uso (backend):** `bcrypt` está instalado mas só `bcryptjs` é usado;
  `dayjs` e `date-fns-tz` não são importados; vários `@types/*` estão em `dependencies`.
- **Pastas duplicadas:** `apps/frontend/src/context/` e `contexts/`; e uma pasta aninhada por engano
  `apps/backend/apps/backend/`.
- **Arquivos soltos / restos:** respostas de erro salvas em `apps/backend/*.json`, scripts `fix-*`,
  `tsc-output*.txt`, `IMPOSTOS.bpmn` na raiz, `apps/frontend/migrate_*.py` e dezenas de scripts em
  `apps/backend/scripts/` (testes de carga, diagnósticos).
- **Rotas sem controller:** várias rotas têm a regra escrita direto no arquivo de rotas.

### Qualidade e documentação
- **Poucos testes.** Só 4 arquivos de teste, todos do módulo Flow. Ponto, folha, OC e permissões não têm
  testes automáticos; o CI confere tipos e build, mas não as regras de negócio.
- **Documentação desatualizada.** O `README.md` cita tecnologias que não aparecem mais no código, a pasta
  `docs/` tem planos antigos e o `env.production.example` não lista as integrações atuais.
- **Integrações desligadas em desenvolvimento.** É proposital, mas rodar localmente não exercita Fluig,
  TOTVS, PNCP, NF-e etc.
- **E-mail:** o sistema usa Resend ou SMTP; não usa AWS SES.
