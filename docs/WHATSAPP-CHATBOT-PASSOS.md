# O que fazer para o chatbot WhatsApp funcionar

Resumo do que **você precisa fazer** para o fluxo ficar completo: contato no WhatsApp, conversas no sistema e envio de atestado.

---

## 1. Subir a Evolution API

- **Opção A – Docker (recomendado)**  
  - Documentação: https://doc.evolution-api.com/  
  - Exemplo: criar um `docker-compose` com a imagem da Evolution API e expor a porta (ex.: 8080).  
  - Você vai acessar o painel da Evolution (ou usar a API REST) para criar a instância.

- **Opção B – Serviço que já oferece Evolution (ou API WhatsApp parecida)**  
  - **[Evolution API Cloud (evocloud.pro)](https://evocloud.pro/)** – Evolution API hospedada; você só cria a instância e configura o webhook. Planos pagos (ex.: ~R$ 29,90/mês).  
  - **[Railway](https://railway.com/deploy/evolution-api-4)** – Deploy da Evolution API com um clique (PostgreSQL + Redis inclusos). Você paga o uso no Railway; não é um “SaaS de WhatsApp”, mas não precisa gerenciar VPS.  
  - **[Z-API (z-api.io)](https://www.z-api.io/)** – API WhatsApp brasileira hospedada; não é Evolution, mas faz o mesmo papel (instância, webhook, envio/recebimento). Suporte e documentação em PT-BR; tem trial.  
  - Outros: qualquer provedor que ofereça “Evolution API” ou “WhatsApp API” com instância + webhook.

**Resultado:** uma URL base da Evolution (ex.: `http://seu-servidor:8080` ou a URL que o provedor der) e uma **instância** (nome, ex.: `gennesis`).

---

## 2. Conectar um número no WhatsApp

- Na Evolution API (painel ou via API), **criar uma instância** (ex.: nome `gennesis`).
- Conectar o WhatsApp: **gerar QR Code** e escanear com o celular do número que será o “atendente” (pode ser um número da empresa ou um celular dedicado).
- Depois de conectado, esse número aparece como contato normal no WhatsApp para quem falar com ele.

**Resultado:** número conectado; quando alguém mandar mensagem para esse número, a Evolution recebe e pode enviar para o seu backend via webhook.

---

## 3. Deixar seu backend acessível pela internet (para o webhook)

A Evolution precisa chamar uma **URL pública** do seu backend (não dá para usar só `localhost`).

- **Produção:** backend já em um servidor com HTTPS (ex.: Railway, Render, VPS).  
  - Exemplo de URL: `https://seu-backend.com/api/whatsapp/webhook`
- **Desenvolvimento:** usar **ngrok** (ou similar) para expor o `localhost`.  
  - Ex.: `ngrok http 5000` → você recebe uma URL tipo `https://xxxx.ngrok.io`.  
  - A URL do webhook seria: `https://xxxx.ngrok.io/api/whatsapp/webhook`

**Resultado:** uma URL fixa que a Evolution vai chamar quando chegar mensagem (ex.: `https://seu-dominio.com/api/whatsapp/webhook`).

---

## 4. Configurar o webhook na Evolution API

- Na Evolution, configurar o **webhook** da instância com:
  - **URL:** a URL do passo 3 (ex.: `https://seu-backend.com/api/whatsapp/webhook`).
  - **Eventos:** pelo menos `MESSAGES_UPSERT` (quando chega mensagem).
- Guardar a **API Key** (ou token) da Evolution para o backend enviar mensagens.

**Resultado:** toda mensagem recebida no WhatsApp será enviada pela Evolution para o seu backend nessa URL.

---

## 5. Implementar no backend (o que ainda falta)

No seu projeto já existe:

- Tabelas e API para listar/ver conversas (página “Conversas WhatsApp”).
- Modelos: `WhatsAppConversation`, `WhatsAppMessage`, `WhatsAppSubmission`.

Ainda falta **criar no backend**:

1. **Rota de webhook (POST)**  
   - Ex.: `POST /api/whatsapp/webhook`  
   - Deve ser **pública** (sem auth), pois quem chama é a Evolution.  
   - Receber o payload da Evolution (evento `MESSAGES_UPSERT`), extrair: número do remetente, conteúdo da mensagem, anexo (se houver).

2. **Serviço do bot (fluxo da conversa)**  
   - Ao receber uma mensagem:  
     - Buscar ou criar `WhatsAppConversation` pelo número (phone).  
     - Salvar a mensagem do usuário em `WhatsAppMessage`.  
     - Definir o fluxo (ex.: MENU → perguntar nome → perguntar dados → se escolheu atestado, pedir arquivo → ao receber arquivo e dados, criar `WhatsAppSubmission` e, se for atestado, criar também `MedicalCertificate`).  
   - Enviar a resposta do bot chamando a **API da Evolution** (enviar mensagem para aquele número).

3. **Variáveis de ambiente**  
   - No `.env` do backend, algo como:  
     - `EVOLUTION_API_URL=https://sua-evolution.com`  
     - `EVOLUTION_INSTANCE=gennesis`  
     - `EVOLUTION_API_KEY=suachave`

Depois disso, quando alguém mandar mensagem no WhatsApp:

- A Evolution chama seu webhook.  
- Seu backend grava a mensagem, processa o fluxo e responde (via Evolution).  
- A conversa e os envios (atestados) aparecem na página **Conversas WhatsApp** no sistema.

---

## 6. Resumo em ordem

| # | O que fazer |
|---|-------------|
| 1 | Subir Evolution API (Docker ou provedor). |
| 2 | Criar instância e conectar número WhatsApp (QR Code). |
| 3 | Expor o backend na internet (produção ou ngrok em dev). |
| 4 | Configurar na Evolution a URL do webhook e eventos (ex.: MESSAGES_UPSERT). |
| 5 | No backend: criar rota POST do webhook, serviço do bot (fluxo + salvar conversa/mensagens/submissions e atestado) e envio de resposta via Evolution API; configurar .env. |

Quando esses passos estiverem feitos, o contato aparece no WhatsApp, as conversas ficam salvas e visíveis na página em **Principal → Conversas WhatsApp**, e o atestado enviado pelo chat pode ser criado no sistema e aparecer para o pessoal.
